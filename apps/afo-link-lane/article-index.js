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

const ARTICLE_PREFIX = "resources/articles/";
const VECTOR_INDEX_NAME = "afo-link-lane-v235-lab-resources-v1";
const VECTOR_NAMESPACE = "web-articles";
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

// ==================== index + manifest ====================

function manifestKeyFor(resourceId) { return ARTICLE_PREFIX + "manifests/" + resourceId + ".json"; }

async function findArticleManifest(env, resourceId) {
  const obj = await env.BUCKET.get(manifestKeyFor(resourceId));
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

async function indexArticleResource(env, resourceId, ingestId) {
  const node = await env.DB.prepare("SELECT id,url,title,description,domain,group_name FROM links WHERE id=?").bind(resourceId).first();
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
    const vectorId = "va1_" + resourceHash + "_" + padded;
    const header = "Resource: " + (node.title || resourceId) + "\nPart: " + (index + 1) + " of " + rawChunks.length + "\nSource: " + node.url + "\n\n";
    const embeddingText = header + item.text;
    if (estimateTokens(embeddingText) > 512) throw new Error("Chunk exceeds model input limit for " + resourceId + " chunk " + index);
    await env.BUCKET.put(chunkKey, item.text, {
      httpMetadata: { contentType: "text/plain; charset=utf-8", cacheControl: "private, max-age=0" },
      customMetadata: { resource_id: resourceId, source_sha256: sourceSha256, chunk_sha256: chunkHash, chunk_index: String(index), chunker_version: CHUNKER_VERSION }
    });
    prepared.push({ ...item, chunk_id: chunkId, vector_id: vectorId, chunk_sha256: chunkHash, chunk_key: chunkKey, chunk_index: index, embedding_text: embeddingText });
  }

  const oldMax = await env.DB.prepare("SELECT MAX(chunk_index) AS max_chunk_index FROM resource_chunks WHERE resource_id=? AND index_state='indexed'").bind(resourceId).first();
  await env.DB.prepare("UPDATE resource_chunks SET index_state='stale', updated_at=datetime('now') WHERE resource_id=? AND index_state='indexed'").bind(resourceId).run();
  await env.DB.prepare("DELETE FROM resource_chunks WHERE resource_id=? AND source_sha256=?").bind(resourceId, sourceSha256).run();

  for (let offset = 0; offset < prepared.length; offset += 16) {
    const batch = prepared.slice(offset, offset + 16);
    const embeddings = await embed(env, batch.map(v => v.embedding_text));
    const vectors = batch.map((v, i) => ({
      id: v.vector_id, values: embeddings[i], namespace: VECTOR_NAMESPACE,
      metadata: {
        resource_id: resourceId, source_sha256: sourceSha256, domain: node.domain || "", resource_type: "article",
        group_name: node.group_name || "", source_url: node.url, title: node.title || resourceId, section_title: "Part " + (v.chunk_index + 1),
        chunk_key: v.chunk_key, chunk_sha256: v.chunk_sha256, chunk_index: v.chunk_index, page_start: 1, page_end: 1,
        chunker_version: CHUNKER_VERSION, embedding_model: EMBEDDING_MODEL, embedding_pooling: EMBEDDING_POOLING
      }
    }));
    await env.RESOURCE_VECTORS.upsert(vectors);
    const statements = batch.map(v => env.DB.prepare(
      "INSERT INTO resource_chunks (chunk_id,vector_id,ingest_id,resource_id,source_sha256,extracted_text_sha256,chunker_version,chunk_config_sha256,chunk_index,section_title,page_start,page_end,char_start,char_end,token_count,chunk_sha256,chunk_key,vector_namespace,embedding_model,embedding_pooling,embedding_dimensions,index_state,indexed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'indexed',datetime('now'),datetime('now'),datetime('now'))"
    ).bind(v.chunk_id, v.vector_id, ingestId, resourceId, sourceSha256, textSha256, CHUNKER_VERSION, CHUNK_CONFIG_SHA256, v.chunk_index, "Part " + (v.chunk_index + 1), 1, 1, v.char_start, v.char_end, v.token_count, v.chunk_sha256, v.chunk_key, VECTOR_NAMESPACE, EMBEDDING_MODEL, EMBEDDING_POOLING, EMBEDDING_DIMENSIONS));
    await env.DB.batch(statements);
  }

  const previousMax = oldMax && Number.isInteger(Number(oldMax.max_chunk_index)) ? Number(oldMax.max_chunk_index) : -1;
  if (previousMax >= prepared.length) {
    const trailing = [];
    for (let index = prepared.length; index <= previousMax; index++) trailing.push("va1_" + resourceHash + "_" + pad4(index));
    for (let offset = 0; offset < trailing.length; offset += 100) await env.RESOURCE_VECTORS.deleteByIds(trailing.slice(offset, offset + 100));
  }

  const manifest = {
    resource_id: resourceId, resource_type: "article", sha256: sourceSha256, text_key: textKey, text_sha256: textSha256,
    source_url: node.url, title: node.title || resourceId, group_name: node.group_name || "", domain: node.domain || "",
    truncated,
    chunking: {
      chunker_version: CHUNKER_VERSION, config_sha256: CHUNK_CONFIG_SHA256, chunk_count: prepared.length,
      namespace: VECTOR_NAMESPACE, vectorize_index: VECTOR_INDEX_NAME, embedding_model: EMBEDDING_MODEL,
      embedding_pooling: EMBEDDING_POOLING, embedding_dimensions: EMBEDDING_DIMENSIONS, completed_at: new Date().toISOString()
    }
  };
  await env.BUCKET.put(manifestKeyFor(resourceId), JSON.stringify(manifest, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "private, max-age=0" } });
  return manifest;
}

export { indexArticleResource, findArticleManifest, ARTICLE_PREFIX, VECTOR_INDEX_NAME, VECTOR_NAMESPACE, CHUNKER_VERSION };
