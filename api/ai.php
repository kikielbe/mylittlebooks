<?php
// ============================================
// MY LITTLE BOOKS — AI Proxy (Groq)
// POST /api/ai.php
// Groq API — GRATIS, 14.400 req/hari
// Types: recommend | summary | analyze
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonError(405, 'Method not allowed');

// ── Load API key ──────────────────────────────
$groq_api_key = '';
if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';

if (empty($groq_api_key) || str_contains($groq_api_key, 'XXXXX')) {
    jsonError(503, 'API key belum diisi. Buka api/ai_config.php dan isi Groq API key kamu. Daftar gratis di console.groq.com');
}

$body   = getBody();
$type   = $body['type'] ?? 'recommend';
$db     = getDB();

// ── Route ─────────────────────────────────────
match($type) {
    'recommend' => handleRecommend($body, $db, $groq_api_key),
    'summary'   => handleSummary($body, $db, $groq_api_key),
    'analyze'   => handleAnalyze($body, $db, $groq_api_key),
    default     => jsonError(400, 'Type tidak valid')
};

// ════════════════════════════════════════════════
// RECOMMEND — 20 buku, filter existing, batch 5
// ════════════════════════════════════════════════
function handleRecommend(array $body, PDO $db, string $key): void {
    $interests     = array_slice($body['interests']     ?? [], 0, 12);
    $done_books    = array_slice($body['done_books']    ?? [], 0, 10);
    $reading_books = array_slice($body['reading_books'] ?? [], 0, 5);
    $existing      = array_slice($body['existing_titles'] ?? [], 0, 50); // semua judul buku user
    $batch         = max(1, min(20, (int)($body['batch'] ?? 5))); // berapa buku per request
    $offset        = max(0, (int)($body['offset'] ?? 0)); // sudah ada berapa

    // Build context
    $ctx = '';
    if ($interests)     $ctx .= "Minat: " . implode(', ', array_map('htmlspecialchars_decode', $interests)) . ".\n";
    if ($done_books)    $ctx .= "Sudah selesai baca: " . implode(', ', array_map('htmlspecialchars_decode', $done_books)) . ".\n";
    if ($reading_books) $ctx .= "Sedang baca: " . implode(', ', array_map('htmlspecialchars_decode', $reading_books)) . ".\n";
    if ($existing)      $ctx .= "JANGAN rekomendasikan buku berikut (sudah ada di koleksi): " . implode(', ', array_map('htmlspecialchars_decode', $existing)) . ".\n";
    if (!$ctx)          $ctx = "Pengguna baru, belum ada data buku atau minat.";

    // Variety prompt berdasarkan offset untuk hindari duplikat
    $variety = $offset > 0
        ? "Berikan rekomendasi yang BERBEDA dari sebelumnya. Eksplorasi genre dan penulis yang bervariasi."
        : "Mulai dengan buku-buku terpopuler dan paling relevan.";

    $system = "Kamu adalah kurator buku terpercaya. Jawab HANYA dengan JSON array yang valid, tanpa teks lain, tanpa markdown, tanpa backtick.";
    $prompt = "Data pembaca:\n$ctx\n\n"
            . "$variety\n\n"
            . "Berikan TEPAT $batch rekomendasi buku yang relevan dan mudah ditemukan di Indonesia. "
            . "Variasikan genre dan penulis. Sertakan buku Indonesia dan terjemahan.\n\n"
            . "Format JSON (array of object):\n"
            . '[{"title":"Judul Buku","author":"Nama Penulis","genre":"Genre","reason":"Alasan 1-2 kalimat kenapa cocok untuk pembaca ini","rating":"4.5/5","emoji":"📚","available":"Gramedia/Tokopedia/iPusnas"}]';

    $result = callGroq($system, $prompt, $key, 1500);
    jsonSuccess(['text' => $result, 'type' => 'recommend', 'batch' => $batch, 'offset' => $offset]);
}

// ════════════════════════════════════════════════
// SUMMARY — ringkasan otomatis dari semua catatan buku
// ════════════════════════════════════════════════
function handleSummary(array $body, PDO $db, string $key): void {
    requireAuth();
    $book_id = (int)($body['book_id'] ?? 0);
    if (!$book_id) jsonError(400, 'book_id wajib diisi');

    // Get book info
    $uid    = userId();
    $bStmt = $db->prepare("SELECT title, author FROM books WHERE id = ? AND user_id = ? LIMIT 1");
    $bStmt->execute([$book_id, $uid]);
    $book = $bStmt->fetch();
    if (!$book) jsonError(404, 'Buku tidak ditemukan');

    // Get all notes for this book (filtered by user)
    $nStmt = $db->prepare(
        "SELECT note_title, content, page_start, page_end, tags
         FROM notes WHERE book_id = ? AND user_id = ? ORDER BY page_start ASC, created_at ASC LIMIT 30"
    );
    $nStmt->execute([$book_id, $uid]);
    $notes = $nStmt->fetchAll();

    if (empty($notes)) jsonError(400, 'Buku ini belum punya catatan. Tambah catatan dulu!');

    // Build notes text (strip HTML, limit length)
    $notesText = '';
    foreach ($notes as $i => $n) {
        $clean = trim(strip_tags($n['content'] ?? ''));
        if (strlen($clean) > 300) $clean = substr($clean, 0, 300) . '...';
        $page  = $n['page_start'] ? "[Hal.{$n['page_start']}]" : '';
        $notesText .= ($i+1) . ". {$n['note_title']} $page\n$clean\n\n";
    }

    $system = "Kamu adalah asisten literasi yang membuat ringkasan buku dari catatan pembaca. Jawab dalam Bahasa Indonesia yang baik dan mengalir.";
    $prompt = "Buku: \"{$book['title']}\" oleh {$book['author']}\n\n"
            . "Catatan pembaca ({$count} catatan):\n$notesText\n"
            . "Buatkan ringkasan komprehensif dari buku ini berdasarkan catatan pembaca di atas.\n\n"
            . "Format ringkasan:\n"
            . "## 📖 Tentang Buku\n[Gambaran umum 2-3 kalimat]\n\n"
            . "## 💡 Pelajaran Utama\n[5-7 poin pelajaran terpenting]\n\n"
            . "## ✍️ Kutipan & Insight Menarik\n[3-5 insight dari catatan]\n\n"
            . "## 🎯 Actionable Takeaways\n[3-4 hal yang bisa langsung dipraktikkan]\n\n"
            . "## ⭐ Kesimpulan\n[1-2 kalimat penutup]\n\n"
            . "Gunakan bahasa yang inspiratif dan mudah dipahami.";

    // Fix: use count correctly
    $count = count($notes);
    $prompt = str_replace('{$count}', (string)$count, $prompt);

    $result = callGroq($system, $prompt, $key, 2000);
    jsonSuccess([
        'text'   => $result,
        'type'   => 'summary',
        'book'   => $book,
        'count'  => $count,
    ]);
}

// ════════════════════════════════════════════════
// ANALYZE — analisis satu buku + saran lanjutan
// ════════════════════════════════════════════════
function handleAnalyze(array $body, PDO $db, string $key): void {
    $title  = htmlspecialchars_decode($body['title']  ?? '');
    $author = htmlspecialchars_decode($body['author'] ?? '');
    $notes  = substr($body['notes'] ?? '', 0, 800);

    if (!$title) jsonError(400, 'title wajib diisi');

    $system = "Kamu adalah asisten literasi. Jawab dalam Bahasa Indonesia, ringkas dan inspiratif.";
    $prompt = "Buku: \"$title\" oleh $author\n"
            . ($notes ? "Catatan pembaca:\n$notes\n\n" : "\n")
            . "Berikan analisis singkat:\n"
            . "1. **Ringkasan** (2-3 kalimat)\n"
            . "2. **3 Pelajaran Utama** (bullet point)\n"
            . "3. **Cocok untuk** siapa buku ini\n"
            . "4. **2 Buku Serupa** yang bisa dibaca selanjutnya";

    $result = callGroq($system, $prompt, $key, 800);
    jsonSuccess(['text' => $result, 'type' => 'analyze']);
}

// ════════════════════════════════════════════════
// HELPER — Call Groq API
// ════════════════════════════════════════════════
function callGroq(string $system, string $prompt, string $key, int $maxTokens = 1024): string {
    $payload = json_encode([
        'model'       => 'llama-3.3-70b-versatile',
        'messages'    => [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user',   'content' => $prompt],
        ],
        'temperature' => 0.75,
        'max_tokens'  => $maxTokens,
    ]);

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "Authorization: Bearer $key",
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 45,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $result   = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) jsonError(503, 'Tidak bisa menghubungi AI: ' . $curlErr);

    $data = json_decode($result, true);

    if ($httpCode !== 200) {
        $errMsg = $data['error']['message'] ?? "HTTP $httpCode";
        if (str_contains($errMsg, 'invalid_api_key') || $httpCode === 401)
            jsonError(401, 'API key Groq tidak valid. Cek api/ai_config.php');
        if ($httpCode === 429)
            jsonError(429, 'Batas request tercapai. Coba lagi sebentar lagi.');
        jsonError(500, 'Groq error: ' . $errMsg);
    }

    $text = $data['choices'][0]['message']['content'] ?? '';
    if (!$text) jsonError(500, 'Respons AI kosong');

    return $text;
}
