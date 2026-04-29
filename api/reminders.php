<?php
require_once __DIR__ . '/db.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$action = $_GET['action'] ?? '';
$uid    = userId();

if ($action==='done' && $method==='POST') { toggleDone($id); }

match($method) {
    'GET'    => getReminders(),
    'POST'   => saveReminder(0),
    'PUT'    => saveReminder($id),
    'DELETE' => deleteReminder($id),
    default  => jsonError(405,'Method not allowed')
};

function getReminders(): void {
    $db=$getDB=getDB(); $uid=userId();
    $month=$_GET['month']??date('Y-m'); $upcoming=$_GET['upcoming']??'';
    if ($upcoming) {
        $stmt=$db->prepare("SELECT * FROM reminders WHERE user_id=? AND reminder_date>=CURDATE() AND is_done=0 ORDER BY reminder_date,reminder_time LIMIT 10");
        $stmt->execute([$uid]);
    } else {
        $from=$month.'-01'; $to=date('Y-m-t',strtotime($from));
        $stmt=$db->prepare("SELECT * FROM reminders WHERE user_id=? AND reminder_date BETWEEN ? AND ? ORDER BY reminder_date,reminder_time");
        $stmt->execute([$uid,$from,$to]);
    }
    jsonSuccess($stmt->fetchAll());
}

function saveReminder(int $id): void {
    $body=getBody(); $db=getDB(); $uid=userId();
    if (empty(trim($body['title']??'')))         jsonError(400,'Judul wajib diisi');
    if (empty(trim($body['reminder_date']??''))) jsonError(400,'Tanggal wajib diisi');
    $fields=[sanitize($body['title']),$body['reminder_date'],$body['reminder_time']??null,$body['type']??'once',sanitize($body['note']??'')];
    if ($id===0) {
        $db->prepare("INSERT INTO reminders (user_id,title,reminder_date,reminder_time,type,note) VALUES (?,?,?,?,?,?)")
           ->execute(array_merge([$uid],$fields));
        $id=(int)$db->lastInsertId(); $msg='Reminder ditambahkan';
    } else {
        $chk=$db->prepare("SELECT id FROM reminders WHERE id=? AND user_id=? LIMIT 1"); $chk->execute([$id,$uid]);
        if (!$chk->fetch()) jsonError(404,'Reminder tidak ditemukan');
        $db->prepare("UPDATE reminders SET title=?,reminder_date=?,reminder_time=?,type=?,note=? WHERE id=? AND user_id=?")
           ->execute(array_merge($fields,[$id,$uid]));
        $msg='Reminder diperbarui';
    }
    $stmt=$db->prepare("SELECT * FROM reminders WHERE id=?"); $stmt->execute([$id]);
    jsonSuccess($stmt->fetch(),$msg);
}

function deleteReminder(int $id): void {
    if (!$id) jsonError(400,'ID tidak valid');
    $stmt=getDB()->prepare("DELETE FROM reminders WHERE id=? AND user_id=?");
    $stmt->execute([$id,userId()]);
    if ($stmt->rowCount()===0) jsonError(404,'Reminder tidak ditemukan');
    jsonSuccess(null,'Reminder dihapus');
}

function toggleDone(int $id): void {
    if (!$id) jsonError(400,'ID tidak valid');
    $db=$getDB=getDB(); $uid=userId();
    $stmt=$db->prepare("SELECT is_done FROM reminders WHERE id=? AND user_id=? LIMIT 1");
    $stmt->execute([$id,$uid]); $r=$stmt->fetch();
    if (!$r) jsonError(404,'Reminder tidak ditemukan');
    $new=$r['is_done']?0:1;
    $db->prepare("UPDATE reminders SET is_done=? WHERE id=? AND user_id=?")->execute([$new,$id,$uid]);
    jsonSuccess(['is_done'=>$new],$new?'Selesai':'Dibuka kembali');
}
