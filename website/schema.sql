CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, draft_json TEXT NOT NULL, published_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER NOT NULL DEFAULT 1, versions_json TEXT NOT NULL, ledger_json TEXT NOT NULL DEFAULT '{"orders":[]}', ledger_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS previews (token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_json TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS device_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, recipient_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER, consumed_at INTEGER, claim_hash TEXT);
-- Additive only. Apply to the isolated experience preview, never the live beta.
CREATE TABLE IF NOT EXISTS roost_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, profile_json TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS roost_credentials (id TEXT NOT NULL, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, credential_json TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
CREATE TABLE IF NOT EXISTS roost_sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS roost_challenges (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, data_json TEXT NOT NULL, expires INTEGER NOT NULL, claimed_by TEXT);
CREATE TABLE IF NOT EXISTS customer_comments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, reviewed_at TEXT);
CREATE INDEX IF NOT EXISTS roost_member_workspace ON roost_members(workspace_id);
CREATE INDEX IF NOT EXISTS comments_workspace ON customer_comments(workspace_id,status,created_at);
