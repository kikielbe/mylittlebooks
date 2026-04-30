<?php
// ============================================
// MY LITTLE BOOKS — Share API
// POST /api/share.php?action=create   → buat share link
// GET  /api/share.php?action=get&token=xxx → ambil catatan publik
// POST /api/share.php?action=revoke   → cabut share
// GET  /api/share.php?action=list     → list share milik user
// ============================================
require_once __DIR__ . '/db.php';

_ensureTable();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// get adalah endpoint publik — tidak perlu auth
if ($action === 'get') { getSharedNote(); exit; }

requireAuth();

match("$method:$action") {
    'POST:create' => createShare(),
    'POST:revoke' => revokeShare(),
    'GET:list'    => listShares(),
    default       => jsonError(400, 'Invalid action')
};

function _ensureTable(): void {
    getDB()->exec("CREATE TABLE IF NOT EXISTS shared_notes (
        id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        note_id    INT UNSIGNED NOT NULL,
        user_id    INT UNSIGNED NOT NULL,
        token      VARCHAR(64) NOT NULL UNIQUE,
        title      VARCHAR(200) DEFAULT '',
        expires_at DATETIME DEFAULT NULL,
        view_count INT UNSIGNED DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_token (token),
        KEY idx_user  (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ── Create share link ─────────────────────────
function createShare(): void {
    $body    = getBody();
    $note_id = (int)($body['note_id'] ?? 0);
    $expires = $body['expires'] ?? 'forever'; // 1d | 7d | 30d | forever
    $uid     = userId();
    $db      = getDB();

    if (!$note_id) jsonError(400, 'note_id wajib diisi');

    // Verify note belongs to user
    $stmt = $db->prepare("SELECT id, note_title FROM notes WHERE id = ? AND user_id = ? LIMIT 1");
    $stmt->execute([$note_id, $uid]);
    $note = $stmt->fetch();
    if (!$note) jsonError(404, 'Catatan tidak ditemukan');

    // Check if already shared — return existing
    $existing = $db->prepare("SELECT token FROM shared_notes WHERE note_id = ? AND user_id = ? LIMIT 1");
    $existing->execute([$note_id, $uid]);
    $ex = $existing->fetch();
    if ($ex) {
        // Update expiry
        $expiresAt = _calcExpiry($expires);
        $db->prepare("UPDATE shared_notes SET expires_at = ? WHERE token = ?")
           ->execute([$expiresAt, $ex['token']]);
        jsonSuccess(['token' => $ex['token'], 'new' => false], 'Link share diperbarui ✓');
    }

    // Generate secure token
    $token = bin2hex(random_bytes(24)); // 48 char hex
    $expiresAt = _calcExpiry($expires);

    $db->prepare("INSERT INTO shared_notes (note_id, user_id, token, title, expires_at)
                  VALUES (?, ?, ?, ?, ?)")
       ->execute([$note_id, $uid, $token, $note['note_title'], $expiresAt]);

    jsonSuccess(['token' => $token, 'new' => true], 'Link share dibuat ✓');
}

function _calcExpiry(string $expires): ?string {
    return match($expires) {
        '1d'  => date('Y-m-d H:i:s', strtotime('+1 day')),
        '7d'  => date('Y-m-d H:i:s', strtotime('+7 days')),
        '30d' => date('Y-m-d H:i:s', strtotime('+30 days')),
        default => null,
    };
}

// ── Get public shared note ─────────────────────
function getSharedNote(): void {
    $token = $_GET['token'] ?? '';
    if (!$token) jsonError(400, 'Token tidak valid');

    $db   = getDB();
    $stmt = $db->prepare(
        "SELECT s.*, n.note_title, n.content, n.page_start, n.page_end,
                n.tags, n.rating, n.created_at AS note_created,
                b.title AS book_title, b.author, b.cover_filename, b.genre,
                u.display_name AS author_name
         FROM shared_notes s
         JOIN notes n ON n.id = s.note_id
         LEFT JOIN books b ON b.id = n.book_id
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? LIMIT 1"
    );
    $stmt->execute([$token]);
    $data = $stmt->fetch();

    if (!$data) jsonError(404, 'Link tidak valid atau sudah dihapus');

    // Check expiry
    if ($data['expires_at'] && strtotime($data['expires_at']) < time()) {
        jsonError(410, 'Link ini sudah kedaluwarsa');
    }

    // Increment view count
    $db->prepare("UPDATE shared_notes SET view_count = view_count + 1 WHERE token = ?")
       ->execute([$token]);

    // Attachments
    $attStmt = $db->prepare("SELECT filename, original_name FROM attachments WHERE note_id = ?");
    $attStmt->execute([$data['note_id']]);
    $data['attachments'] = $attStmt->fetchAll();

    jsonSuccess($data);
}

// ── Revoke share ──────────────────────────────
function revokeShare(): void {
    $body  = getBody();
    $token = $body['token'] ?? '';
    $uid   = userId();
    if (!$token) jsonError(400, 'Token wajib diisi');

    $stmt = getDB()->prepare("DELETE FROM shared_notes WHERE token = ? AND user_id = ?");
    $stmt->execute([$token, $uid]);
    if ($stmt->rowCount() === 0) jsonError(404, 'Share tidak ditemukan');

    jsonSuccess(null, 'Share berhasil dicabut');
}

// ── List user shares ──────────────────────────
function listShares(): void {
    $uid  = userId();
    $stmt = getDB()->prepare(
        "SELECT s.token, s.title, s.view_count, s.created_at, s.expires_at,
                n.note_title, b.title AS book_title
         FROM shared_notes s
         JOIN notes n ON n.id = s.note_id
         LEFT JOIN books b ON b.id = n.book_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC"
    );
    $stmt->execute([$uid]);
    jsonSuccess($stmt->fetchAll());
}
