<?php
require_once __DIR__ . '/db.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($action==='level') { getLevelData(); }

match($method) {
    'GET'  => exportBackup(),
    'POST' => importBackup(),
    default => jsonError(405,'Method not allowed')
};

function exportBackup(): void {
    $db  = getDB(); $uid = userId();
    $data = [
        'app'       => 'mylittlebooks',
        'version'   => '3.0',
        'exported'  => date('c'),
        'user_id'   => $uid,
        'books'     => $db->query("SELECT * FROM books     WHERE user_id=$uid ORDER BY id")->fetchAll(),
        'notes'     => $db->query("SELECT * FROM notes     WHERE user_id=$uid ORDER BY id")->fetchAll(),
        'quotes'    => $db->query("SELECT * FROM quotes    WHERE user_id=$uid ORDER BY id")->fetchAll(),
        'reminders' => $db->query("SELECT * FROM reminders WHERE user_id=$uid ORDER BY id")->fetchAll(),
        'targets'   => getUserTargets($uid),
        'badges'    => $db->query("SELECT * FROM badges    WHERE user_id=$uid ORDER BY id")->fetchAll(),
        'logs'      => $db->query("SELECT * FROM reading_logs WHERE user_id=$uid ORDER BY id")->fetchAll(),
        'user'      => $db->query("SELECT display_name,xp_points FROM users WHERE id=$uid")->fetch(),
    ];
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="mlb_backup_'.date('Ymd_His').'.json"');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function importBackup(): void {
    $body = getBody(); $uid = userId();
    if (empty($body['app']) || $body['app'] !== 'mylittlebooks')
        jsonError(400,'File backup tidak valid');

    $db = getDB();
    try {
        $db->beginTransaction();
        $db->exec("SET FOREIGN_KEY_CHECKS=0");
        foreach (['reading_logs','attachments','quotes','notes','books','reminders','badges'] as $t)
            $db->prepare("DELETE FROM $t WHERE user_id=?")->execute([$uid]);
        $db->exec("SET FOREIGN_KEY_CHECKS=1");

        // Re-map IDs to avoid conflict with other users
        $bookMap = []; $noteMap = [];

        foreach ($body['books']??[] as $r) {
            $db->prepare("INSERT INTO books (user_id,title,author,isbn,cover_filename,genre,description,status,total_pages,current_page,started_at,finished_at,rating,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
               ->execute([$uid,$r['title'],$r['author'],$r['isbn'],$r['cover_filename'],$r['genre'],$r['description'],$r['status'],$r['total_pages'],$r['current_page'],$r['started_at'],$r['finished_at'],$r['rating'],$r['created_at'],$r['updated_at']]);
            $bookMap[$r['id']] = (int)$db->lastInsertId();
        }

        foreach ($body['notes']??[] as $r) {
            $newBookId = $bookMap[$r['book_id']] ?? null;
            if (!$newBookId) continue;
            $db->prepare("INSERT INTO notes (user_id,book_id,note_title,content,page_start,page_end,rating,tags,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
               ->execute([$uid,$newBookId,$r['note_title'],$r['content'],$r['page_start'],$r['page_end'],$r['rating'],$r['tags'],$r['created_at'],$r['updated_at']]);
            $noteMap[$r['id']] = (int)$db->lastInsertId();
        }

        foreach ($body['quotes']??[] as $r) {
            $newBookId = $bookMap[$r['book_id']] ?? null; if (!$newBookId) continue;
            $db->prepare("INSERT INTO quotes (user_id,book_id,quote_text,page_number,created_at) VALUES (?,?,?,?,?)")
               ->execute([$uid,$newBookId,$r['quote_text'],$r['page_number'],$r['created_at']]);
        }

        foreach ($body['reminders']??[] as $r)
            $db->prepare("INSERT INTO reminders (user_id,title,reminder_date,reminder_time,type,note,is_done,created_at) VALUES (?,?,?,?,?,?,?,?)")
               ->execute([$uid,$r['title'],$r['reminder_date'],$r['reminder_time'],$r['type'],$r['note'],$r['is_done'],$r['created_at']]);

        foreach ($body['badges']??[] as $r)
            $db->prepare("INSERT IGNORE INTO badges (user_id,badge_key,earned_at) VALUES (?,?,?)")
               ->execute([$uid,$r['badge_key'],$r['earned_at']]);

        foreach ($body['logs']??[] as $r) {
            $newBookId = $bookMap[$r['book_id']] ?? null;
            $newNoteId = $r['note_id'] ? ($noteMap[$r['note_id']] ?? null) : null;
            if (!$newBookId) continue;
            $db->prepare("INSERT INTO reading_logs (user_id,book_id,note_id,pages_read,logged_date,created_at) VALUES (?,?,?,?,?,?)")
               ->execute([$uid,$newBookId,$newNoteId,$r['pages_read'],$r['logged_date'],$r['created_at']]);
        }

        if (!empty($body['targets'])) {
            foreach (['monthly_books','daily_pages','weekly_notes'] as $type) {
                $val = $body['targets'][$type] ?? null;
                if ($val) $db->prepare("INSERT INTO user_targets (user_id,type,target_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE target_value=?")->execute([$uid,$type,$val,$val]);
            }
        }

        if (!empty($body['user']))
            $db->prepare("UPDATE users SET display_name=?,xp_points=? WHERE id=?")
               ->execute([$body['user']['display_name'],$body['user']['xp_points'],$uid]);

        $db->commit();
        jsonSuccess(null,'Restore berhasil! 🎉');
    } catch(Exception $e) {
        $db->rollBack();
        jsonError(500,'Restore gagal: '.$e->getMessage());
    }
}

function getLevelData(): void {
    requireAuth();
    $db  = getDB(); $uid = userId();
    $xp  = (int)$db->query("SELECT xp_points FROM users WHERE id=$uid")->fetchColumn();
    $level   = getLevel($xp);
    $badges  = $db->query("SELECT badge_key,earned_at FROM badges WHERE user_id=$uid ORDER BY earned_at DESC")->fetchAll();

    $logs   = $db->query("SELECT DISTINCT logged_date FROM reading_logs WHERE user_id=$uid ORDER BY logged_date DESC LIMIT 365")->fetchAll(PDO::FETCH_COLUMN);
    $streak = 0; $check = new DateTime('today');
    foreach ($logs as $d) { if ($d===$check->format('Y-m-d')) { $streak++; $check->modify('-1 day'); } else break; }

    $cal = $db->query("SELECT logged_date,SUM(pages_read) AS pages,COUNT(*) AS sessions FROM reading_logs WHERE user_id=$uid AND logged_date>=DATE_SUB(CURDATE(),INTERVAL 29 DAY) GROUP BY logged_date")->fetchAll();

    $targets = getUserTargets($uid);
    $monthDone  = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid AND status='done' AND MONTH(finished_at)=MONTH(CURDATE()) AND YEAR(finished_at)=YEAR(CURDATE())")->fetchColumn();
    $todayPages = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=$uid AND logged_date=CURDATE()")->fetchColumn();
    $weekNotes  = (int)$db->query("SELECT COUNT(*) FROM notes WHERE user_id=$uid AND created_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)")->fetchColumn();

    jsonSuccess(['level'=>$level,'badges'=>$badges,'streak'=>$streak,'calendar'=>$cal,
        'progress'=>['month_done'=>$monthDone,'today_pages'=>$todayPages,'week_notes'=>$weekNotes],
        'targets'=>$targets]);
}
