<?php
require_once __DIR__ . '/db.php';
requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
match($method) {
    'GET'  => getTargets(),
    'POST' => updateTargets(),
    default => jsonError(405,'Method not allowed')
};

function getTargets(): void {
    jsonSuccess(getUserTargets());
}

function updateTargets(): void {
    $body  = getBody(); $db = getDB(); $uid = userId();
    $valid = ['monthly_books','daily_pages','weekly_notes'];
    foreach ($valid as $type) {
        if (isset($body[$type])) {
            $val = max(1,(int)$body[$type]);
            $db->prepare("INSERT INTO user_targets (user_id,type,target_value) VALUES (?,?,?)
                          ON DUPLICATE KEY UPDATE target_value=?")
               ->execute([$uid,$type,$val,$val]);
        }
    }
    jsonSuccess(getUserTargets(),'Target disimpan');
}
