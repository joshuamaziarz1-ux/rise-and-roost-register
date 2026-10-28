-- Additive beta authentication metadata only. Never rewrites existing tables.
CREATE TABLE IF NOT EXISTS device_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, recipient_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER, consumed_at INTEGER, claim_hash TEXT);
