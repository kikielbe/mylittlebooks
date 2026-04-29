/* ============================================
   MY LITTLE BOOKS — app.js v3
   Router · Theme · Nav Indicator · Dashboard
   ============================================ */
'use strict';

const App = {
  currentPage: 'home',
  role: 'member',
  user: null,
  quill: null,
  bookFilterStatus: '',
  activeNoteTag: '',
  currentBookId: null,
  currentNoteId: null,
  quranData: null,
  reportChart: null,
};

// ── Theme ─────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('mlb-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeUI(saved);
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('mlb-theme', next);
  updateThemeUI(next);
}

function updateThemeUI(theme) {
  const label = document.getElementById('theme-label');
  const knob  = document.getElementById('theme-knob');
  if (label) label.textContent = theme === 'dark' ? 'Mode Gelap' : 'Mode Terang';
  if (knob) {
    knob.textContent  = theme === 'dark' ? '🌙' : '☀️';
    knob.style.transform = theme === 'dark' ? 'translateX(24px)' : 'translateX(0)';
  }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = theme === 'dark' ? '#0E0E10' : '#FFFFFF';
}

// ── API ───────────────────────────────────────
async function api(url, opts = {}) {
  try {
    const res  = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
    return await res.json();
  } catch(e) {
    console.error('API:', url, e);
    return { success: false, error: 'Koneksi gagal' };
  }
}
const apiGet    = url         => api(url);
const apiPost   = (url, body) => api(url, { method:'POST',   body: JSON.stringify(body) });
const apiPut    = (url, body) => api(url, { method:'PUT',    body: JSON.stringify(body) });
const apiDelete = url         => api(url, { method:'DELETE' });

// ── Toast ─────────────────────────────────────
function toast(msg, type = 'success') {
  const icons = {
    success: 'check-circle-fill',
    error:   'x-circle-fill',
    info:    'info-circle-fill',
    warning: 'exclamation-triangle-fill',
  };
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.innerHTML = `<i class="bi bi-${icons[type]||icons.info}"></i><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function confirmDelete(title, text) {
  return Swal.fire({
    title, text, icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Hapus', cancelButtonText: 'Batal',
    reverseButtons: true,
  });
}

// ── Utils ─────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}
function fmtDate(s) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}
function fmtDateShort(s) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('id-ID', { day:'numeric', month:'short' });
}
function renderStars(v = 0) {
  let h = '';
  for (let i = 1; i <= 5; i++)
    h += `<i class="bi bi-star${i<=v?'-fill':''}" style="color:${i<=v?'var(--accent)':'var(--text-3)'};font-size:.85rem"></i>`;
  return h;
}

function initStarInput(cId, hId) {
  const c = document.getElementById(cId), h = document.getElementById(hId);
  if (!c || !h) return;
  const stars = c.querySelectorAll('i');
  stars.forEach(s => {
    s.addEventListener('mouseenter', () => { const v=+s.dataset.v; stars.forEach(x => x.className = +x.dataset.v<=v ? 'bi bi-star-fill filled':'bi bi-star'); });
    s.addEventListener('mouseleave', () => { const cur=+h.value||0; stars.forEach(x => x.className = +x.dataset.v<=cur ? 'bi bi-star-fill filled':'bi bi-star'); });
    s.addEventListener('click', () => { h.value=s.dataset.v; stars.forEach(x => x.className = +x.dataset.v<=+s.dataset.v ? 'bi bi-star-fill filled':'bi bi-star'); });
  });
}

function setStarInput(cId, hId, val) {
  const c = document.getElementById(cId), h = document.getElementById(hId);
  if (!c || !h) return;
  h.value = val;
  c.querySelectorAll('i').forEach(s => s.className = +s.dataset.v <= val ? 'bi bi-star-fill filled':'bi bi-star');
}

function setBtnLoading(tId, sId, on) {
  document.getElementById(tId)?.classList.toggle('d-none', on);
  document.getElementById(sId)?.classList.toggle('d-none', !on);
}

// ── Nav Indicator ─────────────────────────────
function updateNavIndicator(page) {
  // Use rAF to ensure nav is painted before measuring
  requestAnimationFrame(() => {
    const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
    const ind   = document.getElementById('nav-indicator');
    const nav   = document.getElementById('bottom-nav');
    if (!navEl || !ind || !nav) return;
    const navRect  = nav.getBoundingClientRect();
    const itemRect = navEl.getBoundingClientRect();
    if (navRect.width === 0) return; // nav belum visible
    ind.style.left  = (itemRect.left - navRect.left + 4) + 'px';
    ind.style.width = (itemRect.width - 8) + 'px';
  });
}

// ── Router ────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  App.currentPage = page;

  updateNavIndicator(page);
  updateFab(page);
  updateTopbarExtra(page);

  switch(page) {
    case 'home':     loadDashboard();   break;
    case 'books':    loadBooks();       break;
    case 'notes':    loadNotes();       break;
    case 'level':    loadLeaderboard(); break;
    case 'settings': loadSettings();    break;
  }
}

function updateFab(page) {
  const fab = document.getElementById('fab');
  if (!fab) return;
  if (['books','notes'].includes(page)) {
    fab.classList.remove('d-none');
  } else {
    fab.classList.add('d-none');
  }
}

function updateTopbarExtra(page) {
  const el = document.getElementById('topbar-extra');
  if (!el) return;
  el.innerHTML = '';
}

function fabAction() {
  if (App.currentPage === 'books') {
    openBookModal();
    return;
  }
  if (App.currentPage === 'notes') {
    // Check which sub-tab is active
    const quotesPanel = document.getElementById('panel-quotes');
    const quotesActive = quotesPanel && !quotesPanel.classList.contains('d-none');
    if (quotesActive) openQuoteModal();
    else openNoteModal();
  }
}

// ── Auth ──────────────────────────────────────
async function checkAuth() {
  const res = await apiGet('api/auth.php?action=check');
  if (!res.authenticated) { window.location.href = 'welcome.html'; return false; }
  App.user = res.user;
  App.role  = res.user?.role || 'member';
  return true;
}

// ── Dashboard ─────────────────────────────────
async function loadDashboard() {
  const res = await apiGet('api/auth.php?action=stats');
  if (!res.success) return;

  const { counts, streak, level, targets, recent_notes, today_reminders, reading } = res.data;

  // Greeting
  const h  = new Date().getHours();
  const gr = h < 11 ? 'Selamat pagi 🌅' : h < 15 ? 'Selamat siang ☀️' : h < 18 ? 'Selamat sore 🌤' : 'Selamat malam 🌙';
  document.getElementById('dash-greeting')?.textContent && (document.getElementById('dash-greeting').textContent = gr);
  document.getElementById('dash-name') && (document.getElementById('dash-name').textContent = (App.user?.display_name || 'Reader') + ' 👋');

  // Level badge
  const lvEl = document.getElementById('dash-level-badge');
  if (lvEl) lvEl.innerHTML = `
    <div style="text-align:center">
      <div style="font-size:1.6rem;line-height:1">${level.icon}</div>
      <div style="font-size:.72rem;font-weight:700;color:var(--accent);margin-top:2px">${level.name}</div>
      <div style="font-size:.68rem;color:var(--text-3)">${level.xp} XP</div>
    </div>`;

  document.getElementById('dash-month') &&
    (document.getElementById('dash-month').textContent =
      new Date().toLocaleDateString('id-ID', {month:'long', year:'numeric'}));

  // Stats (animate on load)
  const animateNum = (el, target) => {
    if (!el) return;
    let cur = 0; const step = Math.ceil(target / 20);
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = cur > 999 ? (cur/1000).toFixed(1)+'K' : cur;
      if (cur >= target) clearInterval(t);
    }, 40);
  };
  animateNum(document.getElementById('s-books'),  counts.total_books);
  animateNum(document.getElementById('s-notes'),  counts.total_notes);
  animateNum(document.getElementById('s-pages'),  counts.total_pages);
  animateNum(document.getElementById('s-streak'), streak);

  // Target progress
  const tw = document.getElementById('dash-targets');
  if (tw) {
    tw.innerHTML = [
      { label:'Buku bulan ini',     val:counts.month_done,  target:targets.monthly_books||1, icon:'📚' },
      { label:'Halaman hari ini',   val:counts.today_pages, target:targets.daily_pages||1,   icon:'📄' },
      { label:'Catatan minggu ini', val:counts.week_notes,  target:targets.weekly_notes||1,  icon:'✍️' },
    ].map(t => {
      const pct  = Math.min(100, Math.round(t.val / t.target * 100));
      const done = t.val >= t.target;
      return `<div class="mb-2">
        <div class="d-flex justify-content-between small mb-1">
          <span style="color:var(--text-2);font-weight:500">${t.icon} ${t.label}</span>
          <span style="font-weight:700;color:${done?'var(--green)':'var(--text-2)'}">${t.val}/${t.target}${done?' ✓':''}</span>
        </div>
        <div class="progress"><div class="progress-bar${done?' green':''}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  // Currently reading
  const rw = document.getElementById('dash-reading-wrap');
  const rc = document.getElementById('dash-reading');
  if (rw && rc) {
    if (reading?.length) {
      rw.classList.remove('d-none');
      rc.innerHTML = reading.map(b => {
        const pct = b.total_pages ? Math.round(b.current_page/b.total_pages*100) : 0;
        return `<div class="card card-press p-3 mb-2" onclick="openBookDetail(${b.id})">
          <div class="d-flex gap-3 align-items-center">
            ${b.cover_filename
              ? `<img src="assets/uploads/covers/${esc(b.cover_filename)}" class="book-cover"/>`
              : `<div class="book-cover-placeholder">📗</div>`}
            <div class="flex-grow-1 overflow-hidden">
              <div style="font-weight:700;font-size:.92rem" class="text-truncate">${esc(b.title)}</div>
              <div style="font-size:.78rem;color:var(--text-2)" class="text-truncate">${esc(b.author)||'—'}</div>
              <div class="d-flex justify-content-between small mt-1" style="color:var(--text-3)">
                <span>Hal. ${b.current_page}/${b.total_pages||'?'}</span><span style="font-weight:700;color:var(--accent)">${pct}%</span>
              </div>
              <div class="progress mt-1" style="height:5px!important"><div class="progress-bar" style="width:${pct}%"></div></div>
            </div>
          </div>
        </div>`;
      }).join('');
    } else {
      rw.classList.add('d-none');
    }
  }

  // Recent notes
  const rn = document.getElementById('dash-recent-notes');
  if (rn) {
    if (recent_notes?.length) {
      rn.innerHTML = recent_notes.map((n, i) => `
        <div class="card card-press p-3 mb-2" onclick="viewNote(${n.id})"
          style="animation:staggerIn .3s ease ${i*.06}s both">
          <div class="d-flex justify-content-between align-items-center">
            <div class="overflow-hidden flex-grow-1">
              <div style="font-weight:700;font-size:.9rem" class="text-truncate">${esc(n.note_title)}</div>
              <div style="font-size:.78rem;color:var(--text-3)" class="text-truncate">${esc(n.book_title)||'—'}</div>
            </div>
            <div style="font-size:.72rem;color:var(--text-3);margin-left:.75rem;flex-shrink:0">${fmtDateShort(n.created_at)}</div>
          </div>
        </div>`).join('');
    } else {
      rn.innerHTML = `<div class="empty-state">
        <div class="empty-icon">✍️</div>
        <div class="empty-title">Belum ada catatan</div>
        <div class="empty-desc">Mulai catat hal menarik dari buku yang kamu baca</div>
      </div>`;
    }
  }

  // Reminders
  const rdw = document.getElementById('dash-reminders-wrap');
  const rdc = document.getElementById('dash-reminders');
  if (rdw && rdc) {
    if (today_reminders?.length) {
      rdw.classList.remove('d-none');
      rdc.innerHTML = today_reminders.map(r => `
        <div class="card p-3 mb-2 d-flex flex-row align-items-center gap-3">
          <span style="font-size:1.4rem">🔔</span>
          <div class="flex-grow-1">
            <div style="font-weight:700;font-size:.88rem">${esc(r.title)}</div>
            ${r.reminder_time ? `<div style="font-size:.75rem;color:var(--text-3)">${r.reminder_time.slice(0,5)}</div>` : ''}
          </div>
          <button class="btn-icon" onclick="toggleReminderDone(${r.id})">
            <i class="bi bi-check2" style="color:var(--green)"></i>
          </button>
        </div>`).join('');
    } else {
      rdw.classList.add('d-none');
    }
  }

  // Today timer stats
  _loadTodayTimerStats();

  // Sesi 4 widgets
  loadQuoteOfDay();
  loadScheduleWidget();
  loadReviewQueue();
}

async function toggleReminderDone(id) {
  await api(`api/reminders.php?action=done&id=${id}`, { method:'POST' });
  loadDashboard();
}

// ── Init ──────────────────────────────────────
async function init() {
  initTheme();

  const ok = await checkAuth();
  if (!ok) return;

  initStarInput('book-rating-stars', 'book-rating');
  initStarInput('note-rating-stars', 'note-rating');

  App.quill = new Quill('#note-editor', {
    theme: 'snow',
    placeholder: 'Tulis catatanmu di sini...',
    modules: {
      toolbar: [
        ['bold','italic','underline'],
        [{ header:[2,3,false] }],
        [{ list:'ordered' }, { list:'bullet' }],
        ['blockquote'],
        ['clean'],
      ]
    }
  });

  navigateTo('home');

  const rm = document.getElementById('report-month');
  if (rm) rm.value = new Date().toISOString().slice(0,7);

  setTimeout(() => updateNavIndicator('home'), 150);
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

// ── Today timer stats (dashboard widget) ──────
async function _loadTodayTimerStats() {
  const el = document.getElementById('today-timer-stats');
  if (!el) return;
  try {
    const res = await apiGet('api/timer.php?action=today');
    if (!res.success) return;
    const d = res.data;
    if (d.today_sessions === 0) {
      el.innerHTML = `<span style="color:var(--text-3)">Belum ada sesi hari ini — tap <b>Mulai</b> untuk mulai membaca!</span>`;
    } else {
      const checkinBadge = d.checked_in
        ? `<span style="color:var(--green);font-weight:700">✓ Check-in</span>`
        : `<button class="btn-ghost" style="font-size:.72rem;padding:.15rem .5rem" onclick="openCheckinModal()">Check-in?</button>`;
      el.innerHTML = `
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <span>🍅 <b>${d.today_sessions}</b> sesi</span>
          <span>⏱ <b>${d.today_minutes}</b> menit</span>
          <span>📄 <b>${d.today_pages}</b> halaman</span>
          ${checkinBadge}
        </div>`;
    }
  } catch {}
}
