<?php
// ============================================
// MY LITTLE BOOKS — Timer & Habit API v3
// Multi-User
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

_ensureTables();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

match("$method:$action") {
    'POST:log_session' => logSession(),
    'POST:checkin'     => doCheckin(),
    'GET:heatmap'      => getHeatmap(),
    'GET:sessions'     => getSessions(),
    'GET:today'        => getTodayData(),
    default            => jsonError(400, 'Invalid action')
};

function _ensureTables(): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS reading_sessions (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id      INT UNSIGNED NOT NULL,
        book_id      INT UNSIGNED DEFAULT NULL,
        duration     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        pages_read   SMALLINT UNSIGNED DEFAULT 0,
        session_type ENUM('pomodoro','free') DEFAULT 'pomodoro',
        logged_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_sessions_user_date (user_id, logged_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS daily_checkins (
        id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id      INT UNSIGNED NOT NULL,
        checkin_date DATE NOT NULL,
        mood         TINYINT UNSIGNED DEFAULT 3,
        note         VARCHAR(200) DEFAULT '',
        pages_read   SMALLINT UNSIGNED DEFAULT 0,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_date (user_id, checkin_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function logSession(): void {
    $body     = getBody();
    $uid      = userId();
    $book_id  = (int)($body['book_id']     ?? 0);
    $duration = max(1, (int)($body['duration']   ?? 25));
    $pages    = max(0, (int)($body['pages_read']  ?? 0));
    $type     = in_array($body['session_type']??'pomodoro',['pomodoro','free'])
                ? $body['session_type'] : 'pomodoro';
    $db = getDB();

    $db->prepare("INSERT INTO reading_sessions (user_id,book_id,duration,pages_read,session_type)
                  VALUES (?,?,?,?,?)")
       ->execute([$uid, $book_id ?: null, $duration, $pages, $type]);

    if ($book_id && $pages > 0) {
        // Verify book belongs to user
        $bck = $db->prepare("SELECT id FROM books WHERE id=? AND user_id=? LIMIT 1");
        $bck->execute([$book_id, $uid]);
        if ($bck->fetch()) {
            $db->prepare("INSERT INTO reading_logs (user_id,book_id,pages_read,logged_date)
                          VALUES (?,?,?,CURDATE())")->execute([$uid,$book_id,$pages]);
            $db->prepare("UPDATE books SET current_page=LEAST(total_pages,current_page+?)
                          WHERE id=? AND user_id=? AND total_pages>0")
               ->execute([$pages,$book_id,$uid]);
        }
    }

    $xp = ($type==='pomodoro' ? 5 : 2) + min($pages, 20);
    $db->prepare("UPDATE users SET xp_points=xp_points+? WHERE id=?")->execute([$xp,$uid]);

    // Auto check-in
    $db->prepare("INSERT INTO daily_checkins (user_id,checkin_date,pages_read)
                  VALUES (?,CURDATE(),?)
                  ON DUPLICATE KEY UPDATE pages_read=pages_read+?")
       ->execute([$uid,$pages,$pages]);

    $todayMin   = (int)$db->query("SELECT COALESCE(SUM(duration),0) FROM reading_sessions WHERE user_id=$uid AND DATE(logged_at)=CURDATE()")->fetchColumn();
    $todayPages = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=$uid AND logged_date=CURDATE()")->fetchColumn();

    checkBadges($uid);
    jsonSuccess(['xp_earned'=>$xp,'today_min'=>$todayMin,'today_pages'=>$todayPages],
                "Sesi selesai! +{$xp} XP 🎉");
}

function doCheckin(): void {
    $body  = getBody();
    $uid   = userId();
    $mood  = max(1, min(5,(int)($body['mood']  ?? 3)));
    $note  = sanitize($body['note']  ?? '');
    $pages = max(0, (int)($body['pages'] ?? 0));
    $db    = getDB();

    $db->prepare("INSERT INTO daily_checkins (user_id,checkin_date,mood,note,pages_read)
                  VALUES (?,CURDATE(),?,?,?)
                  ON DUPLICATE KEY UPDATE mood=?,note=?,pages_read=GREATEST(pages_read,?)")
       ->execute([$uid,$mood,$note,$pages,$mood,$note,$pages]);

    // Streak
    $logs   = $db->query("SELECT DISTINCT checkin_date FROM daily_checkins WHERE user_id=$uid ORDER BY checkin_date DESC LIMIT 365")->fetchAll(PDO::FETCH_COLUMN);
    $streak = 0; $check = new DateTime('today');
    foreach ($logs as $d) { if ($d===$check->format('Y-m-d')) { $streak++; $check->modify('-1 day'); } else break; }

    jsonSuccess(['streak'=>$streak,'mood'=>$mood],'Check-in berhasil! 🎉');
}

function getHeatmap(): void {
    $uid = userId(); $db = getDB();

    $logs = $db->prepare("SELECT logged_date AS d, SUM(pages_read) AS pages FROM reading_logs WHERE user_id=? AND logged_date>=DATE_SUB(CURDATE(),INTERVAL 364 DAY) GROUP BY logged_date");
    $logs->execute([$uid]); $logs = $logs->fetchAll();

    $sessions = $db->prepare("SELECT DATE(logged_at) AS d, SUM(duration) AS minutes, COUNT(*) AS sessions FROM reading_sessions WHERE user_id=? AND logged_at>=DATE_SUB(CURDATE(),INTERVAL 364 DAY) GROUP BY DATE(logged_at)");
    $sessions->execute([$uid]); $sessions = $sessions->fetchAll();

    $checkins = $db->prepare("SELECT checkin_date AS d, mood FROM daily_checkins WHERE user_id=? AND checkin_date>=DATE_SUB(CURDATE(),INTERVAL 364 DAY)");
    $checkins->execute([$uid]); $checkins = $checkins->fetchAll();

    $map = [];
    foreach ($logs     as $r) $map[$r['d']]['pages']   = (int)$r['pages'];
    foreach ($sessions as $r) { $map[$r['d']]['minutes']=(int)$r['minutes']; $map[$r['d']]['sessions']=(int)$r['sessions']; }
    foreach ($checkins as $r) $map[$r['d']]['mood']    = (int)$r['mood'];

    $result = [];
    for ($i=364; $i>=0; $i--) {
        $d = (new DateTime("today -$i days"))->format('Y-m-d');
        $result[] = array_merge(['date'=>$d,'pages'=>0,'minutes'=>0,'sessions'=>0,'mood'=>0],$map[$d]??[]);
    }

    $streak=0; $check=new DateTime('today');
    $actDates=array_column(array_filter($result,fn($r)=>$r['pages']>0||$r['minutes']>0),'date');
    rsort($actDates);
    foreach ($actDates as $d) { if ($d===$check->format('Y-m-d')) { $streak++; $check->modify('-1 day'); } else break; }

    $totalDays    = count(array_filter($result,fn($r)=>$r['pages']>0||$r['minutes']>0));
    $totalMinutes = array_sum(array_column($result,'minutes'));
    $totalPages   = array_sum(array_column($result,'pages'));

    jsonSuccess(['days'=>$result,'streak'=>$streak,'total_days'=>$totalDays,'total_minutes'=>$totalMinutes,'total_pages'=>$totalPages]);
}

function getTodayData(): void {
    $uid=$uid=userId(); $db=getDB();
    $todayMin    = (int)$db->query("SELECT COALESCE(SUM(duration),0) FROM reading_sessions WHERE user_id=$uid AND DATE(logged_at)=CURDATE()")->fetchColumn();
    $todaySess   = (int)$db->query("SELECT COUNT(*) FROM reading_sessions WHERE user_id=$uid AND DATE(logged_at)=CURDATE()")->fetchColumn();
    $todayPages  = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=$uid AND logged_date=CURDATE()")->fetchColumn();
    $checkin     = $db->query("SELECT mood,note FROM daily_checkins WHERE user_id=$uid AND checkin_date=CURDATE() LIMIT 1")->fetch();
    jsonSuccess(['today_minutes'=>$todayMin,'today_sessions'=>$todaySess,'today_pages'=>$todayPages,'checked_in'=>(bool)$checkin,'mood'=>$checkin['mood']??0]);
}

function getSessions(): void {
    $uid=$uid=userId(); $limit=min((int)($_GET['limit']??10),50);
    $stmt=getDB()->prepare("SELECT s.*,b.title AS book_title FROM reading_sessions s LEFT JOIN books b ON b.id=s.book_id WHERE s.user_id=? ORDER BY s.logged_at DESC LIMIT ?");
    $stmt->execute([$uid,$limit]); jsonSuccess($stmt->fetchAll());
}
