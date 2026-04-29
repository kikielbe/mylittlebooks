# 📚 My Little Books — v3.0 (Multi-User)

Aplikasi jurnal baca pribadi berbasis web (PWA). Dirancang untuk meningkatkan
literasi, membangun disiplin membaca, dan menyimpan ringkasan dari setiap buku.
Mendukung multi-user — cocok untuk dipakai sekeluarga.

---

## 🚀 Quick Start

```
1. Import: database/mylittlebooks.sql → phpMyAdmin
2. Copy:   folder ke htdocs/mylittlebooks/
3. Edit:   api/ai_config.php → isi API keys
4. Buka:   http://localhost/mylittlebooks/welcome.html
5. Daftar: akun pertama otomatis jadi Admin
```

Login default (jika tidak daftar): `admin` / `admin123`

---

## ✨ Fitur Lengkap

### 👤 Multi-User
- Register & login per user
- Role Admin / Member
- Admin: tambah, edit, reset password, nonaktifkan user
- Data tiap user terpisah sepenuhnya
- Telegram Chat ID per user (notif personal)

### 📚 Buku
- Tambah buku + cover, genre, rating, deskripsi
- Status: Ingin Baca / Sedang Dibaca / Selesai / Ditunda
- Update progress halaman real-time
- Filter & search

### 📝 Catatan Rich Text
- Editor Quill (bold, italic, heading, list, blockquote)
- Insert Ayat Al-Qur'an (Arab + terjemahan ID)
- Insert Hadits (6 kitab)
- Upload lampiran foto (max 5)
- Tag & filter, Reading Mode (sepia, font besar)
- Navigasi Prev/Next + reading progress bar

### 🤖 AI (Groq — Gratis)
- 20 rekomendasi buku berdasarkan minat & koleksi
- Pagination 5+5, filter buku yang sudah ada
- Auto-Summary dari semua catatan buku → export PDF
- AI Analyze: ringkasan + buku serupa

### 🍅 Pomodoro Timer
- Web Worker → timer akurat walau tab diminimize
- Auto-restore state saat app dibuka kembali
- Judul browser berubah: ⏱ 23:45 · My Little Books
- Auto-log halaman ke DB + update progress buku
- Notifikasi browser + suara

### 📅 Habit Tracker
- Daily Check-in mood (😞→🤩)
- Heatmap aktivitas 365 hari (GitHub-style)
- Streak harian otomatis

### 📅 Reading Schedule
- Target selesai buku dalam X hari
- Hitung halaman/hari otomatis + milestone 25/50/75/100%
- Dashboard widget: on-track ✓ / urgent 🔥 / terlambat ⚠️

### 🧠 Spaced Repetition
- SM-2 algorithm (seperti Anki)
- Review session flash card
- +2 XP per review

### 💬 Quote of the Day
- Dari koleksi kutipanmu sendiri (prioritas)
- Cache 1 hari, bisa refresh

### 🏆 Gamifikasi
- XP + 6 Level + 10 Badge + Streak

### 📊 Laporan
- Chart mingguan & bulanan (Chart.js)

### 📱 Telegram Reminder
- Setup per user (Chat ID masing-masing)
- Cron harian: reminder + progress + deadline + review pending
- Token bot global (admin isi 1x)

### ☁️ Google Drive Backup
- Upload / list / restore / delete via Service Account

### 💾 Backup Lokal
- Export/import JSON per user

---

## ⚙️ Konfigurasi — api/ai_config.php

```php
$groq_api_key     = 'gsk_...';          // console.groq.com (gratis)
$telegram_token   = '123:ABC...';       // @BotFather (gratis)
$telegram_chat_id = '999...';           // Chat ID admin (untuk test)
$gdrive_folder_id = 'FOLDER_ID';        // Google Drive folder ID
$gdrive_key_file  = __DIR__.'/gdrive_key.json';
```

---

## 📁 Struktur Folder

```
mylittlebooks/
├── welcome.html          ← Landing page
├── register.html         ← Daftar akun
├── login.html            ← Masuk
├── index.html            ← SPA utama
├── manifest.json + sw.js ← PWA
├── api/
│   ├── db.php            ← DB + helpers (userId, XP, badges)
│   ├── auth.php          ← Auth + admin user management
│   ├── books.php         ← CRUD buku
│   ├── notes.php         ← CRUD catatan + attachment
│   ├── quotes.php        ← CRUD kutipan
│   ├── reminders.php     ← CRUD reminder
│   ├── targets.php       ← Target per user
│   ├── report.php        ← Laporan mingguan/bulanan
│   ├── backup.php        ← Backup/restore + level data
│   ├── ai.php            ← AI proxy (Groq)
│   ├── ai_config.php     ← Semua API keys ⚠️
│   ├── timer.php         ← Pomodoro + heatmap + check-in
│   ├── schedule.php      ← Quote + jadwal + spaced repetition
│   ├── telegram.php      ← Bot setup & test
│   ├── cron_reminder.php ← Cron harian multi-user
│   └── gdrive.php        ← Google Drive backup
├── assets/
│   ├── css/app.css
│   ├── js/
│   │   ├── app.js, books.js, notes.js, quotes.js
│   │   ├── calendar.js, leaderboard.js, report.js
│   │   ├── ai.js, timer.js, timer-worker.js (Web Worker)
│   │   ├── schedule.js, settings.js, export.js
│   └── uploads/covers/ + attachments/ + avatars/
└── database/
    └── mylittlebooks.sql
```

---

## 📱 Setup Telegram

1. Telegram → @BotFather → `/newbot` → dapat TOKEN
2. Admin: Setelan → Telegram → Setup Bot → isi TOKEN
3. **Setiap user**: Setelan → Profil → isi Chat ID masing-masing
   - Kirim pesan ke bot → `https://api.telegram.org/bot{TOKEN}/getUpdates` → catat chat.id

**Cron di hosting:**
```bash
0 * * * * php /path/to/mylittlebooks/api/cron_reminder.php
```
Jalan setiap jam — kirim ke user yang jam notif-nya = jam sekarang.

---

## ☁️ Setup Google Drive

1. [console.cloud.google.com](https://console.cloud.google.com) → Project baru
2. Enable Google Drive API
3. IAM → Service Accounts → Create → Download JSON key
4. Simpan sebagai `api/gdrive_key.json`
5. Google Drive → New Folder → Share ke email service account
6. Salin Folder ID dari URL → isi di `ai_config.php`

---

## 🎮 XP System

| Aksi | XP |
|---|---|
| Tambah buku | +5 |
| Buat catatan | +10 |
| Selesai buku | +15 |
| Tambah kutipan | +5 |
| Streak 7 hari | +20 |
| Sesi Pomodoro | +5 |
| Review catatan | +2 |

**Level:** Pemula → Pembaca → Bookworm → Scholar → Bibliophile → 👑 Grand Reader

---

## 🔧 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | HTML5, Bootstrap 5, Vanilla JS ES6+ |
| Editor | Quill.js |
| Charts | Chart.js |
| Dialog | SweetAlert2 |
| Timer | Web Worker API |
| Backend | PHP 8+ |
| Database | MySQL / MariaDB |
| AI | Groq API (Llama 3.3) — Gratis |
| Notif | Telegram Bot API — Gratis |
| Cloud | Google Drive API (Service Account) |
| PWA | Service Worker v6 + Web App Manifest |

---

📚 My Little Books v3.0 · Multi-User · Made with ❤️
