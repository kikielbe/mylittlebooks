/* ============================================
   MY LITTLE BOOKS — quotes.js
   CRUD kutipan · Quote Wall
   ============================================ */

'use strict';

// ── Load Quotes ───────────────────────────────
async function loadQuotes() {
  const list = document.getElementById('quotes-list');
  if (!list) return;

  list.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>`;

  const params = new URLSearchParams();
  if (App.currentBookId) params.set('book_id', App.currentBookId);

  const res = await apiGet('api/quotes.php?' + params);
  if (!res.success) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h6>Gagal memuat</h6></div>`;
    return;
  }

  const quotes = res.data || [];
  if (!quotes.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <h6>Belum ada kutipan</h6>
        <p>Simpan kata-kata berkesan dari buku yang kamu baca</p>
      </div>`;
    return;
  }

  list.innerHTML = `
    <div style="font-size:.8rem;color:var(--text-3);margin-bottom:.75rem">${quotes.length} kutipan tersimpan</div>
    ${quotes.map(q => _quoteCard(q)).join('')}`;
}

function _quoteCard(q) {
  return `
    <div class="quote-card mb-3 position-relative">
      <div class="quote-text">"${esc(q.quote_text)}"</div>
      <div class="d-flex justify-content-between align-items-center mt-2">
        <div class="small" style="color:var(--cyan)">
          <i class="bi bi-book me-1"></i>${esc(q.book_title||'—')}
          ${q.page_number ? ` · Hal. ${q.page_number}` : ''}
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-ghost btn-sm py-0" onclick="openQuoteModal(${q.id})">
            <i class="bi bi-pencil" style="font-size:.8rem"></i>
          </button>
          <button class="btn btn-ghost btn-sm py-0" onclick="deleteQuote(${q.id})">
            <i class="bi bi-trash" style="font-size:.8rem;color:var(--red)"></i>
          </button>
        </div>
      </div>
    </div>`;
}

// ── Open Quote Modal ──────────────────────────
async function openQuoteModal(id = 0) {
  document.getElementById('quote-id').value    = id;
  document.getElementById('quote-text').value  = '';
  document.getElementById('quote-page').value  = '';
  document.getElementById('modal-quote-title').textContent = id ? 'Edit Kutipan' : 'Tambah Kutipan';

  // Populate book select
  await _populateBookSelect('quote-book-id', App.currentBookId || 0);

  if (id) {
    const res = await apiGet(`api/quotes.php?id=${id}`);
    if (res.success) {
      const q = res.data;
      document.getElementById('quote-book-id').value = q.book_id   || '';
      document.getElementById('quote-text').value    = q.quote_text || '';
      document.getElementById('quote-page').value    = q.page_number || '';
    }
  }

  new bootstrap.Modal(document.getElementById('modal-quote')).show();
}

// ── Save Quote ────────────────────────────────
async function saveQuote() {
  const id   = +document.getElementById('quote-id').value;
  const text = document.getElementById('quote-text').value.trim();
  const book = document.getElementById('quote-book-id').value;

  if (!text) { toast('Teks kutipan wajib diisi', 'error'); return; }
  if (!book) { toast('Pilih buku terlebih dahulu', 'error'); return; }

  const body = {
    book_id:     +book,
    quote_text:  text,
    page_number: +document.getElementById('quote-page').value || 0,
  };

  const res = id
    ? await apiPut(`api/quotes.php?id=${id}`, body)
    : await apiPost('api/quotes.php', body);

  if (!res.success) { toast(res.error || 'Gagal menyimpan', 'error'); return; }

  bootstrap.Modal.getInstance(document.getElementById('modal-quote'))?.hide();
  toast(res.message || 'Kutipan tersimpan', 'success');
  loadQuotes();
}

// ── Delete Quote ──────────────────────────────
async function deleteQuote(id) {
  const result = await confirmDelete('Hapus Kutipan?', 'Kutipan ini akan dihapus permanen.');
  if (!result.isConfirmed) return;

  const res = await apiDelete(`api/quotes.php?id=${id}`);
  if (res.success) {
    toast('Kutipan berhasil dihapus', 'success');
    loadQuotes();
  } else {
    toast(res.error || 'Gagal menghapus', 'error');
  }
}
