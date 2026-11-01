-- Additive authentication tables for the isolated experience preview only.
CREATE TABLE IF NOT EXISTS studio_pin_settings (id TEXT PRIMARY KEY CHECK(id='main'), pin_hash TEXT, salt TEXT, version INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, bootstrap_hash TEXT, bootstrap_expires INTEGER, setup_claim TEXT);
CREATE TABLE IF NOT EXISTS studio_pin_sessions (hash TEXT PRIMARY KEY, version INTEGER NOT NULL, expires INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS studio_pin_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
