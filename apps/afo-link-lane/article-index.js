// article-index.js -- lazy on-demand chunk/embed/index pipeline for non-PDF
// (web article) resource nodes. Roadmap Step 2 of the universal node-chat plan.
//
// Design note: this deliberately does NOT modify or import from
// resource-retrieval.js's PDF pipeline (indexOne/chunkPdfText/etc). It is a
// parallel, additive pipeline that reuses the same Vectorize index, D1 table,
// and embedding model/contract, but writes its manifests under a distinct R2
// prefix (ARTICLE_PREFIX) so it can never collide with or destabilize the
// already-verified Financial Aid pilot path (368/369 acceptance). The only
// touch point into the existing pipeline is one additive lookup+fallback
// branch in resource-retrieval.js's apiQueryPilotResource.
//
// Phase split (multi-tier streaming chat roadmap, step 1, corrected scope --
// see CairnStone stones dba12b310aad / 11bc23fec615): indexing is split into
// Phase A (fetch, extract, chunk, write R2 + resource_chunks[pending] +
// resource_chunks_fts) and Phase B (embed, upsert Vectorize, poll readiness,
// flip resource_chunks to 'indexed', write the completed manifest). Phase A
// alone is enough to answer via the real D1 FTS5 lexical_only retrieval path
// (queryLexicalOnly) -- no Vectorize dependency. indexArticleResource() below
// remains the synchronous A-then-B orchestrator for full backward
// compatibility with the existing single-JSON /api/resource-chat/turn
// contract and the on-demand fallback in resource-retrieval.js; callers that
// want the fast instant-tier path should call runPhaseA + runPhaseB
// separately (see resource-node-chat.js's streaming handler).

const ARTICLE_PREFIX = "resources/articles/";
const VECTOR_INDEX_NAME = "afo-link-lane-v235-lab-resources-v1";
const VECTOR_NAMESPACE = "web-articles";
const DEFAULT_UNIVERSE_ID = "default";
function normalizeUniverseId(value) { return String(value || DEFAULT_UNIVERSE_ID).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || DEFAULT_UNIVERSE_ID; }
function vectorNamespaceFor(universeId) { const normalized = normalizeUniverseId(universeId); return normalized === DEFAULT_UNIVERSE_ID ? VECTOR_NAMESPACE : normalized + "--" + VECTOR_NAMESPACE; }
const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBEDDING_POOLING = "cls";
const EMBEDDING_DIMENSIONS = 768;
const CHUNKER_VERSION = "article-plain-v1";
const CHUNK_TARGET_TOKENS = 320;
const CHUNK_HARD_CAP_TOKENS = 448;
const CHUNK_OVERLAP_TOKENS = 48;
const CHUNK_CONFIG_SHA256 = "article-plain-v1-320-448-48";
const MAX_ARTICLE_TEXT_BYTES = 400 * 1024;
const MAX_FETCH_HTML_BYTES = 500000;
const FTS_BACKFILL_BATCH_SIZE = 20;

// ==================== article fetch + extraction ====================
// Deliberately self-contained (not imported from worker.js) to avoid coupling
// this indexing pipeline's correctness to the interactive /content/read
// reader UI code path, and vice versa. Uses the same extraction strategy.

function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function readerCleanTextParts(text) {
  const decoded = decodeHtmlEntities(String(text || "")).replace(/\r/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
  const parts = decoded.split(/\n+/).map(p => p.trim()).filter(p => {
    if (p.length < 60) return false;
    if (/^cookies?\b/i.test(p)) return false;
    if (/^(share|subscribe|advertisement|sign up|log in|menu)$/i.test(p)) return false;
    return true;
  });
  const seen = new Set(), out = [];
  for (const p of parts) {
    const key = p.toLowerCase().slice(0, 120);
    if (!seen.has(key)) { seen.add(key); out.push(p.slice(0, 1200)); }
    if (out.length >= 400) break; // higher cap than the interactive reader view -- this feeds indexing, not a single screen
  }
  return out;
}

function readerParagraphsFromHtml(html) {
  const article = (html.match(/<article[\s\S]*?<\/article>/i) || [])[0];
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [])[0];
  const body = (html.match(/<body[\s\S]*?<\/body>/i) || [])[0];
  let block = article || main || body || html;
  block = block
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(block).replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  return readerCleanTextParts(decoded);
}

async function fetchArticleParagraphs(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AFOLinkLaneArticleIndex/1.0)", "Accept": "text/html,application/xhtml+xml" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error("Article fetch failed: HTTP " + res.status);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("html") && !contentType.includes("text")) throw new Error("Unsupported content type: " + contentType);
  const html = (await res.text()).slice(0, MAX_FETCH_HTML_BYTES);
  const paragraphs = readerParagraphsFromHtml(html);
  if (!paragraphs.length) throw new Error("No readable article text found for indexing");
  return paragraphs;
}

// ==================== hashing / chunking / embedding ====================
// Same contract shape as resource-retrieval.js's PDF pipeline (target/hard
// cap tokens, overlap, stable deterministic IDs) but windows over the whole
// article as one continuous text instead of splitting on PDF form-feed page
// boundaries -- there is no real pagination for an HTML article.

async function sha256Hex(value) {
  const bytes = value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}

function estimateTokens(text) { return Math.max(1, Math.ceil(new TextEncoder().encode(String(text || "")).byteLength / 4)); }
function pad4(v) { return String(v).padStart(4, "0"); }

function findBreak(text, start, targetEnd, hardEnd) {
  const floor = Math.min(text.length, start + Math.max(240, Math.floor((targetEnd - start) * 0.62)));
  for (const marker of ["\n\n", "\n", ". ", "; ", ", ", " "]) {
    const at = text.lastIndexOf(marker, Math.min(hardEnd, text.length));
    if (at >= floor) return Math.min(text.length, at + marker.length);
  }
  return Math.min(text.length, hardEnd);
}

function chunkArticleText(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const target = CHUNK_TARGET_TOKENS * 4, hard = CHUNK_HARD_CAP_TOKENS * 4, overlap = CHUNK_OVERLAP_TOKENS * 4;
  const chunks = [];
  let start = 0;
  while (start < raw.length) {
    while (start < raw.length && /\s/.test(raw[start])) start++;
    if (start >= raw.length) break;
    const end = findBreak(raw, start, Math.min(raw.length, start + target), Math.min(raw.length, start + hard));
    const rawPart = raw.slice(start, end);
    const lead = (rawPart.match(/^\s*/) || [""])[0].length;
    const tail = (rawPart.slice(lead).match(/\s*$/) || [""])[0].length;
    const cleanStart = start + lead, cleanEnd = Math.max(cleanStart, end - tail);
    const chunkText = raw.slice(cleanStart, cleanEnd);
    if (chunkText.length >= 40) {
      chunks.push({ char_start: cleanStart, char_end: cleanEnd, text: chunkText, token_count: estimateTokens(chunkText) });
    }
    if (end >= raw.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

function embeddingRows(result) {
  if (result && Array.isArray(result.data) && Array.isArray(result.data[0])) return result.data;
  if (result && Array.isArray(result.data) && result.data.length === EMBEDDING_DIMENSIONS) return [result.data];
  if (result && Array.isArray(result.embeddings)) return result.embeddings;
  if (Array.isArray(result) && Array.isArray(result[0])) return result;
  throw new Error("Workers AI embedding response shape was not recognized");
}

async function embed(env, texts) {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: texts, pooling: EMBEDDING_POOLING });
  const rows = embeddingRows(result);
  if (rows.length !== texts.length) throw new Error("Embedding row count mismatch");
  for (const row of rows) if (!Array.isArray(row) || row.length !== EMBEDDING_DIMENSIONS) throw new Error("Embedding dimension mismatch");
  return rows;
}

const VECTOR_READINESS_DELAYS_MS = [0, 250, 500, 1000, 2000, 4000];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForVectorReadiness(env, values, expectedVectorId, resourceId, sourceSha256, universeId = DEFAULT_UNIVERSE_ID) {
  let lastError = null;
  let waitedMs = 0;
  for (let attempt = 0; attempt < VECTOR_READINESS_DELAYS_MS.length; attempt++) {
    const delay = VECTOR_READINESS_DELAYS_MS[attempt];
    if (delay) { await sleep(delay); waitedMs += delay; }
    try {
      const result = await env.RESOURCE_VECTORS.query(values, {
        topK: 3,
        namespace: vectorNamespaceFor(universeId),
        filter: normalizeUniverseId(universeId) === DEFAULT_UNIVERSE_ID ? { resource_id: resourceId, source_sha256: sourceSha256 } : { universe_id: normalizeUniverseId(universeId), resource_id: resourceId, source_sha256: sourceSha256 },
        returnValues: false,
        returnMetadata: "all"
      });
      const matches = Array.isArray(result && result.matches) ? result.matches : [];
      const ready = matches.some(match => match && (match.id === expectedVectorId || (match.metadata && match.metadata.resource_id === resourceId && match.metadata.source_sha256 === sourceSha256)));
      if (ready) return { attempts: attempt + 1, waited_ms: waitedMs };
    } catch (error) {
      lastError = error;
    }
  }
  const suffix = lastError ? ": " + (lastError.message || String(lastError)) : "";
  throw new Error("Vectorize indexing was not queryable after " + waitedMs + "ms of bounded readiness polling for " + resourceId + suffix);
}

// ==================== index + manifest ====================

function manifestKeyFor(resourceId) { return ARTICLE_PREFIX + "manifests/" + resourceId + ".json"; }

async function findArticleManifest(env, resourceId) {
  const obj = await env.BUCKET.get(manifestKeyFor(resourceId));
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

// ---- Phase A: fetch, extract, chunk, write R2 + resource_chunks[pending] +
// resource_chunks_fts. No embedding, no Vectorize call. Target 2-4s. ----
async function runPhaseA(env, resourceId, ingestId, universeId = DEFAULT_UNIVERSE_ID) {
  universeId = normalizeUniverseId(universeId);
  const node = await env.DB.prepare("SELECT id,url,title,description,domain,group_name,universe_id FROM links WHERE id=? AND universe_id=?").bind(resourceId, universeId).first();
  if (!node) throw new Error("Resource node not found for " + resourceId);
  if (!node.url) throw new Error("Resource node has no URL to index for " + resourceId);

  const paragraphs = await fetchArticleParagraphs(node.url);
  let fullText = paragraphs.join("\n\n");
  let truncated = false;
  if (fullText.length > MAX_ARTICLE_TEXT_BYTES) { fullText = fullText.slice(0, MAX_ARTICLE_TEXT_BYTES); truncated = true; }
  const sourceSha256 = await sha256Hex(fullText);
  const textSha256 = sourceSha256; // single fetch -> extracted text and source share one hash for this pipeline

  const textKey = ARTICLE_PREFIX + "text/" + resourceId + "-" + sourceSha256.slice(0, 16) + ".txt";
  await env.BUCKET.put(textKey, fullText, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });

  const rawChunks = chunkArticleText(fullText);
  if (!rawChunks.length) throw new Error("Chunker produced no chunks for " + resourceId);

  const resourceHash = (await sha256Hex(resourceId)).slice(0, 24);
  const prepared = [];
  for (let index = 0; index < rawChunks.length; index++) {
    const item = rawChunks[index];
    const chunkHash = await sha256Hex(item.text);
    const padded = pad4(index);
    const chunkKey = ARTICLE_PREFIX + "chunks/" + sourceSha256 + "/" + padded + "-" + chunkHash.slice(0, 24) + ".txt";
    const chunkId = "ca1_" + sourceSha256.slice(0, 24) + "_" + padded + "_" + chunkHash.slice(0, 24);
    const vectorId = "va1_" + resourceHash + "_" + padded; // deterministic -- computable before embedding exists
    const header = "Resource: " + (node.title || resourceId) + "\nPart: " + (index + 1) + " of " + rawChunks.length + "\nSource: " + node.url + "\n\n";
    const embeddingText = header + item.text;
    if (estimateTokens(embeddingText) > 512) throw new Error("Chunk exceeds model input limit for " + resourceId + " chunk " + index);
    await env.BUCKET.put(chunkKey, item.text, {
      httpMetadata: { contentType: "text/plain; charset=utf-8", cacheControl: "private, max-age=0" },
      customMetadata: { resource_id: resourceId, source_sha256: sourceSha256, chunk_sha256: chunkHash, chunk_index: String(index), chunker_version: CHUNKER_VERSION }
    });
    prepared.push({ ...item, chunk_id: chunkId, vector_id: vectorId, chunk_sha256: chunkHash, chunk_key: chunkKey, chunk_index: index, embedding_text: embeddingText });
  }

  const oldMax = await env.DB.prepare("SELECT MAX(chunk_index) AS max_chunk_index FROM resource_chunks WHERE universe_id=? AND resource_id=? AND index_state='indexed'").bind(universeId, resourceId).first();
  await env.DB.prepare("UPDATE resource_chunks SET index_state='stale', updated_at=datetime('now') WHERE universe_id=? AND resource_id=? AND index_state='indexed'").bind(universeId, resourceId).run();
  await env.DB.prepare("DELETE FROM resource_chunks WHERE universe_id=? AND resource_id=? AND source_sha256=?").bind(universeId, resourceId, sourceSha256).run();
  await env.DB.prepare("DELETE FROM resource_chunks_fts WHERE universe_id=? AND resource_id=? AND source_sha256=?").bind(universeId, resourceId, sourceSha256).run();

  // Write resource_chunks rows as 'pending' (Phase B flips them to 'indexed'
  // once Vectorize is confirmed queryable) and populate the FTS table --
  // this is the part that makes lexical_only retrieval usable the instant
  // Phase A completes, independent of Phase B's state.
  for (let offset = 0; offset < prepared.length; offset += 16) {
    const batch = prepared.slice(offset, offset + 16);
    const chunkStatements = batch.map(v => env.DB.prepare(
      "INSERT OR IGNORE INTO resource_chunks (chunk_id,vector_id,ingest_id,universe_id,resource_id,source_sha256,extracted_text_sha256,chunker_version,chunk_config_sha256,chunk_index,section_title,page_start,page_end,char_start,char_end,token_count,chunk_sha256,chunk_key,vector_namespace,embedding_model,embedding_pooling,embedding_dimensions,index_state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'),datetime('now'))"
    ).bind(v.chunk_id, v.vector_id, ingestId, universeId, resourceId, sourceSha256, textSha256, CHUNKER_VERSION, CHUNK_CONFIG_SHA256, v.chunk_index, "Part " + (v.chunk_index + 1), 1, 1, v.char_start, v.char_end, v.token_count, v.chunk_sha256, v.chunk_key, vectorNamespaceFor(universeId), EMBEDDING_MODEL, EMBEDDING_POOLING, EMBEDDING_DIMENSIONS));
    const ftsStatements = batch.map(v => env.DB.prepare(
      "INSERT OR IGNORE INTO resource_chunks_fts (text, chunk_id, universe_id, resource_id, source_sha256, chunk_index) VALUES (?,?,?,?,?,?)"
    ).bind(v.text, v.chunk_id, universeId, resourceId, sourceSha256, v.chunk_index));
    await env.DB.batch([...chunkStatements, ...ftsStatements]);
  }

  return { universe_id: universeId, resource_id: resourceId, node, source_sha256: sourceSha256, text_sha256: textSha256, text_key: textKey, truncated, resource_hash: resourceHash, prepared, chunk_count: prepared.length };
}

// ---- Phase B: embed, upsert Vectorize, poll readiness, flip resource_chunks
// to 'indexed', write the completed manifest. Slow (embedding + readiness
// poll dominate); intended to run backgrounded via ctx.waitUntil(). ----
async function runPhaseB(env, phaseA) {
  const { universe_id: universeId, resource_id: resourceId, node, source_sha256: sourceSha256, text_sha256: textSha256, text_key: textKey, truncated, resource_hash: resourceHash, prepared } = phaseA;
  const vectorNamespace = vectorNamespaceFor(universeId);

  const oldMax = await env.DB.prepare("SELECT MAX(chunk_index) AS max_chunk_index FROM resource_chunks WHERE universe_id=? AND resource_id=? AND index_state='indexed' AND source_sha256!=?").bind(universeId, resourceId, sourceSha256).first();

  let readinessValues = null;
  for (let offset = 0; offset < prepared.length; offset += 16) {
    const batch = prepared.slice(offset, offset + 16);
    const embeddings = await embed(env, batch.map(v => v.embedding_text));
    if (!readinessValues) readinessValues = embeddings[0];
    const vectors = batch.map((v, i) => ({
      id: v.vector_id, values: embeddings[i], namespace: vectorNamespace,
      metadata: {
        universe_id: universeId, resource_id: resourceId, source_sha256: sourceSha256, domain: node.domain || "", resource_type: "article",
        group_name: node.group_name || "", source_url: node.url, title: node.title || resourceId, section_title: "Part " + (v.chunk_index + 1),
        chunk_key: v.chunk_key, chunk_sha256: v.chunk_sha256, chunk_index: v.chunk_index, page_start: 1, page_end: 1,
        chunker_version: CHUNKER_VERSION, embedding_model: EMBEDDING_MODEL, embedding_pooling: EMBEDDING_POOLING
      }
    }));
    await env.RESOURCE_VECTORS.upsert(vectors);
  }

  await env.DB.prepare("UPDATE resource_chunks SET index_state='indexed', indexed_at=datetime('now'), updated_at=datetime('now') WHERE universe_id=? AND resource_id=? AND source_sha256=?").bind(universeId, resourceId, sourceSha256).run();

  const previousMax = oldMax && Number.isInteger(Number(oldMax.max_chunk_index)) ? Number(oldMax.max_chunk_index) : -1;
  if (previousMax >= prepared.length) {
    const trailing = [];
    for (let index = prepared.length; index <= previousMax; index++) trailing.push("va1_" + resourceHash + "_" + pad4(index));
    for (let offset = 0; offset < trailing.length; offset += 100) await env.RESOURCE_VECTORS.deleteByIds(trailing.slice(offset, offset + 100));
  }

  if (!readinessValues || !prepared[0]) throw new Error("Vector readiness probe could not be prepared for " + resourceId);
  const readiness = await waitForVectorReadiness(env, readinessValues, prepared[0].vector_id, resourceId, sourceSha256, universeId);

  const manifest = {
    universe_id: universeId, resource_id: resourceId, resource_type: "article", sha256: sourceSha256, text_key: textKey, text_sha256: textSha256,
    source_url: node.url, title: node.title || resourceId, group_name: node.group_name || "", domain: node.domain || "",
    truncated,
    chunking: {
      chunker_version: CHUNKER_VERSION, config_sha256: CHUNK_CONFIG_SHA256, chunk_count: prepared.length,
      namespace: vectorNamespace, vectorize_index: VECTOR_INDEX_NAME, embedding_model: EMBEDDING_MODEL,
      embedding_pooling: EMBEDDING_POOLING, embedding_dimensions: EMBEDDING_DIMENSIONS, readiness, completed_at: new Date().toISOString()
    }
  };
  await env.BUCKET.put(manifestKeyFor(resourceId), JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, max-age=0" } });
  return manifest;
}

// Backward-compatible synchronous orchestrator -- runs Phase A then Phase B
// inline and returns the completed manifest, exactly like the pre-split
// function. Used by the existing single-JSON /api/resource-chat/turn
// contract and the on-demand fallback in resource-retrieval.js so neither
// changes behavior from this refactor.
async function indexArticleResource(env, resourceId, ingestId, universeId = DEFAULT_UNIVERSE_ID) {
  const phaseA = await runPhaseA(env, resourceId, ingestId, universeId);
  return runPhaseB(env, phaseA);
}

// ==================== real D1 FTS5 lexical-only retrieval ====================
// Genuine independent retrieval path -- no Vectorize call, usable the
// instant Phase A completes regardless of Phase B's state. Replaces the
// previous incorrect assumption that lexicalMetrics() in
// resource-retrieval-quality.js already provided this (it only re-ranks
// results Vectorize already returned; see dba12b310aad).

function ftsMatchQuery(question) {
  const words = (String(question || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1).slice(0, 24);
  const unique = [...new Set(words)];
  if (!unique.length) return "";
  return unique.map(w => '"' + w.replace(/"/g, '""') + '"').join(" OR ");
}

async function queryLexicalOnly(env, resourceId, sourceSha256, question, topK, universeId = DEFAULT_UNIVERSE_ID) {
  universeId = normalizeUniverseId(universeId);
  const matchQuery = ftsMatchQuery(question);
  if (!matchQuery) return [];
  const node = await env.DB.prepare("SELECT title,url FROM links WHERE id=? AND universe_id=?").bind(resourceId, universeId).first();
  const limit = Math.max(1, Math.min(Number(topK) || 8, 20));
  const rows = await env.DB.prepare(
    "SELECT chunk_id, chunk_index, text, bm25(resource_chunks_fts) AS rank FROM resource_chunks_fts WHERE resource_chunks_fts MATCH ? AND universe_id = ? AND resource_id = ? AND source_sha256 = ? ORDER BY rank LIMIT ?"
  ).bind(matchQuery, universeId, resourceId, sourceSha256, limit).all();
  const title = (node && node.title) || resourceId;
  const sourceUrl = node && node.url;
  return (rows.results || []).map(row => ({
    // bm25() is negative-is-better in SQLite FTS5; flip sign so higher score
    // = more relevant, matching the vector_score convention used elsewhere.
    score: row.rank != null ? Number((-row.rank).toFixed(4)) : 0,
    resource_id: resourceId,
    title,
    source_url: sourceUrl,
    source_sha256: sourceSha256,
    // page_start/page_end are always 1/1 for articles (no real pagination),
    // matching the convention Phase B's Vectorize metadata already uses --
    // kept here so evidenceBlock()/cvEvidenceCard() render lexical-only
    // evidence with the same shape as hybrid evidence, no special-casing.
    page_start: 1, page_end: 1,
    chunk_index: Number(row.chunk_index),
    chunk_id: row.chunk_id,
    citation: "[" + title + " — part " + (Number(row.chunk_index) + 1) + "]",
    text: row.text,
    retrieval_mode: "lexical_only"
  }));
}

// ==================== one-time backfill for pre-existing indexed nodes ====================
// Populates resource_chunks_fts for chunks that were written before this
// migration existed. Chunk text for these rows lives only in R2 (chunk_key);
// this reads each one and inserts it into FTS. Idempotent across repeated
// runs -- rows already present in resource_chunks_fts (by chunk_id) are
// skipped, not re-inserted. Pass dryRun:true to size the job before running.
async function backfillFts(env, { dryRun = false, batchSize = FTS_BACKFILL_BATCH_SIZE } = {}) {
  const indexedRows = (await env.DB.prepare(
    "SELECT chunk_id, universe_id, resource_id, source_sha256, chunk_index, chunk_key FROM resource_chunks WHERE index_state='indexed'"
  ).all()).results || [];
  const existingRows = (await env.DB.prepare("SELECT chunk_id FROM resource_chunks_fts").all()).results || [];
  const existing = new Set(existingRows.map(r => r.chunk_id));
  const todo = indexedRows.filter(r => !existing.has(r.chunk_id));

  if (dryRun) {
    return { ok: true, dry_run: true, total_indexed_rows: indexedRows.length, already_in_fts: indexedRows.length - todo.length, to_backfill: todo.length };
  }

  let backfilled = 0;
  const failed = [];
  for (let offset = 0; offset < todo.length; offset += batchSize) {
    const batch = todo.slice(offset, offset + batchSize);
    const fetched = await Promise.all(batch.map(async row => {
      try {
        const obj = await env.BUCKET.get(row.chunk_key);
        if (!obj) return { row, error: "R2 object missing for chunk_key" };
        return { row, text: await obj.text() };
      } catch (e) { return { row, error: e.message || String(e) }; }
    }));
    const statements = [];
    for (const item of fetched) {
      if (item.error) { failed.push({ chunk_id: item.row.chunk_id, error: item.error }); continue; }
      statements.push(env.DB.prepare(
        "INSERT OR IGNORE INTO resource_chunks_fts (text, chunk_id, universe_id, resource_id, source_sha256, chunk_index) VALUES (?,?,?,?,?,?)"
      ).bind(item.text, item.row.chunk_id, item.row.universe_id || DEFAULT_UNIVERSE_ID, item.row.resource_id, item.row.source_sha256, item.row.chunk_index));
    }
    if (statements.length) { await env.DB.batch(statements); backfilled += statements.length; }
  }
  return { ok: failed.length === 0, total_indexed_rows: indexedRows.length, already_in_fts: indexedRows.length - todo.length, backfilled, failed };
}

export {
  indexArticleResource, runPhaseA, runPhaseB, findArticleManifest,
  queryLexicalOnly, backfillFts,
  ARTICLE_PREFIX, VECTOR_INDEX_NAME, VECTOR_NAMESPACE, CHUNKER_VERSION, waitForVectorReadiness
};
