<?php
// ============================================
// MY LITTLE BOOKS — Report API v3
// Multi-User · GET /api/report.php?period=weekly|monthly
// ============================================
require_once __DIR__ . '/db.php';
requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError(405, 'Method not allowed');

$period = $_GET['period'] ?? 'monthly';
$month  = $_GET['month']  ?? date('Y-m');

$period === 'weekly' ? reportWeekly() : reportMonthly($month);

function reportWeekly(): void {
    $db  = getDB();
    $uid = userId();
    $from = date('Y-m-d', strtotime('monday this week'));
    $to   = date('Y-m-d', strtotime('sunday this week'));

    $dailyPages = $db->prepare(
        "SELECT logged_date, SUM(pages_read) AS pages
         FROM reading_logs WHERE user_id=? AND logged_date BETWEEN ? AND ?
         GROUP BY logged_date ORDER BY logged_date ASC"
    );
    $dailyPages->execute([$uid, $from, $to]);

    $notesByDay = $db->prepare(
        "SELECT DATE(created_at) AS d, COUNT(*) AS cnt
         FROM notes WHERE user_id=? AND DATE(created_at) BETWEEN ? AND ?
         GROUP BY d ORDER BY d ASC"
    );
    $notesByDay->execute([$uid, $from, $to]);

    $s = $db->prepare("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=? AND logged_date BETWEEN ? AND ?");
    $s->execute([$uid, $from, $to]); $totalPages = (int)$s->fetchColumn();

    $n = $db->prepare("SELECT COUNT(*) FROM notes WHERE user_id=? AND DATE(created_at) BETWEEN ? AND ?");
    $n->execute([$uid, $from, $to]); $totalNotes = (int)$n->fetchColumn();

    $b = $db->prepare("SELECT COUNT(*) FROM books WHERE user_id=? AND status='done' AND finished_at BETWEEN ? AND ?");
    $b->execute([$uid, $from, $to]); $totalBooks = (int)$b->fetchColumn();

    jsonSuccess([
        'period'       => 'weekly',
        'from'         => $from,
        'to'           => $to,
        'total_pages'  => $totalPages,
        'total_notes'  => $totalNotes,
        'total_books'  => $totalBooks,
        'daily_pages'  => $dailyPages->fetchAll(),
        'notes_by_day' => $notesByDay->fetchAll(),
    ]);
}

function reportMonthly(string $month): void {
    $db   = getDB();
    $uid  = userId();
    $from = $month . '-01';
    $to   = date('Y-m-t', strtotime($from));

    $s = $db->prepare("SELECT COALESCE(SUM(pages_read),0) FROM reading_logs WHERE user_id=? AND logged_date BETWEEN ? AND ?");
    $s->execute([$uid, $from, $to]); $totalPages = (int)$s->fetchColumn();

    $n = $db->prepare("SELECT COUNT(*) FROM notes WHERE user_id=? AND DATE(created_at) BETWEEN ? AND ?");
    $n->execute([$uid, $from, $to]); $totalNotes = (int)$n->fetchColumn();

    $b = $db->prepare("SELECT COUNT(*) FROM books WHERE user_id=? AND status='done' AND finished_at BETWEEN ? AND ?");
    $b->execute([$uid, $from, $to]); $totalBooks = (int)$b->fetchColumn();

    $weekly = $db->prepare(
        "SELECT WEEK(logged_date,1) AS wk, SUM(pages_read) AS pages
         FROM reading_logs WHERE user_id=? AND logged_date BETWEEN ? AND ?
         GROUP BY wk ORDER BY wk ASC"
    );
    $weekly->execute([$uid, $from, $to]);

    $books = $db->prepare(
        "SELECT id,title,author,cover_filename,rating,finished_at
         FROM books WHERE user_id=? AND status='done' AND finished_at BETWEEN ? AND ?
         ORDER BY finished_at DESC"
    );
    $books->execute([$uid, $from, $to]);

    $genre = $db->prepare(
        "SELECT genre, COUNT(*) AS cnt FROM books
         WHERE user_id=? AND finished_at BETWEEN ? AND ? AND genre != ''
         GROUP BY genre ORDER BY cnt DESC"
    );
    $genre->execute([$uid, $from, $to]);

    jsonSuccess([
        'period'       => 'monthly',
        'month'        => $month,
        'from'         => $from,
        'to'           => $to,
        'total_pages'  => $totalPages,
        'total_notes'  => $totalNotes,
        'total_books'  => $totalBooks,
        'weekly_pages' => $weekly->fetchAll(),
        'books_done'   => $books->fetchAll(),
        'genre_chart'  => $genre->fetchAll(),
    ]);
}
