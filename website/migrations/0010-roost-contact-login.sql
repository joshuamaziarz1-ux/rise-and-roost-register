-- Additive only. Never infer ownership from legacy pickup contact fields.
CREATE TABLE IF NOT EXISTS roost_contacts (
 workspace_id TEXT NOT NULL, contact TEXT NOT NULL, channel TEXT NOT NULL,
 member_id TEXT NOT NULL, verified_at INTEGER NOT NULL,
 PRIMARY KEY(workspace_id,contact)
);
CREATE TABLE IF NOT EXISTS roost_codes (
 hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, contact TEXT NOT NULL,
 channel TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'pending',
 purpose TEXT NOT NULL, member_id TEXT, session_hash TEXT, origin TEXT NOT NULL,
 claim TEXT
);
CREATE INDEX IF NOT EXISTS roost_codes_expiry ON roost_codes(expires);
