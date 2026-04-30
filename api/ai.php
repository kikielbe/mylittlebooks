<?php
// ============================================
// MY LITTLE BOOKS — AI Proxy v4 (Groq)
// Types: recommend | summary | analyze | chat | autotag | weekly_insight
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'Method not allowed');

$groq_api_key = '';
if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';

if (empty($groq_api_key) || str_contains($groq_api_key, 'XXXXX'))
    jsonError(503, 'API key belum diisi. Daftar gratis di console.groq.com');

$body = getBody();
$type = $body['type'] ?? 'recommend';
$db   = getDB();

match($type) {
    'recommend'      => handleRecommend($body, $db, $groq_api_key),
    'summary'        => handleSummary($body, $db, $groq_api_key),
    'analyze'        => handleAnalyze($body, $db, $groq_api_key),
    'chat'           => handleChat($body, $db, $groq_api_key),
    'autotag'        => handleAutotag($body, $groq_api_key),
    'weekly_insight' => handleWeeklyInsight($body, $db, $groq_api_key),
    default          => jsonError(400, 'Type tidak valid')
};

// ════════════════════════════════════════════════
// RECOMMEND — 20 buku, filter existing, batch 5
// ════════════════════════════════════════════════
function handleRecommend(array $body, PDO $db, string $key): void {
    $interests     = array_slice($body['interests']      ?? [], 0, 12);
    $done_books    = array_slice($body['done_books']     ?? [], 0, 10);
    $reading_books = array_slice($body['reading_books']  ?? [], 0, 5);
    $existing      = array_slice($body['existing_titles']?? [], 0, 50);
    $batch         = max(1, min(20, (int)($body['batch']  ?? 5)));
    $offset        = max(0, (int)($body['offset'] ?? 0));

    $ctx = '';
    if ($interests)     $ctx .= "Minat: ".implode(', ', $interests).".\n";
    if ($done_books)    $ctx .= "Sudah selesai: ".implode(', ', $done_books).".\n";
    if ($reading_books) $ctx .= "Sedang baca: ".implode(', ', $reading_books).".\n";
    if ($existing)      $ctx .= "JANGAN rekomendasikan buku ini (sudah ada): ".implode(', ', $existing).".\n";
    if (!$ctx)          $ctx = "Pengguna baru.";

    $variety = $offset > 0 ? "Berikan rekomendasi BERBEDA dari sebelumnya." : "";

    $system = "Kamu adalah kurator buku terpercaya. Jawab HANYA dengan JSON array valid, tanpa teks lain.";
    $prompt = "Data pembaca:\n$ctx\n$variety\n\n"
            . "Berikan TEPAT $batch rekomendasi buku relevan dan mudah ditemukan di Indonesia.\n\n"
            . 'Format: [{"title":"...","author":"...","genre":"...","reason":"1-2 kalimat kenapa cocok","rating":"4.5/5","emoji":"📚","available":"Gramedia/Tokopedia"}]';

    jsonSuccess(['text' => callGroq($system, $prompt, $key, 1500), 'type' => 'recommend']);
}

// ════════════════════════════════════════════════
// SUMMARY — ringkasan dari semua catatan buku
// ════════════════════════════════════════════════
function handleSummary(array $body, PDO $db, string $key): void {
    $book_id = (int)($body['book_id'] ?? 0);
    if (!$book_id) jsonError(400, 'book_id wajib diisi');
    $uid = userId();

    $bStmt = $db->prepare("SELECT title, author FROM books WHERE id = ? AND user_id = ? LIMIT 1");
    $bStmt->execute([$book_id, $uid]);
    $book  = $bStmt->fetch();
    if (!$book) jsonError(404, 'Buku tidak ditemukan');

    $nStmt = $db->prepare(
        "SELECT note_title, content, page_start, tags FROM notes
         WHERE book_id = ? AND user_id = ? ORDER BY page_start ASC, created_at ASC LIMIT 30"
    );
    $nStmt->execute([$book_id, $uid]);
    $notes = $nStmt->fetchAll();
    if (empty($notes)) jsonError(400, 'Buku ini belum punya catatan!');

    $notesText = '';
    foreach ($notes as $i => $n) {
        $clean = trim(strip_tags($n['content'] ?? ''));
        if (strlen($clean) > 300) $clean = substr($clean, 0, 300) . '...';
        $page = $n['page_start'] ? "[Hal.{$n['page_start']}]" : '';
        $notesText .= ($i+1).". {$n['note_title']} $page\n$clean\n\n";
    }
    $count = count($notes);

    $system = "Kamu adalah asisten literasi yang membuat ringkasan buku dari catatan pembaca. Jawab dalam Bahasa Indonesia.";
    $prompt = "Buku: \"{$book['title']}\" oleh {$book['author']}\n\n"
            . "Catatan pembaca ($count catatan):\n$notesText\n"
            . "Buatkan ringkasan komprehensif:\n"
            . "## 📖 Tentang Buku\n[Gambaran umum 2-3 kalimat]\n\n"
            . "## 💡 Pelajaran Utama\n[5-7 poin terpenting]\n\n"
            . "## ✍️ Insight Menarik\n[3-5 insight dari catatan]\n\n"
            . "## 🎯 Actionable Takeaways\n[3-4 hal yang bisa dipraktikkan]\n\n"
            . "## ⭐ Kesimpulan\n[1-2 kalimat penutup]\n\n"
            . "Gunakan bahasa inspiratif dan mudah dipahami.";

    jsonSuccess(['text' => callGroq($system, $prompt, $key, 2000), 'type' => 'summary', 'book' => $book, 'count' => $count]);
}

// ════════════════════════════════════════════════
// ANALYZE — analisis singkat per buku
// ════════════════════════════════════════════════
function handleAnalyze(array $body, PDO $db, string $key): void {
    $title  = htmlspecialchars_decode($body['title']  ?? '');
    $author = htmlspecialchars_decode($body['author'] ?? '');
    $notes  = substr($body['notes'] ?? '', 0, 800);
    if (!$title) jsonError(400, 'title wajib diisi');

    $system = "Kamu adalah asisten literasi. Jawab dalam Bahasa Indonesia, ringkas dan inspiratif.";
    $prompt = "Buku: \"$title\" oleh $author\n"
            . ($notes ? "Catatan: $notes\n\n" : "\n")
            . "1. **Ringkasan** (2-3 kalimat)\n"
            . "2. **3 Pelajaran Utama**\n"
            . "3. **Cocok untuk** siapa\n"
            . "4. **2 Buku Serupa**";

    jsonSuccess(['text' => callGroq($system, $prompt, $key, 800), 'type' => 'analyze']);
}

// ════════════════════════════════════════════════
// CHAT — AI Chat per buku (multi-turn)
// ════════════════════════════════════════════════
function handleChat(array $body, PDO $db, string $key): void {
    $book_id  = (int)($body['book_id'] ?? 0);
    $question = trim($body['question'] ?? '');
    $history  = $body['history'] ?? []; // [{role, content}]
    $uid      = userId();

    if (!$question) jsonError(400, 'Pertanyaan tidak boleh kosong');

    // Build book context
    $bookCtx = '';
    if ($book_id) {
        $bStmt = $db->prepare("SELECT title, author, genre FROM books WHERE id=? AND user_id=? LIMIT 1");
        $bStmt->execute([$book_id, $uid]);
        $book = $bStmt->fetch();
        if ($book) {
            $bookCtx = "Buku: \"{$book['title']}\" oleh {$book['author']} (Genre: {$book['genre']})\n\n";

            // Recent notes as context (last 10)
            $nStmt = $db->prepare(
                "SELECT note_title, content, page_start, tags FROM notes
                 WHERE book_id=? AND user_id=? ORDER BY created_at DESC LIMIT 10"
            );
            $nStmt->execute([$book_id, $uid]);
            $notes = $nStmt->fetchAll();
            if ($notes) {
                $bookCtx .= "Catatan pembaca:\n";
                foreach ($notes as $n) {
                    $clean = trim(strip_tags($n['content'] ?? ''));
                    $short = strlen($clean) > 200 ? substr($clean, 0, 200).'...' : $clean;
                    $bookCtx .= "- {$n['note_title']}: $short\n";
                }
            }
        }
    }

    $system = "Kamu adalah asisten literasi cerdas yang membantu pembaca memahami buku secara mendalam. "
            . "Jawab dalam Bahasa Indonesia yang natural, informatif, dan inspiratif. "
            . "Berikan respons yang personal berdasarkan catatan pembaca jika relevan.\n\n"
            . ($bookCtx ? "Konteks buku:\n$bookCtx" : "");

    // Build messages with history
    $messages = [];
    foreach (array_slice($history, -6) as $h) { // Max 6 pesan terakhir
        if (in_array($h['role'] ?? '', ['user', 'assistant'])) {
            $messages[] = ['role' => $h['role'], 'content' => substr($h['content'], 0, 500)];
        }
    }
    $messages[] = ['role' => 'user', 'content' => $question];

    $answer = callGroqMessages($system, $messages, $key, 800);
    jsonSuccess(['answer' => $answer, 'type' => 'chat']);
}

// ════════════════════════════════════════════════
// AUTOTAG — suggest tags untuk catatan
// ════════════════════════════════════════════════
function handleAutotag(array $body, string $key): void {
    $title   = trim($body['title']   ?? '');
    $content = trim($body['content'] ?? '');
    $existing= $body['existing_tags'] ?? []; // tags yang sudah ada di koleksi user

    if (!$title && !$content) jsonError(400, 'Judul atau konten wajib diisi');

    // Strip HTML from content
    $clean = strip_tags($content);
    $short = strlen($clean) > 400 ? substr($clean, 0, 400).'...' : $clean;

    $existingStr = $existing ? "Tag yang sudah ada di koleksi (prioritaskan jika relevan): ".implode(', ', array_slice($existing, 0, 20)).".\n" : "";

    $system = "Kamu adalah tagger konten yang ahli. Jawab HANYA dengan JSON array string, tanpa teks lain.";
    $prompt = "Judul catatan: $title\n"
            . "Isi: $short\n\n"
            . $existingStr
            . "Berikan 3-5 tag relevan dalam Bahasa Indonesia (kata tunggal atau frase pendek, tanpa #).\n"
            . 'Format: ["tag1","tag2","tag3"]';

    $raw   = callGroq($system, $prompt, $key, 200);
    $clean2= preg_replace('/```json|```/', '', $raw);
    $match = null;
    preg_match('/\[.*?\]/s', $clean2, $match);
    $tags  = $match ? json_decode($match[0], true) : [];

    if (!is_array($tags)) $tags = [];
    $tags = array_values(array_filter(array_map('trim', $tags)));

    jsonSuccess(['tags' => $tags, 'type' => 'autotag']);
}

// ════════════════════════════════════════════════
// WEEKLY INSIGHT — untuk Telegram Senin pagi
// ════════════════════════════════════════════════
function handleWeeklyInsight(array $body, PDO $db, string $key): void {
    $uid       = userId();
    $weekPages = (int)($body['week_pages']  ?? 0);
    $weekNotes = (int)($body['week_notes']  ?? 0);
    $topTopics = $body['top_topics']        ?? [];
    $userName  = sanitize($body['user_name'] ?? 'Reader');

    $system = "Kamu adalah mentor literasi yang inspiratif dan hangat. Jawab dalam Bahasa Indonesia.";
    $prompt = "Data baca minggu ini:\n"
            . "- Pembaca: $userName\n"
            . "- Halaman dibaca: $weekPages\n"
            . "- Catatan dibuat: $weekNotes\n"
            . ($topTopics ? "- Topik paling banyak dicatat: ".implode(', ', $topTopics)."\n" : '')
            . "\nBuatkan pesan motivasi mingguan yang:\n"
            . "1. Apresiasi pencapaian minggu ini (spesifik ke data di atas)\n"
            . "2. Insight menarik tentang topik yang sering dicatat\n"
            . "3. Tantangan kecil untuk minggu depan\n"
            . "4. Kutipan inspiratif tentang membaca\n\n"
            . "Tulis dalam 150-200 kata, hangat dan personal. Gunakan emoji secukupnya.";

    jsonSuccess(['text' => callGroq($system, $prompt, $key, 600), 'type' => 'weekly_insight']);
}

// ════════════════════════════════════════════════
// GROQ HELPERS
// ════════════════════════════════════════════════
function callGroq(string $system, string $prompt, string $key, int $maxTokens = 1024): string {
    return callGroqMessages($system, [['role'=>'user','content'=>$prompt]], $key, $maxTokens);
}

function callGroqMessages(string $system, array $messages, string $key, int $maxTokens = 1024): string {
    $payload = json_encode([
        'model'       => 'llama-3.3-70b-versatile',
        'messages'    => array_merge(
            [['role'=>'system','content'=>$system]],
            $messages
        ),
        'temperature' => 0.75,
        'max_tokens'  => $maxTokens,
    ]);

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "Authorization: Bearer $key"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 45,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $result   = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) jsonError(503, 'Tidak bisa menghubungi AI: '.$curlErr);

    $data = json_decode($result, true);
    if ($httpCode !== 200) {
        $msg = $data['error']['message'] ?? "HTTP $httpCode";
        if (str_contains($msg,'invalid_api_key') || $httpCode===401) jsonError(401,'API key Groq tidak valid');
        if ($httpCode===429) jsonError(429,'Batas request tercapai. Coba lagi nanti.');
        jsonError(500, 'Groq error: '.$msg);
    }

    $text = $data['choices'][0]['message']['content'] ?? '';
    if (!$text) jsonError(500, 'Respons AI kosong');
    return $text;
}
