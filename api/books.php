<?php
require_once __DIR__ . '/db.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id'])     ? (int)$_GET['id'] : 0;
$action = $_GET['action']        ?? '';
$uid    = userId();

if ($action === 'cover' && $method === 'POST') { uploadCover($id); }

match($method) {
    'GET'    => $id ? getBook($id) : getBooks(),
    'POST'   => saveBook(0),
    'PUT'    => saveBook($id),
    'DELETE' => deleteBook($id),
    default  => jsonError(405, 'Method not allowed')
};

function getBooks(): void {
    $db     = getDB();
    $uid    = userId();
    $status = $_GET['status'] ?? '';
    $search = $_GET['search'] ?? '';

    $sql    = "SELECT b.*,
               (SELECT COUNT(*) FROM notes  n WHERE n.book_id=b.id AND n.user_id=b.user_id) AS note_count,
               (SELECT COUNT(*) FROM quotes q WHERE q.book_id=b.id AND q.user_id=b.user_id) AS quote_count
               FROM books b WHERE b.user_id=?";
    $params = [$uid];

    if ($status) { $sql .= " AND b.status=?";                         $params[]=$status; }
    if ($search) { $sql .= " AND (b.title LIKE ? OR b.author LIKE ?)"; $params[]="%$search%"; $params[]="%$search%"; }
    $sql .= " ORDER BY b.updated_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonSuccess($stmt->fetchAll());
}

function getBook(int $id): void {
    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM books WHERE id=? AND user_id=? LIMIT 1");
    $stmt->execute([$id, userId()]);
    $book = $stmt->fetch();
    if (!$book) jsonError(404, 'Buku tidak ditemukan');
    jsonSuccess($book);
}

function saveBook(int $id): void {
    $body = getBody();
    if (empty(trim($body['title'] ?? ''))) jsonError(400, 'Judul buku wajib diisi');
    $db        = getDB();
    $uid       = userId();
    $newStatus = $body['status'] ?? 'want';

    if ($id === 0) {
        $stmt = $db->prepare("INSERT INTO books
            (user_id,title,author,isbn,genre,description,status,total_pages,current_page,started_at,finished_at,rating)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
        $stmt->execute([
            $uid, sanitize($body['title']),
            sanitize($body['author']??''), sanitize($body['isbn']??''),
            sanitize($body['genre']??''),  sanitize($body['description']??''),
            $newStatus,
            (int)($body['total_pages']??0), (int)($body['current_page']??0),
            $body['started_at']??null,      $body['finished_at']??null,
            (int)($body['rating']??0),
        ]);
        $id = (int)$db->lastInsertId();
        addXP(5); checkBadges();
        $msg = 'Buku berhasil ditambahkan';
    } else {
        $prev = $db->prepare("SELECT status FROM books WHERE id=? AND user_id=? LIMIT 1");
        $prev->execute([$id, $uid]);
        $old = $prev->fetch();
        if (!$old) jsonError(404, 'Buku tidak ditemukan');

        $stmt = $db->prepare("UPDATE books SET
            title=?,author=?,isbn=?,genre=?,description=?,
            status=?,total_pages=?,current_page=?,started_at=?,finished_at=?,rating=?
            WHERE id=? AND user_id=?");
        $stmt->execute([
            sanitize($body['title']),  sanitize($body['author']??''),
            sanitize($body['isbn']??''), sanitize($body['genre']??''),
            sanitize($body['description']??''), $newStatus,
            (int)($body['total_pages']??0), (int)($body['current_page']??0),
            $body['started_at']??null, $body['finished_at']??null,
            (int)($body['rating']??0), $id, $uid,
        ]);
        if ($old['status'] !== 'done' && $newStatus === 'done') { addXP(15); }
        checkBadges();
        $msg = 'Buku berhasil diperbarui';
    }

    $stmt = $db->prepare("SELECT * FROM books WHERE id=?");
    $stmt->execute([$id]);
    jsonSuccess($stmt->fetch(), $msg);
}

function deleteBook(int $id): void {
    if (!$id) jsonError(400, 'ID tidak valid');
    $db   = getDB();
    $uid  = userId();
    $stmt = $db->prepare("SELECT cover_filename FROM books WHERE id=? AND user_id=? LIMIT 1");
    $stmt->execute([$id, $uid]);
    $book = $stmt->fetch();
    if (!$book) jsonError(404, 'Buku tidak ditemukan');

    if ($book['cover_filename']) {
        $f = UPLOAD_COVERS . $book['cover_filename'];
        if (file_exists($f)) unlink($f);
    }
    $db->prepare("DELETE FROM books WHERE id=? AND user_id=?")->execute([$id, $uid]);
    jsonSuccess(null, 'Buku berhasil dihapus');
}

function uploadCover(int $id): void {
    if (!$id) jsonError(400, 'ID tidak valid');
    if (empty($_FILES['cover'])) jsonError(400, 'File tidak ditemukan');
    $file = $_FILES['cover'];
    if ($file['error'] !== UPLOAD_ERR_OK) jsonError(400, 'Upload gagal');
    if ($file['size'] > MAX_FILE_SIZE)    jsonError(400, 'Ukuran file maks 5MB');
    $mime = mime_content_type($file['tmp_name']);
    if (!in_array($mime, ['image/jpeg','image/png','image/webp','image/gif']))
        jsonError(400, 'Format tidak didukung');

    if (!is_dir(UPLOAD_COVERS)) mkdir(UPLOAD_COVERS, 0755, true);

    $db   = getDB();
    $uid  = userId();
    $prev = $db->prepare("SELECT cover_filename FROM books WHERE id=? AND user_id=? LIMIT 1");
    $prev->execute([$id, $uid]);
    $old  = $prev->fetch();
    if (!$old) jsonError(404, 'Buku tidak ditemukan');
    if ($old['cover_filename'] && file_exists(UPLOAD_COVERS.$old['cover_filename']))
        unlink(UPLOAD_COVERS.$old['cover_filename']);

    $ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) ?: 'jpg';
    $name = "cover_{$uid}_{$id}_".time().".$ext";
    if (!move_uploaded_file($file['tmp_name'], UPLOAD_COVERS.$name)) jsonError(500, 'Gagal menyimpan');

    $db->prepare("UPDATE books SET cover_filename=? WHERE id=? AND user_id=?")->execute([$name, $id, $uid]);
    jsonSuccess(['cover_filename'=>$name,'url'=>'assets/uploads/covers/'.$name], 'Cover diupload');
}
