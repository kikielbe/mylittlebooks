<?php
// ============================================
// MY LITTLE BOOKS — Schedule & Review API v3
// Multi-User
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

_ensureTables();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

match("$method:$action") {
    'GET:quote'         => getQuoteOfDay(),
    'GET:schedule'      => calcSchedule(),
    'POST:set_schedule' => setSchedule(),
    'GET:review'        => getReviewQueue(),
    'POST:mark_review'  => markReviewed(),
    'GET:all_schedules' => getAllSchedules(),
    default             => jsonError(400, 'Invalid action')
};

function _ensureTables(): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS book_schedules (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        book_id     INT UNSIGNED NOT NULL UNIQUE,
        target_date DATE NOT NULL,
        daily_pages SMALLINT UNSIGNED DEFAULT 0,
        started_at  DATE DEFAULT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_sched_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS note_reviews (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        note_id       INT UNSIGNED NOT NULL UNIQUE,
        last_review   DATE DEFAULT NULL,
        next_review   DATE NOT NULL,
        interval_days TINYINT UNSIGNED DEFAULT 1,
        ease          FLOAT DEFAULT 2.5,
        reviews       SMALLINT UNSIGNED DEFAULT 0,
        CONSTRAINT fk_review_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ── Quote of the Day ──────────────────────────
function getQuoteOfDay(): void {
    $uid  = userId(); $db = getDB();
    $seed = (int)date('Ymd');

    $count = (int)$db->query("SELECT COUNT(*) FROM quotes WHERE user_id=$uid")->fetchColumn();
    if ($count > 0) {
        $offset = $seed % $count;
        $stmt   = $db->prepare("SELECT q.quote_text, q.page_number, b.title AS book_title, b.author
                                 FROM quotes q LEFT JOIN books b ON b.id=q.book_id
                                 WHERE q.user_id=? ORDER BY q.id LIMIT 1 OFFSET ?");
        $stmt->execute([$uid, $offset]);
        $quote = $stmt->fetch();
        if ($quote) { jsonSuccess(array_merge($quote,['source'=>'collection'])); }
    }

    $fallbacks = [
        ['text'=>'Buku adalah cermin jiwa. Semakin banyak membaca, semakin kenal diri sendiri.','book_title'=>'My Little Books','author'=>''],
        ['text'=>'Investasi terbaik adalah investasi pada dirimu sendiri melalui ilmu pengetahuan.','book_title'=>'Warren Buffett','author'=>''],
        ['text'=>'Tidak ada teman yang lebih setia selain buku.','book_title'=>'Ernest Hemingway','author'=>''],
        ['text'=>'Membaca tanpa berpikir ibarat makan tanpa mencerna.','book_title'=>'Edmund Burke','author'=>''],
        ['text'=>'Setiap buku yang kamu baca adalah langkah kecil menuju versi terbaik dirimu.','book_title'=>'My Little Books','author'=>''],
        ['text'=>'Orang yang banyak membaca akan memiliki kehidupan yang lebih panjang dari satu kehidupan.','book_title'=>'Umberto Eco','author'=>''],
        ['text'=>'Tunjukkan padaku siapa temanmu, dan kutunjukkan siapa dirimu. Tunjukkan padaku apa yang kamu baca, dan kutunjukkan siapa dirimu.','book_title'=>'Pepatah','author'=>''],
        ['text'=>'Ilmu itu lebih baik daripada harta, karena harta dijaga sedang ilmu menjaga.','book_title'=>'Ali bin Abi Thalib','author'=>''],
    ];
    jsonSuccess(array_merge($fallbacks[$seed % count($fallbacks)],['source'=>'default','page'=>null]));
}

// ── Calculate Schedule ────────────────────────
function calcSchedule(): void {
    $uid     = userId(); $db = getDB();
    $book_id = (int)($_GET['book_id'] ?? 0);
    $days    = max(1, (int)($_GET['days'] ?? 30));
    if (!$book_id) jsonError(400,'book_id wajib diisi');

    $stmt = $db->prepare("SELECT * FROM books WHERE id=? AND user_id=? LIMIT 1");
    $stmt->execute([$book_id,$uid]);
    $book = $stmt->fetch();
    if (!$book) jsonError(404,'Buku tidak ditemukan');
    if ((int)$book['total_pages']===0) jsonError(400,'Isi total halaman buku terlebih dahulu');

    $remaining  = max(0,(int)$book['total_pages']-(int)$book['current_page']);
    $dailyPages = ceil($remaining / $days);
    $targetDate = (new DateTime("today +$days days"))->format('Y-m-d');
    $pct        = (int)$book['total_pages']>0 ? round((int)$book['current_page']/(int)$book['total_pages']*100) : 0;

    $sStmt = $db->prepare("SELECT * FROM book_schedules WHERE book_id=? LIMIT 1");
    $sStmt->execute([$book_id]); $existing = $sStmt->fetch();

    $milestones = [];
    for ($i=1;$i<=4;$i++) {
        $tp   = round((int)$book['total_pages']*($i*.25));
        $pl   = max(0,$tp-(int)$book['current_page']);
        $dn   = $dailyPages>0 ? ceil($pl/$dailyPages) : 0;
        $milestones[] = ['label'=>($i*25).'%','target_page'=>$tp,'days_needed'=>$dn,
            'date'=>(new DateTime("today +$dn days"))->format('Y-m-d'),
            'done'=>(int)$book['current_page']>=$tp];
    }

    jsonSuccess(['book'=>$book,'remaining'=>$remaining,'daily_pages'=>$dailyPages,
        'target_date'=>$targetDate,'days'=>$days,'progress_pct'=>$pct,
        'milestones'=>$milestones,'existing'=>$existing]);
}

function setSchedule(): void {
    $uid=$uid=userId(); $body=getBody();
    $book_id=(int)($body['book_id']??0); $date=$body['target_date']??''; $daily=(int)($body['daily_pages']??0);
    if (!$book_id||!$date) jsonError(400,'book_id dan target_date wajib diisi');

    // Verify book belongs to user
    $bck=getDB()->prepare("SELECT id FROM books WHERE id=? AND user_id=? LIMIT 1");
    $bck->execute([$book_id,$uid]); if (!$bck->fetch()) jsonError(404,'Buku tidak ditemukan');

    getDB()->prepare("INSERT INTO book_schedules (book_id,target_date,daily_pages,started_at) VALUES (?,?,?,CURDATE())
                      ON DUPLICATE KEY UPDATE target_date=?,daily_pages=?,updated_at=NOW()")
           ->execute([$book_id,$date,$daily,$date,$daily]);
    jsonSuccess(['book_id'=>$book_id,'target_date'=>$date,'daily_pages'=>$daily],'Jadwal tersimpan ✓');
}

function getAllSchedules(): void {
    $uid=$uid=userId(); $db=getDB();
    $stmt=$db->prepare("SELECT s.*,b.title,b.author,b.cover_filename,b.current_page,b.total_pages,b.status
                         FROM book_schedules s JOIN books b ON b.id=s.book_id
                         WHERE b.user_id=? AND b.status IN('reading','want') ORDER BY s.target_date ASC");
    $stmt->execute([$uid]); $rows=$stmt->fetchAll();
    $today=new DateTime('today');
    foreach ($rows as &$r) {
        $diff=$today->diff(new DateTime($r['target_date']));
        $r['days_left']=(int)$diff->format('%r%a');
        $r['progress_pct']=$r['total_pages']>0?round($r['current_page']/$r['total_pages']*100):0;
        $r['on_track']=$r['days_left']>=0&&($r['total_pages']-$r['current_page'])<=($r['daily_pages']*max(1,$r['days_left']));
    }
    jsonSuccess($rows);
}

// ── Review queue ──────────────────────────────
function getReviewQueue(): void {
    $uid=$uid=userId(); $db=getDB(); $today=date('Y-m-d');
    $limit=min((int)($_GET['limit']??5),20);
    $stmt=$db->prepare("SELECT n.id,n.note_title,n.book_id,n.page_start,n.tags,b.title AS book_title,b.cover_filename,
                         COALESCE(r.next_review,DATE_ADD(n.created_at,INTERVAL 1 DAY)) AS next_review,
                         COALESCE(r.interval_days,1) AS interval_days,COALESCE(r.reviews,0) AS reviews,COALESCE(r.ease,2.5) AS ease
                         FROM notes n LEFT JOIN books b ON b.id=n.book_id LEFT JOIN note_reviews r ON r.note_id=n.id
                         WHERE n.user_id=? AND COALESCE(r.next_review,DATE_ADD(n.created_at,INTERVAL 1 DAY))<=?
                         ORDER BY COALESCE(r.next_review,n.created_at) ASC LIMIT ?");
    $stmt->execute([$uid,$today,$limit]); $notes=$stmt->fetchAll();

    $pending=(int)$db->query("SELECT COUNT(*) FROM notes n LEFT JOIN note_reviews r ON r.note_id=n.id
        WHERE n.user_id=$uid AND COALESCE(r.next_review,DATE_ADD(n.created_at,INTERVAL 1 DAY))<=CURDATE()")->fetchColumn();

    jsonSuccess(['notes'=>$notes,'pending'=>$pending,'today'=>$today]);
}

// ── Mark reviewed SM-2 ────────────────────────
function markReviewed(): void {
    $body=$body=getBody(); $uid=userId();
    $note_id=(int)($body['note_id']??0); $quality=max(0,min(5,(int)($body['quality']??3)));
    if (!$note_id) jsonError(400,'note_id wajib diisi');

    // Verify note belongs to user
    $bck=getDB()->prepare("SELECT id FROM notes WHERE id=? AND user_id=? LIMIT 1");
    $bck->execute([$note_id,$uid]); if (!$bck->fetch()) jsonError(404,'Catatan tidak ditemukan');

    $db=$db=getDB(); $today=date('Y-m-d');
    $stmt=$db->prepare("SELECT * FROM note_reviews WHERE note_id=? LIMIT 1"); $stmt->execute([$note_id]);
    $rev=$stmt->fetch();

    $ease=(float)($rev?$rev['ease']:2.5); $interval=(int)($rev?$rev['interval_days']:1); $reviews=(int)($rev?$rev['reviews']:0);

    if ($quality>=3) {
        if ($reviews===0) $interval=1; elseif ($reviews===1) $interval=6; else $interval=round($interval*$ease);
        $ease=max(1.3,$ease+0.1-(5-$quality)*(0.08+(5-$quality)*0.02)); $reviews++;
    } else { $interval=1; $reviews=0; }

    $next=(new DateTime("$today +$interval days"))->format('Y-m-d');
    $db->prepare("INSERT INTO note_reviews (note_id,last_review,next_review,interval_days,ease,reviews) VALUES (?,?,?,?,?,?)
                  ON DUPLICATE KEY UPDATE last_review=?,next_review=?,interval_days=?,ease=?,reviews=?")
       ->execute([$note_id,$today,$next,$interval,$ease,$reviews,$today,$next,$interval,$ease,$reviews]);

    addXP(2,$uid);
    jsonSuccess(['next_review'=>$next,'interval_days'=>$interval,'ease'=>round($ease,2)],"Direview! Next: $next (+2 XP)");
}
