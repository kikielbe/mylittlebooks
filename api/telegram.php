<?php
// ============================================
// MY LITTLE BOOKS — Telegram Notifikasi
// POST /api/telegram.php?action=test      → test kirim pesan
// POST /api/telegram.php?action=send      → kirim notif manual
// GET  /api/telegram.php?action=get_chat  → ambil chat_id dari getUpdates
// POST /api/telegram.php?action=save_config → simpan token & chat_id
// GET  /api/telegram.php?action=status    → cek status konfigurasi
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

match("$method:$action") {
    'POST:test'        => testTelegram(),
    'POST:send'        => sendManual(),
    'GET:get_chat'     => getChatId(),
    'POST:save_config' => saveConfig(),
    'GET:status'       => getStatus(),
    default            => jsonError(400, 'Invalid action')
};

// ── Load config ───────────────────────────────
function _loadConfig(): array {
    $cfg = ['token' => '', 'chat_id' => ''];
    if (file_exists(__DIR__ . '/ai_config.php')) {
        require __DIR__ . '/ai_config.php';
        $cfg['token']   = $telegram_token   ?? '';
        $cfg['chat_id'] = $telegram_chat_id ?? '';
    }
    return $cfg;
}

// ── Status ────────────────────────────────────
function getStatus(): void {
    $cfg = _loadConfig();
    $configured = !empty($cfg['token'])
        && !str_contains($cfg['token'], 'XXXX')
        && !empty($cfg['chat_id'])
        && $cfg['chat_id'] !== '000000000';

    jsonSuccess([
        'configured' => $configured,
        'has_token'  => !empty($cfg['token']) && !str_contains($cfg['token'], 'XXXX'),
        'has_chat'   => !empty($cfg['chat_id']) && $cfg['chat_id'] !== '000000000',
        'chat_id'    => $configured ? $cfg['chat_id'] : '',
    ]);
}

// ── Test kirim pesan ──────────────────────────
function testTelegram(): void {
    $cfg = _loadConfig();
    if (empty($cfg['token']) || str_contains($cfg['token'], 'XXXX'))
        jsonError(400, 'Token Telegram belum diisi di api/ai_config.php');
    if (empty($cfg['chat_id']) || $cfg['chat_id'] === '000000000')
        jsonError(400, 'Chat ID belum diisi. Klik "Ambil Chat ID" terlebih dahulu');

    $db   = getDB();
    $user = $db->query("SELECT display_name, xp_points FROM users WHERE id=1")->fetch();
    $name = $user['display_name'] ?? 'Reader';
    $xp   = $user['xp_points']   ?? 0;

    $msg = "📚 *My Little Books — Test Notifikasi*\n\n"
         . "Halo *{$name}*! Telegram sudah terhubung ✅\n\n"
         . "📊 XP kamu saat ini: *{$xp} XP*\n"
         . "🕐 " . date('d M Y, H:i') . " WIB\n\n"
         . "_Notifikasi reminder akan dikirim ke sini_";

    $result = _sendMessage($cfg['token'], $cfg['chat_id'], $msg);
    if ($result['ok']) {
        jsonSuccess(null, 'Pesan test berhasil dikirim! Cek Telegram kamu 📱');
    } else {
        jsonError(400, 'Gagal kirim: ' . ($result['description'] ?? 'Unknown error'));
    }
}

// ── Kirim manual ──────────────────────────────
function sendManual(): void {
    $body = getBody();
    $msg  = $body['message'] ?? '';
    if (!$msg) jsonError(400, 'Pesan tidak boleh kosong');

    $cfg = _loadConfig();
    if (empty($cfg['token']) || str_contains($cfg['token'], 'XXXX'))
        jsonError(400, 'Token belum dikonfigurasi');

    $result = _sendMessage($cfg['token'], $cfg['chat_id'], $msg);
    if ($result['ok']) jsonSuccess(null, 'Pesan terkirim!');
    else jsonError(400, 'Gagal: ' . ($result['description'] ?? 'Error'));
}

// ── Ambil chat_id ─────────────────────────────
function getChatId(): void {
    $token = $_GET['token'] ?? '';
    if (!$token) jsonError(400, 'Token wajib diisi');

    $url    = "https://api.telegram.org/bot{$token}/getUpdates?limit=5&offset=-5";
    $result = _curlGet($url);

    if (!$result['ok']) {
        jsonError(400, 'Token tidak valid: ' . ($result['description'] ?? 'Error'));
    }

    $updates = $result['result'] ?? [];
    if (empty($updates)) {
        jsonError(400, 'Belum ada pesan. Kirim pesan ke bot kamu dulu, lalu klik Ambil Chat ID lagi');
    }

    // Ambil chat_id dari pesan terbaru
    $latest  = end($updates);
    $chatId  = $latest['message']['chat']['id']
            ?? $latest['callback_query']['message']['chat']['id']
            ?? null;
    $name    = $latest['message']['chat']['first_name']
            ?? $latest['message']['chat']['username']
            ?? 'Unknown';

    if (!$chatId) jsonError(400, 'Tidak bisa menemukan chat_id. Pastikan sudah kirim pesan ke bot');

    jsonSuccess(['chat_id' => (string)$chatId, 'name' => $name],
                "Chat ID ditemukan! Nama: $name");
}

// ── Simpan config ─────────────────────────────
function saveConfig(): void {
    $body    = getBody();
    $token   = trim($body['token']   ?? '');
    $chat_id = trim($body['chat_id'] ?? '');

    if (!$token || !$chat_id) jsonError(400, 'Token dan Chat ID wajib diisi');

    $configFile = __DIR__ . '/ai_config.php';
    if (!file_exists($configFile)) jsonError(500, 'File ai_config.php tidak ditemukan');

    $content = file_get_contents($configFile);

    // Replace token
    $content = preg_replace(
        "/\\\$telegram_token\s*=\s*'[^']*';/",
        "\$telegram_token   = '{$token}';",
        $content
    );
    // Replace chat_id
    $content = preg_replace(
        "/\\\$telegram_chat_id\s*=\s*'[^']*';/",
        "\$telegram_chat_id = '{$chat_id}';",
        $content
    );

    if (file_put_contents($configFile, $content) === false)
        jsonError(500, 'Gagal menyimpan config');

    jsonSuccess(['token' => $token, 'chat_id' => $chat_id], 'Konfigurasi Telegram tersimpan ✓');
}

// ── Core: kirim pesan ─────────────────────────
function _sendMessage(string $token, string $chatId, string $text): array {
    $url     = "https://api.telegram.org/bot{$token}/sendMessage";
    $payload = json_encode([
        'chat_id'    => $chatId,
        'text'       => $text,
        'parse_mode' => 'Markdown',
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true) ?? ['ok' => false, 'description' => 'No response'];
}

function _curlGet(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true) ?? ['ok' => false];
}
