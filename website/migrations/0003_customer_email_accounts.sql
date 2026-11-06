-- Additive only. Back up and validate recovery before applying to production.
-- Do not infer membership/order ownership from pre-existing profile email fields.
CREATE TABLE IF NOT EXISTS roost_email_accounts (workspace_id TEXT NOT NULL, email TEXT NOT NULL, member_id TEXT NOT NULL UNIQUE, verified_at INTEGER NOT NULL, PRIMARY KEY(workspace_id,email));
CREATE TABLE IF NOT EXISTS roost_email_challenges (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, verifier TEXT NOT NULL, remember INTEGER NOT NULL CHECK(remember IN (0,1)), expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed TEXT);
CREATE TABLE IF NOT EXISTS roost_email_sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, previous_hash TEXT, previous_until INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL, absolute_expires INTEGER NOT NULL, renewed_at INTEGER NOT NULL, remember INTEGER NOT NULL CHECK(remember IN (0,1)));
CREATE INDEX IF NOT EXISTS roost_email_session_member ON roost_email_sessions(workspace_id,member_id);
CREATE TABLE IF NOT EXISTS roost_email_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS roost_email_session_previous ON roost_email_sessions(previous_hash,workspace_id);
CREATE INDEX IF NOT EXISTS roost_email_challenge_address ON roost_email_challenges(workspace_id,email,consumed);
