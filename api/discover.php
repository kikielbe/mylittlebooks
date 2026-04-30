<?php
// ============================================
// MY LITTLE BOOKS — Discover API
// GET /api/discover.php?action=insight   → AI insight harian
// GET /api/discover.php?action=news      → berita buku terkini (RSS)
// GET /api/discover.php?action=spotlight → AI teaser buku sorotan
// GET /api/discover.php?action=all       → semua sekaligus
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

$action = $_GET['action'] ?? 'all';
$uid    = userId();

match($action) {
    'insight'   => getInsight($uid),
    'news'      => getNews(),
    'spotlight' => getSpotlight($uid),
    'all'       => getAll($uid),
    default     => jsonError(400, 'Invalid action')
};

// ── Cache helpers ─────────────────────────────
function _cacheGet(string $key): mixed {
    $file = __DIR__ . "/cache/{$key}.json";
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    if (!$data || ($data['expires'] ?? 0) < time()) return null;
    return $data['value'];
}

function _cacheSet(string $key, mixed $value, int $ttl = 21600): void {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents("$dir/{$key}.json", json_encode([
        'expires' => time() + $ttl,
        'value'   => $value,
    ]));
}

// ════════════════════════════════════════════════
// AI INSIGHT — kutipan + ide menarik dari buku
// ════════════════════════════════════════════════
function getInsight(int $uid): void {
    $db = getDB();

    // Cache per user per hari
    $cacheKey = "insight_{$uid}_" . date('Ymd');
    $cached   = _cacheGet($cacheKey);
    if ($cached) { jsonSuccess($cached); return; }

    // Load config
    $groq_api_key = '';
    if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';

    if (empty($groq_api_key) || str_contains($groq_api_key, 'XXXXX')) {
        // Fallback: ambil dari koleksi quotes user
        _fallbackInsight($uid, $db);
        return;
    }

    // Ambil konteks user
    $interests = _getUserInterests($uid, $db);
    $recentBook = $db->query(
        "SELECT title, author, genre FROM books WHERE user_id=$uid
         AND status IN ('reading','done') ORDER BY updated_at DESC LIMIT 1"
    )->fetch();

    $interestStr = implode(', ', $interests);
    $bookCtx = $recentBook
        ? "Sedang/baru membaca: \"{$recentBook['title']}\" oleh {$recentBook['author']}"
        : '';

    $system = "Kamu adalah kurator konten literasi yang inspiratif. Jawab HANYA dalam JSON valid.";
    $prompt = "Buat 1 insight/kutipan menarik dari sebuah buku yang sesuai untuk pembaca dengan minat: $interestStr.\n"
            . ($bookCtx ? "$bookCtx\n" : '')
            . "Pilih buku yang berbeda setiap hari (seed: " . date('Ymd') . ").\n\n"
            . "Format JSON:\n"
            . '{"book_title":"...","author":"...","genre":"...","quote":"Kutipan atau insight menarik (1-3 kalimat)","hook":"Kalimat pembuka yang bikin penasaran (1 kalimat)","why":"Kenapa relevan untuk pembaca ini (1 kalimat)","emoji":"📚"}';

    $result = _callGroq($system, $prompt, $groq_api_key, 400);
    $clean  = preg_replace('/```json|```/', '', $result);
    preg_match('/\{.*\}/s', $clean, $m);
    $data = $m ? json_decode($m[0], true) : null;

    if (!$data || empty($data['quote'])) {
        _fallbackInsight($uid, $db);
        return;
    }

    $data['type']   = 'ai';
    $data['date']   = date('Y-m-d');
    _cacheSet($cacheKey, $data, 86400); // cache 24 jam
    jsonSuccess($data);
}

function _fallbackInsight(int $uid, PDO $db): void {
    // Ambil kutipan random dari koleksi user
    $count = (int)$db->query("SELECT COUNT(*) FROM quotes WHERE user_id=$uid")->fetchColumn();
    if ($count > 0) {
        $offset = date('Ymd') % $count;
        $stmt   = $db->prepare(
            "SELECT q.quote_text AS quote, b.title AS book_title, b.author
             FROM quotes q LEFT JOIN books b ON b.id=q.book_id
             WHERE q.user_id=? ORDER BY q.id LIMIT 1 OFFSET ?"
        );
        $stmt->execute([$uid, $offset]);
        $q = $stmt->fetch();
        if ($q) {
            jsonSuccess(array_merge($q, [
                'hook'  => 'Dari koleksi kutipanmu sendiri:',
                'why'   => 'Kutipan yang pernah kamu simpan.',
                'emoji' => '💬',
                'type'  => 'collection',
                'date'  => date('Y-m-d'),
            ]));
            return;
        }
    }

    // Ultimate fallback
    jsonSuccess([
        'book_title' => 'Atomic Habits',
        'author'     => 'James Clear',
        'genre'      => 'Self Help',
        'quote'      => 'Kamu tidak naik ke level tujuanmu. Kamu jatuh ke level sistemmu.',
        'hook'       => 'Satu kalimat yang mengubah cara jutaan orang melihat kebiasaan.',
        'why'        => 'Cocok untuk membangun disiplin membaca setiap hari.',
        'emoji'      => '⚛️',
        'type'       => 'default',
        'date'       => date('Y-m-d'),
    ]);
}

// ════════════════════════════════════════════════
// NEWS — RSS buku terkini
// ════════════════════════════════════════════════
function getNews(): void {
    $cacheKey = 'news_' . date('YmdH'); // cache 1 jam
    $cached   = _cacheGet($cacheKey);
    if ($cached) { jsonSuccess($cached); return; }

    $feeds = [
        [
            'url'    => 'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml',
            'source' => 'NYT Books',
            'lang'   => 'en',
        ],
        [
            'url'    => 'https://feeds.feedburner.com/goodreads/YkJFO',
            'source' => 'Goodreads',
            'lang'   => 'en',
        ],
        [
            'url'    => 'https://www.goodreads.com/blog.xml',
            'source' => 'Goodreads Blog',
            'lang'   => 'en',
        ],
    ];

    $articles = [];
    foreach ($feeds as $feed) {
        $items = _fetchRSS($feed['url'], $feed['source']);
        $articles = array_merge($articles, $items);
        if (count($articles) >= 8) break;
    }

    // Sort by date, take top 6
    usort($articles, fn($a, $b) => ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0));
    $articles = array_slice($articles, 0, 6);

    if (empty($articles)) {
        // Fallback: curated static articles
        $articles = _staticNewsArticles();
    }

    _cacheSet($cacheKey, $articles, 3600);
    jsonSuccess($articles);
}

function _fetchRSS(string $url, string $source): array {
    $ctx = stream_context_create([
        'http' => [
            'timeout'     => 8,
            'user_agent'  => 'MyLittleBooks/1.0',
            'ignore_errors' => true,
        ],
        'ssl'  => ['verify_peer' => false],
    ]);

    $raw = @file_get_contents($url, false, $ctx);
    if (!$raw) return [];

    $articles = [];
    try {
        libxml_use_internal_errors(true);
        $xml = new SimpleXMLElement($raw);
        $ns  = $xml->getNamespaces(true);

        $channel = $xml->channel ?? $xml;
        $items   = $channel->item ?? $xml->entry ?? [];

        foreach ($items as $item) {
            $title   = html_entity_decode(strip_tags((string)($item->title ?? '')));
            $link    = (string)($item->link ?? $item->id ?? '');
            $desc    = html_entity_decode(strip_tags((string)($item->description ?? $item->summary ?? '')));
            $pubDate = (string)($item->pubDate ?? $item->published ?? $item->updated ?? '');

            if (!$title || !$link) continue;

            // Limit description
            if (strlen($desc) > 160) $desc = substr($desc, 0, 157) . '...';

            $articles[] = [
                'title'     => $title,
                'link'      => $link,
                'desc'      => $desc,
                'source'    => $source,
                'timestamp' => $pubDate ? strtotime($pubDate) : 0,
                'date'      => $pubDate ? date('d M Y', strtotime($pubDate)) : 'Baru',
            ];

            if (count($articles) >= 4) break;
        }
    } catch (\Exception $e) {
        // Silent fail
    }

    return $articles;
}

function _staticNewsArticles(): array {
    // Artikel kurated Indonesia — fallback jika RSS tidak tersedia
    return [
        [
            'title'     => 'Atomic Habits: Cara Membangun Kebiasaan Membaca Setiap Hari',
            'link'      => 'https://medium.com/tag/buku',
            'desc'      => 'James Clear membuktikan bahwa perubahan besar dimulai dari kebiasaan kecil yang konsisten setiap hari.',
            'source'    => 'Tips Literasi',
            'timestamp' => time() - 3600,
            'date'      => 'Hari ini',
        ],
        [
            'title'     => '5 Buku Terjemahan Indonesia yang Wajib Ada di Rak Bukumu',
            'link'      => 'https://medium.com/tag/resensi-buku',
            'desc'      => 'Dari Rich Dad Poor Dad hingga Sapiens, buku-buku terjemahan ini mengubah cara pandang jutaan pembaca Indonesia.',
            'source'    => 'Resensi Buku',
            'timestamp' => time() - 86400,
            'date'      => 'Kemarin',
        ],
        [
            'title'     => 'Mengapa Buku Islami Makin Diminati Generasi Muda Indonesia',
            'link'      => 'https://medium.com/tag/buku-islami',
            'desc'      => 'Karya Hamka, Al-Ghazali, dan ulama kontemporer semakin relevan di era digital.',
            'source'    => 'Literasi Islami',
            'timestamp' => time() - 172800,
            'date'      => '2 hari lalu',
        ],
        [
            'title'     => 'Goodreads Indonesia: Komunitas Pembaca yang Terus Berkembang',
            'link'      => 'https://www.goodreads.com',
            'desc'      => 'Bergabung dengan jutaan pembaca, tulis review, dan temukan buku berikutnya.',
            'source'    => 'Komunitas Baca',
            'timestamp' => time() - 259200,
            'date'      => '3 hari lalu',
        ],
    ];
}

// ════════════════════════════════════════════════
// SPOTLIGHT — AI teaser 1 buku pilihan
// ════════════════════════════════════════════════
function getSpotlight(int $uid): void {
    $db = getDB();

    $cacheKey = "spotlight_{$uid}_" . date('Ymd');
    $cached   = _cacheGet($cacheKey);
    if ($cached) { jsonSuccess($cached); return; }

    $groq_api_key = '';
    if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';

    $interests  = _getUserInterests($uid, $db);
    $doneBooks  = $db->query(
        "SELECT title FROM books WHERE user_id=$uid AND status='done' ORDER BY finished_at DESC LIMIT 5"
    )->fetchAll(PDO::FETCH_COLUMN);

    if (empty($groq_api_key) || str_contains($groq_api_key, 'XXXXX')) {
        jsonSuccess(_defaultSpotlight($interests));
        return;
    }

    $interestStr = implode(', ', $interests);
    $doneStr     = $doneBooks ? "Sudah baca: " . implode(', ', $doneBooks) : '';

    $system = "Kamu adalah book marketer yang handal. Jawab HANYA dalam JSON valid.";
    $prompt = "Rekomendasikan 1 buku yang WAJIB dibaca untuk pembaca dengan minat: $interestStr.\n"
            . "$doneStr\n"
            . "Seed hari ini: " . date('Ymd') . "\n\n"
            . "Buat teaser yang sangat menarik — seperti trailer film, bukan sinopsis biasa.\n"
            . "Format JSON:\n"
            . '{"title":"...","author":"...","genre":"...","tagline":"Kalimat pamungkas yang bikin penasaran (1 kalimat, max 15 kata)","teaser":"3-4 kalimat yang membuat orang HARUS baca buku ini. Sebutkan 1 fakta mengejutkan atau insight terkuat.","chapters_hint":"1 kalimat tentang bab atau bagian paling menarik","emoji":"📖","rating":"4.8/5"}';

    $result = _callGroq($system, $prompt, $groq_api_key, 400);
    $clean  = preg_replace('/```json|```/', '', $result);
    preg_match('/\{.*\}/s', $clean, $m);
    $data   = $m ? json_decode($m[0], true) : null;

    if (!$data || empty($data['title'])) {
        jsonSuccess(_defaultSpotlight($interests));
        return;
    }

    $data['type'] = 'ai';
    _cacheSet($cacheKey, $data, 86400);
    jsonSuccess($data);
}

function _defaultSpotlight(array $interests): array {
    $genre = $interests[0] ?? 'self-help';
    $books = [
        'islami'    => ['title'=>'Al-Hikam','author'=>'Ibnu Athaillah','tagline'=>'Kebijaksanaan abadi yang menyentuh jiwa','teaser'=>'Ratusan tahun berlalu, namun setiap kata al-Hikam terasa ditulis untuk masa kini. Buku ini bukan sekadar dibaca — ia diresapi.','chapters_hint'=>'Mulai dari kata pertama, kamu sudah tidak ingin berhenti.','emoji'=>'🕌','rating'=>'5.0/5'],
        'self-help' => ['title'=>'Atomic Habits','author'=>'James Clear','tagline'=>'1% lebih baik setiap hari = perubahan luar biasa','teaser'=>'Mengapa orang gagal bukan karena kurang motivasi, tapi karena sistem yang salah? Buku ini memberikan framework yang sudah mengubah 10 juta orang.','chapters_hint'=>'Bab tentang "2-Minute Rule" saja sudah worth it.','emoji'=>'⚛️','rating'=>'4.9/5'],
        'bisnis'    => ['title'=>'Zero to One','author'=>'Peter Thiel','tagline'=>'Rahasia startup yang benar-benar mengubah dunia','teaser'=>'Peter Thiel, pendiri PayPal, membocorkan cara berpikir yang membuat perusahaan benar-benar unik — bukan sekadar copy competitor.','chapters_hint'=>'Bab tentang monopoli akan mengubah cara kamu melihat bisnis.','emoji'=>'🚀','rating'=>'4.7/5'],
    ];
    $b = $books[$genre] ?? $books['self-help'];
    return array_merge($b, ['genre' => $genre, 'type' => 'default']);
}

// ════════════════════════════════════════════════
// ALL — semua konten sekaligus (tanpa ob_start)
// ════════════════════════════════════════════════
function getAll(int $uid): void {
    $db = getDB();

    // Load config once
    $groq_api_key = '';
    if (file_exists(__DIR__ . '/ai_config.php')) require __DIR__ . '/ai_config.php';
    $hasGroq = !empty($groq_api_key) && !str_contains($groq_api_key, 'XXXXX');

    // ── Insight ──────────────────────────────────
    $insight = null;
    try {
        $cacheKey = "insight_{$uid}_" . date('Ymd');
        $cached   = _cacheGet($cacheKey);
        if ($cached) {
            $insight = $cached;
        } else {
            $interests  = _getUserInterests($uid, $db);
            $interestStr= implode(', ', $interests);
            $recentBook = $db->query(
                "SELECT title, author FROM books WHERE user_id=$uid
                 AND status IN ('reading','done') ORDER BY updated_at DESC LIMIT 1"
            )->fetch();
            $bookCtx = $recentBook ? "Baru membaca: \"{$recentBook['title']}\" oleh {$recentBook['author']}" : '';

            if ($hasGroq) {
                $system = "Kamu adalah kurator literasi. Jawab HANYA dalam JSON valid, tanpa teks lain.";
                $prompt = "Buat 1 insight/kutipan menarik dari buku sesuai minat: $interestStr.\n"
                        . "$bookCtx\nSeed: " . date('Ymd') . "\n\n"
                        . 'Format: {"book_title":"...","author":"...","genre":"...","quote":"...","hook":"...","why":"...","emoji":"📚"}';
                $raw   = _callGroq($system, $prompt, $groq_api_key, 400);
                $clean = preg_replace('/```json|```/', '', $raw);
                preg_match('/\{.*\}/s', $clean, $m);
                $parsed = $m ? json_decode($m[0], true) : null;
                if ($parsed && !empty($parsed['quote'])) {
                    $parsed['type'] = 'ai';
                    $parsed['date'] = date('Y-m-d');
                    $insight = $parsed;
                    _cacheSet($cacheKey, $insight, 86400);
                }
            }
            // Fallback ke koleksi user
            if (!$insight) {
                $count = (int)$db->query("SELECT COUNT(*) FROM quotes WHERE user_id=$uid")->fetchColumn();
                if ($count > 0) {
                    $offset = date('Ymd') % $count;
                    $stmt   = $db->prepare("SELECT q.quote_text AS quote, b.title AS book_title, b.author FROM quotes q LEFT JOIN books b ON b.id=q.book_id WHERE q.user_id=? ORDER BY q.id LIMIT 1 OFFSET ?");
                    $stmt->execute([$uid, $offset]);
                    $q = $stmt->fetch();
                    if ($q) $insight = array_merge($q, ['hook'=>'Dari koleksimu:','why'=>'Kutipanmu sendiri.','emoji'=>'💬','type'=>'collection','date'=>date('Y-m-d'),'genre'=>'']);
                }
                if (!$insight) $insight = ['book_title'=>'Atomic Habits','author'=>'James Clear','genre'=>'Self Help','quote'=>'Kamu tidak naik ke level tujuanmu. Kamu jatuh ke level sistemmu.','hook'=>'Satu kalimat yang mengubah cara jutaan orang.','why'=>'Cocok untuk membangun disiplin membaca.','emoji'=>'⚛️','type'=>'default','date'=>date('Y-m-d')];
            }
        }
    } catch (\Exception $e) { /* silent */ }

    // ── Spotlight ────────────────────────────────
    $spotlight = null;
    try {
        $cacheKey2 = "spotlight_{$uid}_" . date('Ymd');
        $cached2   = _cacheGet($cacheKey2);
        if ($cached2) {
            $spotlight = $cached2;
        } elseif ($hasGroq) {
            $interests  = _getUserInterests($uid, $db);
            $interestStr= implode(', ', $interests);
            $doneBooks  = $db->query("SELECT title FROM books WHERE user_id=$uid AND status='done' ORDER BY finished_at DESC LIMIT 5")->fetchAll(PDO::FETCH_COLUMN);
            $doneStr    = $doneBooks ? "Sudah baca: ".implode(', ', $doneBooks) : '';
            $system2    = "Kamu adalah book marketer. Jawab HANYA dalam JSON valid, tanpa teks lain.";
            $prompt2    = "Rekomendasikan 1 buku wajib baca untuk minat: $interestStr.\n$doneStr\nSeed: ".date('Ymd')."\n\n"
                        . 'Format: {"title":"...","author":"...","genre":"...","tagline":"...","teaser":"...","chapters_hint":"...","emoji":"📖","rating":"4.8/5"}';
            $raw2  = _callGroq($system2, $prompt2, $groq_api_key, 400);
            $clean2= preg_replace('/```json|```/', '', $raw2);
            preg_match('/\{.*\}/s', $clean2, $m2);
            $parsed2 = $m2 ? json_decode($m2[0], true) : null;
            if ($parsed2 && !empty($parsed2['title'])) {
                $parsed2['type'] = 'ai';
                $spotlight = $parsed2;
                _cacheSet($cacheKey2, $spotlight, 86400);
            }
        }
        if (!$spotlight) {
            $interests = _getUserInterests($uid, $db);
            $spotlight = _defaultSpotlight($interests);
        }
    } catch (\Exception $e) { /* silent */ }

    // ── News ─────────────────────────────────────
    $news = null;
    try {
        $newsCacheKey = 'news_' . date('YmdH');
        $newsCached   = _cacheGet($newsCacheKey);
        if ($newsCached) {
            $news = $newsCached;
        } else {
            $articles = [];
            $feeds = [
                ['url'=>'https://medium.com/feed/tag/buku',       'source'=>'Medium Literasi'],
                ['url'=>'https://medium.com/feed/tag/membaca',    'source'=>'Medium Membaca'],
                ['url'=>'https://medium.com/feed/tag/resensi-buku','source'=>'Resensi Buku'],
                ['url'=>'https://medium.com/feed/tag/self-improvement', 'source'=>'Self Improvement'],
            ];
            foreach ($feeds as $feed) {
                $items    = _fetchRSS($feed['url'], $feed['source']);
                $articles = array_merge($articles, $items);
                if (count($articles) >= 6) break;
            }
            if (empty($articles)) $articles = _staticNewsArticles();
            usort($articles, fn($a,$b) => ($b['timestamp']??0)-($a['timestamp']??0));
            $news = array_slice($articles, 0, 6);
            _cacheSet($newsCacheKey, $news, 3600);
        }
    } catch (\Exception $e) {
        $news = _staticNewsArticles();
    }

    jsonSuccess([
        'insight'   => $insight,
        'spotlight' => $spotlight,
        'news'      => $news,
    ]);
}

// ── Helpers ───────────────────────────────────
function _getUserInterests(int $uid, PDO $db): array {
    // 1. Dari localStorage — tidak bisa dari PHP, ambil dari genre buku
    $genres = $db->query(
        "SELECT genre, COUNT(*) AS cnt FROM books WHERE user_id=$uid AND genre!=''
         GROUP BY genre ORDER BY cnt DESC LIMIT 5"
    )->fetchAll(PDO::FETCH_COLUMN);

    return $genres ?: ['self-help', 'islami', 'bisnis'];
}

function _callGroq(string $system, string $prompt, string $key, int $max = 500): string {
    $payload = json_encode([
        'model'       => 'llama-3.3-70b-versatile',
        'messages'    => [
            ['role'=>'system','content'=>$system],
            ['role'=>'user',  'content'=>$prompt],
        ],
        'temperature' => 0.8,
        'max_tokens'  => $max,
    ]);

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "Authorization: Bearer $key"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($res, true);
    return $data['choices'][0]['message']['content'] ?? '';
}
