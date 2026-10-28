CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, draft_json TEXT NOT NULL, published_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER NOT NULL DEFAULT 1, versions_json TEXT NOT NULL, ledger_json TEXT NOT NULL DEFAULT '{"orders":[]}', ledger_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS previews (token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_json TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS device_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, recipient_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER, consumed_at INTEGER, claim_hash TEXT);
