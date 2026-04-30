-- ============================================
-- MY LITTLE BOOKS — Database Schema v3
-- Multi-User Architecture
-- Engine: MySQL 5.7+ / MariaDB 10+
-- ============================================

CREATE DATABASE IF NOT EXISTS mylittlebooks
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mylittlebooks;

-- ============================================
-- TABLE: users (multi-user)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username         VARCHAR(50)  NOT NULL UNIQUE,
  email            VARCHAR(120) DEFAULT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  display_name     VARCHAR(100) NOT NULL DEFAULT 'Reader',
  avatar           VARCHAR(255) DEFAULT NULL,
  role             ENUM('admin','member') NOT NULL DEFAULT 'member',
  xp_points        INT UNSIGNED NOT NULL DEFAULT 0,
  telegram_chat_id VARCHAR(50)  DEFAULT NULL,
  notif_hour       TINYINT UNSIGNED DEFAULT 7,   -- jam kirim notif (0-23)
  notif_enabled    TINYINT(1) NOT NULL DEFAULT 1,
  reading_font_size ENUM('sm','md','lg') DEFAULT 'md',
  language         ENUM('id','en') DEFAULT 'id',
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login       DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin default (password: admin123)
INSERT INTO users (username, email, password_hash, display_name, role)
VALUES ('admin', 'admin@mylittlebooks.local',
        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'Admin', 'admin');

-- ============================================
-- TABLE: user_targets (per user)
-- ============================================
CREATE TABLE IF NOT EXISTS user_targets (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  type         ENUM('monthly_books','daily_pages','weekly_notes') NOT NULL,
  target_value SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_type (user_id, type),
  CONSTRAINT fk_target_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO user_targets (user_id, type, target_value) VALUES
  (1,'monthly_books', 5),
  (1,'daily_pages',  20),
  (1,'weekly_notes',  3);

-- ============================================
-- TABLE: user_interests (per user)
-- ============================================
CREATE TABLE IF NOT EXISTS user_interests (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  genre   VARCHAR(50) NOT NULL,
  UNIQUE KEY uk_user_genre (user_id, genre),
  CONSTRAINT fk_interest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: books (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS books (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  title          VARCHAR(200) NOT NULL,
  author         VARCHAR(150) NOT NULL DEFAULT '',
  isbn           VARCHAR(20)  DEFAULT NULL,
  cover_filename VARCHAR(255) DEFAULT NULL,
  genre          VARCHAR(100) DEFAULT NULL,
  description    TEXT DEFAULT NULL,
  status         ENUM('want','reading','done','paused') NOT NULL DEFAULT 'want',
  total_pages    SMALLINT UNSIGNED DEFAULT 0,
  current_page   SMALLINT UNSIGNED DEFAULT 0,
  started_at     DATE DEFAULT NULL,
  finished_at    DATE DEFAULT NULL,
  rating         TINYINT UNSIGNED DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_book_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: notes (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  book_id     INT UNSIGNED NOT NULL,
  note_title  VARCHAR(150) NOT NULL,
  content     LONGTEXT NOT NULL,
  page_start  SMALLINT UNSIGNED DEFAULT 0,
  page_end    SMALLINT UNSIGNED DEFAULT 0,
  rating      TINYINT UNSIGNED DEFAULT 0,
  tags        VARCHAR(500) DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_note_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FULLTEXT KEY ft_notes (note_title, content, tags)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: quotes (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS quotes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  book_id     INT UNSIGNED NOT NULL,
  quote_text  TEXT NOT NULL,
  page_number SMALLINT UNSIGNED DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quote_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: attachments
-- ============================================
CREATE TABLE IF NOT EXISTS attachments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id       INT UNSIGNED NOT NULL,
  filename      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_size     INT UNSIGNED DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attach_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: reminders (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS reminders (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  title         VARCHAR(200) NOT NULL,
  reminder_date DATE NOT NULL,
  reminder_time TIME DEFAULT NULL,
  type          ENUM('once','daily','weekly') NOT NULL DEFAULT 'once',
  note          TEXT DEFAULT NULL,
  is_done       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reminder_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: reading_logs (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS reading_logs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  book_id     INT UNSIGNED NOT NULL,
  note_id     INT UNSIGNED DEFAULT NULL,
  pages_read  SMALLINT UNSIGNED DEFAULT 0,
  logged_date DATE NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_log_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  CONSTRAINT fk_log_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: badges (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS badges (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id   INT UNSIGNED NOT NULL,
  badge_key VARCHAR(50) NOT NULL,
  earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_badge (user_id, badge_key),
  CONSTRAINT fk_badge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: reading_sessions (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS reading_sessions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  book_id      INT UNSIGNED DEFAULT NULL,
  duration     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  pages_read   SMALLINT UNSIGNED DEFAULT 0,
  session_type ENUM('pomodoro','free') DEFAULT 'pomodoro',
  logged_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_sessions_user_date (user_id, logged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: daily_checkins (+ user_id)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_checkins (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  checkin_date DATE NOT NULL,
  mood         TINYINT UNSIGNED DEFAULT 3,
  note         VARCHAR(200) DEFAULT '',
  pages_read   SMALLINT UNSIGNED DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, checkin_date),
  CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: book_schedules (per user via book)
-- ============================================
CREATE TABLE IF NOT EXISTS book_schedules (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  book_id      INT UNSIGNED NOT NULL UNIQUE,
  target_date  DATE NOT NULL,
  daily_pages  SMALLINT UNSIGNED DEFAULT 0,
  started_at   DATE DEFAULT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sched_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLE: note_reviews (spaced repetition)
-- ============================================
CREATE TABLE IF NOT EXISTS note_reviews (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id       INT UNSIGNED NOT NULL UNIQUE,
  last_review   DATE DEFAULT NULL,
  next_review   DATE NOT NULL,
  interval_days TINYINT UNSIGNED DEFAULT 1,
  ease          FLOAT DEFAULT 2.5,
  reviews       SMALLINT UNSIGNED DEFAULT 0,
  CONSTRAINT fk_review_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_books_user    ON books(user_id);
CREATE INDEX idx_books_status  ON books(user_id, status);
CREATE INDEX idx_notes_user    ON notes(user_id);
CREATE INDEX idx_notes_book    ON notes(book_id);
CREATE INDEX idx_quotes_user   ON quotes(user_id);
CREATE INDEX idx_rems_user     ON reminders(user_id, reminder_date);
CREATE INDEX idx_logs_user     ON reading_logs(user_id, logged_date);
CREATE INDEX idx_logs_book     ON reading_logs(book_id);
CREATE INDEX idx_badges_user   ON badges(user_id);

-- Sesi 12: Shared Notes
CREATE TABLE IF NOT EXISTS shared_notes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  token      VARCHAR(64) NOT NULL UNIQUE,
  title      VARCHAR(200) DEFAULT '',
  expires_at DATETIME DEFAULT NULL,
  view_count INT UNSIGNED DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_token (token),
  KEY idx_user  (user_id),
  CONSTRAINT fk_share_note FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_share_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
