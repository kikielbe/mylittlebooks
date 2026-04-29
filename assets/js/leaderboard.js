/* ============================================
   MY LITTLE BOOKS — leaderboard.js
   XP Level · Badge · Streak · Tab switching
   ============================================ */

'use strict';

// ── All badge definitions ──────────────────────
const BADGE_DEFS = [
  { key:'first_note',     icon:'📝', name:'Catatan Pertama',   desc:'Buat 1 catatan' },
  { key:'five_books',     icon:'📚', name:'Kolektor Pemula',   desc:'Catat 5 buku' },
  { key:'reader',         icon:'📖', name:'Pembaca',           desc:'Selesaikan 1 buku' },
  { key:'streak_7',       icon:'🔥', name:'Streak 7 Hari',     desc:'7 hari berturut-turut' },
  { key:'ten_ratings',    icon:'⭐', name:'Kritikus Buku',     desc:'Beri rating 10 buku' },
  { key:'ten_quotes',     icon:'💬', name:'Pencinta Kutipan',  desc:'Simpan 10 kutipan' },
  { key:'ten_books_done', icon:'🎉', name:'Pembaca Sejati',    desc:'Selesaikan 10 buku' },
  { key:'scholar',        icon:'🎓', name:'Scholar',           desc:'Capai 1000 XP' },
  { key:'bibliophile',    icon:'🏆', name:'Bibliophile',       desc:'Capai 2500 XP' },
  { key:'grand_reader',   icon:'👑', name:'Grand Reader',      desc:'Capai 5000 XP' },
];

// ── Main loader ───────────────────────────────
async function loadLeaderboard() {
  const res = await apiGet('api/backup.php?action=level');
  if (!res.success) return;

  const { level, badges, streak, calendar, progress, targets } = res.data;

  _renderLevelCard(level);
  _renderTargetProgress(progress, targets);
  _renderBadges(badges);
  _renderStreakData(streak, calendar);
}

// ── Tab switching ──────────────────────────────
// switchLevelTab is defined in calendar.js — do not redefine here

// ── Level card ────────────────────────────────
function _renderLevelCard(level) {
  const nameEl = document.getElementById('level-name');
  const xpEl   = document.getElementById('level-xp-text');
  const barEl  = document.getElementById('level-bar');
  const ringEl = document.getElementById('level-ring');

  if (nameEl) nameEl.innerHTML = `${level.icon} ${level.name}`;
  if (xpEl)   xpEl.textContent = level.next
    ? `${level.xp} / ${level.next} XP`
    : `${level.xp} XP — Level Tertinggi!`;
  if (barEl)  barEl.style.width = (level.percent || 0) + '%';

  // Ring
  if (ringEl) {
    const pct  = level.percent || 0;
    const circ = 2 * Math.PI * 44; // r=44
    const dash = circ - (pct / 100) * circ;
    const color = pct >= 100 ? 'var(--green)' : 'url(#ringGrad)';

    ringEl.innerHTML = `
      <svg width="100" height="100" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:var(--blue)"/>
            <stop offset="100%" style="stop-color:var(--cyan)"/>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="50" cy="50" r="44" transform="rotate(-90,50,50)"/>
        <circle cx="50" cy="50" r="44"
          fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(1)}"
          stroke-dashoffset="${dash.toFixed(1)}"
          transform="rotate(-90,50,50)"
          style="transition:stroke-dashoffset .8s ease"/>
      </svg>
      <div class="ring-label position-absolute" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:1.8rem;line-height:1">${level.icon}</div>
        <div style="font-size:.65rem;color:var(--text-muted)">${pct}%</div>
      </div>`;
    ringEl.style.position = 'relative';
    ringEl.style.width    = '100px';
    ringEl.style.height   = '100px';
  }
}

// ── Target progress ────────────────────────────
function _renderTargetProgress(progress, targets) {
  const wrap = document.getElementById('target-progress-list');
  if (!wrap) return;

  const items = [
    {
      label: 'Buku Bulan Ini',
      val:   progress.month_done,
      target:targets.monthly_books || 1,
      icon:  '📚',
      color: 'var(--blue)',
    },
    {
      label: 'Halaman Hari Ini',
      val:   progress.today_pages,
      target:targets.daily_pages || 1,
      icon:  '📄',
      color: 'var(--cyan)',
    },
    {
      label: 'Catatan Minggu Ini',
      val:   progress.week_notes,
      target:targets.weekly_notes || 1,
      icon:  '📝',
      color: 'var(--amber)',
    },
  ];

  wrap.innerHTML = items.map(item => {
    const pct  = Math.min(100, Math.round((item.val / item.target) * 100));
    const done = item.val >= item.target;
    return `
      <div class="card p-3 mb-2">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="d-flex align-items-center gap-2">
            <span style="font-size:1.2rem">${item.icon}</span>
            <span class="small fw-semibold">${item.label}</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="small fw-bold" style="color:${item.color}">${item.val}</span>
            <span class="small text-muted">/ ${item.target}</span>
            ${done ? '<i class="bi bi-check-circle-fill text-success small"></i>' : ''}
          </div>
        </div>
        <div class="progress">
          <div class="progress-bar" style="width:${pct}%;background:${item.color}"></div>
        </div>
        <div class="d-flex justify-content-between mt-1">
          <span class="small text-muted">${pct}%</span>
          ${done
            ? `<span class="small text-success">🎯 Target tercapai!</span>`
            : `<span class="small text-muted">Sisa ${item.target - item.val} lagi</span>`}
        </div>
      </div>`;
  }).join('');
}

// ── Badges ────────────────────────────────────
function _renderBadges(earnedBadges) {
  const grid = document.getElementById('badges-grid');
  if (!grid) return;

  const earnedKeys = new Set((earnedBadges || []).map(b => b.badge_key));

  grid.innerHTML = BADGE_DEFS.map(def => {
    const earned = earnedKeys.has(def.key);
    const earnedData = earned ? earnedBadges.find(b => b.badge_key === def.key) : null;
    return `
      <div class="badge-item ${earned ? 'earned' : 'locked'}" title="${esc(def.desc)}">
        <div class="badge-icon">${def.icon}</div>
        <div class="badge-name">${esc(def.name)}</div>
        ${earned
          ? `<div style="font-size:.6rem;color:var(--amber)">${fmtDateShort(earnedData?.earned_at)}</div>`
          : `<div style="font-size:.6rem;color:var(--text-dim)">Terkunci</div>`}
      </div>`;
  }).join('');
}

// ── Streak ────────────────────────────────────
function _initStreakPanel(streak, calendar) {
  // Streak panel might already have been replaced by calendar shell
  // Only init if panel-streak has its original structure
  const panel = document.getElementById('panel-streak');
  if (!panel || document.getElementById('cal-grid')) return;

  // Re-render streak panel original structure
  panel.innerHTML = `
    <div class="card p-3 mb-3 text-center">
      <div style="font-size:2.5rem">🔥</div>
      <div class="font-display" id="streak-count"
        style="font-size:2.5rem;background:linear-gradient(135deg,var(--blue),var(--cyan));
               -webkit-background-clip:text;-webkit-text-fill-color:transparent">0</div>
      <div class="text-muted small">Hari Streak</div>
    </div>
    <div class="fw-semibold small mb-2 text-muted">30 HARI TERAKHIR</div>
    <div class="streak-grid mb-4" id="streak-grid"></div>

    <!-- Calendar section -->
    <div class="d-flex align-items-center justify-content-between mb-2">
      <button class="btn btn-ghost btn-sm" onclick="calPrev()"><i class="bi bi-chevron-left"></i></button>
      <div class="fw-semibold small" id="cal-header"></div>
      <button class="btn btn-ghost btn-sm" onclick="calNext()"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="d-grid mb-1" style="grid-template-columns:repeat(7,1fr);gap:2px">
      ${['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d =>
        `<div class="text-center small text-muted" style="padding:4px 0">${d}</div>`).join('')}
    </div>
    <div class="d-grid mb-3" style="grid-template-columns:repeat(7,1fr);gap:4px" id="cal-grid"></div>

    <div class="d-flex align-items-center justify-content-between mb-2">
      <div class="fw-semibold small text-muted">REMINDER BULAN INI</div>
      <button class="btn btn-primary btn-sm" onclick="openReminderModal()">
        <i class="bi bi-plus me-1"></i>Tambah
      </button>
    </div>
    <div id="reminders-list"></div>`;

  _renderStreakData(streak, calendar);
  loadCalendar();
}

function _renderStreakData(streak, calendar) {
  const countEl = document.getElementById('streak-count');
  const gridEl  = document.getElementById('streak-grid');

  if (countEl) countEl.textContent = streak || 0;
  if (!gridEl) return;

  // Build 30-day map
  const activityMap = {};
  (calendar || []).forEach(d => { activityMap[d.logged_date] = +d.pages; });

  const today  = new Date();
  const cells  = [];
  for (let i = 29; i >= 0; i--) {
    const d   = new Date(today);
    d.setDate(today.getDate() - i);
    const str = d.toISOString().slice(0,10);
    cells.push({
      str,
      day:    d.getDate(),
      active: !!activityMap[str],
      pages:  activityMap[str] || 0,
      today:  i === 0,
    });
  }

  gridEl.innerHTML = cells.map(c => `
    <div class="streak-day ${c.active ? 'has-activity' : ''} ${c.today ? 'today' : ''}"
      title="${c.str}${c.active ? ` · ${c.pages} hal` : ''}">
      ${c.day}
    </div>`).join('');
}
