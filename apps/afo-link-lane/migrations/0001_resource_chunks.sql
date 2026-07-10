CREATE TABLE IF NOT EXISTS resource_chunks (
  chunk_id TEXT PRIMARY KEY,
  vector_id TEXT NOT NULL,
  ingest_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  extracted_text_sha256 TEXT NOT NULL,
  chunker_version TEXT NOT NULL,
  chunk_config_sha256 TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  section_title TEXT,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  chunk_sha256 TEXT NOT NULL,
  chunk_key TEXT NOT NULL,
  vector_namespace TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_pooling TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  index_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(index_state IN ('pending','indexed','failed','stale')),
  indexed_at TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(resource_id, source_sha256, chunk_index),
  UNIQUE(resource_id, source_sha256, chunk_sha256)
);

CREATE INDEX IF NOT EXISTS idx_resource_chunks_active
  ON resource_chunks(resource_id, index_state, chunk_index);

CREATE INDEX IF NOT EXISTS idx_resource_chunks_source
  ON resource_chunks(resource_id, source_sha256, chunk_index);

CREATE INDEX IF NOT EXISTS idx_resource_chunks_vector
  ON resource_chunks(vector_id, index_state);
