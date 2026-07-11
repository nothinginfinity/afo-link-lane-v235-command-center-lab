#!/usr/bin/env bash
set -euo pipefail

VECTOR_INDEX="${VECTOR_INDEX:-afo-link-lane-v235-lab-resources-v1}"
D1_DATABASE="${D1_DATABASE:-afo-link-lane-v235-lab-db}"
CONFIG="${WRANGLER_CONFIG:-wrangler.jsonc}"

# Bounded retry/backoff wrapper for flaky Cloudflare API reads (specifically
# `wrangler vectorize list-metadata-index`, which has been observed to
# intermittently return an HTML error page instead of JSON: "Received a
# malformed response from the API"). Captures the command label, attempt
# number, exit status, stderr, an HTML-vs-JSON signal, and a short sanitized
# body preview to stderr on every failed attempt, so a future failing run's
# logs show what actually broke instead of a bare exit code. Fails closed:
# after RETRY_MAX_ATTEMPTS it returns non-zero and never treats a failed read
# as "index has no metadata properties" -- callers under `set -e` will still
# abort the script rather than silently bypass the check.
retry_json_command() {
  RETRY_LABEL="$1"; shift
  RETRY_MAX_ATTEMPTS=5
  RETRY_ATTEMPT=1
  RETRY_OUT="$(mktemp)"
  RETRY_ERR="$(mktemp)"
  while [ "${RETRY_ATTEMPT}" -le "${RETRY_MAX_ATTEMPTS}" ]; do
    if "$@" >"${RETRY_OUT}" 2>"${RETRY_ERR}"; then
      RETRY_FIRST_CHAR="$(head -c 1 "${RETRY_OUT}" 2>/dev/null || true)"
      if [ "${RETRY_FIRST_CHAR}" = "{" ] || [ "${RETRY_FIRST_CHAR}" = "[" ]; then
        cat "${RETRY_OUT}"
        rm -f "${RETRY_OUT}" "${RETRY_ERR}"
        return 0
      fi
      RETRY_EXIT_STATUS=0
      RETRY_NOTE="command exited 0 but output did not look like JSON"
    else
      RETRY_EXIT_STATUS=$?
      RETRY_NOTE="command exited nonzero"
    fi
    RETRY_PREVIEW="$(head -c 300 "${RETRY_OUT}" 2>/dev/null | tr -d '\000' | tr '\n' ' ' || true)"
    RETRY_LOOKS_HTML="no"
    case "${RETRY_PREVIEW}" in
      *"<!DOCTYPE"*|*"<html"*) RETRY_LOOKS_HTML="yes" ;;
    esac
    RETRY_STDERR_PREVIEW="$(head -c 300 "${RETRY_ERR}" 2>/dev/null | tr -d '\000' | tr '\n' ' ' || true)"
    echo "[retry_json_command] label=${RETRY_LABEL} attempt=${RETRY_ATTEMPT}/${RETRY_MAX_ATTEMPTS} exit_status=${RETRY_EXIT_STATUS} looks_html=${RETRY_LOOKS_HTML} note=\"${RETRY_NOTE}\"" >&2
    echo "[retry_json_command] label=${RETRY_LABEL} attempt=${RETRY_ATTEMPT} stderr_preview=\"${RETRY_STDERR_PREVIEW}\"" >&2
    echo "[retry_json_command] label=${RETRY_LABEL} attempt=${RETRY_ATTEMPT} body_preview=\"${RETRY_PREVIEW}\"" >&2
    if [ "${RETRY_ATTEMPT}" -eq "${RETRY_MAX_ATTEMPTS}" ]; then
      rm -f "${RETRY_OUT}" "${RETRY_ERR}"
      echo "[retry_json_command] label=${RETRY_LABEL} failed after ${RETRY_MAX_ATTEMPTS} attempts -- failing closed, not bypassing verification" >&2
      return 1
    fi
    RETRY_BACKOFF=$((2 ** RETRY_ATTEMPT))
    RETRY_JITTER=$((RANDOM % 3))
    RETRY_SLEEP_FOR=$((RETRY_BACKOFF + RETRY_JITTER))
    echo "[retry_json_command] label=${RETRY_LABEL} retrying in ${RETRY_SLEEP_FOR}s" >&2
    sleep "${RETRY_SLEEP_FOR}"
    RETRY_ATTEMPT=$((RETRY_ATTEMPT + 1))
  done
}

if npx wrangler vectorize get "${VECTOR_INDEX}" --config "${CONFIG}" >/tmp/vectorize-get.json 2>/tmp/vectorize-get.err; then
  cat /tmp/vectorize-get.json
  echo "Vectorize index already exists"
else
  cat /tmp/vectorize-get.err || true
  npx wrangler vectorize create "${VECTOR_INDEX}" --dimensions=768 --metric=cosine --description="AFO Link Lane lab Financial Aid Toolkit chunks" --config "${CONFIG}"
fi

for PROPERTY in resource_id source_sha256 domain resource_type
do
  META_JSON="$(retry_json_command "list-metadata-index:${PROPERTY}" npx wrangler vectorize list-metadata-index "${VECTOR_INDEX}" --json --config "${CONFIG}")"
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

retry_json_command "list-metadata-index:final" npx wrangler vectorize list-metadata-index "${VECTOR_INDEX}" --json --config "${CONFIG}"
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
