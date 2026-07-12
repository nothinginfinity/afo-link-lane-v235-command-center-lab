-- FTS5 virtual table over chunk text, enabling a real D1-only lexical
-- retrieval path independent of Vectorize. Populated going forward by
-- Phase A of the article indexing pipeline (article-index.js), and
-- backfilled once for resources chunked before this migration existed
-- (see /admin/backfill-fts). Applied live via the D1 query API ahead of
-- this file landing in a deploy, per existing project convention of not
-- waiting on a deploy pipeline for schema changes -- this file exists so
-- a fresh environment (or afo-link-lane-v235-lab-2) stays in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS resource_chunks_fts USING fts5(
  text,
  chunk_id UNINDEXED,
  resource_id UNINDEXED,
  source_sha256 UNINDEXED,
  chunk_index UNINDEXED,
  tokenize = 'porter unicode61'
);
