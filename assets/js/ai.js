/* ============================================
   MY LITTLE BOOKS — ai.js v2
   20 Rekomendasi · Pagination · Filter Existing
   Auto-Summary per Buku · AI Analyze
   ============================================ */
'use strict';

// ── Constants ─────────────────────────────────
const BATCH_SIZE = 5;          // tampilkan 5 per load
const MAX_RECS   = 20;         // maksimum total

const INTEREST_OPTIONS = [
  { key:'islami',    label:'Islami',    icon:'🕌' },
  { key:'self-help', label:'Self Help', icon:'💪' },
  { key:'fiksi',     label:'Fiksi',     icon:'🌟' },
  { key:'bisnis',    label:'Bisnis',    icon:'💼' },
  { key:'sejarah',   label:'Sejarah',   icon:'📜' },
  { key:'sains',     label:'Sains',     icon:'🔬' },
  { key:'filsafat',  label:'Filsafat',  icon:'🧠' },
  { key:'psikologi', label:'Psikologi', icon:'🧩' },
  { key:'motivasi',  label:'Motivasi',  icon:'🚀' },
  { key:'novel',     label:'Novel',     icon:'📖' },
  { key:'biografi',  label:'Biografi',  icon:'👤' },
  { key:'parenting', label:'Parenting', icon:'👶' },
  { key:'kesehatan', label:'Kesehatan', icon:'❤️' },
  { key:'teknologi', label:'Teknologi', icon:'💻' },
  { key:'ekonomi',   label:'Ekonomi',   icon:'📊' },
  { key:'sastra',    label:'Sastra',    icon:'✒️' },
];

// ── State ─────────────────────────────────────
let _recsList     = [];   // semua rekomendasi yang sudah dimuat
let _recsLoading  = false;
let _recsContext  = null; // context disimpan agar tidak fetch ulang

// ── Interests ─────────────────────────────────
function getInterests() {
  try { return JSON.parse(localStorage.getItem('mlb-interests') || '[]'); }
  catch { return []; }
}

function saveInterests() {
  const selected = Array.from(document.querySelectorAll('.interest-chip.active'))
    .map(el => el.dataset.key);
  localStorage.setItem('mlb-interests', JSON.stringify(selected));
  toast('Minat bacaan disimpan ✓', 'success');
  // Reset dan reload rekomendasi
  _recsList    = [];
  _recsContext = null;
  if (App.currentPage === 'home') loadAIRecommendations(true);
}

function renderInterestChips() {
  const wrap = document.getElementById('interest-chips');
  if (!wrap) return;
  const saved = getInterests();
  wrap.innerHTML = INTEREST_OPTIONS.map(item => `
    <div class="interest-chip chip ${saved.includes(item.key) ? 'active' : ''}"
      data-key="${item.key}"
      onclick="this.classList.toggle('active')">
      ${item.icon} ${item.label}
    </div>`).join('');
}

// ── Build user context ─────────────────────────
async function _getContext() {
  if (_recsContext) return _recsContext;

  const interests = getInterests();
  const interestLabels = interests.map(k => {
    const f = INTEREST_OPTIONS.find(o => o.key === k);
    return f ? `${f.icon} ${f.label}` : k;
  });

  const booksRes = await apiGet('api/books.php');
  const books    = booksRes.success ? (booksRes.data || []) : [];

  const done    = books.filter(b => b.status === 'done').slice(0, 10)
    .map(b => `"${b.title}"${b.author ? ` (${b.author})` : ''}`);
  const reading = books.filter(b => b.status === 'reading').slice(0, 5)
    .map(b => `"${b.title}"`);

  // Semua judul buku untuk filter (tidak rekomendasikan lagi)
  const allTitles = books.map(b => b.title);

  _recsContext = { interestLabels, done, reading, allTitles, noInterests: interestLabels.length === 0 };
  return _recsContext;
}

// ════════════════════════════════════════════════
// LOAD AI RECOMMENDATIONS — dengan pagination
// ════════════════════════════════════════════════
async function loadAIRecommendations(reset = false) {
  const wrap = document.getElementById('ai-recommendations');
  if (!wrap || _recsLoading) return;

  if (reset) {
    _recsList    = [];
    _recsContext = null;
  }

  // Sudah capai maksimum?
  if (_recsList.length >= MAX_RECS) {
    _renderRecsWithLoadMore(false);
    return;
  }

  _recsLoading = true;

  // Render loading state
  if (_recsList.length === 0) {
    wrap.innerHTML = `
      <div class="d-flex align-items-center gap-2 py-3" style="color:var(--text-2);font-size:.85rem">
        <div class="spinner-border spinner-border-sm"></div>
        <span>AI sedang menganalisis minat kamu...</span>
      </div>`;
  } else {
    // Append loading di bawah existing cards
    const loadingEl = document.createElement('div');
    loadingEl.id        = 'rec-loading-more';
    loadingEl.innerHTML = `
      <div class="d-flex align-items-center justify-content-center gap-2 py-2"
        style="color:var(--text-2);font-size:.82rem">
        <div class="spinner-border spinner-border-sm"></div>
        <span>Memuat lebih banyak...</span>
      </div>`;
    wrap.appendChild(loadingEl);
  }

  try {
    const ctx = await _getContext();

    const res = await apiPost('api/ai.php', {
      type:            'recommend',
      interests:       ctx.interestLabels,
      done_books:      ctx.done,
      reading_books:   ctx.reading,
      existing_titles: [
        ...ctx.allTitles,
        ..._recsList.map(r => r.title), // filter yg sudah direkomendasikan
      ],
      batch:  BATCH_SIZE,
      offset: _recsList.length,
    });

    if (!res.success) throw new Error(res.error || 'AI tidak tersedia');

    const raw   = res.data?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const match = clean.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('Format AI tidak valid');

    const newBooks = JSON.parse(match[0]);
    if (!Array.isArray(newBooks) || !newBooks.length) throw new Error('Tidak ada rekomendasi baru');

    // Dedup — hapus jika judul sudah ada
    const existingTitles = new Set([
      ...ctx.allTitles.map(t => t.toLowerCase()),
      ..._recsList.map(r => r.title.toLowerCase()),
    ]);
    const filtered = newBooks.filter(b =>
      b.title && !existingTitles.has(b.title.toLowerCase())
    );

    _recsList = [..._recsList, ...filtered];
    _renderRecsWithLoadMore(ctx.noInterests);

  } catch(e) {
    console.error('AI error:', e);
    const isNoKey = e.message?.includes('API key') || e.message?.includes('belum diisi');
    document.getElementById('rec-loading-more')?.remove();

    if (_recsList.length === 0) {
      wrap.innerHTML = `
        <div class="text-center py-3" style="color:var(--text-3);font-size:.85rem">
          <div style="font-size:1.8rem">${isNoKey ? '🔑' : '😔'}</div>
          <div style="margin:.4rem 0 .75rem">${isNoKey
            ? 'Isi API key Groq di <b>api/ai_config.php</b><br><small>Daftar gratis: console.groq.com</small>'
            : esc(e.message || 'Gagal memuat rekomendasi')}</div>
          ${!isNoKey ? `<button class="btn-ghost" style="font-size:.78rem;padding:.35rem .75rem"
            onclick="loadAIRecommendations(true)">
            <i class="bi bi-arrow-clockwise me-1"></i>Coba Lagi
          </button>` : ''}
        </div>`;
    } else {
      // Ada data, cuma load more gagal — show error di bawah
      _renderRecsWithLoadMore(false);
      toast('Gagal memuat lebih banyak: ' + e.message, 'error');
    }
  } finally {
    _recsLoading = false;
  }
}

// ── Render list + tombol Load More ────────────
function _renderRecsWithLoadMore(noInterests) {
  const wrap = document.getElementById('ai-recommendations');
  if (!wrap) return;

  const canLoadMore = _recsList.length < MAX_RECS;

  let html = '';

  if (noInterests && _recsList.length > 0) {
    html += `
      <div style="font-size:.75rem;color:var(--text-2);margin-bottom:.75rem;
        padding:.5rem .75rem;background:var(--bg-3);border-radius:var(--radius-sm);
        display:flex;align-items:center;gap:.4rem">
        💡 <span>Atur <b>Minat Bacaan</b> di Setelan untuk rekomendasi lebih akurat</span>
      </div>`;
  }

  // Render all loaded recs
  html += _recsList.map((b, i) => `
    <div class="card card-press p-3 mb-2"
      style="animation:staggerIn .25s ease ${(i % BATCH_SIZE) * .06}s both"
      onclick="searchBookOnline('${esc(b.title)}','${esc(b.author)}')">
      <div class="d-flex gap-3 align-items-start">
        <!-- Emoji icon -->
        <div style="font-size:1.5rem;flex-shrink:0;width:44px;height:44px;
          background:var(--accent-bg);border-radius:12px;
          display:flex;align-items:center;justify-content:center">
          ${b.emoji || '📚'}
        </div>
        <!-- Book info -->
        <div class="flex-grow-1 overflow-hidden">
          <div style="font-weight:700;font-size:.9rem;line-height:1.3">${esc(b.title)}</div>
          <div style="font-size:.75rem;color:var(--text-2);margin-top:1px">${esc(b.author)}</div>
          <div class="d-flex align-items-center gap-2 mt-1 flex-wrap">
            <span style="font-size:.68rem;background:var(--bg-3);color:var(--text-2);
              padding:.1rem .45rem;border-radius:20px;font-weight:600">${esc(b.genre)}</span>
            <span style="font-size:.68rem;color:var(--accent);font-weight:700">⭐ ${esc(b.rating)}</span>
            ${b.available ? `<span style="font-size:.65rem;color:var(--green);font-weight:600">
              <i class="bi bi-shop me-1"></i>${esc(b.available)}</span>` : ''}
          </div>
          <div style="font-size:.78rem;color:var(--text-2);margin-top:.35rem;line-height:1.4">
            ${esc(b.reason)}
          </div>
        </div>
        <!-- Add button -->
        <button class="btn-icon flex-shrink-0"
          style="width:34px;height:34px;background:var(--accent-bg);border-color:var(--accent)"
          onclick="event.stopPropagation();addRecBook('${esc(b.title)}','${esc(b.author)}','${esc(b.genre)}')"
          title="Tambah ke koleksi Ingin Baca">
          <i class="bi bi-plus-lg" style="color:var(--accent);font-size:.85rem"></i>
        </button>
      </div>
    </div>`).join('');

  // Counter + Load More
  html += `
    <div class="d-flex align-items-center justify-content-between mt-1">
      <span style="font-size:.72rem;color:var(--text-3)">${_recsList.length} rekomendasi dimuat</span>
      ${canLoadMore
        ? `<button class="btn-ghost" style="font-size:.78rem;padding:.35rem .8rem"
            onclick="loadAIRecommendations(false)" id="btn-load-more">
            <i class="bi bi-plus-circle me-1"></i>Muat 5 Lagi
          </button>`
        : `<span style="font-size:.72rem;color:var(--text-3)">✓ Maksimum ${MAX_RECS} tercapai</span>`}
    </div>`;

  wrap.innerHTML = html;
}

// ════════════════════════════════════════════════
// AI AUTO-SUMMARY — ringkasan dari semua catatan buku
// ════════════════════════════════════════════════
async function generateBookSummary(bookId, bookTitle) {
  // Show loading Swal
  Swal.fire({
    title: `📖 Membuat Ringkasan AI`,
    html: `<div style="color:var(--text-2);font-size:.88rem">
      Menganalisis catatan dari <b>${esc(bookTitle)}</b>...<br>
      <div class="d-flex align-items-center justify-content-center gap-2 mt-2">
        <div class="spinner-border spinner-border-sm"></div>
        <span>Ini mungkin perlu 10-15 detik</span>
      </div>
    </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Batal',
    allowOutsideClick: false,
  });

  try {
    const res = await apiPost('api/ai.php', {
      type:    'summary',
      book_id: bookId,
    });

    if (!res.success) throw new Error(res.error || 'Gagal membuat ringkasan');

    const text  = res.data?.text || '';
    const count = res.data?.count || 0;

    Swal.fire({
      title: `📖 Ringkasan: ${esc(bookTitle)}`,
      html: `
        <div style="text-align:left;max-height:60vh;overflow-y:auto;padding-right:.5rem">
          <div style="font-size:.72rem;color:var(--text-3);margin-bottom:.75rem">
            Dibuat dari ${count} catatan kamu
          </div>
          <div style="font-size:.875rem;line-height:1.8;color:var(--text);white-space:pre-wrap">${esc(text)}</div>
        </div>`,
      confirmButtonText: '📄 Export PDF',
      showCancelButton: true,
      cancelButtonText: 'Tutup',
      width: '90vw',
    }).then(r => {
      if (r.isConfirmed) _printSummary(bookTitle, text);
    });

  } catch(e) {
    Swal.fire({
      title: 'Gagal',
      text: e.message || 'Tidak bisa membuat ringkasan',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
}

function _printSummary(title, text) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="id"><head>
  <meta charset="UTF-8"/>
  <title>Ringkasan: ${_escPrint(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&family=Cormorant+Garamond:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    body { font-family:'Plus Jakarta Sans',sans-serif; max-width:700px; margin:0 auto; padding:2cm; color:#111; }
    h1   { font-family:'Cormorant Garamond',serif; font-size:24pt; border-bottom:2px solid #F5A623; padding-bottom:.5rem; }
    .meta { color:#888; font-size:10pt; margin-bottom:1.5rem; }
    .content { font-size:11pt; line-height:1.9; white-space:pre-wrap; }
    .footer { margin-top:2rem; padding-top:.5rem; border-top:1px solid #eee; font-size:9pt; color:#ccc; text-align:center; }
    @media print { body { padding:1.5cm; } }
  </style>
</head><body>
  <h1>📖 Ringkasan Buku</h1>
  <p class="meta">${_escPrint(title)} · Dibuat ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
  <div class="content">${_escPrint(text)}</div>
  <div class="footer">My Little Books · Ringkasan AI</div>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`);
  win.document.close();
}

// ════════════════════════════════════════════════
// AI ANALYZE — analisis singkat per buku
// ════════════════════════════════════════════════
async function analyzeBook(bookId, title, author) {
  // Fetch a few notes for context
  const notesRes = await apiGet(`api/notes.php?book_id=${bookId}&limit=5&sort=newest`);
  const notesTxt = (notesRes.data?.notes || [])
    .map(n => `${n.note_title}: ${n.tags || ''}`)
    .join('; ');

  Swal.fire({
    title: '🤖 Analisis AI',
    html: `<div style="text-align:left">
      <b style="font-size:.95rem">${esc(title)}</b>
      <div style="font-size:.82rem;color:var(--text-2)">${esc(author)}</div>
      <div class="d-flex align-items-center gap-2 mt-2" style="font-size:.82rem;color:var(--text-2)">
        <div class="spinner-border spinner-border-sm"></div> Menganalisis buku...
      </div>
    </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Tutup',
    allowOutsideClick: false,
    didOpen: async () => {
      try {
        const res = await apiPost('api/ai.php', {
          type: 'analyze', title, author, notes: notesTxt
        });
        const text = res.success ? (res.data?.text || '') : '❌ ' + (res.error || 'Gagal');

        // Format markdown-like to HTML
        const formatted = text
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/^#{1,3} (.*)/gm, '<b style="font-size:1rem;color:var(--accent)">$1</b>')
          .replace(/^- (.*)/gm, '• $1')
          .replace(/\n/g, '<br>');

        const html = Swal.getHtmlContainer();
        if (html) html.innerHTML = `
          <div style="text-align:left;font-size:.875rem;line-height:1.8;color:var(--text)">
            ${formatted}
          </div>`;

        Swal.showConfirmButton();
        const btn = Swal.getConfirmButton();
        if (btn) btn.textContent = '✓ OK';

      } catch(e) {
        const html = Swal.getHtmlContainer();
        if (html) html.innerHTML = `<div style="color:var(--red)">Error: ${esc(e.message)}</div>`;
        Swal.showConfirmButton();
      }
    }
  });
}

// ── Helpers ───────────────────────────────────
function searchBookOnline(title, author) {
  window.open(`https://www.google.com/search?q=${encodeURIComponent(title + ' ' + author + ' beli buku')}`, '_blank');
}

async function addRecBook(title, author, genre) {
  const r = await Swal.fire({
    title: 'Tambah ke Koleksi?',
    html: `<b>${esc(title)}</b><br><span style="color:var(--text-2);font-size:.88rem">${esc(author)}</span>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '+ Tambahkan',
    cancelButtonText: 'Batal',
  });
  if (!r.isConfirmed) return;

  const res = await apiPost('api/books.php', {
    title, author, genre: genre || '', status: 'want',
    description: `Direkomendasikan AI — ${new Date().toLocaleDateString('id-ID')}`
  });

  if (res.success) {
    toast(`"${title}" ditambahkan ke Ingin Baca! 📚`, 'success');
    // Update context agar tidak direkomendasikan lagi
    if (_recsContext) _recsContext.allTitles.push(title);
    if (App.currentPage === 'books') loadBooks();
    // Hapus dari tampilan
    _recsList = _recsList.filter(b => b.title.toLowerCase() !== title.toLowerCase());
    _renderRecsWithLoadMore(false);
  } else {
    toast(res.error || 'Gagal menambahkan', 'error');
  }
}

function _escPrint(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ════════════════════════════════════════════════
// AI CHAT PER BUKU
// ════════════════════════════════════════════════
let _chatHistory   = [];   // [{role, content}]
let _chatBookId    = 0;
let _chatBookTitle = '';

async function openAIChatModal(bookId, bookTitle) {
  _chatBookId    = bookId || App.currentBookId || 0;
  _chatHistory   = [];
  _chatBookTitle = bookTitle || 'Buku';

  // Close book detail modal first
  bootstrap.Modal.getInstance(document.getElementById('modal-book-detail'))?.hide();

  setTimeout(() => {
    const modal = document.getElementById('modal-ai-chat');
    if (!modal) return;

    document.getElementById('chat-book-title').textContent = _chatBookTitle;
    document.getElementById('chat-messages').innerHTML = `
      <div class="chat-bubble ai">
        <div class="chat-avatar">🤖</div>
        <div>
          <div class="chat-text">
            Halo! Aku siap membantu kamu memahami <b>${esc(_chatBookTitle)}</b> lebih dalam.<br><br>
            Kamu bisa tanya:<br>
            • Koneksi antar konsep<br>
            • Cara menerapkan insight<br>
            • Perbandingan dengan buku lain<br><br>
            Mulai dengan pertanyaan apa? 😊
          </div>
          <div class="chat-time">Sekarang</div>
        </div>
      </div>`;
    document.getElementById('chat-input').value = '';

    new bootstrap.Modal(modal).show();
    setTimeout(() => document.getElementById('chat-input')?.focus(), 300);
  }, 350);
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const question = input?.value.trim();
  if (!question) return;

  input.value = '';
  input.disabled = true;
  document.getElementById('btn-chat-send')?.setAttribute('disabled', '');
  // Reset chip highlight
  document.querySelectorAll('#chat-quick-btns .chip').forEach(b => b.classList.remove('active'));

  // Append user bubble
  _appendChatBubble('user', question);

  // Typing indicator
  const typingId = 'typing-' + Date.now();
  _appendChatBubble('typing', '...', typingId);

  try {
    const res = await apiPost('api/ai.php', {
      type:     'chat',
      book_id:  _chatBookId,
      question,
      history:  _chatHistory,
    });

    // Remove typing
    document.getElementById(typingId)?.remove();

    if (!res.success) throw new Error(res.error || 'AI tidak tersedia');

    const answer = res.data?.answer || '';
    _appendChatBubble('ai', _formatAIText(answer));

    // Update history
    _chatHistory.push({ role: 'user',      content: question });
    _chatHistory.push({ role: 'assistant', content: answer   });
    if (_chatHistory.length > 12) _chatHistory = _chatHistory.slice(-12);

  } catch(e) {
    document.getElementById(typingId)?.remove();
    _appendChatBubble('ai', `😔 ${esc(e.message || 'Gagal mendapat respons')}`);
  }

  input.disabled = false;
  document.getElementById('btn-chat-send')?.removeAttribute('disabled');
  input.focus();
}

function _appendChatBubble(role, content, id = '') {
  const wrap = document.getElementById('chat-messages');
  if (!wrap) return;

  const now  = new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
  const div  = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  if (id) div.id = id;

  if (role === 'user') {
    div.innerHTML = `
      <div>
        <div class="chat-text"><span class="user-text">${esc(content)}</span></div>
        <div class="chat-time">${now}</div>
      </div>`;
  } else if (role === 'typing') {
    div.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div class="chat-text" style="padding:.5rem .75rem">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>`;
  } else {
    // AI bubble
    div.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div>
        <div class="chat-text">${content}</div>
        <div class="chat-time">${now}</div>
      </div>`;
  }

  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function _formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s(.+)/gm, '<strong style="color:var(--accent)">$1</strong>')
    .replace(/^[-•]\s(.+)/gm, '• $1')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function clearChat() {
  _chatHistory = [];
  document.getElementById('chat-messages').innerHTML = `
    <div class="chat-bubble ai">
      <div class="chat-avatar">🤖</div>
      <div>
        <div class="chat-text">Chat direset. Ada yang ingin kamu tanyakan tentang <b>${esc(_chatBookTitle)}</b>? 😊</div>
        <div class="chat-time">Sekarang</div>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════
// AUTO-TAG — suggest tags untuk catatan
// ════════════════════════════════════════════════
let _autotagTimer = null;

async function triggerAutotag() {
  clearTimeout(_autotagTimer);
  _autotagTimer = setTimeout(async () => {
    const title   = document.getElementById('note-title')?.value.trim();
    const content = App.quill?.getText().trim() || '';

    if (!title && content.length < 30) return;

    // Get user's existing tags for context
    const tagsRes = await apiGet('api/notes.php?action=tags');
    const existing = tagsRes.success ? (tagsRes.data || []).slice(0, 20) : [];

    try {
      const res = await apiPost('api/ai.php', {
        type:          'autotag',
        title,
        content:       App.quill?.root.innerHTML || '',
        existing_tags: existing,
      });

      if (!res.success || !res.data?.tags?.length) return;

      _showTagSuggestions(res.data.tags);
    } catch {}
  }, 1500);
}

function _showTagSuggestions(tags) {
  const wrap = document.getElementById('tag-suggestions');
  if (!wrap) return;

  wrap.innerHTML = `
    <div style="font-size:.7rem;color:var(--text-3);margin-bottom:.3rem">
      🤖 Saran tag AI:
    </div>
    <div class="d-flex flex-wrap gap-1">
      ${tags.map(t => `
        <button onclick="addSuggestedTag('${esc(t)}')"
          style="background:var(--accent-bg);border:1px solid var(--accent);
            color:var(--accent);border-radius:20px;padding:.15rem .55rem;
            font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s"
          onmouseover="this.style.background='var(--accent)';this.style.color='#fff'"
          onmouseout="this.style.background='var(--accent-bg)';this.style.color='var(--accent)'">
          + ${esc(t)}
        </button>`).join('')}
    </div>`;
  wrap.classList.remove('d-none');
}

function addSuggestedTag(tag) {
  const input = document.getElementById('note-tags');
  if (!input) return;

  const current = input.value.trim();
  const tags    = current ? current.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (!tags.includes(tag)) {
    tags.push(tag);
    input.value = tags.join(', ');
  }

  // Remove from suggestions
  const wrap = document.getElementById('tag-suggestions');
  if (wrap) {
    const btns = wrap.querySelectorAll('button');
    btns.forEach(btn => {
      if (btn.textContent.trim() === `+ ${tag}`) btn.remove();
    });
    if (!wrap.querySelectorAll('button').length) wrap.classList.add('d-none');
  }
}

// Helper untuk quick question buttons — isi input saja, tidak auto-kirim
function setChatQ(q) {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.value = q;
  input.focus();
  // Geser cursor ke akhir
  input.setSelectionRange(q.length, q.length);
  // Highlight chip yang dipilih
  document.querySelectorAll('#chat-quick-btns .chip').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === q ||
      b.getAttribute('data-q') === q);
  });
}
