/* ============================================
   MY LITTLE BOOKS — notes.js v2
   CRUD · View Mode · Reading Nav · Quran/Hadits
   ============================================ */
'use strict';

// ── State ─────────────────────────────────────
let _noteSearchTimer = null;
let _pendingAttachments = [];
let _viewNoteId  = null;
let _viewSepia   = false;
let _viewFontLg  = false;
let _viewNoteList = [];   // untuk navigasi prev/next
let _viewNoteIdx  = 0;

// ── Load Notes ────────────────────────────────
async function loadNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;
  list.innerHTML = _skeletonNotes(3);

  const search = document.getElementById('note-search')?.value.trim() || '';
  const sort   = document.getElementById('note-sort')?.value || 'newest';
  const tag    = App.activeNoteTag || '';

  const params = new URLSearchParams({ sort, limit: 50 });
  if (search) params.set('search', search);
  if (tag)    params.set('tag', tag);

  const res = await apiGet('api/notes.php?' + params);
  if (!res.success) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Gagal memuat catatan</div>
    </div>`;
    return;
  }

  _viewNoteList = res.data?.notes || [];
  _renderNotes(_viewNoteList);
  _loadTagChips();
}

function _renderNotes(notes) {
  const list = document.getElementById('notes-list');
  if (!notes.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">Belum ada catatan</div>
        <div class="empty-desc">Tambah catatan pertamamu dari buku yang sedang dibaca</div>
      </div>`;
    return;
  }

  list.innerHTML = notes.map((n, i) => `
    <div class="card card-press p-3 mb-2"
      style="animation:staggerIn .25s ease ${i * .04}s both"
      onclick="viewNote(${n.id})">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="overflow-hidden flex-grow-1">
          <div style="font-weight:700;font-size:.92rem" class="text-truncate">${esc(n.note_title)}</div>
          <div class="d-flex align-items-center gap-1 mt-1" style="font-size:.75rem;color:var(--text-3)">
            <i class="bi bi-book-fill" style="font-size:.7rem;color:var(--accent)"></i>
            <span class="text-truncate">${esc(n.book_title || 'Tanpa buku')}</span>
            ${n.page_start ? `<span>· Hal.${n.page_start}${n.page_end && n.page_end !== n.page_start ? '–'+n.page_end : ''}</span>` : ''}
          </div>
        </div>
        <div class="d-flex flex-column align-items-end gap-1 flex-shrink-0">
          <div style="font-size:.72rem;color:var(--text-3)">${fmtDateShort(n.created_at)}</div>
          ${n.rating ? `<div>${renderStars(n.rating)}</div>` : ''}
        </div>
      </div>
      ${n.tags ? `
        <div class="d-flex flex-wrap gap-1 mt-2">
          ${n.tags.split(',').filter(t=>t.trim()).map(t =>
            `<span class="note-tag" onclick="event.stopPropagation();filterByTag('${esc(t.trim())}')">#${esc(t.trim())}</span>`
          ).join('')}
        </div>` : ''}
      ${n.attachment_count > 0 ? `
        <div style="font-size:.72rem;color:var(--text-3);margin-top:.4rem">
          <i class="bi bi-paperclip me-1"></i>${n.attachment_count} lampiran
        </div>` : ''}
    </div>`).join('');
}

function _skeletonNotes(n) {
  return Array(n).fill(0).map(() => `
    <div class="card mb-2 p-3">
      <div class="skeleton mb-2" style="height:14px;width:65%"></div>
      <div class="skeleton mb-2" style="height:12px;width:45%"></div>
      <div class="skeleton" style="height:10px;width:80%"></div>
    </div>`).join('');
}

async function _loadTagChips() {
  const wrap = document.getElementById('tag-chips');
  if (!wrap) return;
  const res = await apiGet('api/notes.php?action=tags');
  if (!res.success || !res.data?.length) { wrap.innerHTML = ''; return; }
  const tags = res.data.slice(0, 12);
  wrap.innerHTML = `
    <div class="chip ${!App.activeNoteTag ? 'active' : ''}" onclick="filterByTag('')">Semua</div>
    ${tags.map(t => `
      <div class="chip ${App.activeNoteTag === t ? 'active' : ''}"
        onclick="filterByTag('${esc(t)}')">#${esc(t)}</div>
    `).join('')}`;
}

function filterByTag(tag) {
  App.activeNoteTag = tag;
  loadNotes();
}

function searchNotes() {
  clearTimeout(_noteSearchTimer);
  _noteSearchTimer = setTimeout(loadNotes, 350);
}

function switchNoteTab(tab, el) {
  document.querySelectorAll('#notes-tabs .nav-link').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-notes').classList.toggle('d-none', tab !== 'notes');
  document.getElementById('panel-quotes').classList.toggle('d-none', tab !== 'quotes');
  if (tab === 'notes')  loadNotes();
  if (tab === 'quotes') loadQuotes();
}

// ── Open Note Modal ───────────────────────────
async function openNoteModal(id = 0, presetBookId = 0) {
  _pendingAttachments = [];
  document.getElementById('note-id').value         = id;
  document.getElementById('note-title').value       = '';
  document.getElementById('note-tags').value        = '';
  document.getElementById('note-page-start').value  = '';
  document.getElementById('note-page-end').value    = '';
  document.getElementById('attach-preview').innerHTML = '';
  document.getElementById('attach-file').value      = '';
  setStarInput('note-rating-stars', 'note-rating', 0);
  if (App.quill) App.quill.setContents([]);
  document.getElementById('modal-note-title').textContent = id ? 'Edit Catatan' : 'Tambah Catatan';

  await _populateBookSelect('note-book-id', presetBookId || App.currentBookId || 0);
  if (id) await _loadNoteIntoForm(id);

  new bootstrap.Modal(document.getElementById('modal-note')).show();
}

async function _populateBookSelect(selId, preselect = 0) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Pilih buku...</option>';
  const res = await apiGet('api/books.php');
  if (!res.success) return;
  res.data.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.title;
    if (b.id == preselect) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function _loadNoteIntoForm(id) {
  const res = await apiGet(`api/notes.php?id=${id}`);
  if (!res.success) return;
  const n = res.data;
  document.getElementById('note-title').value      = n.note_title   || '';
  document.getElementById('note-tags').value       = n.tags         || '';
  document.getElementById('note-page-start').value = n.page_start   || '';
  document.getElementById('note-page-end').value   = n.page_end     || '';
  document.getElementById('note-book-id').value    = n.book_id      || '';
  setStarInput('note-rating-stars', 'note-rating', n.rating || 0);
  if (App.quill && n.content) App.quill.root.innerHTML = n.content;

  _pendingAttachments = (n.attachments || []).map(a => ({
    id: a.id, filename: a.filename,
    url: `assets/uploads/attachments/${a.filename}`,
    original_name: a.original_name, isNew: false,
  }));
  _renderAttachPreviews();
}

// ── Save Note ─────────────────────────────────
async function saveNote() {
  const id      = +document.getElementById('note-id').value;
  const title   = document.getElementById('note-title').value.trim();
  const book_id = document.getElementById('note-book-id').value;
  const content = App.quill ? App.quill.root.innerHTML : '';

  if (!title)   { toast('Judul catatan wajib diisi', 'error'); return; }
  if (!book_id) { toast('Pilih buku terlebih dahulu', 'error'); return; }
  if (!App.quill?.getText().trim()) { toast('Isi catatan tidak boleh kosong', 'error'); return; }

  const body = {
    note_title: title, book_id: +book_id, content,
    page_start: +document.getElementById('note-page-start').value || 0,
    page_end:   +document.getElementById('note-page-end').value   || 0,
    rating:     +document.getElementById('note-rating').value     || 0,
    tags:        document.getElementById('note-tags').value.trim(),
  };

  setBtnLoading('note-save-text', 'note-save-spin', true);
  const res = id
    ? await apiPut(`api/notes.php?id=${id}`, body)
    : await apiPost('api/notes.php', body);
  setBtnLoading('note-save-text', 'note-save-spin', false);

  if (!res.success) { toast(res.error || 'Gagal menyimpan', 'error'); return; }

  const newId = res.data?.id || id;
  for (const att of _pendingAttachments.filter(a => a.isNew && a.file)) {
    const fd = new FormData();
    fd.append('file', att.file);
    await fetch(`api/notes.php?action=attach&id=${newId}`, { method:'POST', body:fd });
  }

  bootstrap.Modal.getInstance(document.getElementById('modal-note'))?.hide();
  toast(id ? 'Catatan diperbarui ✓' : 'Catatan tersimpan ✓', 'success');
  loadNotes();
  if (App.currentPage === 'home') loadDashboard();
}

// ════════════════════════════════════════════════
// VIEW MODE — READING MODE
// ════════════════════════════════════════════════

async function viewNote(id) {
  _viewNoteId  = id;
  _viewSepia   = false;
  _viewFontLg  = false;

  // Find index in current list for prev/next nav
  _viewNoteIdx = _viewNoteList.findIndex(n => n.id === id);

  // Show modal immediately with loading state
  _setViewContent(null, true);
  new bootstrap.Modal(document.getElementById('modal-view-note')).show();

  // Fetch full note
  const res = await apiGet(`api/notes.php?id=${id}`);
  if (!res.success) {
    document.getElementById('view-note-content').innerHTML =
      `<p style="color:var(--text-3);text-align:center">Gagal memuat catatan</p>`;
    return;
  }
  _setViewContent(res.data, false);
}

function _setViewContent(n, loading) {
  const titleEl   = document.getElementById('view-note-title');
  const metaEl    = document.getElementById('view-note-meta');
  const contentEl = document.getElementById('view-note-content');
  const attachEl  = document.getElementById('view-note-attachments');
  const navEl     = document.getElementById('view-note-nav');
  const progressEl= document.getElementById('view-note-progress');

  if (loading) {
    if (titleEl)   titleEl.textContent = 'Memuat...';
    if (metaEl)    metaEl.textContent  = '';
    if (contentEl) contentEl.innerHTML = `
      <div style="text-align:center;padding:2rem">
        <div class="spinner-border" style="color:var(--accent)"></div>
      </div>`;
    if (attachEl)  attachEl.innerHTML  = '';
    return;
  }

  // ── Title & meta ──
  if (titleEl) titleEl.textContent = n.note_title || '';
  if (metaEl)  metaEl.innerHTML = [
    n.book_title ? `<i class="bi bi-book-fill me-1" style="color:var(--accent)"></i>${esc(n.book_title)}` : '',
    n.page_start ? `Hal.${n.page_start}${n.page_end && n.page_end !== n.page_start ? '–'+n.page_end : ''}` : '',
    fmtDate(n.created_at),
    n.rating ? renderStars(n.rating) : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  // ── Content in reading mode ──
  if (contentEl) {
    contentEl.className = 'reading-mode';
    contentEl.innerHTML = n.content || '<p style="color:var(--text-3)">Catatan kosong</p>';

    // Append tags
    if (n.tags) {
      const tags = n.tags.split(',').filter(t => t.trim());
      if (tags.length) {
        contentEl.innerHTML += `<div class="d-flex flex-wrap gap-1 mt-4 pt-3"
          style="border-top:1px solid var(--border)">
          ${tags.map(t => `<span class="note-tag">#${esc(t.trim())}</span>`).join('')}
        </div>`;
      }
    }
  }

  // ── Attachments ──
  if (attachEl) {
    attachEl.innerHTML = (n.attachments || []).map(a => `
      <img src="assets/uploads/attachments/${esc(a.filename)}"
        class="att-thumb" onclick="window.open(this.src,'_blank')"
        loading="lazy" title="${esc(a.original_name)}"/>`
    ).join('');
  }

  // ── Prev / Next navigation ──
  if (navEl) {
    const hasPrev = _viewNoteIdx > 0;
    const hasNext = _viewNoteIdx < _viewNoteList.length - 1;
    navEl.innerHTML = `
      <button class="btn-icon ${hasPrev ? '' : 'opacity-25'}"
        onclick="${hasPrev ? `viewNote(${_viewNoteList[_viewNoteIdx-1].id})` : ''}"
        ${hasPrev ? '' : 'disabled'} title="Catatan sebelumnya">
        <i class="bi bi-chevron-left"></i>
      </button>
      <span style="font-size:.75rem;color:var(--text-3)">${_viewNoteIdx+1} / ${_viewNoteList.length}</span>
      <button class="btn-icon ${hasNext ? '' : 'opacity-25'}"
        onclick="${hasNext ? `viewNote(${_viewNoteList[_viewNoteIdx+1].id})` : ''}"
        ${hasNext ? '' : 'disabled'} title="Catatan berikutnya">
        <i class="bi bi-chevron-right"></i>
      </button>`;
  }

  // ── Reading progress bar ──
  if (progressEl) {
    const pct = _viewNoteList.length > 1
      ? Math.round((_viewNoteIdx / (_viewNoteList.length - 1)) * 100) : 100;
    progressEl.style.width = pct + '%';
  }
}

// ── Reading mode controls ─────────────────────
function toggleSepia() {
  _viewSepia = !_viewSepia;
  const el = document.getElementById('view-note-content');
  if (el) el.classList.toggle('sepia', _viewSepia);
  const btn = document.getElementById('btn-sepia');
  if (btn) btn.style.background = _viewSepia ? 'var(--accent-bg)' : '';
}

function toggleFontSize() {
  _viewFontLg = !_viewFontLg;
  const el = document.getElementById('view-note-content');
  if (el) el.style.fontSize = _viewFontLg ? '1.2rem' : '';
  const btn = document.getElementById('btn-fontsize');
  if (btn) btn.style.background = _viewFontLg ? 'var(--accent-bg)' : '';
}

function editNoteFromView() {
  bootstrap.Modal.getInstance(document.getElementById('modal-view-note'))?.hide();
  setTimeout(() => openNoteModal(_viewNoteId), 320);
}

async function deleteNoteFromView() {
  const result = await confirmDelete('Hapus Catatan?', 'Catatan ini akan dihapus permanen.');
  if (!result.isConfirmed) return;
  const res = await apiDelete(`api/notes.php?id=${_viewNoteId}`);
  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modal-view-note'))?.hide();
    toast('Catatan dihapus', 'success');
    loadNotes();
    if (App.currentPage === 'home') loadDashboard();
  } else {
    toast(res.error || 'Gagal menghapus', 'error');
  }
}

// ── Attachments ───────────────────────────────
function uploadAttachment(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  if (_pendingAttachments.length + files.length > 5) {
    toast('Maksimal 5 lampiran', 'warning'); return;
  }
  files.forEach(file => {
    if (file.size > 5 * 1024 * 1024) { toast(`${file.name} terlalu besar (maks 5MB)`, 'error'); return; }
    _pendingAttachments.push({
      id: null, filename: null,
      url: URL.createObjectURL(file),
      file, original_name: file.name, isNew: true,
    });
  });
  _renderAttachPreviews();
  e.target.value = '';
}

function _renderAttachPreviews() {
  const wrap = document.getElementById('attach-preview');
  if (!wrap) return;
  wrap.innerHTML = _pendingAttachments.map((a, i) => `
    <div class="position-relative">
      <img src="${a.url}" class="att-thumb"/>
      <button class="att-remove" onclick="removeAttachment(${i},${a.id||0})" type="button">
        <i class="bi bi-x"></i>
      </button>
    </div>`).join('');
}

async function removeAttachment(idx, serverId) {
  if (serverId) await apiDelete(`api/notes.php?action=detach&att_id=${serverId}`);
  _pendingAttachments.splice(idx, 1);
  _renderAttachPreviews();
}

// ── Al-Quran Picker ───────────────────────────
async function openQuranPicker() {
  new bootstrap.Modal(document.getElementById('modal-quran')).show();
  const sel = document.getElementById('quran-surah');
  if (sel.options.length > 1) return;
  sel.innerHTML = '<option value="">Memuat surah...</option>';
  try {
    const res = await fetch('https://api.alquran.cloud/v1/surah');
    const dat = await res.json();
    sel.innerHTML = '<option value="">Pilih Surah...</option>';
    if (dat.code === 200) {
      dat.data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.number;
        opt.textContent = `${s.number}. ${s.englishName} — ${s.name}`;
        sel.appendChild(opt);
      });
      App.quranData = dat.data;
    }
  } catch {
    sel.innerHTML = '<option value="">Gagal memuat (cek internet)</option>';
  }
}

async function loadAyat() {
  const surah   = document.getElementById('quran-surah').value;
  const selAyat = document.getElementById('quran-ayat');
  selAyat.innerHTML = '<option>-</option>';
  if (!surah) return;
  const data = App.quranData?.find(s => s.number == surah);
  if (data) {
    for (let i = 1; i <= data.numberOfAyahs; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `Ayat ${i}`;
      selAyat.appendChild(opt);
    }
    selAyat.value = 1;
  }
}

async function previewAyat() {
  const surah = document.getElementById('quran-surah').value;
  const ayat  = document.getElementById('quran-ayat').value;
  if (!surah || !ayat) { toast('Pilih surah dan ayat', 'warning'); return; }

  const load = document.getElementById('quran-loading');
  const prev = document.getElementById('quran-preview');
  load.classList.remove('d-none'); prev.classList.add('d-none');

  try {
    const [arRes, idRes] = await Promise.all([
      fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayat}`),
      fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayat}/id.indonesian`),
    ]);
    const [arDat, idDat] = await Promise.all([arRes.json(), idRes.json()]);

    prev.innerHTML = `
      <div class="ayat-block">
        <div class="ayat-arabic">${arDat.data?.text || ''}</div>
        <div class="ayat-trans">${idDat.data?.text || ''}</div>
        <div class="ayat-ref">QS. ${arDat.data?.surah?.englishName} (${arDat.data?.surah?.number}): ${ayat}</div>
      </div>`;
    load.classList.add('d-none'); prev.classList.remove('d-none');
  } catch {
    load.classList.add('d-none');
    toast('Gagal memuat ayat. Cek koneksi.', 'error');
  }
}

function insertAyat() {
  const prev = document.getElementById('quran-preview');
  if (!prev || prev.classList.contains('d-none')) { toast('Preview ayat terlebih dahulu', 'warning'); return; }
  if (App.quill) {
    const range = App.quill.getSelection(true);
    App.quill.clipboard.dangerouslyPasteHTML(range.index, prev.innerHTML + '<p><br></p>');
    App.quill.setSelection(range.index + 1);
  }
  bootstrap.Modal.getInstance(document.getElementById('modal-quran'))?.hide();
  toast('Ayat berhasil dimasukkan ✓', 'success');
}

// ── Hadits Picker ─────────────────────────────
function openHadithPicker() {
  new bootstrap.Modal(document.getElementById('modal-hadith')).show();
  document.getElementById('hadith-preview').classList.add('d-none');
}

async function previewHadith() {
  const book = document.getElementById('hadith-book').value;
  const num  = document.getElementById('hadith-num').value;
  if (!num) { toast('Masukkan nomor hadits', 'warning'); return; }

  const load = document.getElementById('hadith-loading');
  const prev = document.getElementById('hadith-preview');
  load.classList.remove('d-none'); prev.classList.add('d-none');

  try {
    const res = await fetch(`https://api.hadith.gading.dev/books/${book}/${num}`);
    const dat = await res.json();
    if (!dat.data) throw new Error('Not found');

    prev.innerHTML = `
      <div class="ayat-block">
        <div class="ayat-arabic">${dat.data.arab || ''}</div>
        <div class="ayat-trans">${dat.data.id || ''}</div>
        <div class="ayat-ref">HR. ${book.charAt(0).toUpperCase()+book.slice(1)} No. ${num}</div>
      </div>`;
    load.classList.add('d-none'); prev.classList.remove('d-none');
  } catch {
    load.classList.add('d-none');
    toast('Hadits tidak ditemukan', 'error');
  }
}

function insertHadith() {
  const prev = document.getElementById('hadith-preview');
  if (!prev || prev.classList.contains('d-none')) { toast('Preview hadits terlebih dahulu', 'warning'); return; }
  if (App.quill) {
    const range = App.quill.getSelection(true);
    App.quill.clipboard.dangerouslyPasteHTML(range.index, prev.innerHTML + '<p><br></p>');
    App.quill.setSelection(range.index + 1);
  }
  bootstrap.Modal.getInstance(document.getElementById('modal-hadith'))?.hide();
  toast('Hadits berhasil dimasukkan ✓', 'success');
}
