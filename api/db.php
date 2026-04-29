<?php
// ============================================
// MY LITTLE BOOKS — Database & Helpers v3
// Multi-User Architecture
// ============================================

define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'mylittlebooks');
define('DB_PORT', 3306);

define('UPLOAD_COVERS', __DIR__ . '/../assets/uploads/covers/');
define('UPLOAD_ATTACH', __DIR__ . '/../assets/uploads/attachments/');
define('UPLOAD_AVATARS',__DIR__ . '/../assets/uploads/avatars/');
define('MAX_FILE_SIZE',   5 * 1024 * 1024);
define('MAX_ATTACHMENTS', 5);

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ── DB ────────────────────────────────────────
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=".DB_HOST.";port=".DB_PORT.";dbname=".DB_NAME.";charset=utf8mb4";
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            jsonError(500, 'Database error: ' . $e->getMessage());
        }
    }
    return $pdo;
}

// ── Response ──────────────────────────────────
function jsonResponse(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function jsonError(int $status, string $msg): void {
    jsonResponse(['success' => false, 'error' => $msg], $status);
}
function jsonSuccess(mixed $data = null, string $msg = 'OK'): void {
    jsonResponse(['success' => true, 'message' => $msg, 'data' => $data]);
}

// ── Auth helpers ──────────────────────────────
function requireAuth(): void {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['user_id'])) jsonError(401, 'Unauthorized');
}

function requireAdmin(): void {
    requireAuth();
    if (($_SESSION['role'] ?? '') !== 'admin') jsonError(403, 'Admin only');
}

// Get current user ID (shorthand)
function userId(): int {
    return (int)($_SESSION['user_id'] ?? 0);
}

function userRole(): string {
    return $_SESSION['role'] ?? 'member';
}

// ── Input helpers ─────────────────────────────
function sanitize(string $val): string {
    return htmlspecialchars(trim($val), ENT_QUOTES, 'UTF-8');
}
function getBody(): array {
    static $body = null;
    if ($body === null) {
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw, true) ?? [];
    }
    return $body;
}

// ── XP & Gamification ─────────────────────────
function addXP(int $points, int $uid = 0): int {
    $uid = $uid ?: userId();
    $db  = getDB();
    $db->prepare("UPDATE users SET xp_points = xp_points + ? WHERE id = ?")
       ->execute([$points, $uid]);
    return (int)$db->query("SELECT xp_points FROM users WHERE id = $uid")->fetchColumn();
}

function getLevel(int $xp): array {
    $tiers = [
        ['name'=>'Grand Reader','min'=>5000,'next'=>null, 'icon'=>'👑'],
        ['name'=>'Bibliophile', 'min'=>2500,'next'=>5000, 'icon'=>'🏆'],
        ['name'=>'Scholar',     'min'=>1000,'next'=>2500, 'icon'=>'🎓'],
        ['name'=>'Bookworm',    'min'=>500, 'next'=>1000, 'icon'=>'🐛'],
        ['name'=>'Pembaca',     'min'=>200, 'next'=>500,  'icon'=>'📖'],
        ['name'=>'Pemula',      'min'=>0,   'next'=>200,  'icon'=>'🌱'],
    ];
    foreach ($tiers as $t) {
        if ($xp >= $t['min']) {
            $pct = $t['next'] ? round(($xp-$t['min'])/($t['next']-$t['min'])*100) : 100;
            return ['name'=>$t['name'],'icon'=>$t['icon'],'xp'=>$xp,
                    'min'=>$t['min'],'next'=>$t['next'],'percent'=>$pct];
        }
    }
    return ['name'=>'Pemula','icon'=>'🌱','xp'=>$xp,'min'=>0,'next'=>200,'percent'=>0];
}

function checkBadges(int $uid = 0): void {
    $uid = $uid ?: userId();
    $db  = getDB();
    $badge = fn(string $key) =>
        $db->prepare("INSERT IGNORE INTO badges (user_id,badge_key) VALUES (?,?)")
           ->execute([$uid, $key]);

    $noteCount  = (int)$db->query("SELECT COUNT(*) FROM notes  WHERE user_id=$uid")->fetchColumn();
    $bookCount  = (int)$db->query("SELECT COUNT(*) FROM books  WHERE user_id=$uid")->fetchColumn();
    $doneCount  = (int)$db->query("SELECT COUNT(*) FROM books  WHERE user_id=$uid AND status='done'")->fetchColumn();
    $quoteCount = (int)$db->query("SELECT COUNT(*) FROM quotes WHERE user_id=$uid")->fetchColumn();
    $ratedCount = (int)$db->query("SELECT COUNT(*) FROM books  WHERE user_id=$uid AND rating>0")->fetchColumn();
    $xp         = (int)$db->query("SELECT xp_points FROM users WHERE id=$uid")->fetchColumn();

    if ($noteCount  >= 1)    $badge('first_note');
    if ($bookCount  >= 5)    $badge('five_books');
    if ($doneCount  >= 1)    $badge('reader');
    if ($doneCount  >= 10)   $badge('ten_books_done');
    if ($quoteCount >= 10)   $badge('ten_quotes');
    if ($ratedCount >= 10)   $badge('ten_ratings');
    if ($xp         >= 1000) $badge('scholar');
    if ($xp         >= 2500) $badge('bibliophile');
    if ($xp         >= 5000) $badge('grand_reader');

    // Streak 7 hari
    $days = (int)$db->query(
        "SELECT COUNT(DISTINCT logged_date) FROM reading_logs
         WHERE user_id=$uid AND logged_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)"
    )->fetchColumn();
    if ($days >= 7) {
        $already = (int)$db->query(
            "SELECT COUNT(*) FROM badges WHERE user_id=$uid AND badge_key='streak_7'"
        )->fetchColumn();
        if (!$already) { $badge('streak_7'); addXP(20, $uid); }
    }
}

// ── User targets helper ───────────────────────
function getUserTargets(int $uid = 0): array {
    $uid  = $uid ?: userId();
    $rows = getDB()->prepare("SELECT type, target_value FROM user_targets WHERE user_id = ?");
    $rows->execute([$uid]);
    $out  = ['monthly_books'=>5,'daily_pages'=>20,'weekly_notes'=>3];
    foreach ($rows->fetchAll() as $r) $out[$r['type']] = (int)$r['target_value'];
    return $out;
}

// ── Ensure user has targets ───────────────────
function ensureUserTargets(int $uid): void {
    $db = getDB();
    foreach (['monthly_books'=>5,'daily_pages'=>20,'weekly_notes'=>3] as $type => $val) {
        $db->prepare("INSERT IGNORE INTO user_targets (user_id,type,target_value) VALUES (?,?,?)")
           ->execute([$uid, $type, $val]);
    }
}
