/* ============================================
   MY LITTLE BOOKS — schedule.js
   Quote of Day · Reading Schedule · Spaced Repetition
   ============================================ */
'use strict';

// ════════════════════════════════════════════════
// QUOTE OF THE DAY
// ════════════════════════════════════════════════
async function loadQuoteOfDay() {
  const wrap = document.getElementById('quote-of-day');
  if (!wrap) return;

  // Cache: cek localStorage, valid 1 hari
  const cacheKey  = 'mlb-qod-' + new Date().toISOString().slice(0,10);
  const cached    = localStorage.getItem(cacheKey);
  if (cached) {
    _renderQuote(JSON.parse(cached));
    return;
  }

  wrap.innerHTML = `<div class="skeleton" style="height:60px;border-radius:var(--radius-sm)"></div>`;

  const res = await apiGet('api/schedule.php?action=quote');
  if (!res.success) return;

  localStorage.setItem(cacheKey, JSON.stringify(res.data));
  _renderQuote(res.data);
}

function _renderQuote(q) {
  const wrap = document.getElementById('quote-of-day');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="d-flex gap-2 align-items-start">
      <span style="font-size:1.5rem;flex-shrink:0;line-height:1;color:var(--accent)">"</span>
      <div class="flex-grow-1">
        <div style="font-family:'Cormorant Garamond',serif;font-style:italic;
          font-size:1rem;line-height:1.6;color:var(--text)">
          ${esc(q.text)}
        </div>
        <div style="font-size:.72rem;color:var(--accent);font-weight:700;margin-top:.4rem">
          — ${esc(q.book_title || '')}${q.author ? ` · ${esc(q.author)}` : ''}
          ${q.page ? ` · Hal.${q.page}` : ''}
          ${q.source === 'collection' ? ' 📚' : ''}
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════
// READING SCHEDULE — modal per buku
// ════════════════════════════════════════════════
async function openScheduleModal(bookId) {
  const modal = document.getElementById('modal-schedule');
  if (!modal) return;

  // Reset
  document.getElementById('sched-book-id').value   = bookId;
  document.getElementById('sched-result').innerHTML = '';
  document.getElementById('sched-days').value       = 30;

  new bootstrap.Modal(modal).show();
  await calcAndShowSchedule(bookId, 30);
}

async function calcAndShowSchedule(bookId, days) {
  bookId = bookId || +document.getElementById('sched-book-id').value;
  days   = days   || +document.getElementById('sched-days').value || 30;

  const wrap = document.getElementById('sched-result');
  if (!wrap) return;
  wrap.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>`;

  const res = await apiGet(`api/schedule.php?action=schedule&book_id=${bookId}&days=${days}`);
  if (!res.success) { wrap.innerHTML = `<div class="empty-state"><div class="empty-desc">${esc(res.error)}</div></div>`; return; }

  const d = res.data;

  wrap.innerHTML = `
    <!-- Book info -->
    <div class="d-flex align-items-center gap-3 mb-3">
      ${d.book.cover_filename
        ? `<img src="assets/uploads/covers/${esc(d.book.cover_filename)}" class="book-cover"/>`
        : `<div class="book-cover-placeholder">📗</div>`}
      <div>
        <div style="font-weight:700;font-size:.92rem">${esc(d.book.title)}</div>
        <div style="font-size:.78rem;color:var(--text-3)">${esc(d.book.author||'')}</div>
        <div class="mt-1">
          <div class="progress"><div class="progress-bar" style="width:${d.progress_pct}%"></div></div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:2px">${d.progress_pct}% · ${esc(String(d.book.current_page))}/${esc(String(d.book.total_pages))} hal</div>
        </div>
      </div>
    </div>

    <!-- Schedule summary -->
    <div class="card p-3 mb-3" style="background:var(--accent-bg);border-color:var(--accent)">
      <div class="row g-2 text-center">
        <div class="col-4">
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent)">${d.daily_pages}</div>
          <div style="font-size:.68rem;color:var(--text-3);font-weight:600;text-transform:uppercase">Hal/Hari</div>
        </div>
        <div class="col-4">
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent)">${d.days}</div>
          <div style="font-size:.68rem;color:var(--text-3);font-weight:600;text-transform:uppercase">Hari</div>
        </div>
        <div class="col-4">
          <div style="font-size:1rem;font-weight:800;color:var(--accent)">${fmtDate(d.target_date)}</div>
          <div style="font-size:.68rem;color:var(--text-3);font-weight:600;text-transform:uppercase">Selesai</div>
        </div>
      </div>
    </div>

    <!-- Milestones -->
    <div class="section-header">🏁 Milestone</div>
    ${d.milestones.map(m => `
      <div class="d-flex align-items-center gap-2 mb-2">
        <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;
          background:${m.done ? 'var(--green-bg)' : 'var(--bg-3)'};
          border:2px solid ${m.done ? 'var(--green)' : 'var(--border)'};
          display:flex;align-items:center;justify-content:center;
          font-size:.72rem;font-weight:800;color:${m.done ? 'var(--green)' : 'var(--text-3)'}">
          ${m.done ? '✓' : m.label}
        </div>
        <div class="flex-grow-1">
          <div style="font-size:.82rem;font-weight:600">${m.label} — Hal. ${m.target_page}</div>
          <div style="font-size:.72rem;color:var(--text-3)">
            ${m.done ? '✅ Sudah tercapai!' : `Target: ${fmtDate(m.date)} (${m.days_needed} hari lagi)`}
          </div>
        </div>
      </div>`).join('')}

    <!-- Adjust days -->
    <div class="divider"></div>
    <div class="d-flex align-items-center gap-2 mt-2">
      <label style="font-size:.78rem;color:var(--text-2);white-space:nowrap">Ubah target:</label>
      <input type="range" class="form-range flex-grow-1" id="sched-days"
        min="7" max="180" value="${d.days}" step="7"
        oninput="document.getElementById('sched-days-val').textContent=this.value+' hari';calcAndShowSchedule(${bookId})"/>
      <span id="sched-days-val" style="font-size:.78rem;color:var(--accent);font-weight:700;white-space:nowrap">${d.days} hari</span>
    </div>
    <input type="hidden" id="sched-book-id" value="${bookId}"/>
    <input type="hidden" id="sched-target-date" value="${d.target_date}"/>
    <input type="hidden" id="sched-daily-pages" value="${d.daily_pages}"/>`;
}

async function saveSchedule() {
  const bookId = +document.getElementById('sched-book-id')?.value;
  const date   = document.getElementById('sched-target-date')?.value;
  const daily  = +document.getElementById('sched-daily-pages')?.value;

  if (!bookId || !date) { toast('Data tidak lengkap', 'error'); return; }

  const res = await apiPost('api/schedule.php?action=set_schedule', {
    book_id: bookId, target_date: date, daily_pages: daily
  });

  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modal-schedule'))?.hide();
    toast('Jadwal baca tersimpan! 📅', 'success');
    loadScheduleWidget();
  } else {
    toast(res.error || 'Gagal menyimpan', 'error');
  }
}

// ── Schedule widget di dashboard ──────────────
async function loadScheduleWidget() {
  const wrap = document.getElementById('reading-schedule-list');
  if (!wrap) return;

  const res = await apiGet('api/schedule.php?action=all_schedules');
  if (!res.success || !res.data?.length) {
    wrap.innerHTML = `<div style="font-size:.78rem;color:var(--text-3)">Belum ada jadwal baca. Buka detail buku → "Jadwal"</div>`;
    return;
  }

  wrap.innerHTML = res.data.slice(0,3).map(s => {
    const isLate    = s.days_left < 0;
    const isUrgent  = s.days_left >= 0 && s.days_left <= 3;
    const statusColor = isLate ? 'var(--red)' : isUrgent ? 'var(--accent)' : 'var(--green)';
    const statusText  = isLate
      ? `Terlambat ${Math.abs(s.days_left)} hari ⚠️`
      : isUrgent ? `${s.days_left} hari lagi 🔥`
      : `${s.days_left} hari lagi ✓`;

    return `
      <div class="d-flex align-items-center gap-2 mb-2">
        ${s.cover_filename
          ? `<img src="assets/uploads/covers/${esc(s.cover_filename)}" style="width:36px;height:50px;object-fit:cover;border-radius:4px;flex-shrink:0"/>`
          : `<div style="width:36px;height:50px;background:var(--bg-3);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center">📗</div>`}
        <div class="flex-grow-1 overflow-hidden">
          <div style="font-size:.82rem;font-weight:700" class="text-truncate">${esc(s.title)}</div>
          <div class="progress mt-1" style="height:4px!important"><div class="progress-bar" style="width:${s.progress_pct}%"></div></div>
          <div class="d-flex justify-content-between mt-1">
            <span style="font-size:.68rem;color:var(--text-3)">${s.daily_pages} hal/hari</span>
            <span style="font-size:.68rem;font-weight:700;color:${statusColor}">${statusText}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
// SPACED REPETITION — Review Queue
// ════════════════════════════════════════════════
async function loadReviewQueue() {
  const wrap = document.getElementById('review-queue-wrap');
  if (!wrap) return;

  const res = await apiGet('api/schedule.php?action=review&limit=5');
  if (!res.success) return;

  const { notes, pending } = res.data;

  if (!pending) {
    wrap.innerHTML = `
      <div style="font-size:.82rem;color:var(--text-3);text-align:center;padding:.75rem 0">
        <span style="font-size:1.5rem">🎉</span><br>
        Semua catatan sudah direview hari ini!
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <span style="font-size:.72rem;color:var(--text-2);font-weight:600">${pending} catatan perlu direview</span>
      <button class="btn-ghost" style="font-size:.72rem;padding:.25rem .6rem" onclick="openReviewSession()">
        <i class="bi bi-play-circle me-1"></i>Mulai Review
      </button>
    </div>
    ${notes.slice(0,3).map(n => `
      <div class="card card-press p-2 mb-2" onclick="openReviewSession(${n.id})">
        <div class="d-flex justify-content-between align-items-start">
          <div class="overflow-hidden flex-grow-1">
            <div style="font-size:.82rem;font-weight:700" class="text-truncate">${esc(n.note_title)}</div>
            <div style="font-size:.72rem;color:var(--text-3)">${esc(n.book_title||'')}</div>
          </div>
          <div style="font-size:.65rem;color:var(--accent);font-weight:600;flex-shrink:0;margin-left:.5rem">
            Review #${n.reviews + 1}
          </div>
        </div>
      </div>`).join('')}
    ${pending > 3 ? `<div style="font-size:.72rem;color:var(--text-3);text-align:center">+${pending-3} lainnya</div>` : ''}`;
}

async function openReviewSession(startNoteId = null) {
  const res = await apiGet('api/schedule.php?action=review&limit=10');
  if (!res.success || !res.data.notes.length) {
    toast('Tidak ada catatan untuk direview! 🎉', 'info');
    return;
  }

  const notes   = res.data.notes;
  let   current = startNoteId
    ? notes.findIndex(n => n.id === startNoteId)
    : 0;
  if (current < 0) current = 0;

  _showReviewCard(notes, current);
}

function _showReviewCard(notes, idx) {
  const n = notes[idx];
  if (!n) {
    Swal.fire({
      title: '🎉 Review Selesai!',
      html: `<div style="font-size:.9rem;color:var(--text-2)">
        Kamu sudah review semua catatan hari ini.<br>
        <b style="color:var(--accent)">+${notes.length * 2} XP</b> earned!
      </div>`,
      icon: 'success',
      confirmButtonText: 'Selesai',
    }).then(() => {
      loadReviewQueue();
      if (App.currentPage === 'home') loadDashboard();
    });
    return;
  }

  Swal.fire({
    title: `📖 Review ${idx+1}/${notes.length}`,
    html: `
      <div style="text-align:left">
        <div style="font-weight:700;font-size:.95rem;margin-bottom:.25rem">${esc(n.note_title)}</div>
        <div style="font-size:.75rem;color:var(--text-3);margin-bottom:.75rem">
          ${esc(n.book_title||'')}${n.page_start ? ` · Hal.${n.page_start}` : ''}
          · Interval: ${n.interval_days} hari
        </div>
        <div style="background:var(--bg-3);padding:.75rem;border-radius:var(--radius-sm);
          font-size:.85rem;line-height:1.7;max-height:200px;overflow-y:auto">
          ${n.tags ? `<div style="margin-bottom:.5rem">${n.tags.split(',').map(t=>`<span class="note-tag">#${esc(t.trim())}</span>`).join(' ')}</div>` : ''}
          Klik <b>Lihat</b> untuk buka catatan lengkap
        </div>
        <div style="margin-top:.75rem;font-size:.82rem;font-weight:600;color:var(--text-2)">
          Seberapa ingat kamu konten catatan ini?
        </div>
        <div class="d-flex gap-2 mt-2 flex-wrap justify-content-center" id="quality-btns">
          ${[
            {q:0, label:'😵 Lupa', color:'var(--red)'},
            {q:2, label:'😕 Samar', color:'var(--text-2)'},
            {q:3, label:'🙂 Ingat', color:'var(--blue)'},
            {q:5, label:'😊 Sangat Ingat', color:'var(--green)'},
          ].map(b => `
            <button onclick="submitReview(${n.id},${b.q},${JSON.stringify(notes).replace(/"/g,'&quot;')},${idx+1})"
              style="background:transparent;border:2px solid ${b.color};color:${b.color};
                border-radius:var(--radius-sm);padding:.4rem .75rem;cursor:pointer;
                font-size:.8rem;font-weight:700;transition:all .15s"
              onmouseover="this.style.background='${b.color}';this.style.color='#fff'"
              onmouseout="this.style.background='transparent';this.style.color='${b.color}'">
              ${b.label}
            </button>`).join('')}
        </div>
      </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '👁 Lihat Catatan',
    width: '92vw',
  }).then(r => {
    if (!r.isConfirmed && r.dismiss === Swal.DismissReason.cancel) {
      viewNote(n.id);
    }
  });
}

async function submitReview(noteId, quality, notes, nextIdx) {
  Swal.close();
  const res = await apiPost('api/schedule.php?action=mark_review', {
    note_id: noteId, quality
  });
  if (res.success) {
    toast(res.message, quality >= 3 ? 'success' : 'info');
  }
  // Lanjut ke catatan berikutnya
  setTimeout(() => _showReviewCard(notes, nextIdx), 400);
}
