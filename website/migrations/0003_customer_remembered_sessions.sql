-- Additive and idempotent. Existing members, credentials, sessions, orders and
-- Studio tables are untouched. Legacy metadata is populated on valid use.
CREATE TABLE IF NOT EXISTS roost_session_details (hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, absolute_expires INTEGER NOT NULL, authenticated_at INTEGER NOT NULL, label TEXT NOT NULL);
