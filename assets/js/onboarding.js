/* ============================================
   MY LITTLE BOOKS — onboarding.js
   Wizard 3 langkah untuk user baru
   ============================================ */
'use strict';

const ONBOARD_KEY = 'mlb-onboarded-v1';

// ── Check & launch ────────────────────────────
async function checkOnboarding() {
  // Sudah pernah onboarding? skip
  if (localStorage.getItem(ONBOARD_KEY)) return;

  // Cek apakah user benar-benar baru (tidak ada buku sama sekali)
  const res = await apiGet('api/books.php');
  const hasBooks = res.success && (res.data || []).length > 0;
  if (hasBooks) {
    localStorage.setItem(ONBOARD_KEY, '1');
    return;
  }

  // Tampilkan onboarding
  setTimeout(() => startOnboarding(), 600);
}

function startOnboarding() {
  _showStep1();
}

// ════════════════════════════════════════════════
// STEP 1 — Selamat datang + nama
// ════════════════════════════════════════════════
function _showStep1() {
  Swal.fire({
    html: `
      <div style="text-align:center;padding:.5rem 0">
        <div style="font-size:3.5rem;margin-bottom:.75rem;animation:heroIconIn .5s cubic-bezier(.34,1.56,.64,1)">📚</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:700;
          font-style:italic;color:var(--accent);margin-bottom:.5rem">
          Selamat Datang!
        </div>
        <p style="font-size:.88rem;color:var(--text-2);margin-bottom:1.5rem;line-height:1.6">
          My Little Books adalah jurnal baca pribadimu.<br>
          Mari setup sebentar agar pengalaman<br>membacamu makin menyenangkan 🎉
        </p>

        <div style="text-align:left;margin-bottom:.75rem">
          <label style="font-size:.78rem;font-weight:600;color:var(--text-2);
            text-transform:uppercase;letter-spacing:.05em">
            Nama panggilanmu
          </label>
          <input id="ob-name" class="form-control mt-1"
            placeholder="Contoh: Andi, Budi, Kak Sarah..."
            value="${esc(App.user?.display_name || '')}"
            style="text-align:center;font-size:1rem;font-weight:600"/>
        </div>

        <!-- Step indicator -->
        <div class="d-flex justify-content-center gap-2 mt-3">
          <div style="width:28px;height:4px;border-radius:2px;background:var(--accent)"></div>
          <div style="width:28px;height:4px;border-radius:2px;background:var(--bg-3)"></div>
          <div style="width:28px;height:4px;border-radius:2px;background:var(--bg-3)"></div>
        </div>
        <div style="font-size:.68rem;color:var(--text-3);margin-top:.4rem">Langkah 1 dari 3</div>
      </div>`,
    confirmButtonText: 'Lanjut →',
    showCancelButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    customClass: { popup: 'onboard-popup' },
    didOpen: () => {
      document.getElementById('ob-name')?.focus();
      document.getElementById('ob-name')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') Swal.clickConfirm();
      });
    },
    preConfirm: () => {
      const name = document.getElementById('ob-name')?.value.trim();
      if (!name) { Swal.showValidationMessage('Nama tidak boleh kosong'); return false; }
      return name;
    }
  }).then(async result => {
    if (!result.isConfirmed) return;
    const name = result.value;

    // Save name if changed
    if (name !== App.user?.display_name) {
      await apiPost('api/auth.php?action=update_profile', { display_name: name });
      if (App.user) App.user.display_name = name;
    }
    _showStep2(name);
  });
}

// ════════════════════════════════════════════════
// STEP 2 — Minat bacaan
// ════════════════════════════════════════════════
function _showStep2(name) {
  const interests = typeof INTEREST_OPTIONS !== 'undefined' ? INTEREST_OPTIONS : [
    { key:'islami',    label:'Islami',    icon:'🕌' },
    { key:'self-help', label:'Self Help', icon:'💪' },
    { key:'fiksi',     label:'Fiksi',     icon:'🌟' },
    { key:'bisnis',    label:'Bisnis',    icon:'💼' },
    { key:'sejarah',   label:'Sejarah',   icon:'📜' },
    { key:'sains',     label:'Sains',     icon:'🔬' },
    { key:'psikologi', label:'Psikologi', icon:'🧩' },
    { key:'motivasi',  label:'Motivasi',  icon:'🚀' },
    { key:'novel',     label:'Novel',     icon:'📖' },
    { key:'biografi',  label:'Biografi',  icon:'👤' },
    { key:'teknologi', label:'Teknologi', icon:'💻' },
    { key:'ekonomi',   label:'Ekonomi',   icon:'📊' },
  ];

  const chips = interests.map(i => `
    <div class="ob-chip" data-key="${i.key}"
      onclick="this.classList.toggle('active')"
      style="display:inline-flex;align-items:center;gap:.3rem;
        padding:.4rem .75rem;border-radius:20px;cursor:pointer;
        border:1.5px solid var(--border);background:var(--bg-2);
        font-size:.82rem;font-weight:600;color:var(--text-2);
        transition:all .15s;margin:.2rem;user-select:none">
      ${i.icon} ${i.label}
    </div>`).join('');

  Swal.fire({
    html: `
      <div style="text-align:center;padding:.5rem 0">
        <div style="font-size:2rem;margin-bottom:.5rem">📖</div>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:.25rem">
          Halo, ${esc(name)}!
        </div>
        <p style="font-size:.85rem;color:var(--text-2);margin-bottom:1rem;line-height:1.5">
          Pilih genre yang kamu suka.<br>
          AI akan rekomendasikan buku yang tepat.
        </p>
        <div style="text-align:left;max-height:200px;overflow-y:auto;
          padding:.5rem;background:var(--bg-3);border-radius:var(--radius-sm);
          margin-bottom:.75rem" id="ob-chips-wrap">
          ${chips}
        </div>
        <div style="font-size:.72rem;color:var(--text-3)">Pilih minimal 1 genre</div>

        <!-- Step indicator -->
        <div class="d-flex justify-content-center gap-2 mt-3">
          <div style="width:28px;height:4px;border-radius:2px;background:var(--green)"></div>
          <div style="width:28px;height:4px;border-radius:2px;background:var(--accent)"></div>
          <div style="width:28px;height:4px;border-radius:2px;background:var(--bg-3)"></div>
        </div>
        <div style="font-size:.68rem;color:var(--text-3);margin-top:.4rem">Langkah 2 dari 3</div>
      </div>`,
    confirmButtonText: 'Lanjut →',
    showCancelButton: true,
    cancelButtonText: '← Kembali',
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      // Style active chips via CSS injection once
      const style = document.createElement('style');
      style.textContent = `.ob-chip.active{background:var(--accent-bg)!important;
        border-color:var(--accent)!important;color:var(--accent)!important}`;
      document.head.appendChild(style);
    },
    preConfirm: () => {
      const selected = Array.from(
        document.querySelectorAll('.ob-chip.active')
      ).map(el => el.dataset.key);
      if (!selected.length) {
        Swal.showValidationMessage('Pilih minimal 1 genre');
        return false;
      }
      return selected;
    }
  }).then(result => {
    if (result.dismiss === Swal.DismissReason.cancel) { _showStep1(); return; }
    if (!result.isConfirmed) return;

    // Save interests
    localStorage.setItem('mlb-interests', JSON.stringify(result.value));
    _showStep3(name, result.value.length);
  });
}

// ════════════════════════════════════════════════
// STEP 3 — Target baca
// ════════════════════════════════════════════════
function _showStep3(name, interestCount) {
  Swal.fire({
    html: `
      <div style="text-align:center;padding:.5rem 0">
        <div style="font-size:2rem;margin-bottom:.5rem">🎯</div>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:.25rem">
          Set Target Bacaan
        </div>
        <p style="font-size:.85rem;color:var(--text-2);margin-bottom:1.25rem;line-height:1.5">
          Target membantumu tetap konsisten.<br>
          Bisa diubah kapan saja di Setelan.
        </p>

        <div style="text-align:left">
          <!-- Books/month -->
          <div style="margin-bottom:1rem">
            <label style="font-size:.78rem;font-weight:600;color:var(--text-2);
              text-transform:uppercase">📚 Buku per Bulan</label>
            <div class="d-flex align-items-center gap-2 mt-1">
              <button onclick="_obAdj('ob-books',-1)"
                style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);
                  background:var(--bg-2);cursor:pointer;font-size:1.1rem;font-weight:700">−</button>
              <input id="ob-books" type="number" value="2" min="1" max="20"
                style="flex:1;text-align:center;font-size:1.3rem;font-weight:800;
                  border:1.5px solid var(--border);border-radius:var(--radius-sm);
                  padding:.4rem;color:var(--accent);background:var(--bg-2)"/>
              <button onclick="_obAdj('ob-books',1)"
                style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);
                  background:var(--bg-2);cursor:pointer;font-size:1.1rem;font-weight:700">+</button>
            </div>
          </div>

          <!-- Pages/day -->
          <div style="margin-bottom:1rem">
            <label style="font-size:.78rem;font-weight:600;color:var(--text-2);
              text-transform:uppercase">📄 Halaman per Hari</label>
            <div class="d-flex align-items-center gap-2 mt-1">
              <button onclick="_obAdj('ob-pages',-5)"
                style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);
                  background:var(--bg-2);cursor:pointer;font-size:1.1rem;font-weight:700">−</button>
              <input id="ob-pages" type="number" value="20" min="5" max="200" step="5"
                style="flex:1;text-align:center;font-size:1.3rem;font-weight:800;
                  border:1.5px solid var(--border);border-radius:var(--radius-sm);
                  padding:.4rem;color:var(--accent);background:var(--bg-2)"/>
              <button onclick="_obAdj('ob-pages',5)"
                style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);
                  background:var(--bg-2);cursor:pointer;font-size:1.1rem;font-weight:700">+</button>
            </div>
          </div>

          <!-- Notes/week -->
          <div>
            <label style="font-size:.78rem;font-weight:600;color:var(--text-2);
              text-transform:uppercase">✍️ Catatan per Minggu</label>
            <div class="d-flex align-items-center gap-2 mt-1">
              <button onclick="_obAdj('ob-notes',-1)"
                style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);
                  background:var(--bg-2);cursor:pointer;font-size:1.1rem;font-weight:700">−</button>
              <input id="ob-notes" type="number" value="3" min="1" max="30"
                style="flex:1;text-align:center;font-size:1.3rem;font-weight:800;
                  border:1.5px solid var(--border);border-radius:var(--radius-sm);
                  padding:.4rem;color:var(--accent);background:var(--bg-2)"/>
              <button onclick="_obAdj('ob-notes',1)"
                style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--border);
                  background:var(--bg-2);cursor:pointer;font-size:1.1rem;font-weight:700">+</button>
            </div>
          </div>
        </div>

        <!-- Step indicator -->
        <div class="d-flex justify-content-center gap-2 mt-3">
          <div style="width:28px;height:4px;border-radius:2px;background:var(--green)"></div>
          <div style="width:28px;height:4px;border-radius:2px;background:var(--green)"></div>
          <div style="width:28px;height:4px;border-radius:2px;background:var(--accent)"></div>
        </div>
        <div style="font-size:.68rem;color:var(--text-3);margin-top:.4rem">Langkah 3 dari 3</div>
      </div>`,
    confirmButtonText: '🚀 Mulai Membaca!',
    showCancelButton: true,
    cancelButtonText: '← Kembali',
    allowOutsideClick: false,
    allowEscapeKey: false,
    preConfirm: () => ({
      books: Math.max(1, +document.getElementById('ob-books').value || 2),
      pages: Math.max(5, +document.getElementById('ob-pages').value || 20),
      notes: Math.max(1, +document.getElementById('ob-notes').value || 3),
    })
  }).then(async result => {
    if (result.dismiss === Swal.DismissReason.cancel) { _showStep2(name); return; }
    if (!result.isConfirmed) return;

    const { books, pages, notes } = result.value;

    // Save targets
    await apiPost('api/targets.php', {
      monthly_books: books,
      daily_pages:   pages,
      weekly_notes:  notes,
    });

    // Mark onboarding done
    localStorage.setItem(ONBOARD_KEY, '1');

    // Completion celebration
    _showOnboardComplete(name, interestCount);
  });
}

// ── Adjust helper ─────────────────────────────
function _obAdj(id, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  const step = Math.abs(delta);
  const newVal = Math.max(1, (+el.value || 0) + delta);
  el.value = step > 1 ? Math.round(newVal / step) * step : newVal;
}

// ── Completion ────────────────────────────────
function _showOnboardComplete(name, interestCount) {
  Swal.fire({
    html: `
      <div style="text-align:center;padding:1rem 0">
        <div style="font-size:4rem;margin-bottom:1rem;
          animation:heroIconIn .6s cubic-bezier(.34,1.56,.64,1)">🎉</div>
        <div style="font-size:1.3rem;font-weight:800;margin-bottom:.5rem;color:var(--text)">
          Siap, ${esc(name)}!
        </div>
        <p style="font-size:.88rem;color:var(--text-2);line-height:1.7;margin-bottom:1.25rem">
          Kamu sudah memilih <b>${interestCount} genre</b> favorit.<br>
          AI akan langsung rekomendasikan buku untukmu!
        </p>
        <div class="d-flex flex-column gap-2" style="text-align:left">
          <div style="background:var(--bg-3);border-radius:var(--radius-sm);
            padding:.6rem .9rem;font-size:.82rem;display:flex;align-items:center;gap:.6rem">
            <span>📚</span>
            <span>Tambah buku pertamamu dari <b>tab Buku</b></span>
          </div>
          <div style="background:var(--bg-3);border-radius:var(--radius-sm);
            padding:.6rem .9rem;font-size:.82rem;display:flex;align-items:center;gap:.6rem">
            <span>🤖</span>
            <span>Lihat rekomendasi AI di <b>Home → Refresh</b></span>
          </div>
          <div style="background:var(--bg-3);border-radius:var(--radius-sm);
            padding:.6rem .9rem;font-size:.82rem;display:flex;align-items:center;gap:.6rem">
            <span>🍅</span>
            <span>Mulai sesi baca dengan <b>Reading Timer</b></span>
          </div>
        </div>
      </div>`,
    confirmButtonText: 'Ayo Mulai! 🚀',
    showCancelButton: false,
    allowOutsideClick: false,
  }).then(() => {
    // Reload dashboard dengan data baru
    loadDashboard();
    loadAIRecommendations(true);
    // Highlight FAB
    _highlightFab();
  });
}

// ── Highlight FAB after onboarding ───────────
function _highlightFab() {
  const fab = document.getElementById('fab');
  if (!fab) return;
  fab.classList.remove('d-none');
  fab.style.animation = 'fabPulse 1s ease 3';
  setTimeout(() => { fab.style.animation = ''; }, 3000);
}
