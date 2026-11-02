-- Initial empty production schema. Contains no seed data or authentication keys.
-- The previews table supports private Website Content previews, not preview data.
-- Preview PIN tables are deliberately excluded. No DROP/DELETE/RESET statements.
CREATE TABLE workspaces (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, draft_json TEXT NOT NULL, published_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, published_revision INTEGER NOT NULL DEFAULT 1, versions_json TEXT NOT NULL, ledger_json TEXT NOT NULL DEFAULT '{"orders":[]}', ledger_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE previews (token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, document_json TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL);
CREATE TABLE limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE device_links (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, recipient_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER, consumed_at INTEGER, claim_hash TEXT);
CREATE TABLE roost_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, profile_json TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE roost_credentials (id TEXT NOT NULL, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, credential_json TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
CREATE TABLE roost_sessions (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, member_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE roost_challenges (hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, data_json TEXT NOT NULL, expires INTEGER NOT NULL, claimed_by TEXT);
CREATE TABLE customer_comments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, reviewed_at TEXT);
CREATE INDEX roost_member_workspace ON roost_members(workspace_id);
CREATE INDEX comments_workspace ON customer_comments(workspace_id,status,created_at);
CREATE TABLE deployment_identity (id TEXT PRIMARY KEY CHECK(id='main'), environment TEXT NOT NULL CHECK(environment='production'), database_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL);
