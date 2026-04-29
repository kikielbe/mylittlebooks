/* ============================================
   MY LITTLE BOOKS — calendar.js
   Kalender Bulanan · CRUD Reminder
   ============================================ */
'use strict';

let _calYear   = new Date().getFullYear();
let _calMonth  = new Date().getMonth();   // 0-based
let _reminders = [];

// ── Tab switch (dipanggil dari index.html) ────
function switchLevelTab(tab, el) {
  document.querySelectorAll('#level-tabs .nav-link').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['progress','badges','streak','calendar','report'].forEach(p => {
    const panel = document.getElementById('panel-' + p);
    if (panel) panel.classList.toggle('d-none', p !== tab);
  });

  if (tab === 'streak')   { loadHeatmap(); }   // load heatmap dari timer.js
  if (tab === 'calendar') {
    _calYear  = new Date().getFullYear();
    _calMonth = new Date().getMonth();
    _refreshCalendar();
  }
  if (tab === 'report') loadReport();
}

// ── Public entry point ────────────────────────
function loadCalendar() {
  _refreshCalendar();
}

// ── Core render ───────────────────────────────
async function _refreshCalendar() {
  const month = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}`;

  // Update month header
  const hEl = document.getElementById('cal-header');
  if (hEl) hEl.textContent = new Date(_calYear, _calMonth, 1)
    .toLocaleDateString('id-ID', { month:'long', year:'numeric' });

  // Fetch reminders
  const res  = await apiGet(`api/reminders.php?month=${month}`);
  _reminders = res.success ? (res.data || []) : [];

  _renderCalGrid();
  _renderReminderList();
}

// ── Calendar grid ─────────────────────────────
function _renderCalGrid() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const firstDay    = new Date(_calYear, _calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(_calYear, _calMonth+1, 0).getDate();
  const todayStr    = new Date().toISOString().slice(0,10);

  // Build reminder map keyed by date
  const remMap = {};
  _reminders.forEach(r => {
    if (!remMap[r.reminder_date]) remMap[r.reminder_date] = [];
    remMap[r.reminder_date].push(r);
  });

  let html = '';
  // Leading empty cells
  for (let i = 0; i < firstDay; i++) html += `<div></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = ds === todayStr;
    const rems    = remMap[ds] || [];
    const hasDone    = rems.some(r =>  r.is_done);
    const hasPending = rems.some(r => !r.is_done);

    html += `
      <div class="cal-day${isToday?' today':''}${rems.length?' has-rem':''}"
        onclick="calDayClick('${ds}')">
        ${d}
        ${hasPending ? `<div class="dot pending"></div>`
          : hasDone  ? `<div class="dot done"></div>` : ''}
      </div>`;
  }

  grid.innerHTML = html;
}

// ── Navigation ────────────────────────────────
function calPrev() {
  _calMonth--;
  if (_calMonth < 0) { _calMonth = 11; _calYear--; }
  _refreshCalendar();
}
function calNext() {
  _calMonth++;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  _refreshCalendar();
}
function calDayClick(dateStr) { openReminderModal(0, dateStr); }

// ── Reminder list ─────────────────────────────
function _renderReminderList() {
  const list = document.getElementById('reminders-list');
  if (!list) return;

  if (!_reminders.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:2rem 0">
        <div class="empty-icon">🔔</div>
        <div class="empty-title">Belum ada reminder</div>
        <div class="empty-desc">Klik tanggal di kalender untuk tambah reminder</div>
      </div>`;
    return;
  }

  const typeLabel = { once:'Sekali', daily:'Harian', weekly:'Mingguan' };

  list.innerHTML = _reminders.map(r => `
    <div class="card p-3 mb-2 ${r.is_done ? 'reminder-done' : ''}">
      <div class="d-flex align-items-start gap-3">

        <!-- Check button -->
        <button class="btn-icon flex-shrink-0" style="
          margin-top:2px;width:36px;height:36px;
          background:${r.is_done?'var(--green-bg)':'var(--bg-3)'};
          border-color:${r.is_done?'var(--green)':'var(--border)'};"
          onclick="toggleReminder(${r.id})">
          <i class="bi bi-${r.is_done?'check2-circle':'circle'}"
            style="color:${r.is_done?'var(--green)':'var(--text-3)'}"></i>
        </button>

        <!-- Content -->
        <div class="flex-grow-1 overflow-hidden">
          <div class="reminder-title" style="font-weight:700;font-size:.92rem">
            ${esc(r.title)}
          </div>
          <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
            <span style="font-size:.75rem;color:var(--text-3)">
              <i class="bi bi-calendar3 me-1"></i>${fmtDate(r.reminder_date)}
              ${r.reminder_time ? `· ${r.reminder_time.slice(0,5)}` : ''}
            </span>
            <span style="
              font-size:.67rem;font-weight:700;
              background:var(--accent-bg);color:var(--accent);
              padding:.1rem .5rem;border-radius:20px">
              ${typeLabel[r.type]||r.type}
            </span>
          </div>
          ${r.note ? `<div style="font-size:.78rem;color:var(--text-2);margin-top:.3rem">${esc(r.note)}</div>` : ''}
        </div>

        <!-- Actions -->
        <div class="d-flex gap-1 flex-shrink-0">
          <button class="btn-icon" style="width:32px;height:32px"
            onclick="openReminderModal(${r.id})">
            <i class="bi bi-pencil" style="font-size:.8rem"></i>
          </button>
          <button class="btn-icon" style="width:32px;height:32px;
            background:var(--red-bg);border-color:rgba(239,68,68,.25)"
            onclick="deleteReminder(${r.id})">
            <i class="bi bi-trash" style="font-size:.8rem;color:var(--red)"></i>
          </button>
        </div>
      </div>
    </div>`).join('');
}

// ── Open modal ────────────────────────────────
function openReminderModal(id = 0, presetDate = '') {
  const modal = document.getElementById('modal-reminder');
  if (!modal) return;

  document.getElementById('reminder-id').value    = id;
  document.getElementById('reminder-title').value = '';
  document.getElementById('reminder-time').value  = '';
  document.getElementById('reminder-note').value  = '';
  document.getElementById('reminder-type').value  = 'once';
  document.getElementById('reminder-date').value  = presetDate
    || new Date().toISOString().slice(0,10);
  document.getElementById('modal-reminder-title').textContent =
    id ? 'Edit Reminder' : 'Tambah Reminder';

  if (id) {
    const r = _reminders.find(x => x.id == id);
    if (r) {
      document.getElementById('reminder-title').value = r.title || '';
      document.getElementById('reminder-date').value  = r.reminder_date || '';
      document.getElementById('reminder-time').value  = r.reminder_time
        ? r.reminder_time.slice(0,5) : '';
      document.getElementById('reminder-type').value  = r.type || 'once';
      document.getElementById('reminder-note').value  = r.note || '';
    }
  }

  new bootstrap.Modal(modal).show();
}

// ── Save ──────────────────────────────────────
async function saveReminder() {
  const id    = +document.getElementById('reminder-id').value;
  const title = document.getElementById('reminder-title').value.trim();
  const date  = document.getElementById('reminder-date').value;
  if (!title) { toast('Judul wajib diisi', 'error'); return; }
  if (!date)  { toast('Tanggal wajib diisi', 'error'); return; }

  const body = {
    title,
    reminder_date: date,
    reminder_time: document.getElementById('reminder-time').value || null,
    type:          document.getElementById('reminder-type').value,
    note:          document.getElementById('reminder-note').value.trim(),
  };

  const res = id
    ? await apiPut(`api/reminders.php?id=${id}`, body)
    : await apiPost('api/reminders.php', body);

  if (!res.success) { toast(res.error || 'Gagal menyimpan', 'error'); return; }

  bootstrap.Modal.getInstance(document.getElementById('modal-reminder'))?.hide();
  toast(id ? 'Reminder diperbarui ✓' : 'Reminder ditambahkan ✓', 'success');
  _refreshCalendar();
  if (App.currentPage === 'home') loadDashboard();
}

// ── Toggle done ───────────────────────────────
async function toggleReminder(id) {
  const res = await api(`api/reminders.php?action=done&id=${id}`, { method:'POST' });
  if (res.success) {
    const r = _reminders.find(x => x.id == id);
    if (r) r.is_done = res.data.is_done;
    _renderReminderList();
    _renderCalGrid();
    if (App.currentPage === 'home') loadDashboard();
  }
}

// ── Delete ────────────────────────────────────
async function deleteReminder(id) {
  const result = await confirmDelete('Hapus Reminder?', 'Reminder ini akan dihapus permanen.');
  if (!result.isConfirmed) return;
  const res = await apiDelete(`api/reminders.php?id=${id}`);
  if (res.success) {
    toast('Reminder dihapus', 'success');
    _refreshCalendar();
    if (App.currentPage === 'home') loadDashboard();
  } else {
    toast(res.error || 'Gagal menghapus', 'error');
  }
}
