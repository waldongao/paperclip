#!/usr/bin/env bash
# Local checkout helper. Keep lifecycle management in Paperclip's dev runner.
set -euo pipefail
umask 077

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

usage() {
  cat <<'EOF'
Usage: bash scripts/local-env.sh <command>

  setup       Install dependencies and repair workspace package links
  start       Start the local dev server in this terminal (Ctrl+C to stop)
  stop        Stop this checkout's registered local dev server
  restart     Stop, then start the local dev server in this terminal
  status      Show registered processes and check the live health endpoint
  logs        Follow the local dev server output
  pnpm ...    Run the exact pnpm version declared in package.json

Optional machine settings: .env.local (see .env.local.example).
Default state: .paperclip-local; URL: http://127.0.0.1:3100
EOF
}

command_name="${1:-help}"
if [[ $# -gt 0 ]]; then shift; fi
case "$command_name" in
  help|-h|--help) usage; exit 0 ;;
  setup|start|stop|restart|status|logs|pnpm) ;;
  *) usage >&2; exit 2 ;;
esac
if [[ "$command_name" != pnpm && $# -gt 0 ]]; then
  printf 'Unexpected argument: %s\n' "$1" >&2
  exit 2
fi

# This is an operator-owned shell file, ignored by Git. Never copy .env.example:
# that template selects an external PostgreSQL database instead of local state.
if [[ -f .env.local ]]; then
  set -a
  source .env.local
  set +a
fi
if [[ -n "${PAPERCLIP_LOCAL_NODE_BIN:-}" ]]; then
  export PATH="$PAPERCLIP_LOCAL_NODE_BIN:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js 24.11+ is required. Set PAPERCLIP_LOCAL_NODE_BIN in .env.local.\n' >&2
  exit 1
fi
node --input-type=module -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 11)) {
    console.error(`Node.js 24.11+ is required; found ${process.version}. Set PAPERCLIP_LOCAL_NODE_BIN in .env.local.`);
    process.exit(1);
  }
'

# Proxy settings apply only to this script and its children. Keep local API
# traffic direct, including when a shell already exports a proxy.
if [[ -n "${PAPERCLIP_LOCAL_PROXY:-}" ]]; then
  export http_proxy="$PAPERCLIP_LOCAL_PROXY" https_proxy="$PAPERCLIP_LOCAL_PROXY"
  export HTTP_PROXY="$PAPERCLIP_LOCAL_PROXY" HTTPS_PROXY="$PAPERCLIP_LOCAL_PROXY"
  export npm_config_proxy="$PAPERCLIP_LOCAL_PROXY" npm_config_https_proxy="$PAPERCLIP_LOCAL_PROXY"
fi
export no_proxy="localhost,127.0.0.1,::1${no_proxy:+,$no_proxy}${NO_PROXY:+,$NO_PROXY}"
export NO_PROXY="$no_proxy"

package_manager="$(node -p 'require("./package.json").packageManager')"
pnpm_command=(npm exec --yes "--package=$package_manager" -- pnpm)
if command -v pnpm >/dev/null 2>&1 && [[ "$(pnpm --version 2>/dev/null)" == "${package_manager#pnpm@}" ]]; then
  pnpm_command=(pnpm)
fi
run_pnpm() { "${pnpm_command[@]}" "$@"; }

if [[ "$command_name" == pnpm ]]; then
  run_pnpm "$@"
  exit 0
fi
if [[ "$command_name" == setup ]]; then
  printf 'Preparing %s with Node %s and %s\n' "$project_dir" "$(node --version)" "$package_manager"
  # Preserve the product's locked dependencies. A manifest/lockfile mismatch
  # must be reported instead of automatically rewriting product files.
  run_pnpm install --frozen-lockfile
  run_pnpm preflight:workspace-links
  printf 'Dependencies ready. Start with: bash scripts/local-env.sh start\n'
  exit 0
fi

# A linked worktree needs the native worktree configuration and its own ports.
# Do not redirect it to this main checkout's data root.
if [[ -f .git ]]; then
  printf 'This helper starts the main local checkout. For a linked worktree, run:\n  bash scripts/local-env.sh pnpm paperclipai worktree init\n  bash scripts/local-env.sh pnpm dev\n' >&2
  exit 1
fi

export PAPERCLIP_HOME="$(node -p 'require("node:path").resolve(process.env.PAPERCLIP_LOCAL_DATA_DIR || ".paperclip-local")')"
export PAPERCLIP_INSTANCE_ID=default
export PAPERCLIP_CONFIG="$PAPERCLIP_HOME/instances/default/config.json"
export PAPERCLIP_CONTEXT="$PAPERCLIP_HOME/context.json"
export PORT="${PAPERCLIP_LOCAL_PORT:-3100}"
node -e 'const p=Number(process.env.PORT); if (!Number.isInteger(p) || p<1 || p>65535) {console.error("PAPERCLIP_LOCAL_PORT must be an integer from 1 to 65535"); process.exit(1)}'
service_url="http://127.0.0.1:$PORT"
log_file="$PAPERCLIP_HOME/local-server.log"

require_dependencies() {
  if [[ ! -f cli/node_modules/tsx/dist/cli.mjs ]]; then
    printf 'Dependencies are missing. Run: bash scripts/local-env.sh setup\n' >&2
    exit 1
  fi
}

start_server() {
  require_dependencies
  run_pnpm preflight:workspace-links
  mkdir -p "$PAPERCLIP_HOME"
  printf 'Starting %s\nState: %s\nLog: %s\n' "$service_url" "$PAPERCLIP_HOME" "$log_file"
  # The foreground process remains registered with the existing supervisor.
  run_pnpm dev --data-dir "$PAPERCLIP_HOME" --bind loopback 2>&1 | tee -a "$log_file"
}

case "$command_name" in
  start) start_server ;;
  stop)
    require_dependencies
    run_pnpm dev:stop --data-dir "$PAPERCLIP_HOME"
    ;;
  restart)
    require_dependencies
    run_pnpm dev:stop --data-dir "$PAPERCLIP_HOME"
    start_server
    ;;
  status)
    require_dependencies
    printf 'Node: %s | pnpm: %s\nState: %s\nURL: %s\n' "$(node --version)" "${package_manager#pnpm@}" "$PAPERCLIP_HOME" "$service_url"
    run_pnpm dev:list --data-dir "$PAPERCLIP_HOME"
    curl --noproxy '*' --fail --silent --show-error --max-time 5 "$service_url/api/health" |
      node --input-type=module -e '
        let body = "";
        for await (const chunk of process.stdin) body += chunk;
        if (!body) { console.error("Server is not responding. Run start or inspect logs."); process.exit(1); }
        const health = JSON.parse(body);
        console.log(JSON.stringify(health, null, 2));
        if (health.status !== "ok" || (health.bootstrapStatus && health.bootstrapStatus !== "ready")) process.exit(1);
      '
    ;;
  logs)
    if [[ ! -f "$log_file" ]]; then
      printf 'No log yet. Run: bash scripts/local-env.sh start\n' >&2
      exit 1
    fi
    exec tail -n 80 -F "$log_file"
    ;;
esac
