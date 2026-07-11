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
console.log('Live version and retrieval bindings verified')
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
console.log('Indexed '+result.resource_id+' with '+result.chunk_count+' chunks')
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
const indexed=(data.rows||[]).filter(r=>r.index_state==='indexed')
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
  if(!Number.isFinite(Number(item.score)))throw new Error('Missing vector score')
  if(!item.chunk_key||!item.chunk_sha256||!item.citation||!item.text)throw new Error('Incomplete evidence provenance')
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
