#!/usr/bin/env bash
# The upload of the `pharos-report` action (INT-04, ADR-0054 §5). Inputs come
# as PHAROS_* variables (action.yml); scripts/int04-smoke.mjs runs this same
# file against a local server. Needs bash, curl and gzip, and jq or node to
# read JSON: every GitHub-hosted runner has them all.
set -euo pipefail

fail_on_error="${PHAROS_FAIL_ON_ERROR:-true}"
out() { if [ -n "${GITHUB_OUTPUT:-}" ]; then printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; fi; }
summary() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"; fi; }

# A pull request from a fork gets no secrets: nothing to do, nothing failed.
if [ -z "${PHAROS_TOKEN:-}" ]; then
  echo "::notice title=Pharos::No token (a pull request from a fork has no secrets): no report was uploaded."
  out uploaded 0
  out failed 0
  exit 0
fi
echo "::add-mask::${PHAROS_TOKEN}"

for tool in curl gzip; do
  command -v "$tool" >/dev/null || { echo "::error title=Pharos::$tool is not installed on this runner."; exit 1; }
done

# JSON and URL helpers: jq when the runner has it, else node.
#   jget JSON PATH  -> the value at PATH (".run.key"), empty when absent or null
#   uri VALUE       -> VALUE encoded for a URL
#   jstr VALUE      -> VALUE as a JSON string
if command -v jq >/dev/null; then
  jget() { jq -r "($2) // empty" <<< "$1" 2>/dev/null || true; }
  uri() { jq -rn --arg v "$1" '$v|@uri'; }
  jstr() { jq -n --arg v "$1" '$v'; }
elif command -v node >/dev/null; then
  jget() {
    node -e 'let o; try { o = JSON.parse(process.argv[1]); } catch { o = null; }
      const v = process.argv[2].split(".").filter(Boolean).reduce((a, k) => (a == null ? a : a[k]), o);
      process.stdout.write(v == null ? "" : String(v));' "$1" "$2"
  }
  uri() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }
  jstr() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }
else
  echo "::error title=Pharos::jq or node is needed on this runner."
  exit 1
fi

# The server: https, or http only for this machine.
server="${PHAROS_SERVER%/}"
case "$server" in
  https://*) proto='=https' ;;
  http://localhost | http://localhost:* | http://127.0.0.1 | http://127.0.0.1:*) proto='=http' ;;
  *)
    echo "::error title=Pharos::The server must be https:// (http:// only for localhost): $server"
    exit 1
    ;;
esac
project="${PHAROS_PROJECT:?project is required}"

# The run: one per workflow run, shared by the jobs of a matrix.
external_id="${PHAROS_EXTERNAL_ID:-}"
if [ -z "$external_id" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  external_id="github:${GITHUB_REPOSITORY:-}:${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT:-1}"
fi
run_name="${PHAROS_RUN_NAME:-}"
if [ -z "$run_name" ] && [ -n "${GITHUB_WORKFLOW:-}" ]; then
  branch="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}"
  run_name="${GITHUB_WORKFLOW} · ${branch} · ${GITHUB_SHA:0:7}"
fi

# One authenticated call. The token reaches curl through its config on stdin
# (-K -), never through the command line or the log.
# call METHOD PATH [curl args...] -> prints "<body>\n<status>"
call() {
  local method="$1" path="$2"
  shift 2
  printf 'header = "Authorization: Bearer %s"\n' "$PHAROS_TOKEN" |
    curl -sS -K - --proto "$proto" --max-redirs 0 --retry 3 --retry-delay 2 \
      --connect-timeout 15 --max-time 300 \
      -X "$method" -w '\n%{http_code}' "$@" "${server}/api/v1${path}"
}
status_of() { printf '%s' "${1##*$'\n'}"; }
body_of() { printf '%s' "${1%$'\n'*}"; }

# The files: one pattern per line; `**` reaches subfolders.
shopt -s globstar nullglob
files=()
missing=()
while IFS= read -r pattern || [ -n "$pattern" ]; do
  pattern="${pattern#"${pattern%%[![:space:]]*}"}"
  pattern="${pattern%"${pattern##*[![:space:]]}"}"
  [ -z "$pattern" ] && continue
  # shellcheck disable=SC2206 # the pattern is meant to expand
  matched=($pattern)
  found=0
  for f in "${matched[@]+"${matched[@]}"}"; do
    if [ -f "$f" ]; then
      files+=("$f")
      found=1
    fi
  done
  [ "$found" = 0 ] && missing+=("$pattern")
done <<< "${PHAROS_FILES:-}"
shopt -u globstar nullglob

for pattern in "${missing[@]+"${missing[@]}"}"; do
  echo "::warning title=Pharos::No file matches «$pattern»."
done

format_name() {
  case "$1" in
    junit) echo JUnit ;;
    sarif) echo SARIF ;;
    k6) echo k6 ;;
    axe) echo axe ;;
    ctrf) echo CTRF ;;
    playwright_json) echo "Playwright JSON" ;;
    cucumber_messages) echo "Cucumber Messages" ;;
    pharos_run_json) echo "Pharos Run JSON" ;;
    *) echo "$1" ;;
  esac
}
cell() { if [ -z "${1:-}" ] || [ "$1" = "0" ]; then echo "—"; else echo "$1"; fi; }

run_key=""
run_url=""
uploaded=0
failed=0
rows=""
close="${PHAROS_CLOSE:-false}"

# Several files without an externalId: the run is created first, empty and
# open, because the server closes at once a run that an upload creates; it is
# closed at the end. (With an externalId the run stays open for the other
# jobs of a matrix, and the last one closes it.)
if [ -z "$external_id" ] && [ "${#files[@]}" -gt 1 ]; then
  run_body="{}"
  if [ -n "$run_name" ] && [ -n "${PHAROS_CYCLE:-}" ]; then
    run_body="{\"name\":$(jstr "$run_name"),\"cycleKey\":$(jstr "$PHAROS_CYCLE")}"
  elif [ -n "$run_name" ]; then
    run_body="{\"name\":$(jstr "$run_name")}"
  elif [ -n "${PHAROS_CYCLE:-}" ]; then
    run_body="{\"cycleKey\":$(jstr "$PHAROS_CYCLE")}"
  fi
  created="$(call POST "/projects/$(uri "$project")/runs" -H "Content-Type: application/json" \
    --data-binary "$run_body" || true)"
  case "$(status_of "$created")" in
    200 | 201)
      run_key="$(jget "$(body_of "$created")" .runKey)"
      [ -z "$run_key" ] && run_key="$(jget "$(body_of "$created")" .run.runKey)"
      close=true
      ;;
    *)
      echo "::error title=Pharos::Could not create the run (HTTP $(status_of "$created") $(jget "$(body_of "$created")" .code))."
      files=()
      failed=1
      ;;
  esac
fi

for f in "${files[@]+"${files[@]}"}"; do
  query="fileName=$(uri "$(basename "$f")")"
  if [ -n "$run_key" ]; then
    query="$query&runKey=$(uri "$run_key")"
  else
    [ -n "$external_id" ] && query="$query&externalId=$(uri "$external_id")"
    [ -n "$run_name" ] && query="$query&runName=$(uri "$run_name")"
    [ -n "${PHAROS_CYCLE:-}" ] && query="$query&cycleKey=$(uri "$PHAROS_CYCLE")"
  fi
  [ -n "${PHAROS_FORMAT:-}" ] && query="$query&format=$(uri "$PHAROS_FORMAT")"
  [ -n "${PHAROS_CONFIGURATION:-}" ] && query="$query&configuration=$(uri "$PHAROS_CONFIGURATION")"
  [ -n "${PHAROS_CASE:-}" ] && query="$query&caseKey=$(uri "$PHAROS_CASE")"

  # Over 64 KB: gzip on the way.
  body="$f"
  encoding=()
  if [ "$(wc -c < "$f")" -gt 65536 ]; then
    body="$(mktemp)"
    gzip -c "$f" > "$body"
    encoding=(-H "Content-Encoding: gzip")
  fi
  response="$(call POST "/projects/$(uri "$project")/results?$query" \
    -H "Content-Type: application/octet-stream" "${encoding[@]+"${encoding[@]}"}" \
    --data-binary "@$body" || true)"
  [ "$body" != "$f" ] && rm -f "$body"
  status="$(status_of "$response")"
  json="$(body_of "$response")"

  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    uploaded=$((uploaded + 1))
    run_key="$(jget "$json" .run.key)"
    url="$(jget "$json" .run.url)"
    [ -n "$url" ] && run_url="$url"
    format="$(format_name "$(jget "$json" .shard.format)")"
    note=""
    [ "$(jget "$json" .shard.created)" = "false" ] && note=" (ya estaba)"
    unlinked="$(jget "$json" .counts.unlinked)"
    echo "✓ $f · $format · $run_key$note"
    rows+="| \`$f\`$note | $format | $(cell "$(jget "$json" .counts.byStatus.passed)") | $(cell "$(jget "$json" .counts.byStatus.failed)") | $(cell "$(jget "$json" .counts.byStatus.skipped)") | $(cell "$(jget "$json" .counts.findings)") | $(cell "$(jget "$json" .counts.metrics)") |"$'\n'
    if [ -n "$unlinked" ] && [ "$unlinked" != "0" ]; then
      echo "::warning title=Pharos::$f: $unlinked tests sin caso. Añade la etiqueta @<prefijo>n del caso al nombre del test para vincularlos."
    fi
  else
    failed=$((failed + 1))
    code="$(jget "$json" .code)"
    message="$(jget "$json" .message)"
    reason="$(jget "$json" .reason)"
    if [ -z "$status" ] || [ "$status" = "000" ]; then message="no se pudo conectar con $server"; fi
    echo "::error title=Pharos::$f: HTTP ${status:-?} ${code:+[$code] }${message}${reason:+ ($reason)}"
    rows+="| \`$f\` | ✗ HTTP ${status:-?} ${code} | | | | | |"$'\n'
    # Without the token or the project nothing else can go.
    case "$status" in 401 | 403 | 404 | 000 | "") break ;; esac
  fi
done

if [ "$close" = "true" ]; then
  if [ -z "$run_key" ] && [ -n "$external_id" ]; then
    created="$(call POST "/projects/$(uri "$project")/runs" -H "Content-Type: application/json" \
      --data-binary "{\"externalId\":$(jstr "$external_id")}" || true)"
    case "$(status_of "$created")" in
      200 | 201)
        run_key="$(jget "$(body_of "$created")" .runKey)"
        [ -z "$run_key" ] && run_key="$(jget "$(body_of "$created")" .run.runKey)"
        ;;
    esac
  fi
  if [ -n "$run_key" ]; then
    closed="$(call POST "/projects/$(uri "$project")/runs/$(uri "$run_key")/close" \
      -H "Content-Type: application/json" --data-binary '{"status":"completed"}' || true)"
    if [ "$(status_of "$closed")" = "200" ]; then
      echo "✓ $run_key cerrado"
    else
      echo "::error title=Pharos::No se pudo cerrar $run_key (HTTP $(status_of "$closed"))."
      failed=$((failed + 1))
    fi
  fi
fi

if [ $((uploaded + failed)) -gt 0 ]; then
  summary "### Pharos · ${run_key:-—}"
  summary ""
  if [ -n "$run_url" ]; then summary "Proyecto $project · [Abrir en Pharos]($run_url)"; else summary "Proyecto $project"; fi
  summary ""
  summary "| Informe | Formato | Pasan | Fallan | Omitidos | Hallazgos | Métricas |"
  summary "|---|---|---:|---:|---:|---:|---:|"
  summary "${rows%$'\n'}"
  summary ""
fi
out run-key "$run_key"
out run-url "$run_url"
out uploaded "$uploaded"
out failed "$failed"
echo "Pharos: $uploaded subidos, $failed fallidos${run_key:+, run $run_key}."
if [ "$failed" -gt 0 ] && [ "$fail_on_error" = "true" ]; then
  exit 1
fi
if [ $((uploaded + failed)) -eq 0 ] && [ "${#missing[@]}" -gt 0 ] && [ "$fail_on_error" = "true" ]; then
  echo "::error title=Pharos::No report file was found."
  exit 1
fi
