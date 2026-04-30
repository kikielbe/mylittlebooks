/* ============================================
   MY LITTLE BOOKS — discover.js
   Discover Page · AI Insight · News · Spotlight
   ============================================ */
'use strict';

// ── Cache ─────────────────────────────────────
const DISCOVER_CACHE_KEY = 'mlb-discover-' + new Date().toISOString().slice(0,13); // per jam

function _getDiscoverCache() {
  try { return JSON.parse(localStorage.getItem(DISCOVER_CACHE_KEY) || 'null'); }
  catch { return null; }
}
function _setDiscoverCache(data) {
  try {
    // Hapus cache lama
    Object.keys(localStorage).filter(k => k.startsWith('mlb-discover-')).forEach(k => {
      if (k !== DISCOVER_CACHE_KEY) localStorage.removeItem(k);
    });
    localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

// ════════════════════════════════════════════════
// LOAD DISCOVER PAGE
// ════════════════════════════════════════════════
async function loadDiscover(forceRefresh = false) {
  // Check cache
  if (!forceRefresh) {
    const cached = _getDiscoverCache();
    if (cached) {
      _renderDiscover(cached);
      return;
    }
  }

  // Show loading
  _renderDiscoverLoading();

  try {
    const res = await apiGet('api/discover.php?action=all');
    if (!res.success) throw new Error(res.error);

    _setDiscoverCache(res.data);
    _renderDiscover(res.data);
  } catch(e) {
    _renderDiscoverError(e.message);
  }
}

function _renderDiscoverLoading() {
  const wrap = document.getElementById('page-discover');
  if (!wrap) return;
  const content = wrap.querySelector('.discover-content');
  if (!content) return;

  content.innerHTML = `
    ${_skeletonCard()}
    ${_skeletonCard()}
    ${_skeletonCard()}`;
}

function _skeletonCard() {
  return `<div class="card p-3 mb-3">
    <div class="skeleton mb-2" style="height:14px;width:40%"></div>
    <div class="skeleton mb-2" style="height:20px;width:90%"></div>
    <div class="skeleton mb-1" style="height:12px;width:80%"></div>
    <div class="skeleton" style="height:12px;width:60%"></div>
  </div>`;
}

function _renderDiscoverError(msg) {
  const content = document.querySelector('.discover-content');
  if (!content) return;
  content.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">😔</div>
      <div class="empty-title">Gagal memuat konten</div>
      <div class="empty-desc">${esc(msg || 'Cek koneksi internet')}</div>
      <button class="btn-ghost mt-2" onclick="loadDiscover(true)">
        <i class="bi bi-arrow-clockwise me-1"></i>Coba Lagi
      </button>
    </div>`;
}

function _renderDiscover(data) {
  const content = document.querySelector('.discover-content');
  if (!content) return;

  content.innerHTML = `
    ${_renderSpotlight(data.spotlight)}
    ${_renderInsight(data.insight)}
    ${_renderNews(data.news)}`;
}

// ── Spotlight — Buku Sorotan ──────────────────
function _renderSpotlight(s) {
  if (!s) return '';
  return `
    <div class="mb-3">
      <span class="section-header">🎯 Buku Sorotan Hari Ini</span>
      <div class="card p-3" style="background:linear-gradient(135deg,var(--accent-bg),var(--bg-2));
        border:1.5px solid var(--accent);position:relative;overflow:hidden">
        <!-- Decoration -->
        <div style="position:absolute;top:-20px;right:-20px;font-size:6rem;opacity:.06;
          pointer-events:none;line-height:1">${s.emoji || '📖'}</div>

        <!-- Badge -->
        <div style="margin-bottom:.6rem">
          <span style="background:var(--accent);color:#fff;border-radius:20px;
            padding:.15rem .6rem;font-size:.68rem;font-weight:800;
            text-transform:uppercase;letter-spacing:.05em">
            ✨ AI Pick
          </span>
        </div>

        <!-- Tagline -->
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;
          font-style:italic;font-weight:700;color:var(--accent);margin-bottom:.4rem;
          line-height:1.3">
          "${esc(s.tagline)}"
        </div>

        <!-- Book info -->
        <div style="font-size:.92rem;font-weight:700;color:var(--text);margin-bottom:.2rem">
          ${esc(s.title)}
        </div>
        <div style="font-size:.75rem;color:var(--text-3);margin-bottom:.75rem">
          ${esc(s.author)} · ${esc(s.genre)} · ⭐ ${esc(s.rating||'4.8/5')}
        </div>

        <!-- Teaser -->
        <p style="font-size:.82rem;color:var(--text-2);line-height:1.7;margin-bottom:.5rem">
          ${esc(s.teaser)}
        </p>

        <!-- Chapter hint -->
        ${s.chapters_hint ? `
          <div style="font-size:.75rem;color:var(--accent);font-style:italic;
            margin-bottom:.75rem">
            💡 ${esc(s.chapters_hint)}
          </div>` : ''}

        <!-- Actions -->
        <div class="d-flex gap-2">
          <button class="btn-accent" style="flex:1;font-size:.82rem;padding:.5rem"
            onclick="discoverAddBook('${esc(s.title)}','${esc(s.author)}','${esc(s.genre)}')">
            <i class="bi bi-plus-lg me-1"></i>Tambah ke Koleksi
          </button>
          <button class="btn-ghost" style="font-size:.82rem;padding:.5rem .75rem"
            onclick="window.open('https://www.google.com/search?q=${encodeURIComponent(s.title+' '+s.author+' buku')}','_blank')">
            <i class="bi bi-search"></i>
          </button>
        </div>
      </div>
    </div>`;
}

// ── Insight — Kutipan & Ide ───────────────────
function _renderInsight(ins) {
  if (!ins) return '';
  return `
    <div class="mb-3">
      <span class="section-header">💬 Insight Hari Ini</span>
      <div class="card p-3" style="border-left:3px solid var(--accent)">
        <!-- Hook -->
        <div style="font-size:.78rem;color:var(--accent);font-weight:700;margin-bottom:.5rem">
          ${esc(ins.hook || '')}
        </div>

        <!-- Quote -->
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.05rem;
          font-style:italic;line-height:1.7;color:var(--text);margin-bottom:.6rem;
          padding:.5rem .75rem;background:var(--bg-3);border-radius:var(--radius-sm)">
          "${esc(ins.quote)}"
        </div>

        <!-- Source -->
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <div style="font-size:.82rem;font-weight:700;color:var(--text)">
              ${esc(ins.book_title)}
            </div>
            <div style="font-size:.72rem;color:var(--text-3)">
              ${esc(ins.author)} · ${esc(ins.genre||'')}
            </div>
          </div>
          <div class="d-flex gap-2 flex-shrink-0">
            <button class="btn-icon" style="width:34px;height:34px"
              title="Tambah ke koleksi"
              onclick="discoverAddBook('${esc(ins.book_title)}','${esc(ins.author)}','${esc(ins.genre||'')}')">
              <i class="bi bi-plus-lg" style="color:var(--accent)"></i>
            </button>
            <button class="btn-icon" style="width:34px;height:34px"
              title="Simpan sebagai kutipan"
              onclick="discoverSaveQuote('${esc(ins.quote)}','${esc(ins.book_title)}')">
              <i class="bi bi-bookmark" style="color:var(--accent)"></i>
            </button>
          </div>
        </div>

        <!-- Why relevant -->
        ${ins.why ? `
          <div style="font-size:.72rem;color:var(--text-3);margin-top:.5rem;
            padding-top:.5rem;border-top:1px solid var(--border)">
            🎯 ${esc(ins.why)}
          </div>` : ''}
      </div>
    </div>`;
}

// ── News — Berita Buku ────────────────────────
function _renderNews(news) {
  if (!news?.length) return '';
  return `
    <div class="mb-3">
      <div class="d-flex align-items-center justify-content-between mb-2">
        <span class="section-header mb-0">📰 Berita Buku</span>
        <button class="btn-ghost" style="font-size:.7rem;padding:.2rem .5rem"
          onclick="loadDiscover(true)">
          <i class="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>

      <!-- Horizontal scroll -->
      <div style="display:flex;gap:.75rem;overflow-x:auto;padding-bottom:.5rem;
        scrollbar-width:none;-webkit-overflow-scrolling:touch"
        class="chips-scroll">
        ${news.map(n => `
          <div onclick="window.open('${esc(n.link)}','_blank')"
            style="min-width:220px;max-width:240px;flex-shrink:0;cursor:pointer;
              background:var(--bg-2);border:1px solid var(--border);
              border-radius:var(--radius);padding:.85rem;
              transition:all var(--t)" class="card-press">
            <!-- Source badge -->
            <div style="font-size:.62rem;font-weight:700;color:var(--accent);
              text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem">
              ${esc(n.source)} · ${esc(n.date)}
            </div>
            <!-- Title -->
            <div style="font-size:.82rem;font-weight:700;color:var(--text);
              line-height:1.35;margin-bottom:.35rem;
              display:-webkit-box;-webkit-line-clamp:3;
              -webkit-box-orient:vertical;overflow:hidden">
              ${esc(n.title)}
            </div>
            <!-- Desc -->
            ${n.desc ? `
              <div style="font-size:.72rem;color:var(--text-3);line-height:1.4;
                display:-webkit-box;-webkit-line-clamp:2;
                -webkit-box-orient:vertical;overflow:hidden">
                ${esc(n.desc)}
              </div>` : ''}
            <!-- Read link -->
            <div style="font-size:.7rem;color:var(--accent);font-weight:600;
              margin-top:.5rem">
              Baca selengkapnya →
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════
// HOME WIDGET — compact preview
// ════════════════════════════════════════════════
async function loadDiscoverWidget() {
  const wrap = document.getElementById('discover-widget');
  if (!wrap) return;

  // Check cache
  const cached = _getDiscoverCache();
  if (cached) {
    _renderDiscoverWidget(cached);
    return;
  }

  wrap.innerHTML = `
    <div class="skeleton" style="height:80px;border-radius:var(--radius-sm)"></div>`;

  try {
    const res = await apiGet('api/discover.php?action=all');
    if (res.success) {
      _setDiscoverCache(res.data);
      _renderDiscoverWidget(res.data);
    }
  } catch {}
}

function _renderDiscoverWidget(data) {
  const wrap = document.getElementById('discover-widget');
  if (!wrap) return;

  // Pick most interesting content to show
  const s   = data.spotlight;
  const ins = data.insight;
  const content = s || ins;
  if (!content) { wrap.innerHTML = ''; return; }

  // Rotate: spotlight if available, else insight
  const isSpotlight = !!s;
  wrap.innerHTML = `
    <div class="card card-press p-3" onclick="navigateTo('discover')"
      style="border-left:3px solid var(--accent);background:var(--accent-bg)">
      <div class="d-flex justify-content-between align-items-start mb-1">
        <span style="font-size:.68rem;font-weight:800;color:var(--accent);
          text-transform:uppercase;letter-spacing:.05em">
          ${isSpotlight ? '🎯 Buku Sorotan' : '💬 Insight Hari Ini'}
        </span>
        <span style="font-size:.68rem;color:var(--text-3)">Tap untuk semua →</span>
      </div>
      <div style="font-size:.88rem;font-weight:700;color:var(--text);margin-bottom:.25rem"
        class="text-truncate">
        ${esc(isSpotlight ? content.tagline : content.hook)}
      </div>
      <div style="font-size:.78rem;color:var(--text-2);line-height:1.5;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
        ${esc(isSpotlight ? content.teaser : content.quote)}
      </div>
      <div style="font-size:.7rem;color:var(--text-3);margin-top:.4rem">
        📚 ${esc(content.title || content.book_title)} · ${esc(content.author)}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════
async function discoverAddBook(title, author, genre) {
  const res = await apiPost('api/books.php', {
    title, author, genre: genre || '',
    status: 'want',
    description: `Ditemukan via Discover · ${new Date().toLocaleDateString('id-ID')}`
  });

  if (res.success) {
    toast(`"${title}" ditambahkan ke Ingin Baca! 📚`, 'success');
    if (App.currentPage === 'books') loadBooks();
  } else {
    toast(res.error || 'Gagal menambahkan', 'error');
  }
}

async function discoverSaveQuote(quoteText, bookTitle) {
  // Cari book_id berdasarkan title
  const bRes  = await apiGet('api/books.php');
  const books = bRes.success ? (bRes.data || []) : [];
  const book  = books.find(b => b.title.toLowerCase() === bookTitle.toLowerCase());

  if (!book) {
    // Tambah buku dulu
    toast('Tambah buku ke koleksi dulu untuk menyimpan kutipan', 'info');
    return;
  }

  const res = await apiPost('api/quotes.php', {
    book_id:    book.id,
    quote_text: quoteText,
  });

  if (res.success) {
    toast('Kutipan disimpan ke koleksi! 💬', 'success');
  } else {
    toast(res.error || 'Gagal menyimpan kutipan', 'error');
  }
}
