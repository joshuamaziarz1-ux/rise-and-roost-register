-- Additive only: profile emails are never promoted to verified identities.
CREATE TABLE IF NOT EXISTS roost_email_identities (
 workspace_id TEXT NOT NULL, email TEXT NOT NULL, member_id TEXT NOT NULL,
 verified_at INTEGER NOT NULL,
 PRIMARY KEY(workspace_id,email), UNIQUE(workspace_id,member_id)
);
CREATE TABLE IF NOT EXISTS roost_email_tokens (
 hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL,
 purpose TEXT NOT NULL, member_id TEXT, session_hash TEXT,
 payload_json TEXT NOT NULL DEFAULT '{}', expires INTEGER NOT NULL,
 claimed_by TEXT
);
CREATE INDEX IF NOT EXISTS roost_email_tokens_expiry ON roost_email_tokens(expires);
CREATE TABLE IF NOT EXISTS roost_auth_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT,
 event TEXT NOT NULL, occurred_at INTEGER NOT NULL
);
