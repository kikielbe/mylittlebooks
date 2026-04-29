/* ============================================
   MY LITTLE BOOKS — settings.js v3
   Profil · Password · Target · Minat
   Telegram · Google Drive
   ============================================ */
'use strict';

async function loadSettings() {
  // Display name & new fields
  const u = App.user || {};
  const nameEl = document.getElementById('set-display-name');
  if (nameEl) nameEl.value = u.display_name || '';
  const emailEl = document.getElementById('set-email');
  if (emailEl) emailEl.value = u.email || '';
  const tgEl = document.getElementById('set-telegram-chat');
  if (tgEl) tgEl.value = u.telegram_chat_id || '';
  const nhEl = document.getElementById('set-notif-hour');
  if (nhEl) nhEl.value = u.notif_hour || 7;
  const neEl = document.getElementById('set-notif-enabled');
  if (neEl) neEl.checked = u.notif_enabled !== 0;
  const fsEl = document.getElementById('set-font-size');
  if (fsEl) fsEl.value = u.reading_font_size || 'md';

  // Show admin panel if admin
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) {
    if (App.role === 'admin') {
      adminPanel.classList.remove('d-none');
      loadAdminUsers();
    } else {
      adminPanel.classList.add('d-none');
    }
  }

  // Targets
  const res = await apiGet('api/targets.php');
  if (res.success) {
    const t = res.data;
    const bEl = document.getElementById('set-t-books');
    const pEl = document.getElementById('set-t-pages');
    const nEl = document.getElementById('set-t-notes');
    if (bEl) bEl.value = t.monthly_books || 5;
    if (pEl) pEl.value = t.daily_pages   || 20;
    if (nEl) nEl.value = t.weekly_notes  || 3;
  }

  // Interest chips
  renderInterestChips();

  // Theme UI
  updateThemeUI(document.documentElement.getAttribute('data-theme') || 'light');

  // Telegram status
  loadTelegramStatus();

  // Google Drive status
  loadDriveStatus();
}

// ── Profile ───────────────────────────────────
async function saveProfile() {
  const name = document.getElementById('set-display-name')?.value.trim();
  if (!name) { toast('Nama tidak boleh kosong', 'error'); return; }
  const email   = document.getElementById('set-email')?.value.trim() || '';
  const tgChat  = document.getElementById('set-telegram-chat')?.value.trim() || '';
  const notifH  = +(document.getElementById('set-notif-hour')?.value || 7);
  const notifEn = document.getElementById('set-notif-enabled')?.checked ? 1 : 0;
  const fontSize= document.getElementById('set-font-size')?.value || 'md';
  const res = await apiPost('api/auth.php?action=update_profile', {
    display_name: name, email, telegram_chat_id: tgChat,
    notif_hour: notifH, notif_enabled: notifEn, reading_font_size: fontSize,
  });
  if (res.success) {
    if (App.user) App.user.display_name = name;
    toast('Profil tersimpan ✓', 'success');
  } else {
    toast(res.error || 'Gagal menyimpan', 'error');
  }
}

// ── Password ──────────────────────────────────
async function changePassword() {
  const oldPw = document.getElementById('set-old-pw')?.value;
  const newPw = document.getElementById('set-new-pw')?.value;
  if (!oldPw || !newPw) { toast('Semua field wajib diisi', 'error'); return; }
  if (newPw.length < 6) { toast('Password baru minimal 6 karakter', 'error'); return; }
  const res = await apiPost('api/auth.php?action=change_password', {
    old_password: oldPw, new_password: newPw,
  });
  if (res.success) {
    document.getElementById('set-old-pw').value = '';
    document.getElementById('set-new-pw').value = '';
    toast('Password berhasil diubah ✓', 'success');
  } else {
    toast(res.error || 'Gagal mengubah password', 'error');
  }
}

// ── Targets ───────────────────────────────────
async function saveTargets() {
  const body = {
    monthly_books: +document.getElementById('set-t-books')?.value || 5,
    daily_pages:   +document.getElementById('set-t-pages')?.value || 20,
    weekly_notes:  +document.getElementById('set-t-notes')?.value || 3,
  };
  const res = await apiPost('api/targets.php', body);
  if (res.success) {
    toast('Target disimpan ✓', 'success');
    if (App.currentPage === 'home') loadDashboard();
  } else {
    toast(res.error || 'Gagal menyimpan', 'error');
  }
}

// ── Local Backup ──────────────────────────────
function doBackup() {
  window.open('api/backup.php', '_blank');
  toast('Mengunduh backup...', 'info');
}

async function doRestore(event) {
  const file = event.target.files[0];
  if (!file) return;
  const result = await Swal.fire({
    title: 'Import Backup?',
    html: `File: <b>${esc(file.name)}</b><br><span style="color:var(--red)">⚠️ Data saat ini akan digantikan</span>`,
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'Ya, Import', cancelButtonText: 'Batal', reverseButtons: true,
  });
  if (!result.isConfirmed) { event.target.value = ''; return; }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.app !== 'mylittlebooks') { toast('File backup tidak valid', 'error'); return; }
    const res = await apiPost('api/backup.php', data);
    if (res.success) {
      toast('Data dipulihkan! Memuat ulang...', 'success');
      setTimeout(() => location.reload(), 2000);
    } else {
      toast(res.error || 'Restore gagal', 'error');
    }
  } catch(e) {
    toast('File tidak valid atau rusak', 'error');
  }
  event.target.value = '';
}

// ── Logout ────────────────────────────────────
async function doLogout() {
  const result = await Swal.fire({
    title: 'Keluar?', text: 'Sesi kamu akan diakhiri.',
    icon: 'question', showCancelButton: true,
    confirmButtonText: 'Keluar', cancelButtonText: 'Batal', reverseButtons: true,
  });
  if (!result.isConfirmed) return;
  await fetch('api/auth.php?action=logout', { method:'POST' });
  window.location.href = 'login.html';
}

// ════════════════════════════════════════════════
// TELEGRAM SETUP
// ════════════════════════════════════════════════
async function loadTelegramStatus() {
  const wrap = document.getElementById('telegram-status');
  if (!wrap) return;

  const res = await apiGet('api/telegram.php?action=status');
  if (!res.success) return;

  const d = res.data;
  if (d.configured) {
    wrap.innerHTML = `
      <div class="d-flex align-items-center gap-2" style="color:var(--green)">
        <i class="bi bi-check-circle-fill"></i>
        <span style="font-size:.82rem;font-weight:600">Terhubung · Chat ID: ${esc(d.chat_id)}</span>
      </div>`;
  } else {
    wrap.innerHTML = `
      <div class="d-flex align-items-center gap-2" style="color:var(--text-3)">
        <i class="bi bi-x-circle"></i>
        <span style="font-size:.82rem">Belum dikonfigurasi</span>
      </div>`;
  }
}

async function setupTelegram() {
  // Step 1: Input token
  const { value: token } = await Swal.fire({
    title: '🤖 Setup Telegram Bot',
    html: `
      <div style="text-align:left;font-size:.85rem">
        <div style="background:var(--bg-3);padding:.75rem;border-radius:var(--radius-sm);margin-bottom:1rem;line-height:1.7">
          <b>Cara dapat Bot Token (2 menit):</b><br>
          1. Buka Telegram → cari <b>@BotFather</b><br>
          2. Kirim <code>/newbot</code><br>
          3. Ikuti instruksi, dapat TOKEN<br>
          4. Paste token di bawah
        </div>
        <label style="font-size:.78rem;font-weight:600;color:var(--text-2);text-transform:uppercase">Bot Token</label>
        <input id="swal-token" class="swal2-input" placeholder="1234567890:ABC..." style="margin-top:.3rem"/>
      </div>`,
    confirmButtonText: 'Lanjut →',
    showCancelButton: true,
    preConfirm: () => {
      const v = document.getElementById('swal-token').value.trim();
      if (!v || !v.includes(':')) { Swal.showValidationMessage('Token tidak valid'); return false; }
      return v;
    }
  });
  if (!token) return;

  // Step 2: Get chat_id
  Swal.fire({
    title: 'Ambil Chat ID...',
    html: `
      <div style="font-size:.85rem;text-align:left">
        <div style="background:var(--bg-3);padding:.75rem;border-radius:var(--radius-sm);margin-bottom:.75rem;line-height:1.7">
          <b>Langkah berikutnya:</b><br>
          1. Buka Telegram → cari bot kamu<br>
          2. Kirim sembarang pesan ke bot<br>
          3. Klik tombol <b>Ambil Chat ID</b>
        </div>
      </div>`,
    confirmButtonText: 'Ambil Chat ID',
    showCancelButton: true,
    showLoaderOnConfirm: true,
    preConfirm: async () => {
      const res = await apiGet(`api/telegram.php?action=get_chat&token=${encodeURIComponent(token)}`);
      if (!res.success) {
        Swal.showValidationMessage(res.error || 'Belum ada pesan. Kirim pesan ke bot dulu!');
        return false;
      }
      return res.data;
    }
  }).then(async result => {
    if (!result.isConfirmed || !result.value) return;
    const { chat_id, name } = result.value;

    // Step 3: Save & test
    const saveRes = await apiPost('api/telegram.php?action=save_config', { token, chat_id });
    if (!saveRes.success) { toast(saveRes.error, 'error'); return; }

    // Test kirim
    const testRes = await apiPost('api/telegram.php?action=test', {});
    if (testRes.success) {
      toast(`Telegram terhubung! Halo ${name} 📱`, 'success');
      loadTelegramStatus();
    } else {
      toast(testRes.error, 'warning');
    }
  });
}

async function testTelegram() {
  const res = await apiPost('api/telegram.php?action=test', {});
  if (res.success) toast(res.message, 'success');
  else toast(res.error || 'Gagal', 'error');
}

// Cron info modal
function showCronInfo() {
  Swal.fire({
    title: '⚙️ Setup Cron Job',
    html: `
      <div style="text-align:left;font-size:.82rem;line-height:1.8">
        <b>Di Hosting (cPanel):</b><br>
        <code style="background:var(--bg-3);padding:.2rem .5rem;border-radius:4px;display:block;margin:.5rem 0;font-size:.75rem;word-break:break-all">0 7 * * * php /home/user/public_html/mylittlebooks/api/cron_reminder.php</code>
        Ganti <code>user</code> dengan username hosting kamu.<br><br>
        <b>Di XAMPP (lokal):</b><br>
        Jalankan manual via terminal:<br>
        <code style="background:var(--bg-3);padding:.2rem .5rem;border-radius:4px;display:block;margin:.5rem 0;font-size:.75rem;word-break:break-all">php C:/xampp/htdocs/mylittlebooks/api/cron_reminder.php</code>
        <br>
        <b>Notifikasi yang dikirim setiap hari:</b><br>
        • Reminder harian yang aktif<br>
        • Progress halaman & streak<br>
        • Buku yang mendekati deadline<br>
        • Catatan yang perlu direview
      </div>`,
    confirmButtonText: 'OK',
    width: '92vw',
  });
}

// ════════════════════════════════════════════════
// GOOGLE DRIVE BACKUP
// ════════════════════════════════════════════════
async function loadDriveStatus() {
  const wrap = document.getElementById('gdrive-status');
  if (!wrap) return;

  const res = await apiGet('api/gdrive.php?action=status');
  if (!res.success) return;

  const d = res.data;
  if (d.configured) {
    wrap.innerHTML = `
      <div class="d-flex align-items-center gap-2" style="color:var(--green)">
        <i class="bi bi-check-circle-fill"></i>
        <span style="font-size:.82rem;font-weight:600">Google Drive terhubung ✓</span>
      </div>`;
  } else {
    const issues = [];
    if (!d.has_folder_id) issues.push('Folder ID belum diisi');
    if (!d.has_key_file)  issues.push('gdrive_key.json tidak ada');
    wrap.innerHTML = `
      <div style="color:var(--text-3);font-size:.78rem">${issues.join(' · ')}</div>`;
  }
}

async function backupToDrive() {
  const btn = document.getElementById('btn-gdrive-backup');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...'; }

  const res = await apiPost('api/gdrive.php?action=backup', {});

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-cloud-upload me-1"></i>Backup ke Drive'; }

  if (res.success) {
    const d = res.data;
    toast(`Backup berhasil! ${d.filename}`, 'success');
    loadDriveFileList();
  } else {
    const isSetup = res.error?.includes('belum diisi') || res.error?.includes('tidak ditemukan');
    if (isSetup) showDriveSetupGuide();
    else toast(res.error || 'Gagal backup', 'error');
  }
}

async function loadDriveFileList() {
  const wrap = document.getElementById('gdrive-files');
  if (!wrap) return;

  wrap.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>`;

  const res = await apiGet('api/gdrive.php?action=list');
  if (!res.success) {
    wrap.innerHTML = `<div style="font-size:.78rem;color:var(--text-3)">${res.error || 'Gagal memuat'}</div>`;
    return;
  }

  if (!res.data?.length) {
    wrap.innerHTML = `<div style="font-size:.78rem;color:var(--text-3);text-align:center;padding:.5rem">Belum ada backup di Drive</div>`;
    return;
  }

  wrap.innerHTML = res.data.map(f => `
    <div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid var(--border)">
      <i class="bi bi-file-earmark-code" style="color:var(--accent);flex-shrink:0"></i>
      <div class="flex-grow-1 overflow-hidden">
        <div style="font-size:.78rem;font-weight:600" class="text-truncate">${esc(f.name)}</div>
        <div style="font-size:.68rem;color:var(--text-3)">${f.date_label} · ${f.size_label}</div>
      </div>
      <div class="d-flex gap-1">
        <button class="btn-icon" style="width:28px;height:28px"
          onclick="restoreFromDrive('${esc(f.id)}','${esc(f.name)}')" title="Restore">
          <i class="bi bi-cloud-download" style="font-size:.75rem;color:var(--blue)"></i>
        </button>
        <button class="btn-icon" style="width:28px;height:28px"
          onclick="deleteDriveFile('${esc(f.id)}')" title="Hapus">
          <i class="bi bi-trash" style="font-size:.75rem;color:var(--red)"></i>
        </button>
      </div>
    </div>`).join('');
}

async function restoreFromDrive(fileId, fileName) {
  const result = await Swal.fire({
    title: 'Restore dari Drive?',
    html: `File: <b>${esc(fileName)}</b><br><span style="color:var(--red)">⚠️ Data saat ini akan digantikan</span>`,
    icon: 'warning', showCancelButton: true,
    confirmButtonText: 'Ya, Restore', cancelButtonText: 'Batal', reverseButtons: true,
  });
  if (!result.isConfirmed) return;

  const res = await apiPost('api/gdrive.php?action=restore', { file_id: fileId });
  if (res.success) {
    toast('Restore berhasil! Memuat ulang...', 'success');
    setTimeout(() => location.reload(), 2000);
  } else {
    toast(res.error || 'Restore gagal', 'error');
  }
}

async function deleteDriveFile(fileId) {
  const result = await confirmDelete('Hapus dari Drive?', 'File backup ini akan dihapus permanen dari Google Drive.');
  if (!result.isConfirmed) return;
  const res = await api(`api/gdrive.php?action=delete&file_id=${fileId}`, { method:'DELETE' });
  if (res.success) {
    toast('File dihapus', 'success');
    loadDriveFileList();
  } else {
    toast(res.error, 'error');
  }
}

function showDriveSetupGuide() {
  Swal.fire({
    title: '🔧 Setup Google Drive',
    html: `
      <div style="text-align:left;font-size:.82rem;line-height:1.8">
        <b>Langkah setup (10 menit):</b><br><br>
        <b>1. Buat Service Account:</b><br>
        • Buka <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent)">console.cloud.google.com</a><br>
        • Buat project → Enable "Google Drive API"<br>
        • IAM & Admin → Service Accounts → Create<br>
        • Download JSON key → simpan sebagai <code>api/gdrive_key.json</code><br><br>
        <b>2. Buat Folder di Google Drive:</b><br>
        • Buka Google Drive → New Folder → "MyLittleBooks Backup"<br>
        • Klik kanan folder → Share → tambah email service account<br>
        • Salin Folder ID dari URL (bagian setelah /folders/)<br><br>
        <b>3. Isi di ai_config.php:</b><br>
        <code style="background:var(--bg-3);padding:.3rem .5rem;border-radius:4px;display:block;font-size:.72rem;word-break:break-all">
        \$gdrive_folder_id = 'ID_FOLDER_KAMU';</code>
      </div>`,
    confirmButtonText: 'Mengerti',
    width: '92vw',
  });
}

// ════════════════════════════════════════════════
// ADMIN — User Management
// ════════════════════════════════════════════════
async function loadAdminUsers() {
  const wrap = document.getElementById('admin-user-list');
  if (!wrap) return;
  wrap.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>`;

  const res = await apiGet('api/auth.php?action=list_users');
  if (!res.success) { wrap.innerHTML = `<div style="color:var(--red);font-size:.8rem">${res.error}</div>`; return; }

  if (!res.data?.length) { wrap.innerHTML = `<div style="font-size:.78rem;color:var(--text-3)">Belum ada user</div>`; return; }

  wrap.innerHTML = res.data.map(u => `
    <div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid var(--border)">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-bg);
        display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">
        ${u.role==='admin'?'👑':'👤'}
      </div>
      <div class="flex-grow-1 overflow-hidden">
        <div style="font-size:.82rem;font-weight:700" class="text-truncate">${esc(u.display_name)}</div>
        <div style="font-size:.68rem;color:var(--text-3)">
          @${esc(u.username)} ·
          <span style="color:${u.is_active?'var(--green)':'var(--red)'}">
            ${u.is_active?'Aktif':'Nonaktif'}
          </span> ·
          ${u.book_count} buku · ${u.note_count} catatan
        </div>
      </div>
      <div class="d-flex gap-1">
        <button class="btn-icon" style="width:28px;height:28px"
          onclick="editUserAdmin(${JSON.stringify(u).replace(/"/g,'&quot;')})" title="Edit">
          <i class="bi bi-pencil" style="font-size:.75rem"></i>
        </button>
        ${u.id !== App.user?.id ? `
        <button class="btn-icon" style="width:28px;height:28px;background:var(--red-bg)"
          onclick="deleteUserAdmin(${u.id},'${esc(u.username)}')" title="Hapus">
          <i class="bi bi-trash" style="font-size:.75rem;color:var(--red)"></i>
        </button>` : ''}
      </div>
    </div>`).join('');
}

function openCreateUserModal() {
  ['cu-display-name','cu-username','cu-email','cu-password'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const roleEl = document.getElementById('cu-role');
  if (roleEl) roleEl.value = 'member';
  new bootstrap.Modal(document.getElementById('modal-create-user')).show();
}

async function createUser() {
  const display  = document.getElementById('cu-display-name')?.value.trim();
  const username = document.getElementById('cu-username')?.value.trim();
  const email    = document.getElementById('cu-email')?.value.trim();
  const password = document.getElementById('cu-password')?.value;
  const role     = document.getElementById('cu-role')?.value || 'member';

  if (!display || !username || !password) { toast('Nama, username, password wajib diisi', 'error'); return; }

  const res = await apiPost('api/auth.php?action=create_user', { display_name:display, username, email, password, role });
  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modal-create-user'))?.hide();
    toast(`User @${username} berhasil dibuat ✓`, 'success');
    loadAdminUsers();
  } else {
    toast(res.error || 'Gagal membuat user', 'error');
  }
}

async function editUserAdmin(u) {
  const result = await Swal.fire({
    title: `Edit User: ${esc(u.username)}`,
    html: `<div style="text-align:left">
      <label style="font-size:.78rem;font-weight:600;text-transform:uppercase;color:var(--text-2)">Nama</label>
      <input id="eu-name" class="swal2-input" value="${esc(u.display_name)}" style="margin:.3rem 0 .75rem"/>
      <label style="font-size:.78rem;font-weight:600;text-transform:uppercase;color:var(--text-2)">Role</label>
      <select id="eu-role" class="swal2-input" style="margin:.3rem 0 .75rem">
        <option value="member" ${u.role==='member'?'selected':''}>Member</option>
        <option value="admin"  ${u.role==='admin' ?'selected':''}>Admin</option>
      </select>
      <label style="font-size:.78rem;font-weight:600;text-transform:uppercase;color:var(--text-2)">Status</label>
      <select id="eu-active" class="swal2-input" style="margin:.3rem 0">
        <option value="1" ${u.is_active?'selected':''}>Aktif</option>
        <option value="0" ${!u.is_active?'selected':''}>Nonaktif</option>
      </select>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    footer: `<button onclick="resetPasswordAdmin(${u.id})" style="background:transparent;border:none;color:var(--accent);font-size:.82rem;cursor:pointer">🔑 Reset Password</button>`,
    preConfirm: () => ({
      id:          u.id,
      display_name:document.getElementById('eu-name').value.trim(),
      role:        document.getElementById('eu-role').value,
      is_active:   +document.getElementById('eu-active').value,
    })
  });

  if (!result.isConfirmed) return;
  const res = await apiPost('api/auth.php?action=update_user', result.value);
  if (res.success) { toast('User diperbarui ✓', 'success'); loadAdminUsers(); }
  else toast(res.error, 'error');
}

async function resetPasswordAdmin(userId) {
  Swal.close();
  const { value: newPw } = await Swal.fire({
    title: 'Reset Password',
    input: 'password',
    inputPlaceholder: 'Password baru (min. 6 karakter)',
    showCancelButton: true,
    confirmButtonText: 'Reset',
    inputValidator: v => v.length < 6 ? 'Min. 6 karakter' : null
  });
  if (!newPw) return;
  const res = await apiPost('api/auth.php?action=reset_password', { id: userId, new_password: newPw });
  if (res.success) toast('Password direset ✓', 'success');
  else toast(res.error, 'error');
}

async function deleteUserAdmin(userId, username) {
  const result = await confirmDelete(`Hapus @${username}?`, 'Semua data user ini (buku, catatan, dll) akan dihapus permanen.');
  if (!result.isConfirmed) return;
  const res = await apiPost('api/auth.php?action=delete_user', { id: userId });
  if (res.success) { toast(`User @${username} dihapus`, 'success'); loadAdminUsers(); }
  else toast(res.error, 'error');
}

function setupTelegramUser() {
  Swal.fire({
    title: '📱 Setup Telegram Pribadi',
    html: `<div style="text-align:left;font-size:.82rem;line-height:1.8">
      <b>Cara dapat Chat ID kamu:</b><br>
      1. Buka Telegram → cari bot yang sudah dibuat admin<br>
      2. Kirim pesan apa saja ke bot<br>
      3. Buka: <code>https://api.telegram.org/bot{TOKEN}/getUpdates</code><br>
      4. Catat <b>chat.id</b> dari response<br>
      5. Paste ke kolom Telegram Chat ID di atas<br><br>
      <b>Atau minta admin untuk bantu setup.</b>
    </div>`,
    confirmButtonText: 'OK',
    width: '92vw',
  });
}
