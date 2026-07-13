-- Step 2: additive chat-universe prototype.
ALTER TABLE links ADD COLUMN resource_type TEXT NOT NULL DEFAULT 'link';
CREATE INDEX IF NOT EXISTS idx_links_universe_resource_type ON links(universe_id, resource_type, added_at DESC);

CREATE TABLE IF NOT EXISTS chat_universes (
  universe_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_universe_sessions (
  session_id TEXT PRIMARY KEY,
  universe_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  turns_json TEXT NOT NULL DEFAULT '[]',
  transcript_sha256 TEXT,
  manifest_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(universe_id) REFERENCES chat_universes(universe_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_universe_resource ON chat_universe_sessions(universe_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_universe ON chat_universe_sessions(universe_id, updated_at DESC);
