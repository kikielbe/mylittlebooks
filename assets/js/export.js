/* ============================================
   MY LITTLE BOOKS — export.js
   Export / Print Catatan ke PDF
   ============================================ */
'use strict';

// ── Print single note (dari view modal) ───────
function printNote() {
  const title   = document.getElementById('view-note-title')?.textContent || 'Catatan';
  const meta    = document.getElementById('view-note-meta')?.textContent  || '';
  const content = document.getElementById('view-note-content')?.innerHTML || '';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>${_escPrint(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Plus+Jakarta+Sans:wght@400;500;600&family=Amiri:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 13pt;
      color: #111;
      background: #fff;
      padding: 2.5cm 2.5cm 2cm;
      line-height: 1.8;
    }
    .header {
      border-bottom: 2px solid #F5A623;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    .brand {
      font-size: 10pt;
      color: #999;
      font-style: italic;
      margin-bottom: .5rem;
    }
    h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 24pt;
      font-weight: 700;
      color: #111;
      line-height: 1.2;
      margin-bottom: .4rem;
    }
    .meta {
      font-size: 10pt;
      color: #777;
    }
    .content {
      font-family: 'Cormorant Garamond', serif;
      font-size: 13pt;
      line-height: 2;
    }
    .content p { margin-bottom: .75rem; }
    .content h2 { font-size: 16pt; margin: 1.25rem 0 .5rem; color: #222; }
    .content h3 { font-size: 14pt; margin: 1rem 0 .4rem; color: #333; }
    .content ul, .content ol { padding-left: 1.5rem; margin-bottom: .75rem; }
    .content li { margin-bottom: .3rem; }
    .content blockquote {
      border-left: 3px solid #F5A623;
      padding: .5rem 1rem;
      margin: 1rem 0;
      background: #FFF8EE;
      font-style: italic;
      color: #555;
    }
    .content strong { color: #111; font-weight: 700; }
    .content em { color: #444; }
    /* Ayat block */
    .ayat-block {
      border-left: 3px solid #F5A623;
      background: #FFF8EE;
      padding: .75rem 1rem;
      margin: 1rem 0;
      border-radius: 0 6px 6px 0;
    }
    .ayat-arabic {
      font-family: 'Amiri', serif;
      font-size: 16pt;
      direction: rtl;
      text-align: right;
      line-height: 2.2;
      color: #111;
    }
    .ayat-trans { font-size: 11pt; color: #555; font-style: italic; margin-top: .4rem; }
    .ayat-ref   { font-size: 10pt; color: #F5A623; font-weight: 700; margin-top: .25rem; }
    .footer {
      margin-top: 2rem;
      padding-top: .75rem;
      border-top: 1px solid #eee;
      font-size: 9pt;
      color: #bbb;
      text-align: center;
    }
    @media print {
      body { padding: 1.5cm 1.5cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">📚 My Little Books</div>
    <h1>${_escPrint(title)}</h1>
    <div class="meta">${_escPrint(meta)}</div>
  </div>
  <div class="content">${content}</div>
  <div class="footer">
    Dicetak dari My Little Books · ${new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}
  </div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Export all notes to PDF (print layout) ───
async function exportNotesToPDF() {
  // Ask scope
  const result = await Swal.fire({
    title: 'Export Catatan ke PDF',
    html: `<div style="text-align:left">
      <p style="margin-bottom:1rem;color:var(--text-2)">Pilih catatan yang ingin diekspor:</p>
      <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;cursor:pointer">
        <input type="radio" name="scope" value="all" checked/> Semua catatan
      </label>
      <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
        <input type="radio" name="scope" value="book"/> Catatan dari buku tertentu
      </label>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Export',
    cancelButtonText: 'Batal',
    preConfirm: () => {
      return document.querySelector('input[name="scope"]:checked')?.value || 'all';
    }
  });

  if (!result.isConfirmed) return;

  toast('Mempersiapkan export...', 'info');

  // Fetch notes
  const params = result.value === 'all'
    ? 'limit=100'
    : `book_id=${App.currentBookId || 0}&limit=100`;

  const res = await apiGet(`api/notes.php?${params}&sort=newest`);
  if (!res.success || !res.data?.notes?.length) {
    toast('Tidak ada catatan untuk diekspor', 'warning');
    return;
  }

  const notes = res.data.notes;
  _printMultipleNotes(notes);
}

function _printMultipleNotes(notes) {
  const win = window.open('', '_blank');
  const today = new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});

  const notesHTML = notes.map((n, i) => `
    <div class="note-item ${i < notes.length - 1 ? 'page-break' : ''}">
      <div class="note-header">
        <h2>${_escPrint(n.note_title)}</h2>
        <div class="note-meta">
          ${n.book_title ? `📚 ${_escPrint(n.book_title)}` : ''}
          ${n.page_start ? `· Hal. ${n.page_start}${n.page_end && n.page_end !== n.page_start ? '–'+n.page_end : ''}` : ''}
          · ${new Date(n.created_at).toLocaleDateString('id-ID', {day:'numeric',month:'short',year:'numeric'})}
        </div>
        ${n.tags ? `<div class="note-tags">${n.tags.split(',').filter(t=>t.trim()).map(t=>`<span class="tag">#${_escPrint(t.trim())}</span>`).join(' ')}</div>` : ''}
      </div>
      <div class="note-content">${n.content || ''}</div>
    </div>`).join('\n');

  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>Catatan — My Little Books</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Plus+Jakarta+Sans:wght@400;500;600&family=Amiri:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12pt; color: #111; background: #fff; padding: 2cm; }
    .cover { text-align: center; padding: 3cm 0 2cm; border-bottom: 2px solid #F5A623; margin-bottom: 2cm; }
    .cover .brand { font-size: 12pt; color: #999; margin-bottom: .5rem; }
    .cover h1 { font-family: 'Cormorant Garamond', serif; font-size: 28pt; color: #111; }
    .cover .sub  { color: #777; font-size: 11pt; margin-top: .5rem; }
    .note-item { margin-bottom: 2rem; }
    .page-break { page-break-after: always; padding-bottom: 2cm; }
    .note-header { margin-bottom: 1rem; padding-bottom: .75rem; border-bottom: 1px solid #eee; }
    .note-header h2 { font-family: 'Cormorant Garamond', serif; font-size: 18pt; color: #111; margin-bottom: .3rem; }
    .note-meta  { font-size: 10pt; color: #888; }
    .note-tags  { margin-top: .4rem; }
    .tag { font-size: 9pt; background: #FFF3DB; color: #E09415; padding: .1rem .4rem; border-radius: 20px; margin-right: .3rem; font-weight: 600; }
    .note-content { font-family: 'Cormorant Garamond', serif; font-size: 13pt; line-height: 1.9; }
    .note-content p { margin-bottom: .6rem; }
    .note-content h2 { font-size: 15pt; margin: 1rem 0 .4rem; }
    .note-content h3 { font-size: 13pt; margin: .75rem 0 .3rem; }
    .note-content ul, .note-content ol { padding-left: 1.5rem; margin-bottom: .6rem; }
    .note-content blockquote { border-left: 3px solid #F5A623; padding: .5rem 1rem; background: #FFF8EE; font-style: italic; margin: .75rem 0; }
    .ayat-block { border-left: 3px solid #F5A623; background: #FFF8EE; padding: .65rem .9rem; margin: .75rem 0; border-radius: 0 5px 5px 0; }
    .ayat-arabic { font-family: 'Amiri', serif; font-size: 15pt; direction: rtl; text-align: right; line-height: 2.2; }
    .ayat-trans { font-size: 10pt; color: #666; font-style: italic; margin-top: .3rem; }
    .ayat-ref   { font-size: 9pt; color: #F5A623; font-weight: 700; }
    .footer { margin-top: 1.5rem; padding-top: .5rem; border-top: 1px solid #eee; font-size: 9pt; color: #ccc; text-align: center; }
    @media print { body { padding: 1.5cm; } }
  </style>
</head>
<body>
  <div class="cover">
    <div class="brand">📚 My Little Books</div>
    <h1>Kumpulan Catatan</h1>
    <div class="sub">${notes.length} catatan · Diekspor ${today}</div>
  </div>
  ${notesHTML}
  <div class="footer">My Little Books · ${today}</div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ── Helper ────────────────────────────────────
function _escPrint(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
