<?php
// ============================================
// MY LITTLE BOOKS — Analytics API v1
// GET /api/analytics.php?action=personality  → reading personality
// GET /api/analytics.php?action=compare&a=1&b=2 → compare 2 books
// GET /api/analytics.php?action=calendar     → mini streak calendar bulan ini
// GET /api/analytics.php?action=insights     → deep reading insights
// GET /api/analytics.php?action=overview     → all analytics in one
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError(405, 'Method not allowed');

$action = $_GET['action'] ?? 'overview';
$uid    = userId();

match($action) {
    'personality' => getPersonality($uid),
    'compare'     => compareBooks($uid),
    'calendar'    => getMiniCalendar($uid),
    'insights'    => getInsights($uid),
    'overview'    => getOverview($uid),
    default       => jsonError(400, 'Invalid action')
};

// ════════════════════════════════════════════════
// READING PERSONALITY
// ════════════════════════════════════════════════
function getPersonality(int $uid): void {
    $db = getDB();

    // Data untuk analisis
    $totalBooks   = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid AND status='done'")->fetchColumn();
    $totalNotes   = (int)$db->query("SELECT COUNT(*) FROM notes WHERE user_id=$uid")->fetchColumn();
    $totalPages   = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=$uid")->fetchColumn();
    $totalSessions= (int)$db->query("SELECT COUNT(*) FROM reading_sessions WHERE user_id=$uid AND session_type='pomodoro'")->fetchColumn();
    $totalReviews = (int)$db->query("SELECT COUNT(*) FROM note_reviews WHERE reviews>0 AND note_id IN (SELECT id FROM notes WHERE user_id=$uid)")->fetchColumn();
    $avgRating    = (float)$db->query("SELECT COALESCE(AVG(rating),0) FROM books WHERE user_id=$uid AND rating>0")->fetchColumn();
    $streakMax    = _getMaxStreak($db, $uid);

    // Genre breakdown
    $genreRows = $db->query(
        "SELECT genre, COUNT(*) AS cnt FROM books WHERE user_id=$uid AND status='done' AND genre!=''
         GROUP BY genre ORDER BY cnt DESC LIMIT 5"
    )->fetchAll();
    $topGenre = $genreRows[0]['genre'] ?? '';
    $genreCount = count($genreRows);

    // Reading time pattern (hour of day from sessions)
    $hourRows = $db->query(
        "SELECT HOUR(logged_at) AS h, COUNT(*) AS cnt FROM reading_sessions
         WHERE user_id=$uid GROUP BY h ORDER BY cnt DESC LIMIT 1"
    )->fetchAll();
    $peakHour = $hourRows[0]['h'] ?? null;

    // Day of week pattern
    $dayRows = $db->query(
        "SELECT DAYOFWEEK(logged_date) AS d, COUNT(*) AS cnt FROM reading_logs
         WHERE user_id=$uid GROUP BY d ORDER BY cnt DESC LIMIT 1"
    )->fetchAll();
    $days     = ['','Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    $peakDay  = $dayRows[0]['d'] ? $days[$dayRows[0]['d']] : null;

    // Notes per book ratio
    $notesPerBook = $totalBooks > 0 ? round($totalNotes / $totalBooks, 1) : 0;

    // Determine personality
    $personality = _calcPersonality(
        $totalBooks, $totalNotes, $totalPages, $totalSessions,
        $totalReviews, $notesPerBook, $avgRating, $streakMax, $topGenre
    );

    jsonSuccess([
        'personality'    => $personality,
        'stats' => [
            'total_books'   => $totalBooks,
            'total_notes'   => $totalNotes,
            'total_pages'   => $totalPages,
            'total_sessions'=> $totalSessions,
            'total_reviews' => $totalReviews,
            'avg_rating'    => round($avgRating, 1),
            'notes_per_book'=> $notesPerBook,
            'streak_max'    => $streakMax,
            'peak_hour'     => $peakHour,
            'peak_day'      => $peakDay,
            'top_genre'     => $topGenre,
            'genre_count'   => $genreCount,
        ],
    ]);
}

function _calcPersonality(
    int $books, int $notes, int $pages, int $sessions,
    int $reviews, float $notesPerBook, float $avgRating,
    int $streakMax, string $topGenre
): array {
    // Scoring tiap dimensi
    $scores = [
        'consistent'  => min(100, $streakMax * 5 + $sessions * 2),
        'deep'        => min(100, $notesPerBook * 15 + $reviews * 3),
        'broad'       => min(100, $books * 8 + ($pages / 100)),
        'critical'    => min(100, $avgRating > 0 ? $avgRating * 12 + ($books * 3) : 0),
    ];

    $dominant = array_keys($scores, max($scores))[0];

    $personalities = [
        'consistent' => [
            'name'   => 'The Consistent Reader',
            'emoji'  => '🎯',
            'color'  => '#22C55E',
            'desc'   => 'Kamu adalah pembaca yang sangat disiplin. Membaca sudah jadi bagian dari rutinitasmu sehari-hari. Konsistensimu adalah kunci pertumbuhan jangka panjang.',
            'badge'  => 'Disiplin Tinggi',
            'tip'    => 'Coba tantang diri dengan genre baru untuk memperluas wawasan.',
        ],
        'deep' => [
            'name'   => 'The Deep Thinker',
            'emoji'  => '🧠',
            'color'  => '#8B5CF6',
            'desc'   => 'Kamu tidak hanya membaca — kamu mencerna setiap kata. Catatanmu yang detail menunjukkan kemampuan analisis yang luar biasa.',
            'badge'  => 'Pemikir Mendalam',
            'tip'    => 'Coba bagikan insight-mu ke orang lain. Mengajar adalah cara belajar terbaik.',
        ],
        'broad' => [
            'name'   => 'The Voracious Reader',
            'emoji'  => '📚',
            'color'  => '#3B82F6',
            'desc'   => 'Kamu adalah pemakan buku sejati! Koleksimu yang besar menunjukkan rasa ingin tahu yang tak terbatas terhadap berbagai topik.',
            'badge'  => 'Pembaca Rakus',
            'tip'    => 'Coba perlambat dan buat lebih banyak catatan untuk memperdalam pemahaman.',
        ],
        'critical' => [
            'name'   => 'The Critical Reader',
            'emoji'  => '⭐',
            'color'  => '#F5A623',
            'desc'   => 'Kamu membaca dengan standar tinggi dan perspektif kritis. Ulasanmu yang thoughtful membantu orang lain menemukan buku terbaik.',
            'badge'  => 'Kritikus Literasi',
            'tip'    => 'Gunakan penilaian kritismu untuk menulis resensi yang bisa dibagikan.',
        ],
    ];

    // Bonus untuk genre islami
    if (stripos($topGenre, 'islami') !== false) {
        $personalities[$dominant]['badge'] .= ' · Pembaca Islami';
    }

    $p = $personalities[$dominant];
    $p['dominant'] = $dominant;
    $p['scores']   = $scores;

    return $p;
}

function _getMaxStreak(PDO $db, int $uid): int {
    $logs = $db->query(
        "SELECT DISTINCT logged_date FROM reading_logs WHERE user_id=$uid
         ORDER BY logged_date ASC"
    )->fetchAll(PDO::FETCH_COLUMN);

    if (!$logs) return 0;

    $max = $cur = 1;
    for ($i = 1; $i < count($logs); $i++) {
        $diff = (new DateTime($logs[$i]))->diff(new DateTime($logs[$i-1]))->days;
        if ($diff === 1) { $cur++; $max = max($max, $cur); }
        else $cur = 1;
    }
    return $max;
}

// ════════════════════════════════════════════════
// COMPARE 2 BOOKS
// ════════════════════════════════════════════════
function compareBooks(int $uid): void {
    $db = getDB();
    $a  = (int)($_GET['a'] ?? 0);
    $b  = (int)($_GET['b'] ?? 0);

    if (!$a || !$b) jsonError(400, 'Dua book_id (a & b) wajib diisi');
    if ($a === $b)  jsonError(400, 'Pilih dua buku yang berbeda');

    $getBook = function(int $id) use ($db, $uid): array {
        $stmt = $db->prepare(
            "SELECT b.*,
             (SELECT COUNT(*) FROM notes n WHERE n.book_id=b.id AND n.user_id=b.user_id) AS note_count,
             (SELECT COUNT(*) FROM quotes q WHERE q.book_id=b.id AND q.user_id=b.user_id) AS quote_count,
             (SELECT COALESCE(SUM(r.pages_read),0) FROM reading_logs r WHERE r.book_id=b.id AND r.user_id=b.user_id) AS pages_logged,
             (SELECT COALESCE(SUM(rs.duration),0) FROM reading_sessions rs WHERE rs.book_id=b.id AND rs.user_id=b.user_id) AS minutes_read,
             (SELECT GROUP_CONCAT(DISTINCT n.tags SEPARATOR ',') FROM notes n WHERE n.book_id=b.id AND n.user_id=b.user_id AND n.tags!='') AS all_tags
             FROM books b WHERE b.id=? AND b.user_id=? LIMIT 1"
        );
        $stmt->execute([$id, $uid]);
        $book = $stmt->fetch();
        if (!$book) return [];

        // Parse top tags
        $tags   = array_filter(array_map('trim', explode(',', $book['all_tags'] ?? '')));
        $tagMap = array_count_values($tags);
        arsort($tagMap);
        $book['top_tags'] = array_slice(array_keys($tagMap), 0, 5);

        // Reading speed (halaman per menit)
        $book['pages_per_min'] = $book['minutes_read'] > 0
            ? round($book['pages_logged'] / $book['minutes_read'], 2) : 0;

        return $book;
    };

    $bookA = $getBook($a);
    $bookB = $getBook($b);

    if (!$bookA) jsonError(404, "Buku A tidak ditemukan");
    if (!$bookB) jsonError(404, "Buku B tidak ditemukan");

    jsonSuccess(['book_a' => $bookA, 'book_b' => $bookB]);
}

// ════════════════════════════════════════════════
// MINI CALENDAR (30 hari terakhir)
// ════════════════════════════════════════════════
function getMiniCalendar(int $uid): void {
    $db = getDB();

    $rows = $db->prepare(
        "SELECT logged_date AS d, SUM(pages_read) AS pages
         FROM reading_logs WHERE user_id=? AND logged_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY logged_date"
    );
    $rows->execute([$uid]);
    $map = [];
    foreach ($rows->fetchAll() as $r) $map[$r['d']] = (int)$r['pages'];

    // Sessions
    $sess = $db->prepare(
        "SELECT DATE(logged_at) AS d, COUNT(*) AS cnt
         FROM reading_sessions WHERE user_id=? AND logged_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY d"
    );
    $sess->execute([$uid]);
    $sessMap = [];
    foreach ($sess->fetchAll() as $r) $sessMap[$r['d']] = (int)$r['cnt'];

    $days = [];
    for ($i = 29; $i >= 0; $i--) {
        $d = (new DateTime("today -$i days"))->format('Y-m-d');
        $days[] = [
            'date'     => $d,
            'pages'    => $map[$d] ?? 0,
            'sessions' => $sessMap[$d] ?? 0,
        ];
    }

    // Current streak
    $streak = 0;
    $check  = new DateTime('today');
    $allDates = array_keys($map);
    rsort($allDates);
    foreach ($allDates as $d) {
        if ($d === $check->format('Y-m-d')) { $streak++; $check->modify('-1 day'); }
        else break;
    }

    jsonSuccess(['days' => $days, 'streak' => $streak]);
}

// ════════════════════════════════════════════════
// DEEP INSIGHTS
// ════════════════════════════════════════════════
function getInsights(int $uid): void {
    $db = getDB();

    // Best reading day
    $bestDay = $db->query(
        "SELECT DAYNAME(logged_date) AS day, SUM(pages_read) AS total
         FROM reading_logs WHERE user_id=$uid GROUP BY DAYNAME(logged_date)
         ORDER BY total DESC LIMIT 1"
    )->fetch();

    // Best reading hour
    $bestHour = $db->query(
        "SELECT HOUR(logged_at) AS h, COUNT(*) AS cnt
         FROM reading_sessions WHERE user_id=$uid GROUP BY h ORDER BY cnt DESC LIMIT 1"
    )->fetch();

    // Fastest book (most pages in shortest time)
    $fastBook = $db->query(
        "SELECT b.title, b.total_pages,
         DATEDIFF(b.finished_at, b.started_at) + 1 AS days_taken,
         ROUND(b.total_pages / (DATEDIFF(b.finished_at, b.started_at) + 1), 1) AS pages_per_day
         FROM books b WHERE user_id=$uid AND status='done'
         AND started_at IS NOT NULL AND finished_at IS NOT NULL AND total_pages > 0
         ORDER BY pages_per_day DESC LIMIT 1"
    )->fetch();

    // Most noted book
    $mostNoted = $db->query(
        "SELECT b.title, COUNT(n.id) AS note_count
         FROM notes n JOIN books b ON b.id=n.book_id
         WHERE n.user_id=$uid GROUP BY n.book_id ORDER BY note_count DESC LIMIT 1"
    )->fetch();

    // Top tag overall
    $allTags = $db->query(
        "SELECT tags FROM notes WHERE user_id=$uid AND tags!='' LIMIT 200"
    )->fetchAll(PDO::FETCH_COLUMN);
    $tagMap  = [];
    foreach ($allTags as $row)
        foreach (explode(',', $row) as $t) { $t=trim($t); if ($t) $tagMap[$t]=($tagMap[$t]??0)+1; }
    arsort($tagMap);
    $topTags = array_slice(array_keys($tagMap), 0, 5);

    // Monthly avg
    $monthlyAvg = $db->query(
        "SELECT ROUND(AVG(monthly_pages)) AS avg FROM
         (SELECT YEAR(logged_date) AS y, MONTH(logged_date) AS m, SUM(pages_read) AS monthly_pages
          FROM reading_logs WHERE user_id=$uid GROUP BY y,m HAVING monthly_pages > 0) t"
    )->fetchColumn();

    // Days map id → label
    $dayLabels = [
        'Monday'=>'Senin','Tuesday'=>'Selasa','Wednesday'=>'Rabu',
        'Thursday'=>'Kamis','Friday'=>'Jumat','Saturday'=>'Sabtu','Sunday'=>'Minggu'
    ];
    $bestDayLabel = $bestDay ? ($dayLabels[$bestDay['day']] ?? $bestDay['day']) : null;

    $hourLabel = null;
    if ($bestHour) {
        $h = (int)$bestHour['h'];
        $hourLabel = $h < 6 ? 'Subuh' : ($h < 11 ? 'Pagi' : ($h < 15 ? 'Siang' : ($h < 18 ? 'Sore' : ($h < 21 ? 'Malam' : 'Larut Malam'))));
        $hourLabel = "$hourLabel ($h:00)";
    }

    jsonSuccess([
        'best_day'     => $bestDayLabel,
        'best_hour'    => $hourLabel,
        'fastest_book' => $fastBook  ?: null,
        'most_noted'   => $mostNoted ?: null,
        'top_tags'     => $topTags,
        'monthly_avg'  => (int)$monthlyAvg,
    ]);
}

// ════════════════════════════════════════════════
// OVERVIEW — semua sekaligus
// ════════════════════════════════════════════════
function getOverview(int $uid): void {
    ob_start();
    getPersonality($uid); $personality = json_decode(ob_get_clean(), true);
    ob_start();
    getMiniCalendar($uid); $calendar = json_decode(ob_get_clean(), true);
    ob_start();
    getInsights($uid); $insights = json_decode(ob_get_clean(), true);

    jsonSuccess([
        'personality' => $personality['data'],
        'calendar'    => $calendar['data'],
        'insights'    => $insights['data'],
    ]);
}
