const NODE_CHAT_DEBUG_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Node Chat -- disposable test harness</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #14161a; color: #e8e8ea; }
  header { padding: 10px 14px; border-bottom: 1px solid #2a2d33; background: #1a1c21; position: sticky; top: 0; z-index: 5; }
  .warn { font-size: 12px; color: #f0b429; margin: 0 0 8px; }
  select, button, input { font-size: 15px; border-radius: 8px; border: 1px solid #33363d; background: #202329; color: #e8e8ea; padding: 8px 10px; }
  select { width: 100%; margin-bottom: 6px; }
  .row { display: flex; gap: 6px; align-items: center; }
  button { cursor: pointer; }
  button.new-chat { background: #2a2d33; font-size: 12px; padding: 6px 10px; white-space: nowrap; }
  main { padding: 10px 14px 90px; max-width: 720px; margin: 0 auto; }
  .turn { margin-bottom: 16px; }
  .q { background: #23262d; border-radius: 12px 12px 4px 12px; padding: 8px 12px; margin-left: 20%; font-size: 14px; }
  .a { background: #1c2b23; border-radius: 12px 12px 12px 4px; padding: 10px 12px; margin-right: 8%; margin-top: 6px; font-size: 14px; line-height: 1.4; }
  .a.refusal { background: #2b241c; }
  .a.error { background: #2b1c1c; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #33363d; color: #b8bcc4; }
  .badge.synthesis { background: #204a34; color: #7de3ab; }
  .badge.extractive { background: #4a3d20; color: #e3c67d; }
  .badge.direct { background: #204a4a; color: #7de3e3; }
  .citations { margin-top: 6px; font-size: 11px; color: #8b8f98; }
  .citations div { margin-top: 2px; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; background: #1a1c21; border-top: 1px solid #2a2d33; padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); }
  footer .row { max-width: 720px; margin: 0 auto; }
  footer input { flex: 1; }
  .empty { color: #6b6f78; font-size: 13px; padding: 20px 0; text-align: center; }
  .loading { color: #8b8f98; font-size: 13px; padding: 4px 0; }
</style>
</head>
<body>
<header>
  <p class="warn">Disposable test harness -- not the real Content Visor. No persistence; resets on reload. Each node below keeps its own isolated turns + signed context_token, exactly like the real system will.</p>
  <div class="row">
    <select id="nodeSelect"></select>
  </div>
  <div class="row" style="margin-top:6px;">
    <span id="sessionLabel" style="font-size:11px;color:#6b6f78;flex:1;"></span>
    <button class="new-chat" id="newChatBtn">New chat (this node)</button>
  </div>
</header>
<main id="log"></main>
<footer>
  <div class="row">
    <input id="questionInput" type="text" placeholder="Ask about this node..." autocomplete="off">
    <button id="sendBtn">Send</button>
  </div>
</footer>
<script>
const NODES = [
  { id: "fat-pslf-infographic-pdf", label: "PSLF Infographic" },
  { id: "fat-money-management-checklist-pdf", label: "Money Management Checklist" },
  { id: "fat-do-you-need-money-pdf", label: "Do You Need Money?" },
  { id: "fat-how-financial-aid-works-graphic", label: "How Financial Aid Works" },
  { id: "fat-federal-student-loan-graphic", label: "Getting a Federal Student Loan" }
];

// One isolated session per node, in memory only. This mirrors the real
// architecture: turns + context_token are always scoped to a single
// resource_id, and switching nodes here is impossible to conflate because
// each node's state lives under its own key.
const sessions = {};
for (const n of NODES) sessions[n.id] = { turns: [], context_token: null };

let currentNodeId = NODES[0].id;

const nodeSelect = document.getElementById("nodeSelect");
for (const n of NODES) {
  const opt = document.createElement("option");
  opt.value = n.id;
  opt.textContent = n.label;
  nodeSelect.appendChild(opt);
}
nodeSelect.value = currentNodeId;
nodeSelect.addEventListener("change", () => {
  currentNodeId = nodeSelect.value;
  render();
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  sessions[currentNodeId] = { turns: [], context_token: null };
  render();
});

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  const session = sessions[currentNodeId];
  document.getElementById("sessionLabel").textContent = session.turns.length
    ? session.turns.length + " turn(s) in this node's session"
    : "No turns yet";
  const log = document.getElementById("log");
  if (!session.turns.length) {
    log.innerHTML = '<div class="empty">Ask this node something to start.</div>';
    return;
  }
  log.innerHTML = session.turns.map(t => {
    const kindClass = t.kind === "extractive" ? "extractive" : "synthesis";
    const answerClass = t.error ? "error" : (t.direct ? "" : "refusal");
    const badges = [
      '<span class="badge ' + kindClass + '">' + escapeHtml(t.mode || t.kind || "?") + "</span>",
      t.direct ? '<span class="badge direct">direct</span>' : '<span class="badge">refusal / limitation</span>',
      t.latencyMs != null ? '<span class="badge">' + t.latencyMs + "ms</span>" : ""
    ].join("");
    const citations = (t.citations || []).map(c => "<div>" + escapeHtml(c) + "</div>").join("");
    return '<div class="turn"><div class="q">' + escapeHtml(t.question) + '</div>' +
      '<div class="a ' + answerClass + '">' + escapeHtml(t.answerText) +
      '<div class="badges">' + badges + '</div>' +
      (citations ? '<div class="citations">' + citations + '</div>' : "") +
      '</div></div>';
  }).join("");
  window.scrollTo(0, document.body.scrollHeight);
}

async function send() {
  const input = document.getElementById("questionInput");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  const session = sessions[currentNodeId];
  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true;
  const log = document.getElementById("log");
  log.innerHTML += '<div class="loading" id="loadingRow">Asking ' + escapeHtml(currentNodeId) + "...</div>";
  window.scrollTo(0, document.body.scrollHeight);

  const start = performance.now();
  try {
    const res = await fetch("/api/resource-chat/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource_id: currentNodeId,
        question,
        turns: session.turns.length ? session.turns.map(t => t.raw) : undefined,
        context_token: session.context_token || undefined
      })
    });
    const latencyMs = Math.round(performance.now() - start);
    const data = await res.json();
    const loadingRow = document.getElementById("loadingRow");
    if (loadingRow) loadingRow.remove();

    if (!data.ok) {
      session.turns.push({ question, answerText: "Error: " + (data.error || "unknown") + (data.tampered ? " (session verification failed -- start a new chat)" : ""), direct: false, error: true, latencyMs });
      render();
      sendBtn.disabled = false;
      return;
    }

    session.context_token = data.context_token;
    session.turns = (data.turns || []).map((raw, i, arr) => ({
      raw,
      question: raw.question,
      answerText: raw.answer_text,
      direct: raw.direct,
      citations: raw.citations,
      kind: i === arr.length - 1 ? data.answer.kind : undefined,
      mode: i === arr.length - 1 ? data.answer.mode : undefined,
      latencyMs: i === arr.length - 1 ? latencyMs : undefined
    }));
    render();
  } catch (e) {
    const loadingRow = document.getElementById("loadingRow");
    if (loadingRow) loadingRow.remove();
    session.turns.push({ question, answerText: "Network error: " + e.message, direct: false, error: true });
    render();
  }
  sendBtn.disabled = false;
}

document.getElementById("sendBtn").addEventListener("click", send);
document.getElementById("questionInput").addEventListener("keydown", e => { if (e.key === "Enter") send(); });

render();
</script>
</body>
</html>`;

function renderNodeChatDebugPage() {
  return new Response(NODE_CHAT_DEBUG_HTML, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" } });
}

export { renderNodeChatDebugPage };
