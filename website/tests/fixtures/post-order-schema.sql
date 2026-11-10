
CREATE TABLE assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL);

CREATE TABLE customer_comments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, reviewed_at TEXT);

CREATE TABLE deployment_identity (id TEXT PRIMARY KEY CHECK(id='main'), environment TEXT NOT NULL CHECK(environment='production'), database_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL);

CREATE TABLE device_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, recipient_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER, consumed_at INTEGER, claim_hash TEXT);

CREATE TABLE limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE previews (token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_json TEXT NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE roost_auth_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT,
 event TEXT NOT NULL, occurred_at INTEGER NOT NULL
);

CREATE TABLE roost_challenges (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, data_json TEXT NOT NULL, expires INTEGER NOT NULL, claimed_by TEXT);

CREATE TABLE roost_credentials (id TEXT NOT NULL, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, credential_json TEXT NOT NULL, PRIMARY KEY(workspace_id,id));

CREATE TABLE roost_email_identities (
 workspace_id TEXT NOT NULL, email TEXT NOT NULL, member_id TEXT NOT NULL,
 verified_at INTEGER NOT NULL,
 PRIMARY KEY(workspace_id,email), UNIQUE(workspace_id,member_id)
);

CREATE TABLE roost_email_tokens (
 hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL,
 purpose TEXT NOT NULL, member_id TEXT, session_hash TEXT,
 payload_json TEXT NOT NULL DEFAULT '{}', expires INTEGER NOT NULL,
 claimed_by TEXT
);

CREATE TABLE roost_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, profile_json TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE roost_password_grants (
 id TEXT PRIMARY KEY,
 expires INTEGER NOT NULL
);

CREATE TABLE roost_passwords (
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

CREATE TABLE roost_session_details (hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, absolute_expires INTEGER NOT NULL, authenticated_at INTEGER NOT NULL, label TEXT NOT NULL);

CREATE TABLE roost_sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE workspaces (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, draft_json TEXT NOT NULL, published_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER NOT NULL DEFAULT 1, versions_json TEXT NOT NULL, ledger_json TEXT NOT NULL DEFAULT '{"orders":[]}', ledger_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);

CREATE INDEX comments_workspace ON customer_comments(workspace_id,status,created_at);

CREATE INDEX roost_email_tokens_expiry ON roost_email_tokens(expires);

CREATE INDEX roost_member_workspace ON roost_members(workspace_id);

CREATE INDEX roost_password_grants_expiry ON roost_password_grants(expires);
