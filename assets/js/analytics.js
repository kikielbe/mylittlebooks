/* ============================================
   MY LITTLE BOOKS — analytics.js
   Reading Personality · Mini Calendar
   Book Comparison · Deep Insights
   ============================================ */
'use strict';

// ════════════════════════════════════════════════
// READING PERSONALITY
// ════════════════════════════════════════════════
async function loadReadingPersonality() {
  const wrap = document.getElementById('personality-wrap');
  if (!wrap) return;

  wrap.innerHTML = `<div class="text-center py-3">
    <div class="spinner-border spinner-border-sm"></div>
    <div style="font-size:.78rem;color:var(--text-3);margin-top:.5rem">Menganalisis pola bacamu...</div>
  </div>`;

  const res = await apiGet('api/analytics.php?action=personality');
  if (!res.success) {
    wrap.innerHTML = `<div style="font-size:.82rem;color:var(--text-3);text-align:center;padding:.75rem">
      Belum cukup data. Mulai baca dan catat untuk melihat Reading Personality!
    </div>`;
    return;
  }

  const { personality, stats } = res.data;
  _renderPersonality(wrap, personality, stats);
}

function _renderPersonality(wrap, p, stats) {
  const scoreBar = (label, val, color) => `
    <div style="margin-bottom:.4rem">
      <div class="d-flex justify-content-between" style="font-size:.68rem;color:var(--text-3)">
        <span>${label}</span><span>${Math.round(val)}%</span>
      </div>
      <div style="height:5px;background:var(--bg-3);border-radius:3px;margin-top:2px">
        <div style="height:100%;border-radius:3px;background:${color};
          width:${Math.min(100,val)}%;transition:width 1s ease"></div>
      </div>
    </div>`;

  wrap.innerHTML = `
    <div class="card p-3 mb-2" style="border:1.5px solid ${p.color};background:${p.color}15">
      <!-- Header -->
      <div class="d-flex align-items-center gap-3 mb-3">
        <div style="width:54px;height:54px;border-radius:16px;flex-shrink:0;
          background:${p.color}25;border:2px solid ${p.color};
          display:flex;align-items:center;justify-content:center;font-size:1.8rem">
          ${p.emoji}
        </div>
        <div class="flex-grow-1">
          <div style="font-weight:800;font-size:1rem;color:var(--text)">${esc(p.name)}</div>
          <div style="font-size:.72rem;margin-top:.15rem">
            <span style="background:${p.color};color:#fff;border-radius:20px;
              padding:.1rem .55rem;font-weight:700;font-size:.68rem">${esc(p.badge)}</span>
          </div>
        </div>
      </div>

      <!-- Description -->
      <p style="font-size:.82rem;color:var(--text-2);line-height:1.6;margin-bottom:.75rem">
        ${esc(p.desc)}
      </p>

      <!-- Score bars -->
      <div style="margin-bottom:.75rem">
        ${scoreBar('Konsisten',  p.scores.consistent,  '#22C55E')}
        ${scoreBar('Mendalam',   p.scores.deep,         '#8B5CF6')}
        ${scoreBar('Luas',       p.scores.broad,        '#3B82F6')}
        ${scoreBar('Kritis',     p.scores.critical,     '#F5A623')}
      </div>

      <!-- Quick stats -->
      <div class="d-flex justify-content-between" style="background:var(--bg-3);
        border-radius:var(--radius-sm);padding:.5rem .75rem">
        ${[
          { n: stats.total_books,    l: 'Buku' },
          { n: stats.total_notes,    l: 'Catatan' },
          { n: stats.streak_max,     l: 'Max Streak' },
          { n: stats.notes_per_book, l: 'Catatan/Buku' },
        ].map(s => `
          <div style="text-align:center">
            <div style="font-size:1rem;font-weight:800;color:${p.color}">${s.n}</div>
            <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;font-weight:600">${s.l}</div>
          </div>`).join('')}
      </div>

      <!-- Tip -->
      <div style="margin-top:.75rem;font-size:.75rem;color:var(--text-2);
        background:var(--bg-2);border-radius:var(--radius-sm);padding:.5rem .75rem;
        border-left:3px solid ${p.color}">
        💡 ${esc(p.tip)}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════
// MINI STREAK CALENDAR (30 hari)
// ════════════════════════════════════════════════
async function loadMiniCalendar() {
  const wrap = document.getElementById('mini-calendar-wrap');
  if (!wrap) return;

  const res = await apiGet('api/analytics.php?action=calendar');
  if (!res.success) return;

  const { days, streak } = res.data;
  _renderMiniCalendar(wrap, days, streak);
}

function _renderMiniCalendar(wrap, days, streak) {
  const today    = new Date().toISOString().slice(0, 10);
  const dayNames = ['M','S','S','R','K','J','S'];

  // Day headers
  const firstDate = new Date(days[0].date);
  const startDow  = (firstDate.getDay() + 6) % 7; // 0=Mon

  let cells = '';
  // Day name headers
  dayNames.forEach(d => {
    cells += `<div style="text-align:center;font-size:.58rem;color:var(--text-3);
      font-weight:700;padding-bottom:3px">${d}</div>`;
  });

  // Empty leading cells
  for (let i = 0; i < startDow; i++) cells += '<div></div>';

  days.forEach(d => {
    const isToday  = d.date === today;
    const hasRead  = d.pages > 0 || d.sessions > 0;
    const intensity= Math.min(1, (d.pages / 30) + (d.sessions * 0.3));
    const bg = hasRead
      ? `rgba(245,166,35,${0.2 + intensity * 0.8})`
      : 'var(--bg-3)';

    const dayNum = new Date(d.date).getDate();
    cells += `
      <div title="${d.date}: ${d.pages} hal · ${d.sessions} sesi"
        style="aspect-ratio:1;border-radius:6px;background:${bg};
          display:flex;align-items:center;justify-content:center;
          font-size:.62rem;font-weight:${isToday?'800':'600'};
          color:${isToday?'var(--accent)':hasRead?'var(--text)':'var(--text-3)'};
          outline:${isToday?'2px solid var(--accent)':'none'};
          outline-offset:1px;cursor:default;transition:transform .1s"
        onmouseenter="this.style.transform='scale(1.2)'"
        onmouseleave="this.style.transform='scale(1)'">
        ${dayNum}
      </div>`;
  });

  wrap.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <span style="font-size:.78rem;font-weight:700">📅 30 Hari Terakhir</span>
      <span style="font-size:.72rem;color:var(--accent);font-weight:700">
        🔥 ${streak} hari streak
      </span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div>
    <div class="d-flex align-items-center gap-1 mt-2 justify-content-end">
      <span style="font-size:.6rem;color:var(--text-3)">Kosong</span>
      ${[0,.25,.5,.75,1].map(l => `<div style="width:10px;height:10px;border-radius:3px;
        background:rgba(245,166,35,${l > 0 ? 0.2 + l * 0.8 : 0});
        ${l===0 ? 'background:var(--bg-3)' : ''}"></div>`).join('')}
      <span style="font-size:.6rem;color:var(--text-3)">Aktif</span>
    </div>`;
}

// ════════════════════════════════════════════════
// DEEP INSIGHTS
// ════════════════════════════════════════════════
async function loadInsights() {
  const wrap = document.getElementById('insights-wrap');
  if (!wrap) return;

  const res = await apiGet('api/analytics.php?action=insights');
  if (!res.success) return;

  const d = res.data;
  const items = [
    d.best_day    && { icon:'📅', label:'Hari Terbaik',    val: d.best_day },
    d.best_hour   && { icon:'⏰', label:'Waktu Favorit',   val: d.best_hour },
    d.monthly_avg && { icon:'📖', label:'Rata-rata/Bulan', val: `${d.monthly_avg} halaman` },
    d.fastest_book&& { icon:'⚡', label:'Buku Tercepat',   val: `${esc(d.fastest_book.title)} (${d.fastest_book.pages_per_day} hal/hari)` },
    d.most_noted  && { icon:'✍️', label:'Buku Terbanyak Catatan', val: `${esc(d.most_noted.title)} (${d.most_noted.note_count} catatan)` },
  ].filter(Boolean);

  if (!items.length) {
    wrap.innerHTML = `<div style="font-size:.78rem;color:var(--text-3);text-align:center">
      Baca lebih banyak untuk melihat insight mendalam!</div>`;
    return;
  }

  wrap.innerHTML = items.map(item => `
    <div class="d-flex align-items-start gap-2 mb-2">
      <span style="font-size:1.1rem;flex-shrink:0;width:24px;text-align:center">${item.icon}</span>
      <div>
        <div style="font-size:.7rem;color:var(--text-3);font-weight:600;text-transform:uppercase">
          ${item.label}
        </div>
        <div style="font-size:.82rem;font-weight:700;color:var(--text)">${item.val}</div>
      </div>
    </div>`).join('') +
    (d.top_tags?.length ? `
      <div class="d-flex align-items-start gap-2 mb-2">
        <span style="font-size:1.1rem;flex-shrink:0;width:24px;text-align:center">🏷️</span>
        <div>
          <div style="font-size:.7rem;color:var(--text-3);font-weight:600;text-transform:uppercase">
            Tag Terpopuler
          </div>
          <div class="d-flex flex-wrap gap-1 mt-1">
            ${d.top_tags.map(t => `<span style="background:var(--accent-bg);color:var(--accent);
              border-radius:20px;padding:.1rem .5rem;font-size:.72rem;font-weight:600">
              #${esc(t)}</span>`).join('')}
          </div>
        </div>
      </div>` : '');
}

// ════════════════════════════════════════════════
// BOOK COMPARISON
// ════════════════════════════════════════════════
async function openCompareModal() {
  // Fetch user's done books
  const res = await apiGet('api/books.php?status=done');
  const books = res.success ? (res.data || []) : [];

  if (books.length < 2) {
    toast('Selesaikan minimal 2 buku untuk membandingkan!', 'info');
    return;
  }

  const opts = books.map(b =>
    `<option value="${b.id}">${esc(b.title)}</option>`
  ).join('');

  const result = await Swal.fire({
    title: '📊 Bandingkan Buku',
    html: `
      <div style="text-align:left">
        <label style="font-size:.78rem;font-weight:600;color:var(--text-2);
          text-transform:uppercase">Buku Pertama</label>
        <select id="cmp-a" class="form-select mt-1 mb-3">${opts}</select>
        <label style="font-size:.78rem;font-weight:600;color:var(--text-2);
          text-transform:uppercase">Buku Kedua</label>
        <select id="cmp-b" class="form-select mt-1">${opts}</select>
      </div>`,
    confirmButtonText: 'Bandingkan',
    showCancelButton: true,
    cancelButtonText: 'Batal',
    didOpen: () => {
      // Pre-select different books
      const selB = document.getElementById('cmp-b');
      if (selB?.options.length > 1) selB.selectedIndex = 1;
    },
    preConfirm: () => {
      const a = +document.getElementById('cmp-a').value;
      const b = +document.getElementById('cmp-b').value;
      if (a === b) { Swal.showValidationMessage('Pilih dua buku yang berbeda'); return false; }
      return { a, b };
    }
  });

  if (!result.isConfirmed) return;

  _showCompareResult(result.value.a, result.value.b);
}

async function _showCompareResult(aId, bId) {
  Swal.fire({
    title: '📊 Perbandingan Buku',
    html: `<div class="text-center py-2">
      <div class="spinner-border spinner-border-sm me-2"></div>Memuat data...
    </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Tutup',
    width: '92vw',
    didOpen: async () => {
      const res = await apiGet(`api/analytics.php?action=compare&a=${aId}&b=${bId}`);
      if (!res.success) {
        Swal.update({ html: `<div style="color:var(--red)">${esc(res.error)}</div>`, showConfirmButton: true });
        return;
      }
      const { book_a: a, book_b: b } = res.data;
      const html = document.getElementById('swal2-html-container');
      if (html) html.innerHTML = _buildCompareHTML(a, b);
    }
  });
}

function _buildCompareHTML(a, b) {
  const row = (label, va, vb, higherIsBetter = true) => {
    const numA   = parseFloat(va) || 0;
    const numB   = parseFloat(vb) || 0;
    const winA   = higherIsBetter ? numA >= numB : numA <= numB;
    const winB   = higherIsBetter ? numB > numA  : numB < numA;
    return `
      <tr>
        <td style="text-align:right;padding:.4rem .5rem;font-size:.82rem;
          font-weight:${winA?'800':'400'};color:${winA?'var(--accent)':'var(--text-2)'}">
          ${va}${winA&&numA!==numB?'✓':''}
        </td>
        <td style="padding:.4rem;font-size:.72rem;color:var(--text-3);text-align:center;
          white-space:nowrap">${label}</td>
        <td style="text-align:left;padding:.4rem .5rem;font-size:.82rem;
          font-weight:${winB?'800':'400'};color:${winB?'var(--accent)':'var(--text-2)'}">
          ${vb}${winB?'✓':''}
        </td>
      </tr>`;
  };

  const stars = (n) => n > 0 ? '⭐'.repeat(Math.round(n)) : '—';

  return `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:right;padding:.5rem;font-size:.78rem;color:var(--accent);
            max-width:120px;word-break:break-word">${esc(a.title)}</th>
          <th style="padding:.5rem;font-size:.7rem;color:var(--text-3);text-align:center">VS</th>
          <th style="text-align:left;padding:.5rem;font-size:.78rem;color:var(--accent);
            max-width:120px;word-break:break-word">${esc(b.title)}</th>
        </tr>
      </thead>
      <tbody style="border-top:1px solid var(--border)">
        ${row('Rating',       stars(a.rating)||'—',        stars(b.rating)||'—')}
        ${row('Halaman',      a.total_pages||'—',          b.total_pages||'—')}
        ${row('Catatan',      a.note_count||0,             b.note_count||0)}
        ${row('Kutipan',      a.quote_count||0,            b.quote_count||0)}
        ${row('Hal Tercatat', a.pages_logged||0,           b.pages_logged||0)}
        ${row('Waktu Baca',   (a.minutes_read||0)+'m',     (b.minutes_read||0)+'m')}
        ${row('Kecepatan',    (a.pages_per_min||0)+' hal/m',(b.pages_per_min||0)+' hal/m')}
      </tbody>
    </table>
    ${a.top_tags?.length || b.top_tags?.length ? `
      <div style="margin-top:.75rem;display:flex;gap:.5rem;align-items:flex-start">
        <div style="flex:1;text-align:right">
          ${(a.top_tags||[]).map(t=>`<span style="background:var(--accent-bg);color:var(--accent);
            border-radius:20px;padding:.1rem .4rem;font-size:.68rem;font-weight:600;
            display:inline-block;margin:.1rem">#${esc(t)}</span>`).join('')}
        </div>
        <div style="font-size:.68rem;color:var(--text-3);white-space:nowrap;padding-top:.25rem">Tags</div>
        <div style="flex:1">
          ${(b.top_tags||[]).map(t=>`<span style="background:var(--accent-bg);color:var(--accent);
            border-radius:20px;padding:.1rem .4rem;font-size:.68rem;font-weight:600;
            display:inline-block;margin:.1rem">#${esc(t)}</span>`).join('')}
        </div>
      </div>` : ''}`;
}

// ── Init analytics (dipanggil saat tab progress) ─
async function loadAnalyticsPanel() {
  await Promise.all([
    loadReadingPersonality(),
    loadMiniCalendar(),
    loadInsights(),
  ]);
}
