/* ============================================
   MY LITTLE BOOKS — report.js
   Laporan mingguan & bulanan · Chart.js
   ============================================ */

'use strict';

async function loadReport() {
  const period   = document.getElementById('report-period')?.value || 'monthly';
  const monthInp = document.getElementById('report-month');
  const month    = monthInp?.value || new Date().toISOString().slice(0,7);

  // Show month picker only for monthly
  if (monthInp) monthInp.style.display = period === 'monthly' ? '' : 'none';

  const params = period === 'monthly'
    ? `period=monthly&month=${month}`
    : `period=weekly`;

  const statsWrap = document.getElementById('report-stats');
  const booksWrap = document.getElementById('report-books-list');
  if (statsWrap) statsWrap.innerHTML = _reportSkeleton();
  if (booksWrap) booksWrap.innerHTML = '';

  const res = await apiGet(`api/report.php?${params}`);
  if (!res.success) {
    if (statsWrap) statsWrap.innerHTML = `<div class="col-12 text-center text-muted small">Gagal memuat laporan</div>`;
    return;
  }

  const d = res.data;

  // ── Stats row ──
  if (statsWrap) {
    statsWrap.innerHTML = [
      { icon:'📚', val: d.total_books, label:'Buku Selesai', color:'var(--blue)' },
      { icon:'📝', val: d.total_notes, label:'Catatan',      color:'var(--cyan)' },
      { icon:'📄', val: d.total_pages, label:'Halaman',      color:'var(--amber)' },
    ].map(s => `
      <div class="col-4">
        <div class="stat-card">
          <div class="stat-icon">${s.icon}</div>
          <div class="stat-val" style="background:${s.color};-webkit-background-clip:text;-webkit-text-fill-color:transparent">
            ${s.val}
          </div>
          <div class="stat-label">${s.label}</div>
        </div>
      </div>`).join('');
  }

  // ── Chart ──
  _drawReportChart(d, period);

  // ── Books list (monthly only) ──
  if (booksWrap && period === 'monthly' && d.books_done?.length) {
    booksWrap.innerHTML = `
      <div class="fw-semibold small text-muted mb-2">BUKU SELESAI PERIODE INI</div>
      ${d.books_done.map(b => `
        <div class="card mb-2 p-3">
          <div class="d-flex gap-3 align-items-center">
            ${b.cover_filename
              ? `<img src="assets/uploads/covers/${esc(b.cover_filename)}" class="book-cover"/>`
              : `<div class="book-cover-placeholder"><span>📗</span></div>`}
            <div class="flex-grow-1 overflow-hidden">
              <div class="fw-semibold text-truncate">${esc(b.title)}</div>
              <div class="small text-muted">${esc(b.author||'')}</div>
              <div class="small text-muted">Selesai: ${fmtDate(b.finished_at)}</div>
              <div class="mt-1">${renderStars(b.rating||0)}</div>
            </div>
          </div>
        </div>`).join('')}`;

    // Genre breakdown
    if (d.genre_chart?.length) {
      booksWrap.innerHTML += `
        <div class="fw-semibold small text-muted mt-3 mb-2">GENRE</div>
        ${d.genre_chart.map(g => `
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small">${esc(g.genre)}</span>
            <span class="badge rounded-pill" style="background:var(--bg-input);color:var(--text)">${g.cnt}</span>
          </div>`).join('')}`;
    }
  } else if (booksWrap && period === 'monthly') {
    booksWrap.innerHTML = `<div class="text-muted small text-center py-2">Tidak ada buku selesai periode ini</div>`;
  }
}

function _drawReportChart(d, period) {
  const canvas = document.getElementById('report-chart');
  if (!canvas) return;

  // Destroy previous chart
  if (App.reportChart) { App.reportChart.destroy(); App.reportChart = null; }

  let labels = [];
  let data   = [];

  if (period === 'monthly' && d.weekly_pages?.length) {
    labels = d.weekly_pages.map((w, i) => `Minggu ${i+1}`);
    data   = d.weekly_pages.map(w => w.pages || 0);
  } else if (period === 'weekly' && d.daily_pages?.length) {
    const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    labels = d.daily_pages.map(p => {
      const day = new Date(p.logged_date).getDay();
      return dayNames[day];
    });
    data = d.daily_pages.map(p => p.pages || 0);
  }

  if (!labels.length) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';

  const ctx = canvas.getContext('2d');

  App.reportChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Halaman Dibaca',
        data,
        backgroundColor: 'rgba(59,130,246,.5)',
        borderColor:     'rgba(59,130,246,1)',
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#7fa0cc', font: { family: 'DM Sans' } } },
      },
      scales: {
        x: {
          ticks: { color: '#7fa0cc' },
          grid:  { color: 'rgba(30,58,95,.5)' },
        },
        y: {
          ticks: { color: '#7fa0cc' },
          grid:  { color: 'rgba(30,58,95,.5)' },
          beginAtZero: true,
        }
      }
    }
  });
}

function _reportSkeleton() {
  return [1,2,3].map(() => `
    <div class="col-4">
      <div class="stat-card">
        <div class="skeleton mx-auto mb-2" style="width:30px;height:30px;border-radius:50%"></div>
        <div class="skeleton mx-auto mb-1" style="width:50px;height:20px"></div>
        <div class="skeleton mx-auto" style="width:60px;height:12px"></div>
      </div>
    </div>`).join('');
}
