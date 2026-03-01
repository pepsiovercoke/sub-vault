const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "./data/subvault.db";

// Ensure data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ───
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    name        TEXT NOT NULL,
    cost        REAL NOT NULL,
    currency    TEXT NOT NULL DEFAULT 'USD',
    cycle       TEXT NOT NULL DEFAULT 'Monthly',
    category    TEXT NOT NULL DEFAULT 'Other',
    status      TEXT NOT NULL DEFAULT 'active',
    next_bill   DATE,
    notes       TEXT DEFAULT '',
    url         TEXT DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spend_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    month       TEXT NOT NULL,
    total       REAL NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, month)
  );

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    provider      TEXT NOT NULL,
    provider_id   TEXT NOT NULL,
    email         TEXT,
    name          TEXT,
    access_token  TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(provider, provider_id)
  );

  CREATE INDEX IF NOT EXISTS idx_subs_user      ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_subs_status     ON subscriptions(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_subs_category   ON subscriptions(user_id, category);
  CREATE INDEX IF NOT EXISTS idx_subs_next_bill  ON subscriptions(user_id, next_bill);
  CREATE INDEX IF NOT EXISTS idx_history_user    ON spend_history(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_oauth_user      ON oauth_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_provider  ON oauth_accounts(provider, provider_id);
`);

module.exports = db;
