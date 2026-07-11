#!/usr/bin/env bash
set -euo pipefail

VECTOR_INDEX="${VECTOR_INDEX:-afo-link-lane-v235-lab-resources-v1}"
D1_DATABASE="${D1_DATABASE:-afo-link-lane-v235-lab-db}"
CONFIG="${WRANGLER_CONFIG:-wrangler.jsonc}"

if npx wrangler vectorize get "${VECTOR_INDEX}" --config "${CONFIG}" >/tmp/vectorize-get.json 2>/tmp/vectorize-get.err; then
  cat /tmp/vectorize-get.json
  echo "Vectorize index already exists"
else
  cat /tmp/vectorize-get.err || true
  npx wrangler vectorize create "${VECTOR_INDEX}" --dimensions=768 --metric=cosine --description="AFO Link Lane lab Financial Aid Toolkit chunks" --config "${CONFIG}"
fi

for PROPERTY in resource_id source_sha256 domain resource_type
do
  META_JSON="$(npx wrangler vectorize list-metadata-index "${VECTOR_INDEX}" --json --config "${CONFIG}")"
  echo "${META_JSON}"
  if META_JSON="${META_JSON}" PROPERTY="${PROPERTY}" node - <<'NODE'
const data=JSON.parse(process.env.META_JSON)
const target=process.env.PROPERTY
let found=false
function walk(value){
  if(found)return
  if(value===target){found=true;return}
  if(Array.isArray(value)){value.forEach(walk);return}
  if(value&&typeof value==='object')Object.values(value).forEach(walk)
}
walk(data)
process.exit(found?0:1)
NODE
  then
    echo "Metadata index already exists: ${PROPERTY}"
  else
    npx wrangler vectorize create-metadata-index "${VECTOR_INDEX}" --propertyName="${PROPERTY}" --type=string --config "${CONFIG}"
  fi
done

npx wrangler vectorize list-metadata-index "${VECTOR_INDEX}" --json --config "${CONFIG}"
npx wrangler d1 migrations apply "${D1_DATABASE}" --remote --config "${CONFIG}"

SCHEMA_JSON="$(npx wrangler d1 execute "${D1_DATABASE}" --remote --json --config "${CONFIG}" --command "SELECT name, sql FROM sqlite_master WHERE name IN ('resource_chunks','idx_resource_chunks_active','idx_resource_chunks_source','idx_resource_chunks_vector') ORDER BY name")"
echo "${SCHEMA_JSON}"
SCHEMA_JSON="${SCHEMA_JSON}" node - <<'NODE'
const data=JSON.parse(process.env.SCHEMA_JSON)
const text=JSON.stringify(data)
for(const name of ['resource_chunks','idx_resource_chunks_active','idx_resource_chunks_source','idx_resource_chunks_vector']){
  if(!text.includes(name))throw new Error('Missing D1 schema object '+name)
}
console.log('D1 resource chunk ledger verified')
NODE
