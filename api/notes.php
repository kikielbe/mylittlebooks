<?php
require_once __DIR__ . '/db.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id'])     ? (int)$_GET['id']     : 0;
$att_id = isset($_GET['att_id']) ? (int)$_GET['att_id'] : 0;
$action = $_GET['action']        ?? '';
$uid    = userId();

if ($action==='tags'   && $method==='GET')    { getAllTags(); }
if ($action==='attach' && $method==='POST')   { uploadAttachment($id); }
if ($action==='detach' && $method==='DELETE') { deleteAttachment($att_id); }

match($method) {
    'GET'    => $id ? getNote($id) : getNotes(),
    'POST'   => saveNote(0),
    'PUT'    => saveNote($id),
    'DELETE' => deleteNote($id),
    default  => jsonError(405, 'Method not allowed')
};

function getNotes(): void {
    $db      = getDB();
    $uid     = userId();
    $search  = trim($_GET['search']  ?? '');
    $book_id = isset($_GET['book_id']) ? (int)$_GET['book_id'] : 0;
    $tag     = trim($_GET['tag']     ?? '');
    $sort    = $_GET['sort']         ?? 'newest';
    $limit   = min((int)($_GET['limit']  ?? 20), 100);
    $offset  = (int)($_GET['offset'] ?? 0);

    $sql    = "SELECT n.*, b.title AS book_title, b.author, b.cover_filename,
               (SELECT COUNT(*) FROM attachments a WHERE a.note_id=n.id) AS attachment_count
               FROM notes n LEFT JOIN books b ON b.id=n.book_id
               WHERE n.user_id=?";
    $params = [$uid];

    if ($search) {
        $sql   .= " AND MATCH(n.note_title,n.content,n.tags) AGAINST(? IN BOOLEAN MODE)";
        $params[] = '+'.implode('* +', array_filter(explode(' ', $search))).'*';
    }
    if ($book_id) { $sql .= " AND n.book_id=?";  $params[]=$book_id; }
    if ($tag)     { $sql .= " AND FIND_IN_SET(?,REPLACE(n.tags,' ',''))"; $params[]=$tag; }
    $sql .= match($sort) {
        'oldest' => " ORDER BY n.created_at ASC",
        'rating' => " ORDER BY n.rating DESC, n.created_at DESC",
        'title'  => " ORDER BY n.note_title ASC",
        default  => " ORDER BY n.created_at DESC",
    };
    $sql .= " LIMIT ? OFFSET ?";
    $params[]=$limit; $params[]=$offset;

    $stmt = $db->prepare($sql); $stmt->execute($params);
    $notes = $stmt->fetchAll();

    $cSql = "SELECT COUNT(*) FROM notes n WHERE n.user_id=?";
    $cPrm = [$uid];
    if ($book_id) { $cSql .= " AND n.book_id=?"; $cPrm[]=$book_id; }
    $cStmt = $db->prepare($cSql); $cStmt->execute($cPrm);
    jsonSuccess(['notes'=>$notes,'total'=>(int)$cStmt->fetchColumn(),'limit'=>$limit,'offset'=>$offset]);
}

function getNote(int $id): void {
    $db   = getDB();
    $uid  = userId();
    $stmt = $db->prepare("SELECT n.*, b.title AS book_title, b.author, b.cover_filename
                          FROM notes n LEFT JOIN books b ON b.id=n.book_id
                          WHERE n.id=? AND n.user_id=? LIMIT 1");
    $stmt->execute([$id, $uid]);
    $note = $stmt->fetch();
    if (!$note) jsonError(404, 'Catatan tidak ditemukan');

    $aStmt = $db->prepare("SELECT * FROM attachments WHERE note_id=? ORDER BY created_at");
    $aStmt->execute([$id]);
    $note['attachments'] = $aStmt->fetchAll();
    jsonSuccess($note);
}

function saveNote(int $id): void {
    $body = getBody();
    if (empty(trim($body['note_title']??''))) jsonError(400,'Judul catatan wajib diisi');
    if (empty(trim($body['book_id']??'')))    jsonError(400,'Buku wajib dipilih');
    if (empty(strip_tags($body['content']??''))) jsonError(400,'Isi catatan tidak boleh kosong');

    $db      = getDB();
    $uid     = userId();
    $book_id = (int)$body['book_id'];

    // Verify book belongs to user
    $bck = $db->prepare("SELECT id FROM books WHERE id=? AND user_id=? LIMIT 1");
    $bck->execute([$book_id, $uid]);
    if (!$bck->fetch()) jsonError(404, 'Buku tidak ditemukan');

    if ($id === 0) {
        $stmt = $db->prepare("INSERT INTO notes (user_id,book_id,note_title,content,page_start,page_end,rating,tags)
                               VALUES (?,?,?,?,?,?,?,?)");
        $stmt->execute([$uid,$book_id,sanitize($body['note_title']),$body['content'],
            (int)($body['page_start']??0),(int)($body['page_end']??0),
            (int)($body['rating']??0),sanitize($body['tags']??'')]);
        $id = (int)$db->lastInsertId();

        $pg = (int)($body['page_end']??0);
        if ($pg>0) $db->prepare("UPDATE books SET current_page=GREATEST(current_page,?) WHERE id=? AND user_id=?")->execute([$pg,$book_id,$uid]);

        $pRead = max(0,(int)($body['page_end']??0)-(int)($body['page_start']??0));
        if ($pRead>0) $db->prepare("INSERT INTO reading_logs (user_id,book_id,note_id,pages_read,logged_date) VALUES (?,?,?,?,CURDATE())")->execute([$uid,$book_id,$id,$pRead]);

        addXP(10); checkBadges();
        $msg = 'Catatan berhasil disimpan';
    } else {
        $chk = $db->prepare("SELECT id FROM notes WHERE id=? AND user_id=? LIMIT 1");
        $chk->execute([$id,$uid]);
        if (!$chk->fetch()) jsonError(404,'Catatan tidak ditemukan');
        $db->prepare("UPDATE notes SET book_id=?,note_title=?,content=?,page_start=?,page_end=?,rating=?,tags=? WHERE id=? AND user_id=?")
           ->execute([$book_id,sanitize($body['note_title']),$body['content'],
             (int)($body['page_start']??0),(int)($body['page_end']??0),
             (int)($body['rating']??0),sanitize($body['tags']??''),$id,$uid]);
        $msg = 'Catatan berhasil diperbarui';
    }

    $stmt = $db->prepare("SELECT n.*, b.title AS book_title FROM notes n LEFT JOIN books b ON b.id=n.book_id WHERE n.id=?");
    $stmt->execute([$id]);
    jsonSuccess($stmt->fetch(), $msg);
}

function deleteNote(int $id): void {
    if (!$id) jsonError(400,'ID tidak valid');
    $db  = getDB();
    $uid = userId();
    $aStmt = $db->prepare("SELECT a.filename FROM attachments a JOIN notes n ON n.id=a.note_id WHERE a.note_id=? AND n.user_id=?");
    $aStmt->execute([$id,$uid]);
    foreach ($aStmt->fetchAll() as $a) { $f=UPLOAD_ATTACH.$a['filename']; if(file_exists($f)) unlink($f); }
    $stmt = $db->prepare("DELETE FROM notes WHERE id=? AND user_id=?");
    $stmt->execute([$id,$uid]);
    if ($stmt->rowCount()===0) jsonError(404,'Catatan tidak ditemukan');
    jsonSuccess(null,'Catatan berhasil dihapus');
}

function getAllTags(): void {
    $db   = getDB();
    $uid  = userId();
    $rows = $db->prepare("SELECT tags FROM notes WHERE user_id=? AND tags!='' LIMIT 500");
    $rows->execute([$uid]);
    $map  = [];
    foreach ($rows->fetchAll(PDO::FETCH_COLUMN) as $row)
        foreach (explode(',',$row) as $t) { $t=trim($t); if($t) $map[$t]=($map[$t]??0)+1; }
    arsort($map);
    jsonSuccess(array_keys($map));
}

function uploadAttachment(int $note_id): void {
    if (!$note_id) jsonError(400,'Note ID tidak valid');
    if (empty($_FILES['file'])) jsonError(400,'File tidak ditemukan');
    $db  = getDB();
    $uid = userId();
    $chk = $db->prepare("SELECT id FROM notes WHERE id=? AND user_id=? LIMIT 1");
    $chk->execute([$note_id,$uid]);
    if (!$chk->fetch()) jsonError(404,'Catatan tidak ditemukan');

    $cnt = $db->prepare("SELECT COUNT(*) FROM attachments WHERE note_id=?");
    $cnt->execute([$note_id]);
    if ((int)$cnt->fetchColumn()>=MAX_ATTACHMENTS) jsonError(400,'Maks '.MAX_ATTACHMENTS.' lampiran');

    $file = $_FILES['file'];
    if ($file['error']!==UPLOAD_ERR_OK) jsonError(400,'Upload gagal');
    if ($file['size']>MAX_FILE_SIZE) jsonError(400,'File maks 5MB');
    $mime = mime_content_type($file['tmp_name']);
    if (!in_array($mime,['image/jpeg','image/png','image/webp','image/gif'])) jsonError(400,'Hanya gambar');
    if (!is_dir(UPLOAD_ATTACH)) mkdir(UPLOAD_ATTACH,0755,true);
    $ext  = strtolower(pathinfo($file['name'],PATHINFO_EXTENSION))?:'jpg';
    $name = "att_{$uid}_{$note_id}_".time()."_".rand(100,999).".$ext";
    if (!move_uploaded_file($file['tmp_name'],UPLOAD_ATTACH.$name)) jsonError(500,'Gagal menyimpan');
    $db->prepare("INSERT INTO attachments (note_id,filename,original_name,file_size) VALUES (?,?,?,?)")
       ->execute([$note_id,$name,sanitize($file['name']),$file['size']]);
    jsonSuccess(['id'=>(int)$db->lastInsertId(),'filename'=>$name,'url'=>'assets/uploads/attachments/'.$name],'Lampiran diupload');
}

function deleteAttachment(int $att_id): void {
    if (!$att_id) jsonError(400,'ID tidak valid');
    $db  = getDB();
    $uid = userId();
    $stmt = $db->prepare("SELECT a.filename FROM attachments a JOIN notes n ON n.id=a.note_id WHERE a.id=? AND n.user_id=? LIMIT 1");
    $stmt->execute([$att_id,$uid]);
    $att = $stmt->fetch();
    if (!$att) jsonError(404,'Lampiran tidak ditemukan');
    $f = UPLOAD_ATTACH.$att['filename'];
    if (file_exists($f)) unlink($f);
    $db->prepare("DELETE FROM attachments WHERE id=?")->execute([$att_id]);
    jsonSuccess(null,'Lampiran dihapus');
}
