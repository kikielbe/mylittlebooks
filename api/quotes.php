<?php
// quotes.php
require_once __DIR__ . '/db.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$uid    = userId();

match($method) {
    'GET'    => $id ? getQuote($id) : getQuotes(),
    'POST'   => saveQuote(0),
    'PUT'    => saveQuote($id),
    'DELETE' => deleteQuote($id),
    default  => jsonError(405,'Method not allowed')
};

function getQuotes(): void {
    $db      = getDB(); $uid = userId();
    $book_id = isset($_GET['book_id']) ? (int)$_GET['book_id'] : 0;
    $sql     = "SELECT q.*,b.title AS book_title,b.author,b.cover_filename
                FROM quotes q LEFT JOIN books b ON b.id=q.book_id
                WHERE q.user_id=?";
    $params  = [$uid];
    if ($book_id) { $sql .= " AND q.book_id=?"; $params[]=$book_id; }
    $sql .= " ORDER BY q.created_at DESC";
    $stmt = $db->prepare($sql); $stmt->execute($params);
    jsonSuccess($stmt->fetchAll());
}

function getQuote(int $id): void {
    $stmt = getDB()->prepare("SELECT q.*,b.title AS book_title FROM quotes q LEFT JOIN books b ON b.id=q.book_id WHERE q.id=? AND q.user_id=? LIMIT 1");
    $stmt->execute([$id,userId()]);
    $q = $stmt->fetch(); if (!$q) jsonError(404,'Kutipan tidak ditemukan');
    jsonSuccess($q);
}

function saveQuote(int $id): void {
    $body = getBody(); $db = getDB(); $uid = userId();
    if (empty(trim($body['quote_text']??''))) jsonError(400,'Teks kutipan wajib diisi');
    if (empty($body['book_id']))             jsonError(400,'Buku wajib dipilih');

    // Verify book belongs to user
    $bck = $db->prepare("SELECT id FROM books WHERE id=? AND user_id=? LIMIT 1");
    $bck->execute([(int)$body['book_id'],$uid]);
    if (!$bck->fetch()) jsonError(404,'Buku tidak ditemukan');

    if ($id===0) {
        $db->prepare("INSERT INTO quotes (user_id,book_id,quote_text,page_number) VALUES (?,?,?,?)")
           ->execute([$uid,(int)$body['book_id'],sanitize($body['quote_text']),(int)($body['page_number']??0)]);
        $id=(int)$db->lastInsertId(); addXP(5); checkBadges(); $msg='Kutipan ditambahkan';
    } else {
        $chk=$db->prepare("SELECT id FROM quotes WHERE id=? AND user_id=? LIMIT 1"); $chk->execute([$id,$uid]);
        if (!$chk->fetch()) jsonError(404,'Kutipan tidak ditemukan');
        $db->prepare("UPDATE quotes SET book_id=?,quote_text=?,page_number=? WHERE id=? AND user_id=?")
           ->execute([(int)$body['book_id'],sanitize($body['quote_text']),(int)($body['page_number']??0),$id,$uid]);
        $msg='Kutipan diperbarui';
    }
    $stmt=$db->prepare("SELECT q.*,b.title AS book_title FROM quotes q LEFT JOIN books b ON b.id=q.book_id WHERE q.id=?");
    $stmt->execute([$id]); jsonSuccess($stmt->fetch(),$msg);
}

function deleteQuote(int $id): void {
    if (!$id) jsonError(400,'ID tidak valid');
    $stmt=getDB()->prepare("DELETE FROM quotes WHERE id=? AND user_id=?");
    $stmt->execute([$id,userId()]);
    if ($stmt->rowCount()===0) jsonError(404,'Kutipan tidak ditemukan');
    jsonSuccess(null,'Kutipan dihapus');
}
