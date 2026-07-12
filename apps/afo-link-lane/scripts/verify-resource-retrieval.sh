#!/usr/bin/env bash
set -euo pipefail

: "${HEALTH_URL:?HEALTH_URL is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required}"
: "${LAB_INGEST_TOKEN:?LAB_INGEST_TOKEN is required}"

VECTOR_INDEX="${VECTOR_INDEX:-afo-link-lane-v235-lab-resources-v1}"
BASE_URL="${HEALTH_URL%/health}"

HEALTH_JSON="$(curl --fail-with-body -sS "${HEALTH_URL}")"
echo "${HEALTH_JSON}"
HEALTH_JSON="${HEALTH_JSON}" node - <<'NODE'
const data=JSON.parse(process.env.HEALTH_JSON)
if(!data.ok)throw new Error('Health check returned ok=false')
if(data.worker!=='afo-link-lane-v235-lab')throw new Error('Unexpected worker '+data.worker)
if(data.version!==process.env.EXPECTED_VERSION)throw new Error('Unexpected live version '+data.version)
if(data.max_universe_nodes!==5000)throw new Error('Expected max_universe_nodes=5000')
if(data.r2_resource_pilot!==5)throw new Error('Expected r2_resource_pilot=5')
if(!data.resource_retrieval?.ai_binding)throw new Error('AI binding missing')
if(!data.resource_retrieval?.vector_binding)throw new Error('RESOURCE_VECTORS binding missing')
if(data.resource_retrieval?.index_name!==process.env.VECTOR_INDEX)throw new Error('Unexpected Vectorize index')
if(data.resource_retrieval?.chunker_version!=='pdf-page-v2-reading-order')throw new Error('Unexpected chunker version')
if(data.resource_retrieval?.normalizer!=='pdf-reading-order-v2')throw new Error('Unexpected reading-order normalizer')
if(data.resource_retrieval?.ranking_version!=='hybrid-vector-lexical-v1')throw new Error('Unexpected ranking version')
if(data.resource_retrieval?.answer_mode!=='extractive-evidence-v1')throw new Error('Unexpected answer mode')
console.log('Live version, retrieval bindings, ranking, and extractive answer mode verified')
NODE

while IFS= read -r RESOURCE_ID
do
  [ -n "${RESOURCE_ID}" ] || continue
  PAYLOAD="$(RESOURCE_ID="${RESOURCE_ID}" node -e "process.stdout.write(JSON.stringify({resource_ids:[process.env.RESOURCE_ID]}))")"
  INDEX_JSON="$(curl --fail-with-body -sS --max-time 240 -X POST "${BASE_URL}/admin/index-pilot-resources" -H "Content-Type: application/json" -H "X-Lab-Ingest-Token: ${LAB_INGEST_TOKEN}" --data-binary "${PAYLOAD}")"
  echo "${INDEX_JSON}"
  INDEX_JSON="${INDEX_JSON}" RESOURCE_ID="${RESOURCE_ID}" node - <<'NODE'
const data=JSON.parse(process.env.INDEX_JSON)
const result=data.results?.[0]
if(!data.ok||data.failed!==0||!result?.ok)throw new Error('Indexing failed for '+process.env.RESOURCE_ID)
if(result.resource_id!==process.env.RESOURCE_ID)throw new Error('Wrong indexed resource')
if(!(result.chunk_count>0))throw new Error('No chunks indexed')
if(result.chunker_version!=='pdf-page-v2-reading-order')throw new Error('Wrong chunker version')
if(result.normalizer!=='pdf-reading-order-v2')throw new Error('Wrong reading-order normalizer')
console.log('Indexed '+result.resource_id+' with '+result.chunk_count+' reading-order chunks')
NODE
done <<'EOF'
fat-do-you-need-money-pdf
fat-money-management-checklist-pdf
fat-pslf-infographic-pdf
fat-how-financial-aid-works-graphic
fat-federal-student-loan-graphic
EOF

STATUS_JSON="$(curl --fail-with-body -sS "${BASE_URL}/admin/pilot-retrieval-status" -H "X-Lab-Ingest-Token: ${LAB_INGEST_TOKEN}")"
echo "${STATUS_JSON}"
STATUS_JSON="${STATUS_JSON}" node - <<'NODE'
const data=JSON.parse(process.env.STATUS_JSON)
if(!data.ok||!data.ai_binding||!data.vectorize_binding)throw new Error('Retrieval status failed')
if(data.chunker_version!=='pdf-page-v2-reading-order'||data.normalizer!=='pdf-reading-order-v2')throw new Error('Retrieval status quality metadata mismatch')
if(data.ranking_version!=='hybrid-vector-lexical-v1'||data.answer_mode!=='extractive-evidence-v1')throw new Error('Retrieval status answer metadata mismatch')
const indexed=(data.rows||[]).filter(r=>r.index_state==='indexed'&&r.chunker_version==='pdf-page-v2-reading-order')
const ids=new Set(indexed.filter(r=>Number(r.chunk_count)>0).map(r=>r.resource_id))
const expected=['fat-do-you-need-money-pdf','fat-money-management-checklist-pdf','fat-pslf-infographic-pdf','fat-how-financial-aid-works-graphic','fat-federal-student-loan-graphic']
for(const id of expected)if(!ids.has(id))throw new Error('Missing indexed ledger row for '+id)
console.log('Five-resource D1 chunk ledger verified')
NODE

while IFS='|' read -r RESOURCE_ID QUESTION
do
  [ -n "${RESOURCE_ID}" ] || continue
  PAYLOAD="$(RESOURCE_ID="${RESOURCE_ID}" QUESTION="${QUESTION}" node -e "process.stdout.write(JSON.stringify({resource_id:process.env.RESOURCE_ID,question:process.env.QUESTION,top_k:8}))")"
  QUERY_OK=0
  QUERY_JSON=''
  for ATTEMPT in $(seq 1 30)
  do
    HTTP_CODE="$(curl -sS --max-time 120 -o /tmp/query-response.json -w '%{http_code}' -X POST "${BASE_URL}/admin/query-pilot-resource" -H "Content-Type: application/json" -H "X-Lab-Ingest-Token: ${LAB_INGEST_TOKEN}" --data-binary "${PAYLOAD}")"
    QUERY_JSON="$(cat /tmp/query-response.json)"
    echo "Query attempt ${ATTEMPT} for ${RESOURCE_ID} returned HTTP ${HTTP_CODE}: ${QUERY_JSON}"
    if HTTP_CODE="${HTTP_CODE}" QUERY_JSON="${QUERY_JSON}" RESOURCE_ID="${RESOURCE_ID}" node - <<'NODE'
const code=Number(process.env.HTTP_CODE)
let data
try{data=JSON.parse(process.env.QUERY_JSON)}catch{process.exit(1)}
if(code!==200||!data.ok||data.resource_id!==process.env.RESOURCE_ID)process.exit(1)
if(!(data.count>0)||!Array.isArray(data.evidence)||!data.evidence.length)process.exit(1)
process.exit(0)
NODE
    then
      QUERY_OK=1
      break
    fi
    sleep 3
  done
  if [ "${QUERY_OK}" != "1" ]; then
    echo "Vectorize query never became visible for ${RESOURCE_ID}"
    exit 1
  fi
  QUERY_JSON="${QUERY_JSON}" RESOURCE_ID="${RESOURCE_ID}" node - <<'NODE'
const data=JSON.parse(process.env.QUERY_JSON)
if(!data.ok||data.resource_id!==process.env.RESOURCE_ID)throw new Error('Node-local query failed')
if(!(data.count>0)||!Array.isArray(data.evidence)||!data.evidence.length)throw new Error('No node-local evidence returned')
for(const item of data.evidence){
  if(item.resource_id!==process.env.RESOURCE_ID)throw new Error('Cross-node evidence leaked into local query')
  if(!Number.isFinite(Number(item.score))||!Number.isFinite(Number(item.vector_score))||!Number.isFinite(Number(item.rank_score))||!Number.isFinite(Number(item.lexical_score)))throw new Error('Missing hybrid ranking scores')
  if(!item.chunk_key||!item.chunk_sha256||!item.source_sha256||!item.citation||!item.text)throw new Error('Incomplete evidence provenance')
  if(!(Number(item.page_start)>=1)||!(Number(item.page_end)>=Number(item.page_start)))throw new Error('Invalid page citation')
}
console.log('Node-local retrieval verified for '+process.env.RESOURCE_ID+' with '+data.count+' evidence chunks')
NODE
done <<'EOF'
fat-do-you-need-money-pdf|What types of federal student aid can help pay for college or career school?
fat-money-management-checklist-pdf|What steps can a student use to create and manage a budget?
fat-pslf-infographic-pdf|How many qualifying payments are required for Public Service Loan Forgiveness?
fat-how-financial-aid-works-graphic|How does a school determine a student's financial aid offer?
fat-federal-student-loan-graphic|What should a borrower understand before accepting a federal student loan?
EOF

while IFS='|' read -r RESOURCE_ID QUESTION EXPECTED_SOURCE_SHA EXPECTED_URL_TOKEN FORBIDDEN_SOURCE_SHA
do
  [ -n "${RESOURCE_ID}" ] || continue
  PAYLOAD="$(RESOURCE_ID="${RESOURCE_ID}" QUESTION="${QUESTION}" node -e "process.stdout.write(JSON.stringify({resource_id:process.env.RESOURCE_ID,question:process.env.QUESTION,top_k:8}))")"
  NEGATIVE_JSON="$(curl --fail-with-body -sS --max-time 120 -X POST "${BASE_URL}/admin/query-pilot-resource" -H "Content-Type: application/json" -H "X-Lab-Ingest-Token: ${LAB_INGEST_TOKEN}" --data-binary "${PAYLOAD}")"
  echo "Wrong-node isolation query for ${RESOURCE_ID}: ${NEGATIVE_JSON}"
  NEGATIVE_JSON="${NEGATIVE_JSON}" RESOURCE_ID="${RESOURCE_ID}" EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA}" EXPECTED_URL_TOKEN="${EXPECTED_URL_TOKEN}" FORBIDDEN_SOURCE_SHA="${FORBIDDEN_SOURCE_SHA}" node - <<'NODE'
const data=JSON.parse(process.env.NEGATIVE_JSON)
const target=process.env.RESOURCE_ID
const expectedSha=process.env.EXPECTED_SOURCE_SHA
const expectedUrlToken=process.env.EXPECTED_URL_TOKEN
const forbiddenSha=process.env.FORBIDDEN_SOURCE_SHA
if(!data.ok||data.resource_id!==target)throw new Error('Wrong-node isolation query failed for '+target)
if(data.source_sha256!==expectedSha)throw new Error('Wrong-node query escaped the opened resource source hash')
if(!(data.count>0)||!Array.isArray(data.evidence)||!data.evidence.length)throw new Error('Wrong-node query returned no local evidence')
if(!data.answer||data.answer.direct!==false)throw new Error('Wrong-node query must refuse a direct answer')
if(data.answer.resource_id&&data.answer.resource_id!==target)throw new Error('Wrong-node answer identity escaped the opened resource')
for(const item of data.evidence){
  if(item.resource_id!==target)throw new Error('Sibling resource_id leaked into wrong-node query')
  if(!String(item.chunk_key||'').includes('/'+expectedSha+'/'))throw new Error('Evidence chunk key escaped the opened resource source hash')
  if(String(item.chunk_key||'').includes('/'+forbiddenSha+'/'))throw new Error('PSLF sibling chunk leaked into non-PSLF node')
  if(!String(item.source_url||'').includes(expectedUrlToken))throw new Error('Evidence source URL escaped the opened node')
  if(!Number.isFinite(Number(item.score))||!item.chunk_sha256||!item.citation||!item.text)throw new Error('Wrong-node evidence provenance incomplete')
}
console.log('Explicit wrong-node isolation verified for '+target+' with '+data.count+' local evidence chunks')
NODE
done <<'EOF'
fat-money-management-checklist-pdf|How many qualifying payments are required for Public Service Loan Forgiveness?|971976a17e564319c53bf909ff180f31b3be6dcfdbea1b8fb966dc7b64074cae|money-management-checklist.pdf|a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a
fat-do-you-need-money-pdf|How many qualifying payments are required for Public Service Loan Forgiveness?|866bb8ed3b0202a86652f51c4ff461bfff3c4561d8397b7583e2914005e9328a|do-you-need-money.pdf|a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a
EOF

curl --fail-with-body -sS "${BASE_URL}/" -o /tmp/link-lane-root.html
node - <<'NODE'
const fs=require('fs')
const html=fs.readFileSync('/tmp/link-lane-root.html','utf8')
for(const marker of ['cvQuestion','Send','cvAnswerCard','ANSWER FROM THIS NODE','NO DIRECT ANSWER IN THIS NODE','Open Original ↗','← Return to Universe','/api/resource-chat/turn','NODE CHAT','cvChatLog','New Chat','cvSubmitChatTurn']){
  if(!html.includes(marker))throw new Error('Missing browser UI marker '+marker)
}
for(const forbidden of ['LAB_INGEST_TOKEN','X-Lab-Ingest-Token','/admin/query-pilot-resource','\\u2190 Return to Universe','Open Original \\u2197']){
  if(html.includes(forbidden))throw new Error('Secret/admin retrieval marker reached browser HTML: '+forbidden)
}
console.log('Browser Content Visor retrieval UI markers verified with no ingest-token/admin-route exposure')
NODE

node - <<'NODE'
const fs=require('fs')
const html=fs.readFileSync('/tmp/link-lane-root.html','utf8')
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1])
const browser=scripts.find(script=>script.includes('CV_PILOT_RESOURCE_IDS')&&script.includes('cvSubmitChatTurn'))
if(!browser)throw new Error('Generated Link Lane browser script was not found')
fs.writeFileSync('/tmp/afo-link-lane-browser.js',browser)
console.log('Extracted generated browser script bytes: '+Buffer.byteLength(browser))
NODE
node --check /tmp/afo-link-lane-browser.js

echo 'Generated browser script syntax verified'

GET_CODE="$(curl -sS -o /tmp/browser-get.json -w '%{http_code}' "${BASE_URL}/api/resource-retrieval/query")"
GET_CODE="${GET_CODE}" GET_JSON="$(cat /tmp/browser-get.json)" node - <<'NODE'
const data=JSON.parse(process.env.GET_JSON)
if(Number(process.env.GET_CODE)!==405||data.ok!==false)throw new Error('Browser route did not reject GET with 405')
console.log('Browser route POST-only behavior verified')
NODE

TYPE_CODE="$(curl -sS -o /tmp/browser-type.json -w '%{http_code}' -X POST "${BASE_URL}/api/resource-retrieval/query" -H 'Content-Type: text/plain' --data-binary '{}')"
TYPE_CODE="${TYPE_CODE}" TYPE_JSON="$(cat /tmp/browser-type.json)" node - <<'NODE'
const data=JSON.parse(process.env.TYPE_JSON)
if(Number(process.env.TYPE_CODE)!==415||data.ok!==false)throw new Error('Browser route accepted non-JSON content')
console.log('Browser route JSON-only behavior verified')
NODE

ORIGIN_CODE="$(curl -sS -o /tmp/browser-origin.json -w '%{http_code}' -X POST "${BASE_URL}/api/resource-retrieval/query" -H 'Content-Type: application/json' -H 'Origin: https://example.invalid' --data-binary '{"resource_id":"fat-pslf-infographic-pdf","question":"How many qualifying payments are required?"}')"
ORIGIN_CODE="${ORIGIN_CODE}" ORIGIN_JSON="$(cat /tmp/browser-origin.json)" node - <<'NODE'
const data=JSON.parse(process.env.ORIGIN_JSON)
if(Number(process.env.ORIGIN_CODE)!==403||data.ok!==false)throw new Error('Browser route accepted a cross-origin request')
console.log('Browser route cross-origin rejection verified')
NODE

ARBITRARY_CODE="$(curl -sS -o /tmp/browser-arbitrary.json -w '%{http_code}' -X POST "${BASE_URL}/api/resource-retrieval/query" -H 'Content-Type: application/json' --data-binary '{"resource_id":"not-an-approved-node","question":"What does this say?"}')"
ARBITRARY_CODE="${ARBITRARY_CODE}" ARBITRARY_JSON="$(cat /tmp/browser-arbitrary.json)" node - <<'NODE'
const data=JSON.parse(process.env.ARBITRARY_JSON)
if(Number(process.env.ARBITRARY_CODE)!==403||data.ok!==false)throw new Error('Browser route accepted an arbitrary resource ID')
console.log('Browser route pilot allowlist verified')
NODE

EXTRA_CODE="$(curl -sS -o /tmp/browser-extra.json -w '%{http_code}' -X POST "${BASE_URL}/api/resource-retrieval/query" -H 'Content-Type: application/json' --data-binary '{"resource_id":"fat-pslf-infographic-pdf","question":"How many qualifying payments are required?","top_k":20}')"
EXTRA_CODE="${EXTRA_CODE}" EXTRA_JSON="$(cat /tmp/browser-extra.json)" node - <<'NODE'
const data=JSON.parse(process.env.EXTRA_JSON)
if(Number(process.env.EXTRA_CODE)!==400||data.ok!==false)throw new Error('Browser route accepted extra request fields')
console.log('Browser route fixed request shape verified')
NODE

browser_query(){
  local resource_id="$1"
  local question="$2"
  local output="$3"
  RESOURCE_ID="${resource_id}" QUESTION="${question}" node -e "process.stdout.write(JSON.stringify({resource_id:process.env.RESOURCE_ID,question:process.env.QUESTION}))" > /tmp/browser-payload.json
  curl --fail-with-body -sS --max-time 120 -X POST "${BASE_URL}/api/resource-retrieval/query" -H 'Content-Type: application/json' --data-binary @/tmp/browser-payload.json > "${output}"
}

browser_query 'fat-pslf-infographic-pdf' 'How many qualifying payments are required for Public Service Loan Forgiveness?' /tmp/browser-pslf.json
BROWSER_JSON="$(cat /tmp/browser-pslf.json)" node - <<'NODE'
const data=JSON.parse(process.env.BROWSER_JSON)
const resource='fat-pslf-infographic-pdf'
const expectedSha='a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a'
if(!data.ok||data.resource_id!==resource||data.source_sha256!==expectedSha)throw new Error('PSLF browser retrieval identity mismatch')
if(!(data.count>0)||!Array.isArray(data.evidence)||!data.evidence.length)throw new Error('PSLF browser retrieval returned no evidence')
if(data.ranking_version!=='hybrid-vector-lexical-v1'||data.answer_mode!=='extractive-evidence-v1')throw new Error('PSLF answer-quality metadata mismatch')
if(!data.answer||data.answer.direct!==true||data.answer.resource_id!==resource)throw new Error('PSLF direct answer missing or escaped the selected node')
if(!/\b120\b/.test(String(data.answer.text||'')))throw new Error('PSLF direct answer does not contain 120')
if(!data.answer.citation)throw new Error('PSLF direct answer citation missing')
for(const item of data.evidence){
  if(item.resource_id!==resource||item.source_sha256!==expectedSha)throw new Error('PSLF browser evidence escaped the selected node')
  if(!Number.isFinite(Number(item.score))||!Number.isFinite(Number(item.rank_score))||!Number.isFinite(Number(item.lexical_score))||!item.citation||!item.text||!item.source_url||!item.chunk_key||!item.chunk_sha256)throw new Error('PSLF browser evidence or ranking provenance incomplete')
  if(!(Number(item.page_start)>=1)||!(Number(item.page_end)>=Number(item.page_start))||!Number.isFinite(Number(item.chunk_index)))throw new Error('PSLF browser evidence page/chunk metadata incomplete')
}
console.log('Browser PSLF positive retrieval verified with complete node-local provenance')
NODE

browser_query 'fat-money-management-checklist-pdf' 'How many qualifying payments are required for Public Service Loan Forgiveness?' /tmp/browser-wrong-node.json
BROWSER_JSON="$(cat /tmp/browser-wrong-node.json)" node - <<'NODE'
const data=JSON.parse(process.env.BROWSER_JSON)
const resource='fat-money-management-checklist-pdf'
const expectedSha='971976a17e564319c53bf909ff180f31b3be6dcfdbea1b8fb966dc7b64074cae'
const forbiddenSha='a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a'
if(!data.ok||data.resource_id!==resource||data.source_sha256!==expectedSha)throw new Error('Wrong-node browser retrieval identity mismatch')
if(!Array.isArray(data.evidence))throw new Error('Wrong-node browser evidence is not an array')
if(!data.answer||data.answer.direct!==false)throw new Error('Wrong-node browser query must refuse a direct answer')
if(data.answer.resource_id&&data.answer.resource_id!==resource)throw new Error('Wrong-node browser answer escaped the opened node')
if(/\b120\b/.test(String(data.answer.text||'')))throw new Error('Wrong-node browser answer leaked the PSLF answer')
for(const item of data.evidence){
  if(item.resource_id!==resource||item.source_sha256!==expectedSha)throw new Error('PSLF sibling identity leaked into Money Management response')
  const serialized=JSON.stringify(item)
  if(serialized.includes(forbiddenSha)||String(item.source_url||'').includes('pslf-infographic'))throw new Error('PSLF sibling provenance leaked into Money Management response')
  if(!String(item.source_url||'').includes('money-management-checklist.pdf'))throw new Error('Wrong-node evidence source URL escaped the opened node')
}
console.log('Browser wrong-node isolation verified for Money Management Checklist')
NODE

browser_query 'fat-how-financial-aid-works-graphic' 'How does a school determine a student financial aid offer?' /tmp/browser-image.json
BROWSER_JSON="$(cat /tmp/browser-image.json)" node - <<'NODE'
const data=JSON.parse(process.env.BROWSER_JSON)
const resource='fat-how-financial-aid-works-graphic'
if(!data.ok||data.resource_id!==resource)throw new Error('Image-node browser retrieval identity mismatch')
if(!(data.count>0)||!Array.isArray(data.evidence)||!data.evidence.length)throw new Error('Image-node browser retrieval returned no evidence')
if(!data.answer||data.answer.resource_id!==resource)throw new Error('Image-node extractive answer missing or escaped the selected node')
for(const item of data.evidence){
  if(item.resource_id!==resource||item.source_sha256!==data.source_sha256)throw new Error('Image-node retrieval escaped the selected node')
  if(!String(item.source_url||'').includes('how-financial-aid-works.pdf'))throw new Error('Image-node evidence source URL mismatch')
}
console.log('Browser image-based Financial Aid node retrieval verified')
NODE

if grep -R -n -E 'LAB_INGEST_TOKEN|X-Lab-Ingest-Token' /tmp/browser-pslf.json /tmp/browser-wrong-node.json /tmp/browser-image.json; then
  echo 'A secret marker appeared in browser retrieval output'
  exit 1
fi

echo 'Browser-safe node-local answer-quality and retrieval acceptance suite passed'
