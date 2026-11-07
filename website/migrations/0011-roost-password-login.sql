-- Additive identities. Never map or merge by profile email, phone, or name.
CREATE TABLE IF NOT EXISTS roost_passwords (
 workspace_id TEXT NOT NULL,
 username TEXT NOT NULL,
 member_id TEXT NOT NULL,
 salt TEXT NOT NULL,
 verifier TEXT NOT NULL,
 scheme TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(workspace_id,username),
 UNIQUE(workspace_id,member_id)
);
CREATE TABLE IF NOT EXISTS roost_password_grants (
 id TEXT PRIMARY KEY,
 expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS roost_password_grants_expiry ON roost_password_grants(expires);
