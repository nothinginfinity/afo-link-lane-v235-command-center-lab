// Live 5-node node-chat acceptance matrix.
// Run: HEALTH_URL=https://afo-link-lane-v235-lab.jaredtechfit.workers.dev/health node scripts/node-chat-matrix.mjs
//
// This does NOT touch CairnStone HEAD or deploy anything. It only calls the
// already-deployed /api/resource-chat/turn endpoint and asserts on live
// responses. Existing isolation/tamper coverage lives in verify-node-chat.sh
// and is left untouched; this script adds the five-node semantic matrix plus
// dedicated semantic wrong-node tests, repeated 3x to catch nondeterminism.

const HEALTH_URL = process.env.HEALTH_URL || "https://afo-link-lane-v235-lab.jaredtechfit.workers.dev/health";
const BASE_URL = HEALTH_URL.replace(/\/health$/, "");
const CHAT_URL = BASE_URL + "/api/resource-chat/turn";
const REPEATS = Number(process.env.REPEATS || 3);

const NODES = [
  {
    id: "fat-pslf-infographic-pdf",
    sha: "a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a",
    direct: "How many qualifying payments are required for Public Service Loan Forgiveness?",
    directMustInclude: "120",
    followup: "Does that change if I have two part-time jobs instead of one full-time job?",
    unsupported: "What's the interest rate on my Direct Loan?"
  },
  {
    id: "fat-money-management-checklist-pdf",
    sha: "971976a17e564319c53bf909ff180f31b3be6dcfdbea1b8fb966dc7b64074cae",
    direct: "What steps can a student use to create and manage a budget?",
    directMustInclude: null,
    followup: "Why does keeping a bank account help with that?",
    unsupported: "What's the FAFSA deadline this year?"
  },
  {
    id: "fat-do-you-need-money-pdf",
    sha: "866bb8ed3b0202a86652f51c4ff461bfff3c4561d8397b7583e2914005e9328a",
    direct: "What types of federal student aid can help pay for college or career school?",
    directMustInclude: null,
    followup: "What should I keep in mind about that money once I actually have it?",
    unsupported: "How many qualifying payments are required for Public Service Loan Forgiveness?"
  },
  {
    id: "fat-how-financial-aid-works-graphic",
    sha: "18999beff8d14938192ae4f65cb5e5290d137a447d1913938777b27b43dd9cbb",
    direct: "What must a contributor do before a school can access their federal tax information for the FAFSA?",
    directMustInclude: null,
    followup: "What happens right after that consent is given and the form is submitted?",
    unsupported: "What steps can a student use to create and manage a budget?"
  },
  {
    id: "fat-federal-student-loan-graphic",
    sha: "b3723ee15170848d4aa34c06565188884088160e4a24f21f82b3127cef253125",
    direct: "What happens once a student is accepted for admission, regarding financial aid?",
    directMustInclude: null,
    followup: "What does the school do with that aid once it's ready?",
    unsupported: "How many qualifying payments are required for Public Service Loan Forgiveness?"
  }
];

// Dedicated semantic wrong-node pairs (separate from signed-history replay,
// which is already covered by verify-node-chat.sh). Each of these opens a
// FRESH session on the target node and asks a question that only belongs to
// a different node's document.
const WRONG_NODE_PAIRS = [
  { targetId: "fat-money-management-checklist-pdf", question: "How many qualifying payments are required for Public Service Loan Forgiveness?", forbiddenSha: "a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a", forbiddenSubstring: "120" },
  { targetId: "fat-pslf-infographic-pdf", question: "What steps can a student use to create and manage a budget?", forbiddenSha: "971976a17e564319c53bf909ff180f31b3be6dcfdbea1b8fb966dc7b64074cae", forbiddenSubstring: null },
  { targetId: "fat-how-financial-aid-works-graphic", question: "What happens once a student is accepted for admission, regarding financial aid?", forbiddenSha: "b3723ee15170848d4aa34c06565188884088160e4a24f21f82b3127cef253125", forbiddenSubstring: null },
  { targetId: "fat-federal-student-loan-graphic", question: "What must a contributor do before a school can access their federal tax information for the FAFSA?", forbiddenSha: "18999beff8d14938192ae4f65cb5e5290d137a447d1913938777b27b43dd9cbb", forbiddenSubstring: null }
];

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, ctx) {
  if (cond) { pass++; }
  else { fail++; failures.push({ name, ctx }); console.log("FAIL:", name, ctx ? JSON.stringify(ctx).slice(0, 300) : ""); }
}

async function postTurn(body) {
  const start = Date.now();
  const res = await fetch(CHAT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  const latencyMs = Date.now() - start;
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status: res.status, json, latencyMs, sizeBytes: text.length };
}

// Structural assertions shared by every synthesized-answer turn.
function assertSynthesisShape(label, resourceId, result, evidenceMustBelongTo) {
  const { json } = result;
  check(label + ": ok:true", json && json.ok === true, json);
  if (!json || !json.ok) return;
  check(label + ": resource_id matches", json.resource_id === resourceId, json.resource_id);
  const a = json.answer || {};
  check(label + ": answer.resource_id matches", a.resource_id === resourceId, a.resource_id);
  if (a.direct) {
    check(label + ": direct answer has at least one citation", Array.isArray(a.citations) && a.citations.length > 0, a.citations);
  }
  const validIdx = new Set((json.evidence || []).map(e => e.chunk_index));
  const cited = Array.isArray(a.cited_chunk_indexes) ? a.cited_chunk_indexes : [];
  check(label + ": every cited_chunk_index exists in current evidence", cited.every(i => validIdx.has(i)), { cited, validIdx: [...validIdx] });
  const evidenceOk = (json.evidence || []).every(e => e.resource_id === (evidenceMustBelongTo || resourceId));
  check(label + ": every evidence item belongs to the active resource_id", evidenceOk, (json.evidence || []).map(e => e.resource_id));
}

function assertGenuineSynthesis(label, json) {
  const a = json.answer || {};
  check(label + ": answer.kind === synthesis", a.kind === "synthesis", a.kind);
  check(label + ": answer.mode === grounded-synthesis-v1", a.mode === "grounded-synthesis-v1", a.mode);
}

async function runNodeMatrix(node, iteration) {
  const label = node.id + " [run " + iteration + "]";
  const metrics = [];

  // 1. Direct question, fresh session.
  const r1 = await postTurn({ resource_id: node.id, question: node.direct });
  assertSynthesisShape(label + " direct", node.id, r1);
  if (r1.json && r1.json.ok) {
    assertGenuineSynthesis(label + " direct", r1.json);
    if (node.directMustInclude) {
      check(label + " direct: answer contains expected fact", r1.json.answer.text.includes(node.directMustInclude), r1.json.answer.text);
    }
    metrics.push({ resource_id: node.id, turn: "direct", kind: r1.json.answer.kind, mode: r1.json.answer.mode, direct: r1.json.answer.direct, citations: r1.json.answer.citations.length, latency_ms: r1.latencyMs, size_bytes: r1.sizeBytes, evidence_count: r1.json.count });
  }

  // 2. Follow-up using the resolved token/turns from turn 1 -- must remain
  // synthesized (not silently fall back to extractive), must produce a
  // DIFFERENT answer than turn 1 (proxy for "actually resolved the referent
  // and re-grounded", since we can't semantically grade), and retrieval must
  // have been rerun (evidence array present and scoped correctly again).
  if (r1.json && r1.json.ok) {
    const r2 = await postTurn({ resource_id: node.id, question: node.followup, turns: r1.json.turns, context_token: r1.json.context_token });
    assertSynthesisShape(label + " follow-up", node.id, r2);
    if (r2.json && r2.json.ok) {
      assertGenuineSynthesis(label + " follow-up", r2.json);
      check(label + " follow-up: turns length is 2", Array.isArray(r2.json.turns) && r2.json.turns.length === 2, r2.json.turns && r2.json.turns.length);
      check(label + " follow-up: answer text differs from turn 1 (actually resolved the referent)", r2.json.answer.text !== r1.json.answer.text, { t1: r1.json.answer.text, t2: r2.json.answer.text });
      check(label + " follow-up: evidence present (retrieval was rerun)", Array.isArray(r2.json.evidence) && r2.json.evidence.length > 0, r2.json.count);
      metrics.push({ resource_id: node.id, turn: "followup", kind: r2.json.answer.kind, mode: r2.json.answer.mode, direct: r2.json.answer.direct, citations: r2.json.answer.citations.length, latency_ms: r2.latencyMs, size_bytes: r2.sizeBytes, evidence_count: r2.json.count });
    }
  }

  // 3. Unsupported question, fresh session -- must produce an explicit
  // limitation, not a confident wrong answer.
  const r3 = await postTurn({ resource_id: node.id, question: node.unsupported });
  check(label + " unsupported: ok:true", r3.json && r3.json.ok === true, r3.json);
  if (r3.json && r3.json.ok) {
    check(label + " unsupported: direct === false", r3.json.answer.direct === false, r3.json.answer);
    metrics.push({ resource_id: node.id, turn: "unsupported", kind: r3.json.answer.kind, mode: r3.json.answer.mode, direct: r3.json.answer.direct, citations: r3.json.answer.citations.length, latency_ms: r3.latencyMs, size_bytes: r3.sizeBytes, evidence_count: r3.json.count });
  }

  return metrics;
}

async function runWrongNodePair(pair, iteration) {
  const label = pair.targetId + " wrong-node [run " + iteration + "]";
  const r = await postTurn({ resource_id: pair.targetId, question: pair.question });
  check(label + ": ok:true", r.json && r.json.ok === true, r.json);
  if (!r.json || !r.json.ok) return;
  check(label + ": direct === false", r.json.answer.direct === false, r.json.answer);
  const raw = JSON.stringify(r.json);
  check(label + ": no forbidden sha leaked", !raw.includes(pair.forbiddenSha), pair.forbiddenSha);
  if (pair.forbiddenSubstring) {
    check(label + ": answer text does not contain forbidden substring", !r.json.answer.text.includes(pair.forbiddenSubstring), r.json.answer.text);
  }
  const evidenceOk = (r.json.evidence || []).every(e => e.resource_id === pair.targetId);
  check(label + ": all evidence still belongs to the opened node", evidenceOk, (r.json.evidence || []).map(e => e.resource_id));
}

async function main() {
  const allMetrics = [];
  for (let iteration = 1; iteration <= REPEATS; iteration++) {
    console.log("\n=== Iteration " + iteration + "/" + REPEATS + " ===");
    for (const node of NODES) {
      const m = await runNodeMatrix(node, iteration);
      allMetrics.push(...m);
    }
    for (const pair of WRONG_NODE_PAIRS) {
      await runWrongNodePair(pair, iteration);
    }
  }

  console.log("\n=== Per-turn metrics ===");
  for (const m of allMetrics) console.log(JSON.stringify(m));

  console.log("\n" + pass + " passed, " + fail + " failed (across " + REPEATS + " iterations)");
  if (fail > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log("-", f.name);
    process.exit(1);
  }
}

main().catch(e => { console.error("MATRIX HARNESS THREW:", e); process.exit(1); });
