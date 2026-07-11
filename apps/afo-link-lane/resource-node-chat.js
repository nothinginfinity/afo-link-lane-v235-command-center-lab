import {
  apiQueryPilotResource,
  RANKING_VERSION,
  ANSWER_MODE
} from "./resource-retrieval-quality.js";

const CHAT_MODE = "grounded-synthesis-v1";
const CHAT_MODEL = "@cf/zai-org/glm-4.7-flash";
const MAX_TURNS = 6;
const MAX_HISTORY_IN_PROMPT = 3;
const BROWSER_HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

function browserJson(value, status = 200, extra = {}) { return new Response(JSON.stringify(value), { status, headers: { ...BROWSER_HEADERS, ...extra } }); }

function browserGuard(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(length) && length > 8192) return browserJson({ ok: false, error: "Request body is too large" }, 413);
  const type = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (!type.startsWith("application/json")) return browserJson({ ok: false, error: "Content-Type must be application/json" }, 415);
  const site = String(request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (site && !new Set(["same-origin", "same-site", "none"]).has(site)) return browserJson({ ok: false, error: "Cross-site requests are not allowed" }, 403);
  const origin = request.headers.get("Origin");
  if (origin) {
    try { if (new URL(origin).host !== new URL(request.url).host) return browserJson({ ok: false, error: "Cross-origin requests are not allowed" }, 403); }
    catch { return browserJson({ ok: false, error: "Invalid Origin header" }, 400); }
  }
  return null;
}

function newSessionId() {
  try { return crypto.randomUUID(); } catch { return "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
}

// A turn as carried by the client between requests. Deliberately flat and small
// so it can live in browser/session memory (no D1 in Phase 2).
function sanitizeIncomingTurn(raw) {
  if (!raw || typeof raw !== "object") return null;
  const question = String(raw.question || "").trim().slice(0, 500);
  const answerText = String(raw.answer_text || "").trim().slice(0, 2000);
  if (!question || !answerText) return null;
  return {
    resource_id: String(raw.resource_id || "").trim(),
    question,
    answer_text: answerText,
    direct: Boolean(raw.direct),
    citations: Array.isArray(raw.citations) ? raw.citations.slice(0, 6).map(c => String(c || "").slice(0, 200)) : []
  };
}

// Requirement: switching nodes must create/restore a *different* session, and no
// prior-node evidence may leak. A client sending turns stamped with a different
// resource_id is either a stale tab or a bug -- either way we refuse rather than
// silently splicing cross-node history into this node's context.
function validateTurnsForNode(resourceId, turnsRaw) {
  if (turnsRaw === undefined || turnsRaw === null) return { ok: true, turns: [] };
  if (!Array.isArray(turnsRaw)) return { ok: false, error: "turns must be an array" };
  if (turnsRaw.length > MAX_TURNS) return { ok: false, error: "Too many turns; start a new session" };
  const turns = [];
  for (const raw of turnsRaw) {
    const turn = sanitizeIncomingTurn(raw);
    if (!turn) return { ok: false, error: "Malformed turn in session history" };
    if (turn.resource_id && turn.resource_id !== resourceId) {
      return { ok: false, error: "Session history belongs to a different node. Start a new node chat.", cross_node: true };
    }
    turns.push({ ...turn, resource_id: resourceId });
  }
  return { ok: true, turns };
}

function evidenceBlock(evidence) {
  return evidence.map(item => (
    "[chunk " + item.chunk_index + ", pp. " + item.page_start + (item.page_end !== item.page_start ? "-" + item.page_end : "") + "]\n" + String(item.text || "").slice(0, 900)
  )).join("\n\n");
}

function historyBlock(turns) {
  const recent = turns.slice(-MAX_HISTORY_IN_PROMPT);
  if (!recent.length) return "(no prior turns in this session)";
  return recent.map(t => "Q: " + t.question + "\nA: " + t.answer_text).join("\n\n");
}

function buildPrompt(question, turns, evidence) {
  const system = "You are a node-scoped assistant. You may answer ONLY using the evidence chunks provided below, which all come from exactly one document. " +
    "Never use outside knowledge, never reference any other document, and never assume facts not present in the evidence. " +
    "Prior turns are provided only so you can resolve pronouns and follow-up phrasing (e.g. \"that\", \"it\") -- they are not a source of facts by themselves; every factual claim must still be grounded in the evidence chunks given for THIS turn. " +
    "If the evidence does not clearly answer the question, set direct to false and say so plainly instead of guessing. " +
    "Respond with ONLY a JSON object of the exact shape {\"direct\":boolean,\"text\":string,\"cited_chunk_indexes\":number[]} and nothing else -- no markdown, no preamble.";
  const user = "Prior turns in this node session:\n" + historyBlock(turns) +
    "\n\nEvidence chunks from the active node (cite by chunk index):\n" + evidenceBlock(evidence) +
    "\n\nCurrent question: " + question;
  return { system, user };
}

async function generateGroundedAnswer(env, question, turns, evidence) {
  if (!env.AI) return null;
  const { system, user } = buildPrompt(question, turns, evidence);
  let result;
  try {
    result = await env.AI.run(CHAT_MODEL, {
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000
    });
  } catch { return null; }
  const raw = result && (result.response ?? result.result ?? result);
  const content = typeof raw === "string" ? raw : (raw && raw.content) || null;
  if (!content) return null;
  let parsed;
  try { parsed = JSON.parse(content); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || typeof parsed.text !== "string") return null;
  const validChunkIndexes = new Set(evidence.map(item => item.chunk_index));
  const citedRaw = Array.isArray(parsed.cited_chunk_indexes) ? parsed.cited_chunk_indexes : [];
  const cited = citedRaw.filter(index => validChunkIndexes.has(Number(index))).map(Number);
  const direct = Boolean(parsed.direct);
  // Groundedness guard: a "direct" answer must cite at least one real chunk from
  // THIS turn's evidence. If the model claims direct:true with no valid citation,
  // treat it as ungrounded and let the caller fall back to the extractive answer
  // rather than surface a confident, uncited sentence.
  if (direct && !cited.length) return null;
  const citations = cited.map(index => {
    const item = evidence.find(e => e.chunk_index === index);
    return item ? item.citation : null;
  }).filter(Boolean);
  return {
    direct,
    kind: "synthesis",
    mode: CHAT_MODE,
    text: String(parsed.text).slice(0, 2000),
    citations,
    cited_chunk_indexes: cited,
    resource_id: evidence[0]?.resource_id || null
  };
}

function extractiveFallback(payload) {
  const a = payload.answer || {};
  return {
    direct: Boolean(a.direct),
    kind: "extractive",
    mode: ANSWER_MODE,
    text: a.text || "No direct answer was found in this resource.",
    citations: a.citation ? [a.citation] : [],
    cited_chunk_indexes: Number.isFinite(a.chunk_index) ? [a.chunk_index] : [],
    resource_id: a.resource_id || payload.resource_id || null
  };
}

async function apiNodeChatTurn(env, request) {
  if (request.method !== "POST") return browserJson({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  const blocked = browserGuard(request);
  if (blocked) return blocked;
  const body = await request.json().catch(() => null);
  if (!body || Array.isArray(body) || typeof body !== "object") return browserJson({ ok: false, error: "A JSON object is required" }, 400);
  const allowedKeys = new Set(["resource_id", "question", "session_id", "turns"]);
  if (Object.keys(body).some(key => !allowedKeys.has(key))) return browserJson({ ok: false, error: "Only resource_id, question, session_id, and turns are accepted" }, 400);

  const resourceId = String(body.resource_id || "").trim();
  const question = String(body.question || "").trim();
  if (question.length < 3 || question.length > 500) return browserJson({ ok: false, error: "Question must be between 3 and 500 characters" }, 400);

  const turnsCheck = validateTurnsForNode(resourceId, body.turns);
  if (!turnsCheck.ok) return browserJson({ ok: false, error: turnsCheck.error, cross_node: Boolean(turnsCheck.cross_node) }, turnsCheck.cross_node ? 409 : 400);

  const sessionId = body.session_id && typeof body.session_id === "string" ? body.session_id.slice(0, 80) : newSessionId();

  // Retrieval is re-run from scratch every turn, scoped strictly to resourceId --
  // never reused or carried over from a prior turn or a different node.
  const internalRequest = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lab-Ingest-Token": String(env.LAB_INGEST_TOKEN || "") },
    body: JSON.stringify({ resource_id: resourceId, question, top_k: 12 })
  });
  const retrievalResponse = await apiQueryPilotResource(env, internalRequest);
  let payload;
  try { payload = await retrievalResponse.json(); } catch { return browserJson({ ok: false, error: "Retrieval response was not valid JSON" }, 502); }
  if (!payload || !payload.ok) return browserJson({ ok: false, error: (payload && payload.error) || "Retrieval failed" }, retrievalResponse.status || 502);
  if (payload.resource_id !== resourceId) return browserJson({ ok: false, error: "Node-local retrieval integrity check failed" }, 502);
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  if (evidence.some(item => !item || item.resource_id !== resourceId)) return browserJson({ ok: false, error: "Cross-node evidence rejected" }, 502);

  let answer;
  if (!evidence.length) {
    answer = { direct: false, kind: "extractive", mode: ANSWER_MODE, text: "No evidence was found in this node for that question.", citations: [], cited_chunk_indexes: [], resource_id: resourceId };
  } else {
    answer = await generateGroundedAnswer(env, question, turnsCheck.turns, evidence);
    if (!answer) answer = extractiveFallback(payload);
  }
  if (answer.resource_id && answer.resource_id !== resourceId) return browserJson({ ok: false, error: "Node-local answer integrity check failed" }, 502);

  const newTurn = { resource_id: resourceId, question, answer_text: answer.text, direct: answer.direct, citations: answer.citations };
  const turns = [...turnsCheck.turns, newTurn].slice(-MAX_TURNS);

  return browserJson({
    ok: true,
    resource_id: resourceId,
    session_id: sessionId,
    ranking_version: RANKING_VERSION,
    chat_mode: CHAT_MODE,
    answer,
    evidence,
    turns,
    count: evidence.length
  });
}

export { apiNodeChatTurn, CHAT_MODE, CHAT_MODEL, MAX_TURNS };
