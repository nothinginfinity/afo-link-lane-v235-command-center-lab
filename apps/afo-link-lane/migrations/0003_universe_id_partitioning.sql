-- Additive multi-universe foundation. Existing rows remain in the implicit
-- default universe; current Link Lane behavior and legacy Vectorize namespaces
-- remain unchanged.
ALTER TABLE links ADD COLUMN universe_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE resource_chunks ADD COLUMN universe_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_links_universe
  ON links(universe_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_resource_chunks_universe_active
  ON resource_chunks(universe_id, resource_id, index_state, chunk_index);

CREATE INDEX IF NOT EXISTS idx_resource_chunks_universe_source
  ON resource_chunks(universe_id, resource_id, source_sha256, chunk_index);

-- FTS5 does not support ADD COLUMN. Rebuild only the virtual table and copy
-- every existing row into the default universe before removing the legacy copy.
ALTER TABLE resource_chunks_fts RENAME TO resource_chunks_fts_legacy;

CREATE VIRTUAL TABLE resource_chunks_fts USING fts5(
  text,
  chunk_id UNINDEXED,
  universe_id UNINDEXED,
  resource_id UNINDEXED,
  source_sha256 UNINDEXED,
  chunk_index UNINDEXED,
  tokenize = 'porter unicode61'
);

INSERT INTO resource_chunks_fts(
  text, chunk_id, universe_id, resource_id, source_sha256, chunk_index
)
SELECT
  text, chunk_id, 'default', resource_id, source_sha256, chunk_index
FROM resource_chunks_fts_legacy;

DROP TABLE resource_chunks_fts_legacy;
