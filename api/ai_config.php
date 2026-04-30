<?php
// ============================================
// MY LITTLE BOOKS — Config
// Simpan semua API key di sini
// JANGAN share file ini!
// ============================================

// ── Groq AI (Rekomendasi Buku) ────────────────
// Daftar gratis: https://console.groq.com
$groq_api_key = 'gsk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// ── Telegram Bot ──────────────────────────────
// Cara setup (5 menit):
// 1. Cari @BotFather di Telegram → /newbot
// 2. Ikuti instruksi, dapat TOKEN
// 3. Kirim pesan ke bot kamu
// 4. Buka: https://api.telegram.org/bot{TOKEN}/getUpdates
// 5. Catat chat_id dari response
$telegram_token   = 'XXXXXXXXXX:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
$telegram_chat_id = '000000000';  // chat ID kamu

// ── Google Drive Backup ───────────────────────
// Cara setup:
// 1. Buka: https://console.cloud.google.com
// 2. Buat project baru → Enable "Google Drive API"
// 3. Create credentials → Service Account
// 4. Download JSON key → taruh di api/gdrive_key.json
// 5. Buka Google Drive → share folder ke email service account
$gdrive_folder_id  = '';          // ID folder Google Drive (dari URL)
$gdrive_key_file   = __DIR__ . '/gdrive_key.json';  // path ke service account key
