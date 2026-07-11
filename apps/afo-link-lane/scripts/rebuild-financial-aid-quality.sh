#!/usr/bin/env bash
set -euo pipefail

if [ -z "${LAB_INGEST_TOKEN:-}" ]; then
  echo "LAB_INGEST_TOKEN is required"
  exit 1
fi

BASE_URL="${BASE_URL:-${HEALTH_URL%/health}}"
WORK_DIR="${RUNNER_TEMP:-/tmp}/afo-financial-aid-quality"
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

while IFS='|' read -r RESOURCE_ID SOURCE_URL EXPECTED_SHA
 do
  [ -n "${RESOURCE_ID}" ] || continue
  PDF_PATH="${WORK_DIR}/${RESOURCE_ID}.pdf"
  TXT_PATH="${WORK_DIR}/${RESOURCE_ID}.txt"
  PAYLOAD_PATH="${WORK_DIR}/${RESOURCE_ID}.json"

  curl -fL --retry 4 --retry-all-errors --connect-timeout 20 --max-time 240 \
    -A 'Mozilla/5.0 (compatible; AFOLinkLaneLabReadingOrder/2.0)' \
    -H 'Accept: application/pdf' \
    "${SOURCE_URL}" -o "${PDF_PATH}"

  if [ "$(head -c 5 "${PDF_PATH}")" != "%PDF-" ]; then
    echo "Downloaded resource is not a PDF: ${RESOURCE_ID}"
    exit 1
  fi

  ACTUAL_SHA="$(sha256sum "${PDF_PATH}" | awk '{print $1}')"
  if [ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]; then
    echo "Source SHA changed for ${RESOURCE_ID}: expected ${EXPECTED_SHA}, got ${ACTUAL_SHA}"
    exit 1
  fi

  PAGE_COUNT="$(pdfinfo "${PDF_PATH}" | awk -F: '/^Pages:/{gsub(/ /,"",$2);print $2}')"
  if ! [[ "${PAGE_COUNT}" =~ ^[0-9]+$ ]] || [ "${PAGE_COUNT}" -lt 1 ]; then
    echo "Invalid page count for ${RESOURCE_ID}: ${PAGE_COUNT}"
    exit 1
  fi

  pdftotext -raw -enc UTF-8 "${PDF_PATH}" "${TXT_PATH}"
  python3 - "${TXT_PATH}" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8", errors="strict")
text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
pages = text.split("\f")
clean_pages = []
for page in pages:
    lines = [line.rstrip() for line in page.split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    clean_pages.append("\n".join(lines))
path.write_text("\f".join(clean_pages), encoding="utf-8")
PY

  TEXT_SHA="$(sha256sum "${TXT_PATH}" | awk '{print $1}')"
  RESOURCE_ID="${RESOURCE_ID}" SOURCE_SHA="${ACTUAL_SHA}" TEXT_SHA="${TEXT_SHA}" PAGE_COUNT="${PAGE_COUNT}" TXT_PATH="${TXT_PATH}" PAYLOAD_PATH="${PAYLOAD_PATH}" python3 - <<'PY'
import json
import os
from pathlib import Path
payload = {
    "resource_id": os.environ["RESOURCE_ID"],
    "source_sha256": os.environ["SOURCE_SHA"],
    "text_sha256": os.environ["TEXT_SHA"],
    "page_count": int(os.environ["PAGE_COUNT"]),
    "extraction_engine": "pdftotext-raw-v2",
    "text": Path(os.environ["TXT_PATH"]).read_text(encoding="utf-8"),
}
Path(os.environ["PAYLOAD_PATH"]).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
PY

  STORE_JSON="$(curl --fail-with-body -sS --max-time 120 -X POST "${BASE_URL}/admin/store-pilot-text" \
    -H 'Content-Type: application/json' \
    -H "X-Lab-Ingest-Token: ${LAB_INGEST_TOKEN}" \
    --data-binary "@${PAYLOAD_PATH}")"
  echo "${STORE_JSON}"
  STORE_JSON="${STORE_JSON}" RESOURCE_ID="${RESOURCE_ID}" SOURCE_SHA="${ACTUAL_SHA}" TEXT_SHA="${TEXT_SHA}" PAGE_COUNT="${PAGE_COUNT}" node - <<'NODE'
const data=JSON.parse(process.env.STORE_JSON)
if(!data.ok)throw new Error('Text storage failed: '+JSON.stringify(data))
if(data.resource_id!==process.env.RESOURCE_ID)throw new Error('Stored resource ID mismatch')
if(data.source_sha256!==process.env.SOURCE_SHA)throw new Error('Stored source SHA mismatch')
if(data.text_sha256!==process.env.TEXT_SHA)throw new Error('Stored text SHA mismatch')
if(data.page_count!==Number(process.env.PAGE_COUNT))throw new Error('Stored page count mismatch')
if(data.extraction_engine!=='pdftotext-raw-v2')throw new Error('Stored extraction engine mismatch')
console.log('Stored reading-order text for '+data.resource_id)
NODE
 done <<'RESOURCES'
fat-do-you-need-money-pdf|https://studentaid.gov/sites/default/files/do-you-need-money.pdf|866bb8ed3b0202a86652f51c4ff461bfff3c4561d8397b7583e2914005e9328a
fat-money-management-checklist-pdf|https://studentaid.gov/sites/default/files/money-management-checklist.pdf|971976a17e564319c53bf909ff180f31b3be6dcfdbea1b8fb966dc7b64074cae
fat-pslf-infographic-pdf|https://studentaid.gov/sites/default/files/pslf-infographic.pdf|a94826164435a3266f35bcfbeda24e0aaaeb5fa8db1bbd9867bd34f67153752a
fat-how-financial-aid-works-graphic|https://studentaid.gov/sites/default/files/how-financial-aid-works.pdf|18999beff8d14938192ae4f65cb5e5290d137a447d1913938777b27b43dd9cbb
fat-federal-student-loan-graphic|https://studentaid.gov/sites/default/files/get-loan.pdf|b3723ee15170848d4aa34c06565188884088160e4a24f21f82b3127cef253125
RESOURCES

cat > "${WORK_DIR}/index.json" <<'JSON'
{"resource_ids":["fat-do-you-need-money-pdf","fat-money-management-checklist-pdf","fat-pslf-infographic-pdf","fat-how-financial-aid-works-graphic","fat-federal-student-loan-graphic"]}
JSON

INDEX_JSON="$(curl --fail-with-body -sS --max-time 300 -X POST "${BASE_URL}/admin/index-pilot-resources" \
  -H 'Content-Type: application/json' \
  -H "X-Lab-Ingest-Token: ${LAB_INGEST_TOKEN}" \
  --data-binary "@${WORK_DIR}/index.json")"
echo "${INDEX_JSON}"
INDEX_JSON="${INDEX_JSON}" node - <<'NODE'
const data=JSON.parse(process.env.INDEX_JSON)
if(!data.ok||data.failed!==0)throw new Error('Pilot re-index failed: '+JSON.stringify(data))
if(data.chunker_version!=='pdf-page-v2-reading-order')throw new Error('Chunker version mismatch')
if(data.normalizer!=='pdf-reading-order-v2')throw new Error('Normalizer mismatch')
if(!Array.isArray(data.results)||data.results.length!==5||data.results.some(item=>!item.ok))throw new Error('Expected five successful re-index results')
for(const item of data.results){
  if(item.chunker_version!=='pdf-page-v2-reading-order'||item.normalizer!=='pdf-reading-order-v2')throw new Error('Per-resource quality metadata mismatch')
}
console.log('Five pilot resources rebuilt with reading-order text and re-indexed')
NODE
