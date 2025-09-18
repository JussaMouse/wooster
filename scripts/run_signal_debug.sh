#!/usr/bin/env bash
set -euo pipefail

# Move to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

mkdir -p logs

# Enable high-visibility logging
export LOGGING_CONSOLE_QUIET_MODE=false
export LOGGING_CONSOLE_LOG_LEVEL=DEBUG
export LOGGING_FILE_LOG_LEVEL=DEBUG
export CODE_AGENT_DEBUG=1

# Helper to mask sensitive numbers in output
mask() {
  local v="${1:-}"
  if [[ -z "$v" ]]; then echo ""; return; fi
  local len=${#v}
  if (( len <= 4 )); then echo "****"; return; fi
  echo "${v:0:2}***${v: -2}"
}

# Show effective Signal env context (masked)
CLI_PATH="${SIGNAL_CLI_PATH:-/opt/homebrew/bin/signal-cli}"
ACCNT="${SIGNAL_CLI_NUMBER:-}"
TO="${SIGNAL_TO:-}"
GROUP="${SIGNAL_GROUP_ID:-}"

echo "[run_signal_debug] Using signal-cli: ${CLI_PATH}"
echo "[run_signal_debug] Account: $(mask "$ACCNT")  To: $(mask "$TO")  Group: $(mask "$GROUP")"

if [[ -x "$CLI_PATH" ]]; then
  echo "[run_signal_debug] signal-cli version:"
  "$CLI_PATH" --version || true
else
  echo "[run_signal_debug][WARN] signal-cli not executable at '${CLI_PATH}'. Update SIGNAL_CLI_PATH if needed."
fi

echo "[run_signal_debug] Building..."
pnpm -s build

ts="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="logs/run_${ts}.log"
echo "[run_signal_debug] Starting Wooster. Mirroring logs to ${LOG_FILE}"
echo "[run_signal_debug] Tip: in another shell, run: rg -n 'Signal: exec send|SANDBOX|Agent execution result|sendSignal called|signalNotify called' ${LOG_FILE} logs/wooster_session.log" || true

node dist/index.js 2>&1 | tee -a "${LOG_FILE}"


