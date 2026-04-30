<?php
// ============================================
// MY LITTLE BOOKS — Cron Reminder (Multi-User)
//
// Setup cron di hosting (cPanel):
// 0 * * * * php /path/to/mylittlebooks/api/cron_reminder.php
// (Jalan setiap jam, kirim ke user sesuai jam notif mereka)
//
// Test manual:
// php api/cron_reminder.php
// ============================================
require_once __DIR__ . '/db.php';

$telegram_token = '';
if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';

if (empty($telegram_token) || str_contains($telegram_token, 'XXXXX')) {
    echo "[CRON] Telegram token belum dikonfigurasi. Skip.\n"; exit(0);
}

$db          = getDB();
$currentHour = (int)date('H');
$today       = date('Y-m-d');

echo "[CRON] Jam: {$currentHour}:00 · {$today}\n";

// ── Ambil semua user aktif yang sudah setup Telegram ─
$users = $db->query(
    "SELECT id, username, display_name, telegram_chat_id, notif_hour
     FROM users
     WHERE is_active=1
       AND telegram_chat_id IS NOT NULL
       AND telegram_chat_id != ''
       AND notif_enabled = 1
       AND notif_hour = $currentHour"
)->fetchAll();

if (empty($users)) {
    echo "[CRON] Tidak ada user yang jadwal notifnya jam {$currentHour}:00\n";
    exit(0);
}

echo "[CRON] Kirim ke " . count($users) . " user\n";

foreach ($users as $user) {
    $uid    = (int)$user['id'];
    $name   = $user['display_name'];
    $chatId = $user['telegram_chat_id'];

    echo "[CRON] Processing: @{$user['username']} (uid=$uid)\n";

    // 1. Reminder hari ini
    $reminders = $db->query(
        "SELECT * FROM reminders
         WHERE user_id=$uid AND reminder_date='$today' AND is_done=0
         AND (type='once' OR type='daily' OR (type='weekly' AND DAYOFWEEK(CURDATE())=DAYOFWEEK(reminder_date)))"
    )->fetchAll();

    if (!empty($reminders)) {
        $msg = "🔔 *Reminder Hari Ini*\n\n";
        foreach ($reminders as $r) {
            $time = $r['reminder_time'] ? " ⏰ " . substr($r['reminder_time'],0,5) : "";
            $msg .= "• *{$r['title']}*{$time}\n";
            if ($r['note']) $msg .= "  _{$r['note']}_\n";
        }
        _send($telegram_token, $chatId, $msg);
    }

    // 2. Daily progress report
    $targets = [];
    $tRows   = $db->query("SELECT type, target_value FROM user_targets WHERE user_id=$uid")->fetchAll();
    foreach ($tRows as $t) $targets[$t['type']] = (int)$t['target_value'];

    $monthDone  = (int)$db->query("SELECT COUNT(*) FROM books WHERE user_id=$uid AND status='done' AND MONTH(finished_at)=MONTH(CURDATE()) AND YEAR(finished_at)=YEAR(CURDATE())")->fetchColumn();
    $todayPages = (int)$db->query("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=$uid AND logged_date=CURDATE()")->fetchColumn();
    $weekNotes  = (int)$db->query("SELECT COUNT(*) FROM notes WHERE user_id=$uid AND created_at>=DATE_SUB(CURDATE(), INTERVAL 6 DAY)")->fetchColumn();
    $xp         = (int)$db->query("SELECT xp_points FROM users WHERE id=$uid")->fetchColumn();

    // Streak
    $logs   = $db->query("SELECT DISTINCT logged_date FROM reading_logs WHERE user_id=$uid ORDER BY logged_date DESC LIMIT 30")->fetchAll(PDO::FETCH_COLUMN);
    $streak = 0; $check = new DateTime('today');
    foreach ($logs as $d) { if ($d===$check->format('Y-m-d')) { $streak++; $check->modify('-1 day'); } else break; }

    // Motivasi
    $targPages = $targets['daily_pages'] ?? 20;
    if ($todayPages === 0) $mot = "📖 Belum baca hari ini? Yuk mulai sesi Pomodoro!";
    elseif ($todayPages >= $targPages) $mot = "🎉 Target halaman hari ini tercapai! Keren!";
    else $mot = "💪 Kurang " . ($targPages - $todayPages) . " halaman lagi untuk capai target!";

    $report = "📚 *Daily Report — {$name}*\n\n"
            . "📊 *Progress:*\n"
            . "• Halaman hari ini: *{$todayPages}* / {$targPages}\n"
            . "• Streak: *{$streak} hari* 🔥\n"
            . "• Buku selesai bulan ini: *{$monthDone}* / " . ($targets['monthly_books']??5) . "\n"
            . "• Catatan minggu ini: *{$weekNotes}* / " . ($targets['weekly_notes']??3) . "\n"
            . "• Total XP: *{$xp} XP*\n\n"
            . "💬 {$mot}\n";

    // Buku deadline urgent
    $urgentBooks = $db->query(
        "SELECT s.*, b.title, b.current_page, b.total_pages
         FROM book_schedules s JOIN books b ON b.id=s.book_id
         WHERE b.user_id=$uid AND b.status='reading'
         AND DATEDIFF(s.target_date, CURDATE()) BETWEEN 0 AND 7
         LIMIT 3"
    )->fetchAll();

    if (!empty($urgentBooks)) {
        $report .= "\n⏰ *Deadline Mendekat:*\n";
        foreach ($urgentBooks as $ub) {
            $dl  = (int)(new DateTime($ub['target_date']))->diff(new DateTime('today'))->format('%r%a');
            $pct = $ub['total_pages'] > 0 ? round($ub['current_page']/$ub['total_pages']*100) : 0;
            $report .= "• *{$ub['title']}* — {$dl} hari ({$pct}%)\n";
        }
    }

    // Spaced repetition pending
    $reviewPending = (int)$db->query(
        "SELECT COUNT(*) FROM notes n LEFT JOIN note_reviews r ON r.note_id=n.id
         WHERE n.user_id=$uid AND COALESCE(r.next_review, DATE_ADD(n.created_at, INTERVAL 1 DAY)) <= CURDATE()"
    )->fetchColumn();

    if ($reviewPending > 0) {
        $report .= "\n🧠 *{$reviewPending} catatan* perlu direview hari ini";
    }

    $report .= "\n\n_" . date('d M Y') . " · My Little Books_";

    _send($telegram_token, $chatId, $report);
    echo "[CRON] ✅ Sent to @{$user['username']}\n";

    // Jeda antar user (anti-rate-limit)
    if (count($users) > 1) sleep(1);
}

// ── Weekly Insight (Senin pagi) ───────────────
$isMonday = date('N') === '1'; // 1 = Monday
if ($isMonday) {
    echo "[CRON] Senin — mengirim Weekly Insight...\n";
    _sendWeeklyInsight($telegram_token, $db, $groq_api_key ?? '');
}

function _sendWeeklyInsight(string $token, PDO $db, string $groqKey): void {
    if (empty($groqKey) || str_contains($groqKey, 'XXXXX')) {
        echo "[CRON] Groq key belum diisi, skip weekly insight\n";
        return;
    }

    $users = $db->query(
        "SELECT id, username, display_name, telegram_chat_id FROM users
         WHERE is_active=1 AND telegram_chat_id IS NOT NULL
         AND telegram_chat_id != '' AND notif_enabled=1"
    )->fetchAll();

    foreach ($users as $user) {
        $uid  = (int)$user['id'];
        $name = $user['display_name'];

        // Data minggu ini
        $weekPages = (int)$db->query(
            "SELECT COALESCE(SUM(pages_read),0) FROM reading_logs
             WHERE user_id=$uid AND logged_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
        )->fetchColumn();

        $weekNotes = (int)$db->query(
            "SELECT COUNT(*) FROM notes
             WHERE user_id=$uid AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
        )->fetchColumn();

        // Top topics dari tags catatan minggu ini
        $tagRows = $db->query(
            "SELECT tags FROM notes WHERE user_id=$uid
             AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             AND tags != '' LIMIT 20"
        )->fetchAll(PDO::FETCH_COLUMN);

        $tagMap = [];
        foreach ($tagRows as $row) {
            foreach (explode(',', $row) as $t) {
                $t = trim($t);
                if ($t) $tagMap[$t] = ($tagMap[$t] ?? 0) + 1;
            }
        }
        arsort($tagMap);
        $topTopics = array_slice(array_keys($tagMap), 0, 3);

        // Generate insight via Groq
        try {
            $payload = json_encode([
                'model'    => 'llama-3.3-70b-versatile',
                'messages' => [
                    ['role'=>'system','content'=>'Kamu adalah mentor literasi yang inspiratif. Jawab dalam Bahasa Indonesia, hangat dan personal.'],
                    ['role'=>'user',  'content'=>
                        "Data baca minggu ini:\n"
                        ."- Pembaca: $name\n"
                        ."- Halaman dibaca: $weekPages\n"
                        ."- Catatan dibuat: $weekNotes\n"
                        .($topTopics ? "- Topik utama: ".implode(', ', $topTopics)."\n" : '')
                        ."\nBuatkan pesan motivasi mingguan yang personal (150 kata). "
                        ."Apresiasi, insight, tantangan minggu depan, kutipan. Gunakan emoji."]
                ],
                'temperature' => 0.8,
                'max_tokens'  => 500,
            ]);

            $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "Authorization: Bearer $groqKey"],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 30,
            ]);
            $r    = json_decode(curl_exec($ch), true);
            curl_close($ch);
            $insight = $r['choices'][0]['message']['content'] ?? '';
        } catch (\Exception $e) {
            $insight = '';
        }

        if (!$insight) continue;

        $msg = "🌟 *Weekly Insight — {$name}*\n\n$insight\n\n_My Little Books · " . date('d M Y') . "_";
        _send($token, $user['telegram_chat_id'], $msg);
        echo "[CRON] Weekly insight → @{$user['username']}\n";
        sleep(1);
    }
}

function _send(string $token, string $chatId, string $text): void {
    $ch = curl_init("https://api.telegram.org/bot{$token}/sendMessage");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['chat_id'=>$chatId,'text'=>$text,'parse_mode'=>'Markdown']),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $r = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (!($r['ok']??false)) echo "[CRON] Error: " . ($r['description']??"Unknown") . "\n";
}

echo "[CRON] Selesai: " . date('H:i:s') . "\n";
