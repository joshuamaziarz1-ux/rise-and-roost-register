-- PREPARATION ONLY: new production database only, after explicit approval.
-- It deliberately creates no identity row; a reviewed database UUID/workspace
-- assignment is required before the backup worker can read the bound database.
CREATE TABLE deployment_identity (
  id TEXT PRIMARY KEY CHECK(id='main'),
  environment TEXT NOT NULL CHECK(environment='production'),
  database_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL
);
