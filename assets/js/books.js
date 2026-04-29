/* ============================================
   MY LITTLE BOOKS — books.js
   CRUD buku · upload cover · detail modal
   ============================================ */

'use strict';

// ── State ─────────────────────────────────────
let _allBooks     = [];   // cached full list
let _searchTimer  = null;

// ── Load & Render Books ───────────────────────
async function loadBooks() {
  const list = document.getElementById('books-list');
  list.innerHTML = _skeletonBooks(4);

  const params = new URLSearchParams();
  if (App.bookFilterStatus) params.set('status', App.bookFilterStatus);

  const res = await apiGet('api/books.php?' + params);
  if (!res.success) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h6>Gagal memuat data</h6></div>`; return; }

  _allBooks = res.data || [];
  _renderBooks(_allBooks);
}

function _renderBooks(books) {
  const list  = document.getElementById('books-list');
  const query = document.getElementById('book-search').value.trim().toLowerCase();
  const shown = query
    ? books.filter(b => b.title.toLowerCase().includes(query) || (b.author||'').toLowerCase().includes(query))
    : books;

  if (!shown.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <h6>${query ? 'Tidak ditemukan' : 'Belum ada buku'}</h6>
        <p>${query ? `Tidak ada hasil untuk "<b>${esc(query)}</b>"` : 'Tambah buku pertamamu!'}</p>
      </div>`;
    return;
  }

  list.innerHTML = shown.map(b => _bookCard(b)).join('');
}

function _bookCard(b) {
  const pct    = b.total_pages ? Math.round((b.current_page / b.total_pages) * 100) : 0;
  const cover  = b.cover_filename
    ? `<img src="assets/uploads/covers/${esc(b.cover_filename)}" class="book-cover" loading="lazy"/>`
    : `<div class="book-cover-placeholder"><span>📗</span></div>`;

  const statusMap = { want:'badge-want', reading:'badge-reading', done:'badge-done', paused:'badge-paused' };
  const statusLbl = { want:'Ingin Baca', reading:'Dibaca', done:'Selesai', paused:'Ditunda' };

  return `
    <div class="card mb-2 card-hover" onclick="openBookDetail(${b.id})">
      <div class="card-body p-3">
        <div class="d-flex gap-3">
          ${cover}
          <div class="flex-grow-1 overflow-hidden">
            <div class="d-flex align-items-start justify-content-between gap-1">
              <div class="fw-semibold text-truncate flex-grow-1">${esc(b.title)}</div>
              <span class="badge-status ${statusMap[b.status]||'badge-want'} text-nowrap">${statusLbl[b.status]||b.status}</span>
            </div>
            <div class="small text-muted text-truncate">${esc(b.author)||'Tanpa penulis'}</div>
            ${b.genre ? `<div class="small text-muted">${esc(b.genre)}</div>` : ''}

            ${b.status === 'reading' && b.total_pages ? `
              <div class="d-flex justify-content-between small text-muted mt-1">
                <span>Hal. ${b.current_page}/${b.total_pages}</span><span>${pct}%</span>
              </div>
              <div class="progress mt-1"><div class="progress-bar" style="width:${pct}%"></div></div>` : ''}

            <div class="d-flex align-items-center justify-content-between mt-1">
              <div>${renderStars(b.rating||0)}</div>
              <div class="small text-muted">
                ${b.note_count > 0 ? `<span class="me-2"><i class="bi bi-journal-text"></i> ${b.note_count}</span>` : ''}
                ${b.quote_count > 0 ? `<span><i class="bi bi-chat-quote"></i> ${b.quote_count}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function filterBooks() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => _renderBooks(_allBooks), 300);
}

function setBookFilter(el, status) {
  document.querySelectorAll('.chips-scroll .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  App.bookFilterStatus = status;
  loadBooks();
}

// ── Skeleton ──────────────────────────────────
function _skeletonBooks(n) {
  return Array(n).fill(0).map(() => `
    <div class="card mb-2 p-3">
      <div class="d-flex gap-3">
        <div class="skeleton" style="width:64px;height:90px;border-radius:6px"></div>
        <div class="flex-grow-1">
          <div class="skeleton mb-2" style="height:14px;width:70%"></div>
          <div class="skeleton mb-2" style="height:12px;width:50%"></div>
          <div class="skeleton" style="height:6px;width:100%;border-radius:4px"></div>
        </div>
      </div>
    </div>`).join('');
}

// ── Open Add/Edit Modal ───────────────────────
function openBookModal(id = 0) {
  // Reset form
  document.getElementById('book-id').value          = id;
  document.getElementById('book-title').value        = '';
  document.getElementById('book-author').value       = '';
  document.getElementById('book-genre').value        = '';
  document.getElementById('book-isbn').value         = '';
  document.getElementById('book-desc').value         = '';
  document.getElementById('book-status').value       = 'want';
  document.getElementById('book-total-pages').value  = '';
  document.getElementById('book-started').value      = '';
  document.getElementById('book-finished').value     = '';
  document.getElementById('cover-file').value        = '';
  setStarInput('book-rating-stars', 'book-rating', 0);
  _resetCoverPreview();
  document.getElementById('modal-book-title').textContent = id ? 'Edit Buku' : 'Tambah Buku';
  toggleBookDates();

  if (id) {
    _loadBookIntoForm(id);
  }

  new bootstrap.Modal(document.getElementById('modal-book')).show();
}

async function _loadBookIntoForm(id) {
  const res = await apiGet(`api/books.php?id=${id}`);
  if (!res.success) return;
  const b = res.data;

  document.getElementById('book-title').value       = b.title       || '';
  document.getElementById('book-author').value      = b.author      || '';
  document.getElementById('book-genre').value       = b.genre       || '';
  document.getElementById('book-isbn').value        = b.isbn        || '';
  document.getElementById('book-desc').value        = b.description || '';
  document.getElementById('book-status').value      = b.status      || 'want';
  document.getElementById('book-total-pages').value = b.total_pages || '';
  document.getElementById('book-started').value     = b.started_at  || '';
  document.getElementById('book-finished').value    = b.finished_at || '';
  setStarInput('book-rating-stars', 'book-rating', b.rating || 0);
  toggleBookDates();

  // Cover preview
  if (b.cover_filename) {
    const prev = document.getElementById('cover-preview');
    prev.innerHTML = `<img src="assets/uploads/covers/${esc(b.cover_filename)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px"/>`;
  }
}

function toggleBookDates() {
  const status = document.getElementById('book-status').value;
  const row    = document.getElementById('book-dates-row');
  const finWrap = document.getElementById('book-finished-wrap');
  row.style.display     = status !== 'want' ? '' : 'none';
  finWrap.style.display = status === 'done' ? '' : 'none';
}

function previewCover(e) {
  const file = e.target.files[0];
  if (!file) return;
  const prev = document.getElementById('cover-preview');
  const url  = URL.createObjectURL(file);
  prev.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px"/>`;
}

function _resetCoverPreview() {
  document.getElementById('cover-preview').innerHTML = '<span style="font-size:2rem">📗</span>';
}

// ── Save Book ─────────────────────────────────
async function saveBook() {
  const id     = +document.getElementById('book-id').value;
  const title  = document.getElementById('book-title').value.trim();
  if (!title) { toast('Judul buku wajib diisi', 'error'); return; }

  const body = {
    title,
    author:      document.getElementById('book-author').value.trim(),
    genre:       document.getElementById('book-genre').value.trim(),
    isbn:        document.getElementById('book-isbn').value.trim(),
    description: document.getElementById('book-desc').value.trim(),
    status:      document.getElementById('book-status').value,
    total_pages: +document.getElementById('book-total-pages').value || 0,
    started_at:  document.getElementById('book-started').value  || null,
    finished_at: document.getElementById('book-finished').value || null,
    rating:      +document.getElementById('book-rating').value  || 0,
  };

  // Set finished_at auto if status=done and empty
  if (body.status === 'done' && !body.finished_at)
    body.finished_at = new Date().toISOString().slice(0,10);

  setBtnLoading('book-save-text', 'book-save-spin', true);

  const res = id
    ? await apiPut(`api/books.php?id=${id}`, body)
    : await apiPost('api/books.php', body);

  setBtnLoading('book-save-text', 'book-save-spin', false);

  if (!res.success) { toast(res.error || 'Gagal menyimpan', 'error'); return; }

  const newId = res.data?.id || id;

  // Upload cover if selected
  const coverFile = document.getElementById('cover-file').files[0];
  if (coverFile && newId) {
    const fd = new FormData();
    fd.append('cover', coverFile);
    await fetch(`api/books.php?action=cover&id=${newId}`, { method:'POST', body: fd });
  }

  bootstrap.Modal.getInstance(document.getElementById('modal-book'))?.hide();
  toast(res.message || 'Buku tersimpan', 'success');
  loadBooks();
  if (App.currentPage === 'home') loadDashboard();
}

function setBtnLoading(textId, spinId, loading) {
  document.getElementById(textId).classList.toggle('d-none', loading);
  document.getElementById(spinId).classList.toggle('d-none', !loading);
}

// ── Book Detail Modal ─────────────────────────
async function openBookDetail(id) {
  App.currentBookId = id;
  document.getElementById('book-detail-body').innerHTML = `
    <div class="text-center py-4"><div class="spinner-border"></div></div>`;

  new bootstrap.Modal(document.getElementById('modal-book-detail')).show();

  const res = await apiGet(`api/books.php?id=${id}`);
  if (!res.success) { document.getElementById('book-detail-body').innerHTML = '<p class="text-muted text-center">Gagal memuat</p>'; return; }

  const b = res.data;
  const statusMap = { want:'badge-want', reading:'badge-reading', done:'badge-done', paused:'badge-paused' };
  const statusLbl = { want:'Ingin Baca', reading:'Sedang Dibaca', done:'Selesai', paused:'Ditunda' };
  const pct = b.total_pages ? Math.round((b.current_page / b.total_pages) * 100) : 0;

  document.getElementById('book-detail-body').innerHTML = `
    <!-- Cover + Info -->
    <div class="d-flex gap-3 mb-3">
      ${b.cover_filename
        ? `<img src="assets/uploads/covers/${esc(b.cover_filename)}" class="book-cover book-cover-lg"/>`
        : `<div class="book-cover-placeholder book-cover-lg"><span style="font-size:2.5rem">📗</span></div>`}
      <div class="flex-grow-1">
        <h6 class="font-display mb-1">${esc(b.title)}</h6>
        <div class="small text-muted mb-1">${esc(b.author)||'Tanpa penulis'}</div>
        ${b.genre ? `<div class="small text-muted mb-1">${esc(b.genre)}</div>` : ''}
        <span class="badge-status ${statusMap[b.status]}">${statusLbl[b.status]}</span>
        <div class="mt-2">${renderStars(b.rating||0)}</div>
      </div>
    </div>

    ${b.description ? `<p class="small text-muted mb-3">${esc(b.description)}</p>` : ''}

    <!-- Progress -->
    ${b.status === 'reading' || b.status === 'done' ? `
    <div class="mb-3">
      <div class="d-flex justify-content-between small text-muted mb-1">
        <span>Progress Halaman</span>
        <span>${b.current_page}/${b.total_pages||'?'} (${pct}%)</span>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      ${b.status === 'reading' ? `
        <div class="d-flex gap-2 mt-2">
          <input type="number" class="form-control form-control-sm" id="detail-page-input"
            value="${b.current_page}" min="0" max="${b.total_pages||9999}" placeholder="Halaman saat ini"/>
          <button class="btn btn-primary btn-sm text-nowrap" onclick="updateCurrentPage(${b.id})">Update</button>
        </div>` : ''}
    </div>` : ''}

    <!-- Dates -->
    ${b.started_at || b.finished_at ? `
    <div class="d-flex gap-3 small text-muted mb-3">
      ${b.started_at  ? `<div><i class="bi bi-calendar-check me-1"></i>Mulai: ${fmtDate(b.started_at)}</div>` : ''}
      ${b.finished_at ? `<div><i class="bi bi-calendar-x me-1"></i>Selesai: ${fmtDate(b.finished_at)}</div>` : ''}
    </div>` : ''}

    <!-- Stats -->
    <div class="row g-2 mb-3 text-center">
      <div class="col-4">
        <div class="card p-2">
          <div class="fw-bold" style="color:var(--blue)">${b.note_count||0}</div>
          <div class="small text-muted">Catatan</div>
        </div>
      </div>
      <div class="col-4">
        <div class="card p-2">
          <div class="fw-bold" style="color:var(--cyan)">${b.quote_count||0}</div>
          <div class="small text-muted">Kutipan</div>
        </div>
      </div>
      <div class="col-4">
        <div class="card p-2">
          <div class="fw-bold" style="color:var(--amber)">${b.total_pages||0}</div>
          <div class="small text-muted">Halaman</div>
        </div>
      </div>
    </div>

    <!-- Notes from this book -->
    <div id="book-detail-notes"></div>`;

  // Load notes for this book
  _loadBookNotes(id);
}

async function _loadBookNotes(bookId) {
  const wrap = document.getElementById('book-detail-notes');
  if (!wrap) return;

  const res = await apiGet(`api/notes.php?book_id=${bookId}&limit=10`);
  if (!res.success || !res.data?.notes?.length) {
    wrap.innerHTML = `<div class="text-muted small text-center py-2">Belum ada catatan untuk buku ini</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="fw-semibold small text-muted mb-2">CATATAN BUKU INI</div>
    ${res.data.notes.map(n => `
      <div class="card mb-2 p-2 card-hover" onclick="viewNote(${n.id}); bootstrap.Modal.getInstance(document.getElementById('modal-book-detail'))?.hide()">
        <div class="d-flex justify-content-between align-items-start">
          <div class="overflow-hidden flex-grow-1">
            <div class="small fw-semibold text-truncate">${esc(n.note_title)}</div>
            ${n.page_start ? `<div class="small text-muted">Hal. ${n.page_start}–${n.page_end||n.page_start}</div>` : ''}
          </div>
          <div class="small text-muted ms-2 text-nowrap">${fmtDateShort(n.created_at)}</div>
        </div>
      </div>`).join('')}`;
}

async function updateCurrentPage(bookId) {
  const val = +document.getElementById('detail-page-input').value;
  if (isNaN(val) || val < 0) { toast('Halaman tidak valid', 'error'); return; }

  // Get current book data and update
  const res = await apiGet(`api/books.php?id=${bookId}`);
  if (!res.success) return;
  const b = res.data;

  const updateRes = await apiPut(`api/books.php?id=${bookId}`, { ...b, current_page: val });
  if (updateRes.success) {
    toast('Halaman diperbarui', 'success');
    openBookDetail(bookId); // reload detail
    if (App.currentPage === 'home') loadDashboard();
  } else {
    toast(updateRes.error || 'Gagal update', 'error');
  }
}

function editBookFromDetail() {
  bootstrap.Modal.getInstance(document.getElementById('modal-book-detail'))?.hide();
  setTimeout(() => openBookModal(App.currentBookId), 300);
}

function addNoteFromBook() {
  bootstrap.Modal.getInstance(document.getElementById('modal-book-detail'))?.hide();
  setTimeout(() => openNoteModal(0, App.currentBookId), 300);
}

async function deleteBookFromDetail() {
  const result = await confirmDelete('Hapus Buku?', 'Semua catatan dan kutipan terkait juga akan dihapus.');
  if (!result.isConfirmed) return;

  const res = await apiDelete(`api/books.php?id=${App.currentBookId}`);
  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modal-book-detail'))?.hide();
    toast('Buku berhasil dihapus', 'success');
    loadBooks();
    if (App.currentPage === 'home') loadDashboard();
  } else {
    toast(res.error || 'Gagal menghapus', 'error');
  }
}

// ── AI Summary dari semua catatan buku ────────
async function aiSummaryFromDetail() {
  const bookId = App.currentBookId;
  if (!bookId) return;

  // Get book title
  const res = await apiGet(`api/books.php?id=${bookId}`);
  if (!res.success) { toast('Gagal memuat data buku', 'error'); return; }

  generateBookSummary(bookId, res.data.title);
}

// ── AI Analyze buku (tanpa perlu banyak catatan) ──
async function aiAnalyzeFromDetail() {
  const bookId = App.currentBookId;
  if (!bookId) return;
  const res = await apiGet(`api/books.php?id=${bookId}`);
  if (!res.success) return;
  const b = res.data;
  analyzeBook(bookId, b.title, b.author || '');
}

// ── Open Schedule from book detail ───────────
function openScheduleFromDetail() {
  const bookId = App.currentBookId;
  if (!bookId) return;
  bootstrap.Modal.getInstance(document.getElementById('modal-book-detail'))?.hide();
  setTimeout(() => openScheduleModal(bookId), 300);
}
