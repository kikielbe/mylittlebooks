<?php
// ============================================
// MY LITTLE BOOKS — Google Drive Backup
// POST /api/gdrive.php?action=backup   → upload backup ke Drive
// GET  /api/gdrive.php?action=list     → list file backup di Drive
// POST /api/gdrive.php?action=restore  → restore dari Drive
// GET  /api/gdrive.php?action=status   → cek konfigurasi
// DELETE /api/gdrive.php?action=delete&file_id=xxx → hapus file
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

$gdrive_folder_id = '';
$gdrive_key_file  = __DIR__ . '/gdrive_key.json';
if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

match("$method:$action") {
    'POST:backup'     => doBackupToDrive($gdrive_folder_id, $gdrive_key_file),
    'GET:list'        => listDriveFiles($gdrive_folder_id, $gdrive_key_file),
    'POST:restore'    => restoreFromDrive($gdrive_key_file),
    'GET:status'      => getDriveStatus($gdrive_folder_id, $gdrive_key_file),
    'DELETE:delete'   => deleteFromDrive($gdrive_key_file),
    default           => jsonError(400, 'Invalid action')
};

// ── Status check ──────────────────────────────
function getDriveStatus(string $folderId, string $keyFile): void {
    $configured = !empty($folderId)
        && file_exists($keyFile)
        && filesize($keyFile) > 100;

    jsonSuccess([
        'configured'    => $configured,
        'has_folder_id' => !empty($folderId),
        'has_key_file'  => file_exists($keyFile),
    ]);
}

// ── Backup ke Google Drive ────────────────────
function doBackupToDrive(string $folderId, string $keyFile): void {
    _validateConfig($folderId, $keyFile);

    $db   = getDB();
    $data = _buildBackupData($db);
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    $name = 'mylittlebooks_backup_' . date('Y-m-d_His') . '.json';

    $token = _getAccessToken($keyFile);
    $result = _uploadToDrive($token, $folderId, $name, $json);

    if (isset($result['id'])) {
        jsonSuccess([
            'file_id'  => $result['id'],
            'filename' => $name,
            'size'     => strlen($json),
            'web_link' => $result['webViewLink'] ?? '',
        ], "Backup berhasil diunggah ke Google Drive ✓");
    } else {
        $err = $result['error']['message'] ?? json_encode($result);
        jsonError(500, "Gagal upload ke Drive: $err");
    }
}

// ── List backup files di Drive ────────────────
function listDriveFiles(string $folderId, string $keyFile): void {
    _validateConfig($folderId, $keyFile);

    $token = _getAccessToken($keyFile);
    $q     = urlencode("'$folderId' in parents and name contains 'mylittlebooks_backup' and trashed=false");
    $url   = "https://www.googleapis.com/drive/v3/files?q={$q}&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime+desc&pageSize=20";

    $res   = _curlGet($url, $token);
    $files = $res['files'] ?? [];

    // Format size
    foreach ($files as &$f) {
        $bytes = (int)($f['size'] ?? 0);
        $f['size_label'] = $bytes > 1024 ? round($bytes/1024, 1).' KB' : $bytes.' B';
        $f['date_label'] = date('d M Y H:i', strtotime($f['createdTime'] ?? 'now'));
    }

    jsonSuccess($files);
}

// ── Restore dari Drive ────────────────────────
function restoreFromDrive(string $keyFile): void {
    if (!file_exists($keyFile)) jsonError(400, 'Key file tidak ditemukan');

    $body    = getBody();
    $file_id = $body['file_id'] ?? '';
    if (!$file_id) jsonError(400, 'file_id wajib diisi');

    $token   = _getAccessToken($keyFile);
    $url     = "https://www.googleapis.com/drive/v3/files/{$file_id}?alt=media";
    $content = _curlGetRaw($url, $token);

    if (!$content) jsonError(500, 'Gagal mengunduh file dari Drive');

    $data = json_decode($content, true);
    if (!$data || ($data['app'] ?? '') !== 'mylittlebooks')
        jsonError(400, 'File backup tidak valid');

    // Jalankan restore — sama seperti api/backup.php
    $db = getDB();
    try {
        $db->beginTransaction();
        $db->exec("SET FOREIGN_KEY_CHECKS=0");
        foreach (['reading_logs','attachments','quotes','notes','books','reminders','badges'] as $t)
            $db->exec("TRUNCATE TABLE $t");
        $db->exec("SET FOREIGN_KEY_CHECKS=1");

        _restoreTable($db, $data['books'] ?? [], "INSERT INTO books
            (id,title,author,isbn,cover_filename,genre,description,status,
             total_pages,current_page,started_at,finished_at,rating,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            fn($r) => [$r['id'],$r['title'],$r['author'],$r['isbn'],$r['cover_filename'],
                $r['genre'],$r['description'],$r['status'],$r['total_pages'],
                $r['current_page'],$r['started_at'],$r['finished_at'],
                $r['rating'],$r['created_at'],$r['updated_at']]);

        _restoreTable($db, $data['notes'] ?? [], "INSERT INTO notes
            (id,book_id,note_title,content,page_start,page_end,rating,tags,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)",
            fn($r) => [$r['id'],$r['book_id'],$r['note_title'],$r['content'],
                $r['page_start'],$r['page_end'],$r['rating'],$r['tags'],
                $r['created_at'],$r['updated_at']]);

        _restoreTable($db, $data['quotes'] ?? [], "INSERT INTO quotes (id,book_id,quote_text,page_number,created_at) VALUES (?,?,?,?,?)",
            fn($r) => [$r['id'],$r['book_id'],$r['quote_text'],$r['page_number'],$r['created_at']]);

        _restoreTable($db, $data['reminders'] ?? [], "INSERT INTO reminders
            (id,title,reminder_date,reminder_time,type,note,is_done,created_at) VALUES (?,?,?,?,?,?,?,?)",
            fn($r) => [$r['id'],$r['title'],$r['reminder_date'],$r['reminder_time'],
                $r['type'],$r['note'],$r['is_done'],$r['created_at']]);

        _restoreTable($db, $data['badges'] ?? [], "INSERT INTO badges (id,badge_key,earned_at) VALUES (?,?,?)",
            fn($r) => [$r['id'],$r['badge_key'],$r['earned_at']]);

        _restoreTable($db, $data['logs'] ?? [], "INSERT INTO reading_logs
            (id,book_id,note_id,pages_read,logged_date,created_at) VALUES (?,?,?,?,?,?)",
            fn($r) => [$r['id'],$r['book_id'],$r['note_id'],$r['pages_read'],$r['logged_date'],$r['created_at']]);

        foreach ($data['targets'] ?? [] as $t)
            $db->prepare("UPDATE targets SET target_value=? WHERE type=?")->execute([$t['target_value'],$t['type']]);

        if (!empty($data['user']))
            $db->prepare("UPDATE users SET display_name=?, xp_points=? WHERE id=1")
               ->execute([$data['user']['display_name'], $data['user']['xp_points']]);

        $db->commit();
        jsonSuccess(null, 'Restore dari Google Drive berhasil! 🎉');

    } catch(Exception $e) {
        $db->rollBack();
        jsonError(500, 'Restore gagal: ' . $e->getMessage());
    }
}

// ── Delete file dari Drive ────────────────────
function deleteFromDrive(string $keyFile): void {
    if (!file_exists($keyFile)) jsonError(400, 'Key file tidak ditemukan');
    $fileId = $_GET['file_id'] ?? '';
    if (!$fileId) jsonError(400, 'file_id wajib diisi');

    $token = _getAccessToken($keyFile);
    $ch = curl_init("https://www.googleapis.com/drive/v3/files/$fileId");
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'DELETE',
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer $token"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $code = 0;
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 204) jsonSuccess(null, 'File berhasil dihapus');
    else jsonError(500, "Gagal menghapus (HTTP $code)");
}

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

function _validateConfig(string $folderId, string $keyFile): void {
    if (empty($folderId))          jsonError(400, 'Google Drive Folder ID belum diisi di ai_config.php');
    if (!file_exists($keyFile))    jsonError(400, 'File gdrive_key.json tidak ditemukan di folder api/');
    if (filesize($keyFile) < 100)  jsonError(400, 'File gdrive_key.json tidak valid');
}

function _buildBackupData(PDO $db): array {
    return [
        'app'       => 'mylittlebooks',
        'version'   => '1.0',
        'exported'  => date('c'),
        'books'     => $db->query("SELECT * FROM books ORDER BY id")->fetchAll(),
        'notes'     => $db->query("SELECT * FROM notes ORDER BY id")->fetchAll(),
        'quotes'    => $db->query("SELECT * FROM quotes ORDER BY id")->fetchAll(),
        'reminders' => $db->query("SELECT * FROM reminders ORDER BY id")->fetchAll(),
        'targets'   => $db->query("SELECT * FROM targets")->fetchAll(),
        'badges'    => $db->query("SELECT * FROM badges ORDER BY id")->fetchAll(),
        'user'      => $db->query("SELECT display_name, xp_points FROM users WHERE id=1")->fetch(),
        'logs'      => $db->query("SELECT * FROM reading_logs ORDER BY id")->fetchAll(),
    ];
}

function _restoreTable(PDO $db, array $rows, string $sql, callable $mapper): void {
    if (empty($rows)) return;
    $stmt = $db->prepare($sql);
    foreach ($rows as $r) $stmt->execute($mapper($r));
}

function _getAccessToken(string $keyFile): string {
    $key   = json_decode(file_get_contents($keyFile), true);
    $now   = time();
    $claim = [
        'iss'   => $key['client_email'],
        'scope' => 'https://www.googleapis.com/auth/drive.file',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ];

    // Build JWT
    $header  = _base64url(json_encode(['alg'=>'RS256','typ'=>'JWT']));
    $payload = _base64url(json_encode($claim));
    $sig     = '';
    openssl_sign("$header.$payload", $sig, $key['private_key'], 'SHA256');
    $jwt = "$header.$payload." . _base64url($sig);

    // Exchange for access token
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$jwt]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res   = json_decode(curl_exec($ch), true);
    curl_close($ch);

    if (empty($res['access_token']))
        jsonError(500, 'Gagal mendapatkan akses token Google: ' . ($res['error_description'] ?? json_encode($res)));

    return $res['access_token'];
}

function _uploadToDrive(string $token, string $folderId, string $name, string $content): array {
    $meta = json_encode(['name' => $name, 'parents' => [$folderId]]);
    $body = "--boundary\r\nContent-Type: application/json\r\n\r\n{$meta}\r\n"
          . "--boundary\r\nContent-Type: application/json\r\n\r\n{$content}\r\n--boundary--";

    $ch = curl_init('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => [
            "Authorization: Bearer $token",
            'Content-Type: multipart/related; boundary=boundary',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true) ?? [];
}

function _curlGet(string $url, string $token): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer $token"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true) ?? [];
}

function _curlGetRaw(string $url, string $token): string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer $token"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return $res ?: '';
}

function _base64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
