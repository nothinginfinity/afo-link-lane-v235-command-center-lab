const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Lab-Ingest-Token"
};

export const RESOURCE_RETRIEVAL = Object.freeze({
  indexName: "afo-link-lane-v235-lab-resources-v1",
  namespace: "financial-aid-toolkit",
  model: "@cf/baai/bge-base-en-v1.5",
  pooling: "cls",
  dimensions: 768,
  chunkerVersion: "pdf-page-v1",
  maxChunkTokens: 448
});

function json(value, status = 200) {
  return Response.json(value, { status, headers: CORS });
}

function constantTimeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function authorized(env, request) {
  if (!env.LAB_INGEST_TOKEN) {
    return { ok: false, response: json({ ok: false, error: "LAB_INGEST_TOKEN is not configured" }, 503) };
  }
  const supplied = request.headers.get("X-Lab-Ingest-Token") || "";
  if (!constantTimeEqual(supplied, env.LAB_INGEST_TOKEN)) {
    return { ok: false, response: json({ ok: false, error: "Unauthorized" }, 401) };
  }
  return { ok: true };
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : value instanceof ArrayBuffer
        ? value
        : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

function validSha(value) {
  return /^[a-f0-9]{64}$/.test(String(value || ""));
}

function safeString(value, max = 2048) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function makeIngestId() {
  return `ing_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function stableVectorId(resourceHash, chunkIndex) {
  return `v1_${resourceHash.slice(0, 24)}_${String(chunkIndex).padStart(4, "0")}`;
}

function versionedChunkId(sourceSha, chunkIndex, chunkSha) {
  return `c1_${sourceSha.slice(0, 24)}_${String(chunkIndex).padStart(4, "0")}_${chunkSha.slice(0, 24)}`;
}

function chunkR2Key(sourceSha, chunkIndex, chunkSha) {
  return `resources/financial-aid-toolkit/chunks/${sourceSha}/${String(chunkIndex).padStart(4, "0")}-${chunkSha.slice(0, 24)}.txt`;
}

async function loadPilotContext(env, resourceId) {
  const row = await env.DB.prepare(
    "SELECT id,url,title,description,domain,group_name FROM links WHERE id=?"
  ).bind(resourceId).first();
  if (!row) {
    return { ok: false, response: json({ ok: false, error: "Resource node not found" }, 404) };
  }
  if (row.group_name !== "Financial Aid Toolkit" || row.domain !== "studentaid.gov") {
    return { ok: false, response: json({ ok: false, error: "Resource node failed group/domain policy" }, 403) };
  }
  const manifestKey = `resources/financial-aid-toolkit/manifests/${resourceId}.json`;
  const manifestObject = await env.BUCKET.get(manifestKey);
  if (!manifestObject) {
    return { ok: false, response: json({ ok: false, error: "Resource manifest not found" }, 404) };
  }
  let manifest;
  try {
    manifest = JSON.parse(await manifestObject.text());
  } catch {
    return { ok: false, response: json({ ok: false, error: "Stored resource manifest is invalid" }, 500) };
  }
  if (!validSha(manifest.sha256) || !validSha(manifest.text_sha256) || !manifest.text_key) {
    return { ok: false, response: json({ ok: false, error: "Resource manifest is not extraction-ready" }, 409) };
  }
  return { ok: true, row, manifest, manifestKey };
}

function validateChunks(payload, manifest) {
  const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
  if (!chunks.length || chunks.length > 250) {
    return { ok: false, error: "chunks must contain between 1 and 250 entries" };
  }
  const normalized = [];
  for (let i = 0; i < chunks.length; i++) {
    const raw = chunks[i] || {};
    const chunkIndex = Number(raw.chunk_index);
    const pageStart = Number(raw.page_start);
    const pageEnd = Number(raw.page_end);
    const charStart = Number(raw.char_start);
    const charEnd = Number(raw.char_end);
    const tokenCount = Number(raw.token_count);
    const text = String(raw.text || "");
    const citationHeader = safeString(raw.citation_header, 512);
    const chunkSha = safeString(raw.chunk_sha256, 64).toLowerCase();
    if (chunkIndex !== i) return { ok: false, error: `chunk_index must be sequential at ${i}` };
    if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd) || pageStart < 1 || pageEnd < pageStart) {
      return { ok: false, error: `invalid page range for chunk ${i}` };
    }
    if (pageEnd - pageStart > 1 || pageEnd > Number(manifest.page_count || 0)) {
      return { ok: false, error: `chunk ${i} exceeds the page-span policy` };
    }
    if (!Number.isInteger(charStart) || !Number.isInteger(charEnd) || charStart < 0 || charEnd <= charStart) {
      return { ok: false, error: `invalid character range for chunk ${i}` };
    }
    if (!Number.isInteger(tokenCount) || tokenCount < 1 || tokenCount > RESOURCE_RETRIEVAL.maxChunkTokens) {
      return { ok: false, error: `chunk ${i} exceeds the token policy` };
    }
    if (!text.trim() || new TextEncoder().encode(text).byteLength > 65536) {
      return { ok: false, error: `invalid text for chunk ${i}` };
    }
    if (!validSha(chunkSha)) return { ok: false, error: `invalid chunk SHA-256 for chunk ${i}` };
    normalized.push({
      chunkIndex,
      pageStart,
      pageEnd,
      charStart,
      charEnd,
      tokenCount,
      text,
      citationHeader,
      sectionTitle: safeString(raw.section_title, 240) || null,
      chunkSha
    });
  }
  return { ok: true, chunks: normalized };
}

async function embedTexts(env, texts) {
  const result = await env.AI.run(RESOURCE_RETRIEVAL.model, {
    text: texts,
    pooling: RESOURCE_RETRIEVAL.pooling
  });
  const data = result && Array.isArray(result.data) ? result.data : null;
  if (!data || data.length !== texts.length) {
    throw new Error("Workers AI returned an unexpected embedding batch");
  }
  for (const vector of data) {
    if (!Array.isArray(vector) || vector.length !== RESOURCE_RETRIEVAL.dimensions) {
      throw new Error("Workers AI returned an embedding with unexpected dimensions");
    }
  }
  return data;
}

function insertStatement(env, row) {
  return env.DB.prepare(
    `INSERT INTO resource_chunks (
      chunk_id,vector_id,ingest_id,resource_id,source_sha256,extracted_text_sha256,
      chunker_version,chunk_config_sha256,chunk_index,section_title,page_start,page_end,
      char_start,char_end,token_count,chunk_sha256,chunk_key,vector_namespace,
      embedding_model,embedding_pooling,embedding_dimensions,index_state,indexed_at,
      error_text,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',NULL,NULL,datetime('now'),datetime('now'))
    ON CONFLICT(chunk_id) DO UPDATE SET
      vector_id=excluded.vector_id,
      ingest_id=excluded.ingest_id,
      extracted_text_sha256=excluded.extracted_text_sha256,
      chunker_version=excluded.chunker_version,
      chunk_config_sha256=excluded.chunk_config_sha256,
      section_title=excluded.section_title,
      page_start=excluded.page_start,
      page_end=excluded.page_end,
      char_start=excluded.char_start,
      char_end=excluded.char_end,
      token_count=excluded.token_count,
      chunk_key=excluded.chunk_key,
      vector_namespace=excluded.vector_namespace,
      embedding_model=excluded.embedding_model,
      embedding_pooling=excluded.embedding_pooling,
      embedding_dimensions=excluded.embedding_dimensions,
      index_state='pending',
      indexed_at=NULL,
      error_text=NULL,
      updated_at=datetime('now')`
  ).bind(
    row.chunkId,
    row.vectorId,
    row.ingestId,
    row.resourceId,
    row.sourceSha,
    row.textSha,
    RESOURCE_RETRIEVAL.chunkerVersion,
    row.configSha,
    row.chunkIndex,
    row.sectionTitle,
    row.pageStart,
    row.pageEnd,
    row.charStart,
    row.charEnd,
    row.tokenCount,
    row.chunkSha,
    row.chunkKey,
    RESOURCE_RETRIEVAL.namespace,
    RESOURCE_RETRIEVAL.model,
    RESOURCE_RETRIEVAL.pooling,
    RESOURCE_RETRIEVAL.dimensions
  );
}

export async function apiIndexPilotChunks(env, request) {
  const auth = authorized(env, request);
  if (!auth.ok) return auth.response;
  if (!env.AI || !env.RESOURCE_VECTORS) {
    return json({ ok: false, error: "AI or RESOURCE_VECTORS binding is not configured" }, 503);
  }

  const payload = await request.json().catch(() => null);
  if (!payload) return json({ ok: false, error: "Valid JSON body is required" }, 400);

  const resourceId = safeString(payload.resource_id, 160);
  const sourceSha = safeString(payload.source_sha256, 64).toLowerCase();
  const textSha = safeString(payload.extracted_text_sha256, 64).toLowerCase();
  const configSha = safeString(payload.chunk_config_sha256, 64).toLowerCase();
  if (!resourceId || !validSha(sourceSha) || !validSha(textSha) || !validSha(configSha)) {
    return json({ ok: false, error: "resource_id and valid source/text/config SHA-256 values are required" }, 400);
  }
  if (payload.chunker_version !== RESOURCE_RETRIEVAL.chunkerVersion) {
    return json({ ok: false, error: "Unsupported chunker_version" }, 400);
  }
  if (payload.embedding_pooling !== RESOURCE_RETRIEVAL.pooling) {
    return json({ ok: false, error: "Embedding pooling must be cls" }, 400);
  }

  const context = await loadPilotContext(env, resourceId);
  if (!context.ok) return context.response;
  const { row, manifest, manifestKey } = context;
  if (manifest.sha256 !== sourceSha || manifest.text_sha256 !== textSha) {
    return json({
      ok: false,
      error: "Chunk payload does not match the current resource manifest",
      manifest_source_sha256: manifest.sha256,
      manifest_text_sha256: manifest.text_sha256
    }, 409);
  }

  const textObject = await env.BUCKET.get(manifest.text_key);
  if (!textObject) return json({ ok: false, error: "Extracted text object not found" }, 404);
  const textBytes = await textObject.arrayBuffer();
  const computedTextSha = await sha256Hex(textBytes);
  if (computedTextSha !== textSha) {
    return json({ ok: false, error: "Stored extracted text SHA-256 mismatch", computed: computedTextSha }, 409);
  }

  const checked = validateChunks(payload, manifest);
  if (!checked.ok) return json({ ok: false, error: checked.error }, 400);

  const existingSameSource = (
    await env.DB.prepare(
      "SELECT chunk_id,chunk_index,chunk_sha256,chunk_config_sha256,index_state FROM resource_chunks WHERE resource_id=? AND source_sha256=? ORDER BY chunk_index"
    ).bind(resourceId, sourceSha).all()
  ).results || [];
  if (existingSameSource.some((entry) => entry.chunk_config_sha256 !== configSha || Number(entry.chunk_index) >= checked.chunks.length || entry.chunk_sha256 !== checked.chunks[Number(entry.chunk_index)].chunkSha)) {
    return json({
      ok: false,
      error: "This source hash already has a different chunk layout; create a versioned migration before rechunking it"
    }, 409);
  }

  const resourceHash = await sha256Hex(resourceId);
  const ingestId = makeIngestId();
  const prepared = [];
  for (const chunk of checked.chunks) {
    const computedChunkSha = await sha256Hex(chunk.text);
    if (computedChunkSha !== chunk.chunkSha) {
      return json({ ok: false, error: `Chunk SHA-256 mismatch at index ${chunk.chunkIndex}`, computed: computedChunkSha }, 409);
    }
    const vectorId = stableVectorId(resourceHash, chunk.chunkIndex);
    const chunkId = versionedChunkId(sourceSha, chunk.chunkIndex, chunk.chunkSha);
    const chunkKey = chunkR2Key(sourceSha, chunk.chunkIndex, chunk.chunkSha);
    prepared.push({
      ...chunk,
      resourceId,
      sourceSha,
      textSha,
      configSha,
      ingestId,
      vectorId,
      chunkId,
      chunkKey
    });
  }

  const previousIndexed = (
    await env.DB.prepare(
      "SELECT vector_id,chunk_index FROM resource_chunks WHERE resource_id=? AND index_state='indexed' ORDER BY chunk_index"
    ).bind(resourceId).all()
  ).results || [];

  try {
    await env.DB.batch(prepared.map((entry) => insertStatement(env, entry)));

    await Promise.all(prepared.map((entry) =>
      env.BUCKET.put(entry.chunkKey, entry.text, {
        httpMetadata: {
          contentType: "text/plain; charset=utf-8",
          cacheControl: "private, max-age=0"
        },
        customMetadata: {
          resource_id: resourceId,
          source_sha256: sourceSha,
          chunk_sha256: entry.chunkSha,
          chunk_index: String(entry.chunkIndex),
          page_start: String(entry.pageStart),
          page_end: String(entry.pageEnd)
        }
      })
    ));

    const batchSize = 16;
    for (let offset = 0; offset < prepared.length; offset += batchSize) {
      const batch = prepared.slice(offset, offset + batchSize);
      const embeddingInputs = batch.map((entry) => `${entry.citationHeader}\n\n${entry.text}`);
      const vectors = await embedTexts(env, embeddingInputs);
      await env.RESOURCE_VECTORS.upsert(batch.map((entry, index) => ({
        id: entry.vectorId,
        values: vectors[index],
        namespace: RESOURCE_RETRIEVAL.namespace,
        metadata: {
          resource_id: resourceId,
          source_sha256: sourceSha,
          domain: row.domain,
          resource_type: manifest.resource_type || "pdf",
          group_name: row.group_name,
          source_url: manifest.source_url || row.url,
          title: row.title || resourceId,
          section_title: entry.sectionTitle || "",
          chunk_key: entry.chunkKey,
          chunk_sha256: entry.chunkSha,
          chunk_index: entry.chunkIndex,
          page_start: entry.pageStart,
          page_end: entry.pageEnd,
          chunker_version: RESOURCE_RETRIEVAL.chunkerVersion,
          embedding_model: RESOURCE_RETRIEVAL.model,
          embedding_pooling: RESOURCE_RETRIEVAL.pooling
        }
      })));
    }

    const currentIds = new Set(prepared.map((entry) => entry.vectorId));
    const trailingIds = previousIndexed
      .map((entry) => entry.vector_id)
      .filter((id) => id && !currentIds.has(id));
    if (trailingIds.length) {
      await env.RESOURCE_VECTORS.deleteByIds(trailingIds);
    }

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE resource_chunks SET index_state='stale',updated_at=datetime('now') WHERE resource_id=? AND index_state='indexed' AND ingest_id<>?"
      ).bind(resourceId, ingestId),
      env.DB.prepare(
        "UPDATE resource_chunks SET index_state='indexed',indexed_at=datetime('now'),error_text=NULL,updated_at=datetime('now') WHERE ingest_id=?"
      ).bind(ingestId)
    ]);

    const completedAt = new Date().toISOString();
    manifest.chunking = {
      schema_version: 1,
      chunker_version: RESOURCE_RETRIEVAL.chunkerVersion,
      chunk_config_sha256: configSha,
      chunk_count: prepared.length,
      vector_namespace: RESOURCE_RETRIEVAL.namespace,
      vectorize_index: RESOURCE_RETRIEVAL.indexName,
      embedding_model: RESOURCE_RETRIEVAL.model,
      embedding_pooling: RESOURCE_RETRIEVAL.pooling,
      embedding_dimensions: RESOURCE_RETRIEVAL.dimensions,
      completed_at: completedAt
    };
    await env.BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "private, max-age=0"
      }
    });

    return json({
      ok: true,
      resource_id: resourceId,
      source_sha256: sourceSha,
      ingest_id: ingestId,
      chunk_count: prepared.length,
      vector_count: prepared.length,
      stale_vector_ids_deleted: trailingIds.length,
      namespace: RESOURCE_RETRIEVAL.namespace,
      index_name: RESOURCE_RETRIEVAL.indexName,
      embedding_model: RESOURCE_RETRIEVAL.model,
      embedding_pooling: RESOURCE_RETRIEVAL.pooling,
      completed_at: completedAt
    });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE resource_chunks SET index_state='failed',error_text=?,updated_at=datetime('now') WHERE ingest_id=?"
    ).bind(String(error && error.message ? error.message : error).slice(0, 1000), ingestId).run().catch(() => null);
    return json({
      ok: false,
      error: "Pilot chunk indexing failed",
      detail: String(error && error.message ? error.message : error),
      ingest_id: ingestId
    }, 500);
  }
}

export async function apiQueryPilotResource(env, request) {
  const auth = authorized(env, request);
  if (!auth.ok) return auth.response;
  if (!env.AI || !env.RESOURCE_VECTORS) {
    return json({ ok: false, error: "AI or RESOURCE_VECTORS binding is not configured" }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Valid JSON body is required" }, 400);
  const resourceId = safeString(body.resource_id, 160);
  const question = safeString(body.question, 2000);
  const topK = Math.max(1, Math.min(Number(body.top_k || 8), 16));
  if (!resourceId || question.length < 3) {
    return json({ ok: false, error: "resource_id and a question of at least 3 characters are required" }, 400);
  }

  const context = await loadPilotContext(env, resourceId);
  if (!context.ok) return context.response;
  const { row, manifest } = context;
  if (!manifest.chunking || manifest.chunking.embedding_pooling !== RESOURCE_RETRIEVAL.pooling) {
    return json({ ok: false, error: "Resource has not been indexed with the current retrieval contract" }, 409);
  }

  try {
    const [queryVector] = await embedTexts(env, [question]);
    const result = await env.RESOURCE_VECTORS.query(queryVector, {
      topK,
      namespace: RESOURCE_RETRIEVAL.namespace,
      filter: {
        $and: [
          { resource_id: { $eq: resourceId } },
          { source_sha256: { $eq: manifest.sha256 } }
        ]
      },
      returnMetadata: "all",
      returnValues: false
    });
    const matches = result && Array.isArray(result.matches) ? result.matches : [];
    const selected = [];
    const seen = new Set();
    for (let rank = 0; rank < matches.length && selected.length < 4; rank++) {
      const match = matches[rank];
      const metadata = match && match.metadata ? match.metadata : {};
      if (metadata.resource_id !== resourceId || metadata.source_sha256 !== manifest.sha256) continue;
      const key = safeString(metadata.chunk_key, 1024);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const object = await env.BUCKET.get(key);
      if (!object) continue;
      selected.push({
        semantic_rank: rank + 1,
        score: Number(match.score),
        resource_id: resourceId,
        title: metadata.title || row.title || resourceId,
        source_url: metadata.source_url || manifest.source_url || row.url,
        page_start: Number(metadata.page_start),
        page_end: Number(metadata.page_end),
        chunk_index: Number(metadata.chunk_index),
        chunk_key: key,
        chunk_sha256: metadata.chunk_sha256 || null,
        citation: `[${metadata.title || row.title || resourceId} — pp. ${metadata.page_start}${Number(metadata.page_end) !== Number(metadata.page_start) ? `–${metadata.page_end}` : ""} — chunk ${metadata.chunk_index}]`,
        text: await object.text()
      });
    }
    selected.sort((a, b) => a.page_start - b.page_start || a.chunk_index - b.chunk_index);
    return json({
      ok: true,
      resource_id: resourceId,
      source_sha256: manifest.sha256,
      question,
      namespace: RESOURCE_RETRIEVAL.namespace,
      index_name: RESOURCE_RETRIEVAL.indexName,
      embedding_model: RESOURCE_RETRIEVAL.model,
      embedding_pooling: RESOURCE_RETRIEVAL.pooling,
      local_match_count: matches.length,
      evidence_count: selected.length,
      evidence: selected,
      sufficient_local_evidence: selected.length > 0
    });
  } catch (error) {
    return json({
      ok: false,
      error: "Node-local retrieval failed",
      detail: String(error && error.message ? error.message : error)
    }, 500);
  }
}
