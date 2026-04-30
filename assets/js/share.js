/* ============================================
   MY LITTLE BOOKS — share.js
   Share via WhatsApp · Quote Card Canvas
   Wake Lock API · Reading Mode Swipe
   ============================================ */
'use strict';

// ════════════════════════════════════════════════
// WAKE LOCK API — layar tidak mati saat baca
// ════════════════════════════════════════════════
let _wakeLock = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch {}
}

function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release(); _wakeLock = null; }
}

// Re-acquire saat tab kembali aktif
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _viewWakeLockActive) {
    requestWakeLock();
  }
});

let _viewWakeLockActive = false;

// ════════════════════════════════════════════════
// SHARE MODAL
// ════════════════════════════════════════════════
async function openShareModal() {
  const noteId  = _viewNoteId;
  if (!noteId) return;

  // Check existing share
  Swal.fire({
    title: '📤 Bagikan Catatan',
    html: `<div style="text-align:center">
      <div class="spinner-border spinner-border-sm me-2"></div>
      Menyiapkan link...
    </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Batal',
    allowOutsideClick: false,
    didOpen: async () => {
      try {
        // Get or create share token
        const res = await apiPost('api/share.php?action=create', {
          note_id: noteId,
          expires: 'forever',
        });

        if (!res.success) {
          Swal.update({
            title: 'Gagal',
            html: `<div style="color:var(--red)">${esc(res.error)}</div>`,
            showConfirmButton: true,
          });
          return;
        }

        const token   = res.data.token;
        const shareUrl = `${location.origin}${location.pathname.replace('index.html','').replace(/\/+$/,'')}/share.php?t=${token}`;

        // Get note title for message
        const noteTitle = document.getElementById('view-note-title')?.textContent || 'Catatan';
        const noteMeta  = document.getElementById('view-note-meta')?.textContent  || '';
        const waText    = encodeURIComponent(`📚 *${noteTitle}*\n${noteMeta}\n\nBaca catatanku di My Little Books:\n${shareUrl}`);

        Swal.update({
          title: '📤 Bagikan Catatan',
          html: `
            <div style="text-align:left">
              <!-- Preview link -->
              <div style="background:var(--bg-3);border-radius:var(--radius-sm);
                padding:.75rem;margin-bottom:1rem;word-break:break-all">
                <div style="font-size:.68rem;color:var(--text-3);font-weight:600;
                  text-transform:uppercase;margin-bottom:.3rem">Link Publik</div>
                <div style="font-size:.78rem;color:var(--accent);font-weight:600">
                  ${esc(shareUrl)}
                </div>
              </div>

              <!-- Share options -->
              <div style="font-size:.78rem;font-weight:600;color:var(--text-2);
                text-transform:uppercase;margin-bottom:.5rem">Bagikan via</div>
              <div class="d-flex flex-column gap-2">
                <a href="https://wa.me/?text=${waText}" target="_blank"
                  class="btn-accent d-flex align-items-center justify-content-center gap-2"
                  style="background:#25D366;padding:.65rem;border-radius:var(--radius-sm);
                    font-weight:700;font-size:.9rem;text-decoration:none;color:#fff">
                  <i class="bi bi-whatsapp" style="font-size:1.1rem"></i>
                  Kirim ke WhatsApp
                </a>
                <button onclick="shareJs_copyLink('${shareUrl}')"
                  class="btn-ghost d-flex align-items-center justify-content-center gap-2"
                  id="btn-copy-link" style="padding:.6rem">
                  <i class="bi bi-link-45deg"></i> Salin Link
                </button>
                <button onclick="shareJs_openQuoteCard()"
                  class="btn-ghost d-flex align-items-center justify-content-center gap-2"
                  style="padding:.6rem">
                  <i class="bi bi-image"></i> Buat Quote Card (Gambar)
                </button>
              </div>

              <!-- Expiry -->
              <div style="margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--border)">
                <div style="font-size:.72rem;color:var(--text-3);margin-bottom:.35rem">
                  Aktif hingga
                </div>
                <select id="share-expiry" class="form-select form-select-sm"
                  style="font-size:.78rem" onchange="shareJs_updateExpiry('${token}',this.value)">
                  <option value="forever">Selamanya</option>
                  <option value="30d">30 hari</option>
                  <option value="7d">7 hari</option>
                  <option value="1d">1 hari</option>
                </select>
              </div>
            </div>`,
          showConfirmButton: false,
          showCancelButton: true,
          cancelButtonText: 'Tutup',
        });

        // Store token for revoke
        window._currentShareToken = token;

      } catch(e) {
        Swal.update({ title: 'Error', html: `<div>${esc(e.message)}</div>`, showConfirmButton: true });
      }
    }
  });
}

function shareJs_copyLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-copy-link');
    if (btn) {
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Link tersalin!';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green)';
    }
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = '<i class="bi bi-link-45deg"></i> Salin Link';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    }, 2000);
  }).catch(() => {
    prompt('Salin link ini:', url);
  });
}

async function shareJs_updateExpiry(token, expires) {
  await apiPost('api/share.php?action=create', { note_id: _viewNoteId, expires });
  toast('Expiry diperbarui ✓', 'success');
}

async function revokeShare() {
  const token = window._currentShareToken;
  if (!token) return;
  const res = await apiPost('api/share.php?action=revoke', { token });
  if (res.success) {
    toast('Share dicabut — link tidak bisa diakses lagi', 'success');
    Swal.close();
  }
}

// ════════════════════════════════════════════════
// QUOTE CARD — generate gambar dari catatan
// ════════════════════════════════════════════════
function shareJs_openQuoteCard() {
  Swal.close();
  setTimeout(() => _showQuoteCardModal(), 300);
}

function _showQuoteCardModal() {
  const title    = document.getElementById('view-note-title')?.textContent || '';
  const metaEl   = document.getElementById('view-note-meta');
  const bookTitle = metaEl?.querySelector('i.bi-book-fill')?.nextSibling?.textContent?.trim() || '';

  // Extract text from content (strip HTML, max 280 chars)
  const contentEl = document.getElementById('view-note-content');
  let text = '';
  if (contentEl) {
    const tmp = document.createElement('div');
    tmp.innerHTML = contentEl.innerHTML;
    text = (tmp.textContent || '').trim().substring(0, 280);
    if ((tmp.textContent || '').length > 280) text += '...';
  }

  Swal.fire({
    title: '🖼️ Quote Card',
    html: `
      <div style="text-align:left">
        <div style="font-size:.78rem;font-weight:600;color:var(--text-2);
          text-transform:uppercase;margin-bottom:.5rem">Preview</div>
        <canvas id="quote-canvas" style="width:100%;border-radius:var(--radius-sm);
          box-shadow:var(--shadow);cursor:pointer"
          onclick="shareJs_downloadCard()" title="Klik untuk download"></canvas>
        <div style="font-size:.72rem;color:var(--text-3);text-align:center;margin-top:.4rem">
          Klik gambar untuk download · Lalu share ke WhatsApp / Instagram
        </div>
        <!-- Style selector -->
        <div style="margin-top:.75rem;display:flex;gap:.4rem;flex-wrap:wrap">
          ${['amber','dark','sepia','green'].map((s,i) => `
            <button onclick="generateQuoteCard('${s}')"
              style="flex:1;padding:.35rem .5rem;border-radius:8px;border:1.5px solid var(--border);
                font-size:.72rem;font-weight:700;cursor:pointer;
                background:${s==='amber'?'#FFF3DB':s==='dark'?'#1a1a1c':s==='sepia'?'#FDF6E3':'#E8F5E9'};
                color:${s==='dark'?'#fff':'#333'}">
              ${['🟡 Amber','⚫ Dark','📜 Sepia','🟢 Green'][i]}
            </button>`).join('')}
        </div>
      </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Tutup',
    width: '92vw',
    didOpen: () => generateQuoteCard('amber'),
  });

  // Store for card gen
  window._cardData = { title, bookTitle, text };
}

function generateQuoteCard(style = 'amber') {
  const canvas = document.getElementById('quote-canvas');
  if (!canvas) return;

  const W = 800, H = 450;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const d = window._cardData || {};

  // ── Background ──
  const themes = {
    amber: { bg1:'#FFFBF0', bg2:'#FFF3DB', accent:'#F5A623', text:'#1a1a1a', sub:'#888' },
    dark:  { bg1:'#0E0E10', bg2:'#1a1a1c', accent:'#F5A623', text:'#F5F5F5', sub:'#888' },
    sepia: { bg1:'#FDF6E3', bg2:'#FAF0D7', accent:'#C8860A', text:'#3D2B1F', sub:'#8B6F5E' },
    green: { bg1:'#F0FFF4', bg2:'#DCFCE7', accent:'#22C55E', text:'#14532D', sub:'#4B7A5A' },
  };
  const t = themes[style] || themes.amber;

  // Gradient bg
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, t.bg1);
  grad.addColorStop(1, t.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent bar left
  ctx.fillStyle = t.accent;
  ctx.fillRect(0, 0, 6, H);

  // Brand top-right
  ctx.font = 'italic 700 18px Georgia, serif';
  ctx.fillStyle = t.accent;
  ctx.textAlign = 'right';
  ctx.fillText('📚 My Little Books', W - 32, 36);

  // Opening quote mark
  ctx.font = '900 96px Georgia, serif';
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.15;
  ctx.textAlign = 'left';
  ctx.fillText('"', 28, 110);
  ctx.globalAlpha = 1;

  // Note title
  ctx.font = `bold 24px "Plus Jakarta Sans", Arial, sans-serif`;
  ctx.fillStyle = t.text;
  ctx.textAlign = 'left';
  _wrapText(ctx, d.title || 'Catatan', 48, 80, W - 96, 30);

  // Divider
  ctx.strokeStyle = t.accent;
  ctx.lineWidth   = 2;
  ctx.beginPath(); ctx.moveTo(48, 100); ctx.lineTo(200, 100); ctx.stroke();

  // Main text
  ctx.font = `400 20px Georgia, serif`;
  ctx.fillStyle = t.text;
  ctx.globalAlpha = 0.88;
  const textY = _wrapText(ctx, d.text || '', 48, 135, W - 96, 28);
  ctx.globalAlpha = 1;

  // Book title
  if (d.bookTitle) {
    ctx.font = `600 16px "Plus Jakarta Sans", Arial, sans-serif`;
    ctx.fillStyle = t.sub;
    ctx.textAlign = 'left';
    ctx.fillText(`📖 ${d.bookTitle}`, 48, H - 40);
  }

  // URL bottom right
  ctx.font = `400 13px "Plus Jakarta Sans", Arial, sans-serif`;
  ctx.fillStyle = t.sub;
  ctx.textAlign = 'right';
  ctx.fillText('mylittlebooks.app', W - 32, H - 40);
}

function _wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let curY  = y;
  const maxLines = 6;
  let lineCount  = 0;

  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, curY);
      line   = words[i] + ' ';
      curY  += lineH;
      lineCount++;
      if (lineCount >= maxLines) {
        ctx.fillText(line.trim() + '...', x, curY);
        return curY + lineH;
      }
    } else {
      line = test;
    }
  }
  if (line.trim()) ctx.fillText(line.trim(), x, curY);
  return curY + lineH;
}

function shareJs_downloadCard() {
  const canvas = document.getElementById('quote-canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `mylittlebooks_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('Gambar berhasil didownload! Buka WhatsApp untuk share 📱', 'success');
}

// ════════════════════════════════════════════════
// READING MODE — Swipe gesture antar catatan
// ════════════════════════════════════════════════
let _swipeStartX = 0;
let _swipeStartY = 0;
let _swipeActive = false;

function initReadingSwipe() {
  const body = document.getElementById('view-note-content');
  const modal = document.getElementById('modal-view-note');
  if (!modal) return;

  modal.addEventListener('touchstart', (e) => {
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipeActive = true;
  }, { passive: true });

  modal.addEventListener('touchend', (e) => {
    if (!_swipeActive) return;
    _swipeActive = false;

    const dx = e.changedTouches[0].clientX - _swipeStartX;
    const dy = e.changedTouches[0].clientY - _swipeStartY;

    // Only horizontal swipes > 60px with minimal vertical drift
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.8) return;

    // Check if content is scrollable — don't interfere
    const content = document.getElementById('view-note-content');
    if (content && content.scrollHeight > content.clientHeight) return;

    if (dx < 0 && _viewNoteIdx < _viewNoteList.length - 1) {
      // Swipe left → next note
      _swipeTransition('left', () => viewNote(_viewNoteList[_viewNoteIdx + 1].id));
    } else if (dx > 0 && _viewNoteIdx > 0) {
      // Swipe right → prev note
      _swipeTransition('right', () => viewNote(_viewNoteList[_viewNoteIdx - 1].id));
    }
  }, { passive: true });
}

function _swipeTransition(dir, callback) {
  const modal = document.querySelector('#modal-view-note .modal-content');
  if (!modal) { callback(); return; }

  modal.style.transition = 'transform .2s ease, opacity .2s';
  modal.style.transform  = `translateX(${dir === 'left' ? '-30px' : '30px'})`;
  modal.style.opacity    = '0.4';

  setTimeout(() => {
    callback();
    modal.style.transform = dir === 'left' ? '30px' : '-30px';
    setTimeout(() => {
      modal.style.transition = 'transform .2s ease, opacity .2s';
      modal.style.transform  = 'translateX(0)';
      modal.style.opacity    = '1';
      setTimeout(() => { modal.style.transition = ''; }, 200);
    }, 50);
  }, 180);
}

// ── Init reading mode enhancements ───────────
function initReadingMode() {
  initReadingSwipe();

  // Wake lock when modal opens
  const modal = document.getElementById('modal-view-note');
  if (modal) {
    modal.addEventListener('show.bs.modal', () => {
      _viewWakeLockActive = true;
      requestWakeLock();
    });
    modal.addEventListener('hide.bs.modal', () => {
      _viewWakeLockActive = false;
      releaseWakeLock();
    });
  }
}
