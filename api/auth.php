<?php
// ============================================
// MY LITTLE BOOKS — Auth API v3
// POST /api/auth.php?action=register
// POST /api/auth.php?action=login
// POST /api/auth.php?action=logout
// GET  /api/auth.php?action=check
// POST /api/auth.php?action=update_profile
// POST /api/auth.php?action=change_password
// GET  /api/auth.php?action=stats
// GET  /api/auth.php?action=list_users     (admin)
// POST /api/auth.php?action=create_user    (admin)
// POST /api/auth.php?action=update_user    (admin)
// POST /api/auth.php?action=delete_user    (admin)
// POST /api/auth.php?action=reset_password (admin)
// ============================================
require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';

match($action) {
    'register'       => handleRegister(),
    'login'          => handleLogin(),
    'logout'         => handleLogout(),
    'check'          => handleCheck(),
    'update_profile' => handleUpdateProfile(),
    'change_password'=> handleChangePassword(),
    'stats'          => handleStats(),
    'list_users'     => handleListUsers(),
    'create_user'    => handleCreateUser(),
    'update_user'    => handleUpdateUser(),
    'delete_user'    => handleDeleteUser(),
    'reset_password' => handleResetPassword(),
    default          => jsonError(400, 'Invalid action')
};

// ── Register ──────────────────────────────────
function handleRegister(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'Method not allowed');

    $body        = getBody();
    $username    = trim($body['username']     ?? '');
    $password    = $body['password']          ?? '';
    $display     = sanitize($body['display_name'] ?? $username);
    $email       = trim($body['email']        ?? '');

    if (!$username) jsonError(400, 'Username wajib diisi');
    if (!$password) jsonError(400, 'Password wajib diisi');
    if (strlen($password) < 6) jsonError(400, 'Password minimal 6 karakter');
    if (!preg_match('/^[a-zA-Z0-9_\.]+$/', $username))
        jsonError(400, 'Username hanya boleh huruf, angka, underscore, titik');

    $db = getDB();

    // Check duplicate
    $check = $db->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
    $check->execute([$username]);
    if ($check->fetch()) jsonError(409, 'Username sudah digunakan');

    if ($email) {
        $checkEmail = $db->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
        $checkEmail->execute([$email]);
        if ($checkEmail->fetch()) jsonError(409, 'Email sudah digunakan');
    }

    // Count existing users — first user becomes admin
    $count = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $role  = $count === 0 ? 'admin' : 'member';

    $db->prepare("INSERT INTO users (username, email, password_hash, display_name, role)
                  VALUES (?, ?, ?, ?, ?)")
       ->execute([$username, $email ?: null, password_hash($password, PASSWORD_BCRYPT), $display, $role]);

    $uid = (int)$db->lastInsertId();
    ensureUserTargets($uid);

    if (session_status() === PHP_SESSION_NONE) session_start();
    session_regenerate_id(true);
    $_SESSION['user_id']      = $uid;
    $_SESSION['username']     = $username;
    $_SESSION['display_name'] = $display;
    $_SESSION['role']         = $role;

    jsonSuccess([
        'id'           => $uid,
        'username'     => $username,
        'display_name' => $display,
        'role'         => $role,
        'xp_points'    => 0,
        'level'        => getLevel(0),
    ], 'Registrasi berhasil! Selamat datang 🎉');
}

// ── Login ─────────────────────────────────────
function handleLogin(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'Method not allowed');

    $body     = getBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password']      ?? '';

    if (!$username || !$password) jsonError(400, 'Username dan password wajib diisi');

    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT id, username, password_hash, display_name, xp_points, role, is_active
         FROM users WHERE username = ? OR email = ? LIMIT 1"
    );
    $stmt->execute([$username, $username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash']))
        jsonError(401, 'Username atau password salah');

    if (!$user['is_active'])
        jsonError(403, 'Akun tidak aktif. Hubungi admin.');

    // Update last_login
    $db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")
       ->execute([$user['id']]);

    if (session_status() === PHP_SESSION_NONE) session_start();
    session_regenerate_id(true);
    $_SESSION['user_id']      = $user['id'];
    $_SESSION['username']     = $user['username'];
    $_SESSION['display_name'] = $user['display_name'];
    $_SESSION['role']         = $user['role'];

    jsonSuccess([
        'id'           => $user['id'],
        'username'     => $user['username'],
        'display_name' => $user['display_name'],
        'role'         => $user['role'],
        'xp_points'    => (int)$user['xp_points'],
        'level'        => getLevel((int)$user['xp_points']),
    ], 'Login berhasil');
}

// ── Logout ────────────────────────────────────
function handleLogout(): void {
    if (session_status() === PHP_SESSION_NONE) session_start();
    session_destroy();
    jsonSuccess(null, 'Logout berhasil');
}

// ── Check session ─────────────────────────────
function handleCheck(): void {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['user_id'])) {
        jsonResponse(['authenticated' => false]);
    }
    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT id, username, display_name, xp_points, role, avatar,
                telegram_chat_id, notif_enabled, notif_hour,
                reading_font_size, language
         FROM users WHERE id = ? AND is_active = 1 LIMIT 1"
    );
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) { session_destroy(); jsonResponse(['authenticated' => false]); }

    jsonResponse([
        'authenticated' => true,
        'user' => array_merge($user, ['level' => getLevel((int)$user['xp_points'])])
    ]);
}

// ── Update profile ────────────────────────────
function handleUpdateProfile(): void {
    requireAuth();
    $body  = getBody();
    $uid   = userId();
    $db    = getDB();

    $display  = sanitize($body['display_name']     ?? '');
    $email    = trim($body['email']               ?? '');
    $tg_chat  = trim($body['telegram_chat_id']    ?? '');
    $notif_h  = max(0, min(23, (int)($body['notif_hour']     ?? 7)));
    $notif_en = isset($body['notif_enabled']) ? (int)(bool)$body['notif_enabled'] : 1;
    $font     = in_array($body['reading_font_size'] ?? 'md', ['sm','md','lg'])
                ? $body['reading_font_size'] : 'md';
    $lang     = in_array($body['language'] ?? 'id', ['id','en'])
                ? $body['language'] : 'id';

    if (!$display) jsonError(400, 'Nama tidak boleh kosong');

    $db->prepare("UPDATE users SET
        display_name=?, email=?, telegram_chat_id=?,
        notif_hour=?, notif_enabled=?, reading_font_size=?, language=?
        WHERE id=?")
       ->execute([$display, $email ?: null, $tg_chat ?: null,
                  $notif_h, $notif_en, $font, $lang, $uid]);

    $_SESSION['display_name'] = $display;

    jsonSuccess([
        'display_name'     => $display,
        'telegram_chat_id' => $tg_chat,
    ], 'Profil diperbarui ✓');
}

// ── Change password ───────────────────────────
function handleChangePassword(): void {
    requireAuth();
    $body = getBody();
    $old  = $body['old_password'] ?? '';
    $new  = $body['new_password'] ?? '';
    if (!$old || !$new) jsonError(400, 'Semua field wajib diisi');
    if (strlen($new) < 6) jsonError(400, 'Password baru minimal 6 karakter');

    $db   = getDB();
    $stmt = $db->prepare("SELECT password_hash FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([userId()]);
    $user = $stmt->fetch();
    if (!password_verify($old, $user['password_hash'])) jsonError(400, 'Password lama salah');

    $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?")
       ->execute([password_hash($new, PASSWORD_BCRYPT), userId()]);

    jsonSuccess(null, 'Password berhasil diubah ✓');
}

// ── Dashboard Stats ───────────────────────────
function handleStats(): void {
    requireAuth();
    $uid = userId();
    $db  = getDB();

    $totalBooks   = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid")->fetchColumn();
    $totalNotes   = (int)$db->query("SELECT COUNT(*) FROM notes WHERE user_id=$uid")->fetchColumn();
    $totalDone    = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid AND status='done'")->fetchColumn();
    $totalReading = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid AND status='reading'")->fetchColumn();
    $totalPages   = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=$uid")->fetchColumn();
    $totalQuotes  = (int)$db->query("SELECT COUNT(*) FROM quotes WHERE user_id=$uid")->fetchColumn();

    $monthDone  = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid AND status='done'
                   AND MONTH(finished_at)=MONTH(CURDATE()) AND YEAR(finished_at)=YEAR(CURDATE())")->fetchColumn();
    $weekNotes  = (int)$db->query("SELECT COUNT(*) FROM notes WHERE user_id=$uid
                   AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)")->fetchColumn();
    $todayPages = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs
                   WHERE user_id=$uid AND logged_date=CURDATE()")->fetchColumn();

    // Streak
    $logs   = $db->query("SELECT DISTINCT logged_date FROM reading_logs
                          WHERE user_id=$uid ORDER BY logged_date DESC LIMIT 365")
                ->fetchAll(PDO::FETCH_COLUMN);
    $streak = 0;
    $check  = new DateTime('today');
    foreach ($logs as $d) {
        if ($d === $check->format('Y-m-d')) { $streak++; $check->modify('-1 day'); }
        else break;
    }

    $targets = getUserTargets($uid);

    // Recent notes
    $recentNotes = $db->query("SELECT n.id, n.note_title, n.created_at, b.title AS book_title
         FROM notes n LEFT JOIN books b ON b.id = n.book_id
         WHERE n.user_id=$uid ORDER BY n.created_at DESC LIMIT 5")->fetchAll();

    // Today reminders
    $todayRem = $db->query("SELECT * FROM reminders
         WHERE user_id=$uid AND reminder_date=CURDATE() AND is_done=0
         ORDER BY reminder_time ASC LIMIT 5")->fetchAll();

    // Currently reading
    $reading  = $db->query("SELECT id,title,author,cover_filename,current_page,total_pages
         FROM books WHERE user_id=$uid AND status='reading'
         ORDER BY updated_at DESC LIMIT 3")->fetchAll();

    $xp    = (int)$db->query("SELECT xp_points FROM users WHERE id=$uid")->fetchColumn();
    $level = getLevel($xp);

    jsonSuccess([
        'counts' => [
            'total_books'   => $totalBooks,
            'total_notes'   => $totalNotes,
            'total_done'    => $totalDone,
            'total_reading' => $totalReading,
            'total_pages'   => $totalPages,
            'total_quotes'  => $totalQuotes,
            'month_done'    => $monthDone,
            'week_notes'    => $weekNotes,
            'today_pages'   => $todayPages,
        ],
        'streak'          => $streak,
        'level'           => $level,
        'targets'         => $targets,
        'recent_notes'    => $recentNotes,
        'today_reminders' => $todayRem,
        'reading'         => $reading,
    ]);
}

// ════════════════════════════════════════════════
// ADMIN — User Management
// ════════════════════════════════════════════════

function handleListUsers(): void {
    requireAdmin();
    $db   = getDB();
    $stmt = $db->query(
        "SELECT u.id, u.username, u.email, u.display_name, u.role,
                u.xp_points, u.is_active, u.created_at, u.last_login,
                u.telegram_chat_id,
                (SELECT COUNT(*) FROM books  b WHERE b.user_id=u.id) AS book_count,
                (SELECT COUNT(*) FROM notes  n WHERE n.user_id=u.id) AS note_count
         FROM users u ORDER BY u.created_at ASC"
    );
    $users = $stmt->fetchAll();
    foreach ($users as &$u) $u['level'] = getLevel((int)$u['xp_points']);
    jsonSuccess($users);
}

function handleCreateUser(): void {
    requireAdmin();
    $body     = getBody();
    $username = trim($body['username']     ?? '');
    $password = $body['password']          ?? '';
    $display  = sanitize($body['display_name'] ?? $username);
    $email    = trim($body['email']        ?? '');
    $role     = in_array($body['role'] ?? 'member', ['admin','member'])
                ? $body['role'] : 'member';

    if (!$username || !$password) jsonError(400, 'Username dan password wajib diisi');
    if (strlen($password) < 6) jsonError(400, 'Password minimal 6 karakter');

    $db = getDB();
    $check = $db->prepare("SELECT id FROM users WHERE username = ? LIMIT 1");
    $check->execute([$username]);
    if ($check->fetch()) jsonError(409, 'Username sudah digunakan');

    $db->prepare("INSERT INTO users (username,email,password_hash,display_name,role)
                  VALUES (?,?,?,?,?)")
       ->execute([$username, $email ?: null, password_hash($password, PASSWORD_BCRYPT), $display, $role]);

    $uid = (int)$db->lastInsertId();
    ensureUserTargets($uid);

    jsonSuccess(['id' => $uid, 'username' => $username, 'role' => $role],
                "User {$username} berhasil dibuat ✓");
}

function handleUpdateUser(): void {
    requireAdmin();
    $body = getBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) jsonError(400, 'ID wajib diisi');

    $db = getDB();
    $db->prepare("UPDATE users SET
        display_name=?, email=?, role=?, is_active=?
        WHERE id=?")
       ->execute([
           sanitize($body['display_name'] ?? ''),
           trim($body['email'] ?? '') ?: null,
           in_array($body['role']??'member',['admin','member']) ? $body['role'] : 'member',
           isset($body['is_active']) ? (int)(bool)$body['is_active'] : 1,
           $id
       ]);

    jsonSuccess(null, 'User diperbarui ✓');
}

function handleDeleteUser(): void {
    requireAdmin();
    $body = getBody();
    $id   = (int)($body['id'] ?? 0);
    if (!$id) jsonError(400, 'ID wajib diisi');
    if ($id === userId()) jsonError(400, 'Tidak bisa hapus akun sendiri');

    getDB()->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
    jsonSuccess(null, 'User berhasil dihapus');
}

function handleResetPassword(): void {
    requireAdmin();
    $body = getBody();
    $id   = (int)($body['id']       ?? 0);
    $pass = $body['new_password']   ?? '';
    if (!$id || !$pass) jsonError(400, 'ID dan password baru wajib diisi');
    if (strlen($pass) < 6) jsonError(400, 'Password minimal 6 karakter');

    getDB()->prepare("UPDATE users SET password_hash = ? WHERE id = ?")
           ->execute([password_hash($pass, PASSWORD_BCRYPT), $id]);

    jsonSuccess(null, 'Password berhasil direset ✓');
}
