<!DOCTYPE html>
<html lang="id" data-theme="light">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>

  <!-- Dynamic OG tags — filled by JS -->
  <meta property="og:type"        content="article"/>
  <meta property="og:site_name"   content="My Little Books"/>
  <meta id="og-title"       property="og:title"       content="Catatan dari My Little Books"/>
  <meta id="og-desc"        property="og:description" content="Baca catatan buku ini"/>
  <meta id="og-image"       property="og:image"       content=""/>
  <meta id="tw-title"       name="twitter:title"      content="Catatan dari My Little Books"/>
  <meta id="tw-desc"        name="twitter:description"content=""/>
  <meta name="twitter:card"                           content="summary_large_image"/>
  <meta id="page-title" name="title" content="My Little Books"/>

  <title id="doc-title">My Little Books — Catatan Buku</title>

  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Amiri:wght@400;700&display=swap" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet"/>
  <link href="assets/css/app.css" rel="stylesheet"/>

  <style>
    body { background: var(--bg); min-height: 100vh; }

    .share-wrap {
      max-width: 680px; margin: 0 auto;
      padding: 0 0 4rem;
    }

    /* Top bar */
    .share-topbar {
      position: sticky; top: 0; z-index: 50;
      background: rgba(248,245,240,.92);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border);
      padding: .6rem 1rem;
      display: flex; align-items: center; justify-content: space-between;
    }
    [data-theme="dark"] .share-topbar { background: rgba(14,14,16,.92); }
    .share-brand {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic; font-weight: 700;
      color: var(--accent); font-size: 1.1rem;
    }

    /* Hero */
    .note-hero {
      padding: 2rem 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    .note-book-tag {
      display: inline-flex; align-items: center; gap: .4rem;
      background: var(--accent-bg); color: var(--accent);
      border-radius: 20px; padding: .25rem .75rem;
      font-size: .75rem; font-weight: 700;
      margin-bottom: .75rem;
    }
    .note-hero h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.9rem; font-weight: 700; line-height: 1.25;
      color: var(--text); margin-bottom: .5rem;
    }
    .note-meta {
      font-size: .78rem; color: var(--text-3);
      display: flex; align-items: center; gap: .4rem; flex-wrap: wrap;
    }

    /* Content */
    .note-content-wrap { padding: 1.25rem; }
    .note-content {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.15rem; line-height: 2;
      color: var(--text);
    }
    .note-content p   { margin-bottom: .75rem; }
    .note-content h2  { font-size: 1.4rem; font-weight: 700; margin: 1.5rem 0 .5rem; }
    .note-content h3  { font-size: 1.2rem; font-weight: 700; margin: 1.25rem 0 .4rem; }
    .note-content ul,
    .note-content ol  { padding-left: 1.5rem; margin-bottom: .75rem; }
    .note-content li  { margin-bottom: .3rem; }
    .note-content blockquote {
      border-left: 3px solid var(--accent);
      padding: .6rem 1rem;
      background: var(--accent-bg);
      margin: 1rem 0;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      font-style: italic;
    }
    .note-content strong { color: var(--accent-d); font-weight: 700; }

    /* Ayat */
    .ayat-block {
      border-left: 3px solid var(--accent);
      background: var(--accent-bg);
      padding: .75rem 1rem;
      margin: 1rem 0;
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }
    .ayat-arabic {
      font-family: 'Amiri', serif;
      font-size: 1.35rem; direction: rtl; text-align: right;
      line-height: 2.2; color: var(--text);
    }
    .ayat-trans { font-size: .9rem; color: var(--text-2); margin-top: .35rem; font-style: italic; }
    .ayat-ref   { font-size: .78rem; color: var(--accent); font-weight: 700; margin-top: .2rem; }

    /* Tags */
    .note-tag {
      display: inline-block;
      background: var(--bg-3); color: var(--text-2);
      border-radius: 20px; padding: .15rem .55rem;
      font-size: .72rem; font-weight: 600; margin: .15rem;
    }

    /* CTA */
    .share-cta {
      margin: 2rem 1.25rem 1rem;
      background: var(--accent-bg);
      border: 1.5px solid var(--accent);
      border-radius: var(--radius);
      padding: 1.25rem;
      text-align: center;
    }
    .share-cta h3 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.2rem; font-weight: 700; margin-bottom: .35rem;
    }
    .share-cta p { font-size: .82rem; color: var(--text-2); margin-bottom: 1rem; }
    .btn-cta {
      display: inline-flex; align-items: center; gap: .4rem;
      background: var(--accent); color: #fff; border: none;
      border-radius: var(--radius-sm); padding: .6rem 1.5rem;
      font-weight: 700; font-size: .9rem; cursor: pointer;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(245,166,35,.35);
      transition: all .2s;
    }
    .btn-cta:hover { background: var(--accent-d); color: #fff; transform: translateY(-1px); }

    /* Share buttons */
    .share-buttons {
      display: flex; gap: .75rem; justify-content: center;
      padding: 1rem 1.25rem; flex-wrap: wrap;
    }
    .btn-share {
      display: inline-flex; align-items: center; gap: .4rem;
      border-radius: var(--radius-sm); padding: .5rem 1rem;
      font-size: .82rem; font-weight: 700; cursor: pointer;
      border: none; transition: all .15s;
    }
    .btn-wa  { background: #25D366; color: #fff; }
    .btn-wa:hover { background: #128C7E; }
    .btn-copy { background: var(--bg-3); color: var(--text); border: 1px solid var(--border); }
    .btn-copy:hover { background: var(--bg-4); }

    /* Loading / error */
    .share-loading {
      text-align: center; padding: 5rem 1.25rem;
      color: var(--text-3);
    }
    .share-error {
      text-align: center; padding: 4rem 1.25rem;
    }

    /* Footer */
    .share-footer {
      text-align: center; padding: 1.5rem;
      font-size: .72rem; color: var(--text-3);
      border-top: 1px solid var(--border);
    }
    .share-footer .views {
      display: inline-flex; align-items: center; gap: .3rem;
      font-size: .72rem; color: var(--text-3);
    }
  </style>
</head>
<body>

<div class="share-wrap">
  <!-- Top bar -->
  <div class="share-topbar">
    <a href="welcome.html" class="share-brand">📚 My Little Books</a>
    <div class="d-flex gap-2 align-items-center">
      <button class="btn-icon" onclick="toggleShareTheme()" style="width:32px;height:32px">
        <i class="bi bi-sun icon-sun" style="font-size:.9rem"></i>
        <i class="bi bi-moon icon-moon" style="font-size:.9rem"></i>
      </button>
    </div>
  </div>

  <!-- Content area -->
  <div id="share-content">
    <div class="share-loading">
      <div style="font-size:2rem;margin-bottom:.75rem">📖</div>
      <div>Memuat catatan...</div>
    </div>
  </div>
</div>

<script>
// ── Theme ─────────────────────────────────────
const _t = localStorage.getItem('mlb-theme') || 'light';
document.documentElement.setAttribute('data-theme', _t);
function toggleShareTheme() {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('mlb-theme', next);
}

// ── Get token from URL ─────────────────────────
const token = new URLSearchParams(location.search).get('t') || '';

async function loadSharedNote() {
  if (!token) { showError('Link tidak valid', 'Token tidak ditemukan di URL'); return; }

  try {
    const res  = await fetch(`api/share.php?action=get&token=${token}`);
    const data = await res.json();

    if (!data.success) {
      showError(
        data.error === 'Link ini sudah kedaluwarsa' ? '⏰ Link Kedaluwarsa' : '❌ Link Tidak Valid',
        data.error || 'Catatan tidak ditemukan'
      );
      return;
    }

    renderNote(data.data);
  } catch(e) {
    showError('Gagal memuat', 'Cek koneksi internet kamu');
  }
}

function renderNote(n) {
  // Update meta tags
  const title = n.note_title || 'Catatan';
  const desc  = n.book_title ? `Dari buku "${n.book_title}" · ${n.author || ''}` : 'My Little Books';
  document.getElementById('doc-title').textContent   = `${title} — My Little Books`;
  document.getElementById('og-title').content        = title;
  document.getElementById('og-desc').content         = desc;
  document.getElementById('tw-title').content        = title;
  document.getElementById('tw-desc').content         = desc;

  const stars = n.rating
    ? Array.from({length:5}, (_,i) => `<i class="bi bi-star${i<n.rating?'-fill':''}"
        style="color:${i<n.rating?'#F5A623':'#ccc'};font-size:.8rem"></i>`).join('')
    : '';

  const tags = n.tags
    ? n.tags.split(',').filter(t=>t.trim())
        .map(t => `<span class="note-tag">#${_esc(t.trim())}</span>`).join('')
    : '';

  const attachHtml = (n.attachments || []).length
    ? `<div class="d-flex flex-wrap gap-2 mt-3">
        ${n.attachments.map(a => `
          <img src="assets/uploads/attachments/${_esc(a.filename)}"
            style="height:80px;border-radius:8px;cursor:pointer;object-fit:cover"
            onclick="window.open(this.src,'_blank')"
            loading="lazy"/>`).join('')}
       </div>`
    : '';

  const shareUrl = location.href;
  const waText   = encodeURIComponent(`📚 *${title}*\n${desc}\n\nBaca di: ${shareUrl}`);

  document.getElementById('share-content').innerHTML = `
    <!-- Hero -->
    <div class="note-hero">
      ${n.book_title ? `
        <div class="note-book-tag">
          <i class="bi bi-book-fill"></i>
          ${_esc(n.book_title)}${n.author ? ` · ${_esc(n.author)}` : ''}
        </div>` : ''}
      <h1>${_esc(n.note_title)}</h1>
      <div class="note-meta">
        <span><i class="bi bi-person-fill me-1"></i>${_esc(n.author_name)}</span>
        <span>·</span>
        <span><i class="bi bi-calendar3 me-1"></i>${_fmtDate(n.note_created)}</span>
        ${n.page_start ? `<span>·</span><span>Hal.${n.page_start}${n.page_end && n.page_end !== n.page_start ? '–'+n.page_end : ''}</span>` : ''}
        ${stars ? `<span>·</span><span>${stars}</span>` : ''}
      </div>
    </div>

    <!-- Share buttons (top) -->
    <div class="share-buttons">
      <a href="https://wa.me/?text=${waText}" target="_blank" class="btn-share btn-wa">
        <i class="bi bi-whatsapp"></i> Bagikan ke WhatsApp
      </a>
      <button class="btn-share btn-copy" onclick="copyLink()">
        <i class="bi bi-link-45deg"></i> Salin Link
      </button>
    </div>

    <!-- Note content -->
    <div class="note-content-wrap">
      <div class="note-content">${n.content || ''}</div>
      ${attachHtml}
      ${tags ? `<div style="margin-top:1.25rem;padding-top:.75rem;border-top:1px solid var(--border)">${tags}</div>` : ''}
    </div>

    <!-- CTA -->
    <div class="share-cta">
      <h3>📚 My Little Books</h3>
      <p>Simpan catatan dari buku favoritmu,<br>track progress baca, dan banyak lagi.</p>
      <a href="welcome.html" class="btn-cta">
        <i class="bi bi-person-plus-fill"></i> Daftar Gratis
      </a>
    </div>

    <!-- Footer -->
    <div class="share-footer">
      <div class="views">
        <i class="bi bi-eye"></i>
        ${n.view_count} kali dilihat
      </div>
      ${n.expires_at
        ? `<div style="margin-top:.3rem">Link aktif hingga ${_fmtDate(n.expires_at)}</div>`
        : '<div style="margin-top:.3rem">Link permanen</div>'}
      <div style="margin-top:.5rem">
        <a href="welcome.html" style="color:var(--accent);font-weight:600">My Little Books</a>
        · Jurnal Baca Pribadi
      </div>
    </div>`;
}

function showError(title, msg) {
  document.getElementById('share-content').innerHTML = `
    <div class="share-error">
      <div style="font-size:3rem;margin-bottom:1rem">😔</div>
      <h3 style="font-weight:700;margin-bottom:.5rem">${_esc(title)}</h3>
      <p style="color:var(--text-3);font-size:.88rem">${_esc(msg)}</p>
      <a href="welcome.html" style="display:inline-flex;align-items:center;gap:.4rem;
        margin-top:1.5rem;background:var(--accent);color:#fff;
        padding:.55rem 1.25rem;border-radius:10px;font-weight:700;
        text-decoration:none;font-size:.88rem">
        <i class="bi bi-house-fill"></i> Ke Beranda
      </a>
    </div>`;
}

function copyLink() {
  navigator.clipboard.writeText(location.href).then(() => {
    const btn = document.querySelector('.btn-copy');
    if (btn) { btn.innerHTML = '<i class="bi bi-check-lg"></i> Tersalin!'; btn.style.background='var(--green-bg)'; }
    setTimeout(() => {
      if (btn) { btn.innerHTML = '<i class="bi bi-link-45deg"></i> Salin Link'; btn.style.background=''; }
    }, 2000);
  });
}

function _esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
function _fmtDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
}

// ── Init ──────────────────────────────────────
loadSharedNote();
</script>
</body>
</html>
