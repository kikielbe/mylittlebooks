/* ============================================
   MY LITTLE BOOKS — timer.js v2
   Pomodoro dengan Web Worker + localStorage restore
   Timer tetap akurat walau tab di-minimize
   ============================================ */
'use strict';

// ── Constants ─────────────────────────────────
const POMO = { WORK: 25*60, SHORT: 5*60, LONG: 15*60 };
const STATE_KEY = 'mlb-pomo-state';

// ── Worker instance ───────────────────────────
let _worker     = null;
let _pomoCount  = 0;
let _bookId     = 0;

// ── Init Worker ───────────────────────────────
function _initWorker() {
  if (_worker) return;
  try {
    _worker = new Worker('assets/js/timer-worker.js');
    _worker.onmessage = _handleWorkerMsg;
    _worker.onerror   = (e) => {
      console.warn('Worker error:', e);
      _worker = null;
      // Fallback ke setInterval jika Worker gagal
    };
  } catch(e) {
    console.warn('Web Worker tidak tersedia, pakai setInterval fallback');
  }
}

function _handleWorkerMsg(e) {
  const { type, state } = e.data;
  switch(type) {
    case 'tick':
      _syncFromWorker(state);
      _saveState();
      break;
    case 'complete':
      _syncFromWorker(state);
      _onTimerComplete();
      break;
    case 'paused':
    case 'reset':
    case 'phase_set':
    case 'state':
      _syncFromWorker(state);
      break;
  }
}

function _syncFromWorker(state) {
  if (!state) return;
  _timerState.remaining = state.remaining;
  _timerState.total     = state.total;
  _timerState.running   = state.running;
  _timerState.phase     = state.phase;
  _updateTimerDisplay();
  _updateProgressRing();
}

// ── Timer State (juga di localStorage) ────────
let _timerState = {
  remaining: POMO.WORK,
  total:     POMO.WORK,
  running:   false,
  phase:     'work',
  pomoCount: 0,
  startedAt: null,  // timestamp saat mulai (untuk restore)
};

function _saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      ..._timerState,
      pomoCount: _pomoCount,
      bookId:    _bookId,
      savedAt:   Date.now(),
    }));
  } catch {}
}

function _restoreState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (!saved.running) {
      // Timer tidak sedang jalan — restore tampilan saja
      _timerState = { ...saved };
      _pomoCount  = saved.pomoCount || 0;
      _bookId     = saved.bookId    || 0;
      _updateTimerDisplay();
      _updateProgressRing();
      _updatePhaseLabel();
      _updatePomoCount();
      return;
    }

    // Timer sedang jalan — hitung sisa waktu berdasarkan waktu berlalu
    const elapsed = Math.floor((Date.now() - (saved.savedAt || Date.now())) / 1000);
    const realRemaining = Math.max(0, (saved.remaining || POMO.WORK) - elapsed);

    _timerState   = { ...saved, remaining: realRemaining };
    _pomoCount    = saved.pomoCount || 0;
    _bookId       = saved.bookId    || 0;

    _updateTimerDisplay();
    _updateProgressRing();
    _updatePhaseLabel();
    _updatePomoCount();

    if (realRemaining > 0) {
      // Resume timer
      toast('⏱ Timer dilanjutkan dari sesi sebelumnya', 'info');
      _sendWorker('set_phase', { phase: _timerState.phase, remaining: realRemaining });
      setTimeout(() => _sendWorker('start', { ..._timerState, remaining: realRemaining }), 100);
      _setRunningUI(true);
    } else {
      // Sudah selesai saat tab tutup
      _timerState.running = false;
      toast('⏱ Sesi Pomodoro selesai saat kamu pergi', 'info');
    }
  } catch(e) {
    console.warn('Restore state error:', e);
  }
}

function _sendWorker(cmd, data = null) {
  if (_worker) {
    _worker.postMessage({ cmd, data });
  }
}

// ── Open Modal ────────────────────────────────
async function openPomodoroModal() {
  _initWorker();

  const modal = document.getElementById('modal-pomodoro');
  if (!modal) return;

  await _populatePomodoroBooks();
  _updateTimerDisplay();
  _updateProgressRing();
  _updatePhaseLabel();
  _updatePomoCount();

  if (_bookId) {
    const sel = document.getElementById('pomo-book-select');
    if (sel) sel.value = _bookId;
  }

  // UI state
  _setRunningUI(_timerState.running);
  _setTimerStatus(_timerState.running
    ? (_timerState.phase === 'work' ? '🍅 Fokus membaca...' : '☕ Istirahat...')
    : 'Siap memulai');

  new bootstrap.Modal(modal).show();
}

async function _populatePomodoroBooks() {
  const sel = document.getElementById('pomo-book-select');
  if (!sel) return;
  sel.innerHTML = '<option value="0">— Tanpa buku tertentu —</option>';
  const res = await apiGet('api/books.php?status=reading');
  if (res.success) {
    (res.data || []).forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = `📖 ${b.title}`;
      sel.appendChild(o);
    });
  }
}

// ── Controls ──────────────────────────────────
function startTimer() {
  if (_timerState.running) return;

  _initWorker();
  _timerState.running  = true;
  _timerState.startedAt = Date.now();
  _bookId = +document.getElementById('pomo-book-select')?.value || 0;

  _sendWorker('start', {
    remaining: _timerState.remaining,
    total:     _timerState.total,
    phase:     _timerState.phase,
    running:   true,
  });

  _setRunningUI(true);
  _setTimerStatus(_timerState.phase === 'work' ? '🍅 Fokus membaca...' : '☕ Istirahat...');
  _saveState();
}

function pauseTimer() {
  if (!_timerState.running) return;
  _sendWorker('pause');
  _timerState.running = false;
  _setRunningUI(false);
  _setTimerStatus('⏸ Dijeda');
  _saveState();
}

function resetTimer() {
  _sendWorker('reset', { total: POMO.WORK, phase: 'work' });
  _timerState = { remaining: POMO.WORK, total: POMO.WORK, running: false, phase: 'work', startedAt: null };
  _setRunningUI(false);
  _setTimerStatus('Siap memulai');
  _updateTimerDisplay();
  _updateProgressRing();
  _updatePhaseLabel();
  _saveState();
}

function skipPhase() {
  _sendWorker('pause');
  _timerState.running = false;
  _onTimerComplete();
}

async function _onTimerComplete() {
  _notifyTimer(_timerState.phase);

  if (_timerState.phase === 'work') {
    _pomoCount++;
    _updatePomoCount();

    const pages = +document.getElementById('pomo-pages')?.value || 0;

    // Log ke server
    const res = await apiPost('api/timer.php?action=log_session', {
      book_id:      _bookId,
      duration:     Math.round(POMO.WORK / 60),
      pages_read:   pages,
      session_type: 'pomodoro',
    });

    if (res.success) {
      toast(`🍅 Sesi selesai! ${res.message}`, 'success');
      const pEl = document.getElementById('pomo-pages');
      if (pEl) pEl.value = '';
    }

    if (App.currentPage === 'home') loadDashboard();

    // Next phase
    const nextPhase = _pomoCount % 4 === 0 ? 'long' : 'short';
    const nextTime  = nextPhase === 'long' ? POMO.LONG : POMO.SHORT;
    _timerState     = { remaining: nextTime, total: nextTime, running: false, phase: nextPhase, startedAt: null };
    _setTimerStatus(nextPhase === 'long' ? '🌟 Istirahat panjang! Kamu keren.' : '☕ Istirahat sebentar dulu');
  } else {
    _timerState = { remaining: POMO.WORK, total: POMO.WORK, running: false, phase: 'work', startedAt: null };
    _setTimerStatus('💪 Siap sesi berikutnya!');
  }

  _sendWorker('set_phase', { phase: _timerState.phase, remaining: _timerState.remaining });
  _updateTimerDisplay();
  _updateProgressRing();
  _updatePhaseLabel();
  _setRunningUI(false);
  _saveState();
}

// ── Display helpers ───────────────────────────
function _updateTimerDisplay() {
  const el = document.getElementById('pomo-time');
  if (!el) return;
  const m = Math.floor(_timerState.remaining / 60);
  const s = _timerState.remaining % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  // Update browser title saat timer jalan
  if (_timerState.running) {
    document.title = `⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} · My Little Books`;
  } else {
    document.title = '📚 My Little Books';
  }
}

function _updateProgressRing() {
  const circle = document.getElementById('pomo-ring-fill');
  if (!circle) return;
  const pct  = _timerState.total > 0 ? _timerState.remaining / _timerState.total : 1;
  const circ = 2 * Math.PI * 54;
  circle.style.strokeDashoffset = circ * pct;
}

function _setTimerStatus(text) {
  const el = document.getElementById('pomo-status');
  if (el) el.textContent = text;
}

function _updatePhaseLabel() {
  const el = document.getElementById('pomo-phase');
  if (!el) return;
  const labels = { work:'🍅 Fokus Membaca', short:'☕ Istirahat Pendek', long:'🌟 Istirahat Panjang' };
  const colors = { work:'var(--accent)', short:'var(--green)', long:'var(--blue, #3B82F6)' };
  el.textContent = labels[_timerState.phase] || '';
  el.style.color = colors[_timerState.phase] || 'var(--accent)';
  const ring = document.getElementById('pomo-ring-fill');
  if (ring) ring.style.stroke = colors[_timerState.phase] || 'var(--accent)';
}

function _updatePomoCount() {
  const el = document.getElementById('pomo-count');
  if (el) el.innerHTML = _pomoCount > 0
    ? `<span title="${_pomoCount} sesi selesai">${'🍅'.repeat(Math.min(_pomoCount, 8))}</span>`
    : '—';
}

function _setRunningUI(running) {
  document.getElementById('pomo-btn-start')?.classList.toggle('d-none',  running);
  document.getElementById('pomo-btn-pause')?.classList.toggle('d-none', !running);
}

function _notifyTimer(phase) {
  const title = phase === 'work'
    ? '✅ Sesi baca selesai! Waktunya istirahat.'
    : '💪 Istirahat selesai! Ayo lanjut baca!';
  toast(title, 'success');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('📚 My Little Books', { body: title, icon: 'assets/img/icon-192.png' });
  }
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = phase === 'work' ? 880 : 440;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
  } catch {}
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') toast('Notifikasi diaktifkan ✓', 'success');
    });
  } else if (Notification.permission === 'granted') {
    toast('Notifikasi sudah aktif ✓', 'info');
  } else {
    toast('Notifikasi diblokir browser. Izinkan di pengaturan browser.', 'warning');
  }
}

// ════════════════════════════════════════════════
// HEATMAP 365 HARI
// ════════════════════════════════════════════════
async function loadHeatmap() {
  const wrap = document.getElementById('heatmap-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>`;

  const res = await apiGet('api/timer.php?action=heatmap');
  if (!res.success) { wrap.innerHTML = `<div class="text-center py-2" style="color:var(--text-3);font-size:.82rem">Gagal memuat heatmap</div>`; return; }

  const { days, streak, total_days, total_minutes, total_pages } = res.data;
  const hrs  = Math.floor(total_minutes / 60);
  const mins = total_minutes % 60;

  wrap.innerHTML = `
    <div style="display:flex;gap:0;margin-bottom:1rem;background:var(--bg-3);border-radius:var(--radius-sm);overflow:hidden">
      ${[
        {n: streak,      l: 'Streak'},
        {n: total_days,  l: 'Aktif'},
        {n: (hrs>0 ? hrs+'j ' : '') + mins+'m', l: 'Waktu'},
        {n: total_pages, l: 'Hal'},
      ].map((s,i) => `
        <div style="flex:1;text-align:center;padding:.6rem .15rem;min-width:0;
          ${i<3?'border-right:1px solid var(--border)':''}">
          <div style="font-size:1.1rem;font-weight:800;color:var(--accent);
            line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${s.n}
          </div>
          <div style="font-size:.58rem;color:var(--text-3);
            text-transform:uppercase;font-weight:600;margin-top:2px;
            white-space:nowrap;overflow:hidden">
            ${s.l}
          </div>
        </div>`).join('')}
    </div>
    <div id="heatmap-months" style="display:flex;font-size:.6rem;color:var(--text-3);margin-bottom:3px;overflow:hidden"></div>
    <div id="heatmap-grid" style="display:grid;grid-template-rows:repeat(7,12px);grid-auto-flow:column;gap:3px;overflow-x:auto;padding-bottom:4px"></div>
    <div style="display:flex;align-items:center;gap:.35rem;margin-top:.5rem;justify-content:flex-end">
      <span style="font-size:.62rem;color:var(--text-3)">Sedikit</span>
      ${[0,1,2,3,4].map(l=>`<div style="width:10px;height:10px;border-radius:2px;background:${_heatColor(l*15,60)};flex-shrink:0"></div>`).join('')}
      <span style="font-size:.62rem;color:var(--text-3)">Banyak</span>
    </div>`;

  const grid   = document.getElementById('heatmap-grid');
  const today  = new Date().toISOString().slice(0,10);
  const first  = new Date(days[0].date).getDay();
  for (let i=0;i<first;i++) { const e=document.createElement('div'); e.style.cssText='width:12px;height:12px;opacity:0'; grid.appendChild(e); }

  days.forEach(d => {
    const intensity = Math.min(d.pages + d.minutes, 60);
    const cell = document.createElement('div');
    const isToday = d.date === today;
    cell.style.cssText = `width:12px;height:12px;border-radius:2px;cursor:pointer;flex-shrink:0;background:${_heatColor(intensity,60)};outline:${isToday?'2px solid var(--accent)':'none'};outline-offset:1px;transition:transform .1s`;
    cell.title = `${d.date}\n${d.pages} hal · ${d.minutes} mnt${d.mood?' · '+('⭐'.repeat(d.mood)):''}`;
    cell.onmouseenter = () => cell.style.transform = 'scale(1.5)';
    cell.onmouseleave = () => cell.style.transform = 'scale(1)';
    grid.appendChild(cell);
  });

  _renderMonthLabels(days);
}

function _heatColor(intensity, max) {
  if (intensity === 0) return 'var(--bg-3)';
  const p = Math.min(intensity/max,1);
  if (p<.25) return 'rgba(245,166,35,.2)';
  if (p<.5)  return 'rgba(245,166,35,.45)';
  if (p<.75) return 'rgba(245,166,35,.7)';
  return 'var(--accent)';
}

function _renderMonthLabels(days) {
  const wrap = document.getElementById('heatmap-months');
  if (!wrap) return;
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  let last=-1; let weeks=0; let html='';
  days.forEach(d => {
    const m = new Date(d.date).getMonth();
    if (m!==last) { html+=`<span style="min-width:${weeks*15}px">${months[m]}</span>`; last=m; weeks=0; }
    if (new Date(d.date).getDay()===0) weeks++;
  });
  wrap.innerHTML = html;
}

// ════════════════════════════════════════════════
// DAILY CHECK-IN
// ════════════════════════════════════════════════
async function openCheckinModal() {
  const modal = document.getElementById('modal-checkin');
  if (!modal) return;
  const res = await apiGet('api/timer.php?action=today');
  if (res.success && res.data.checked_in) { toast('Sudah check-in hari ini! 🎉', 'info'); return; }
  new bootstrap.Modal(modal).show();
  _renderMoodSelector();
}

function _renderMoodSelector() {
  const wrap = document.getElementById('checkin-mood');
  if (!wrap) return;
  const moods = ['😞','😐','🙂','😊','🤩'];
  wrap.innerHTML = moods.map((m,i) => `
    <div class="mood-opt" data-v="${i+1}" onclick="selectMood(${i+1},this)"
      style="font-size:1.8rem;cursor:pointer;padding:.4rem;border-radius:10px;
             transition:all .15s;border:2px solid transparent;text-align:center;user-select:none">
      ${m}
    </div>`).join('');
}

function selectMood(val, el) {
  document.querySelectorAll('.mood-opt').forEach(m => {
    m.style.background=m.style.borderColor='transparent'; m.style.transform='scale(1)';
  });
  el.style.background='var(--accent-bg)'; el.style.borderColor='var(--accent)'; el.style.transform='scale(1.15)';
  const hid = document.getElementById('checkin-mood-val');
  if (hid) hid.value = val;
}

async function submitCheckin() {
  const mood  = +document.getElementById('checkin-mood-val')?.value || 3;
  const note  = document.getElementById('checkin-note')?.value.trim() || '';
  const pages = +document.getElementById('checkin-pages')?.value || 0;
  const res   = await apiPost('api/timer.php?action=checkin', { mood, note, pages });
  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modal-checkin'))?.hide();
    toast(`Check-in berhasil! Streak: ${res.data.streak} hari 🔥`, 'success');
    if (App.currentPage === 'home') loadDashboard();
    if (document.getElementById('heatmap-wrap')) loadHeatmap();
  } else { toast(res.error || 'Gagal check-in', 'error'); }
}

// ── Auto-restore saat halaman dibuka ──────────
window.addEventListener('load', () => {
  setTimeout(() => {
    _initWorker();
    _restoreState();
  }, 500);
});

// ── Simpan state sebelum halaman ditutup ──────
window.addEventListener('beforeunload', () => {
  if (_timerState.running) {
    _timerState.savedAt = Date.now();
    _saveState();
  }
});
