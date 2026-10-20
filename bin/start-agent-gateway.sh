#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
GATEWAY_ROOT="$PROJECT_ROOT/agent-gateway"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install Node.js 22.19+ and enable pnpm 10 with corepack." >&2
  exit 1
fi

if [ ! -d "$GATEWAY_ROOT/node_modules" ]; then
  echo "Agent Gateway dependencies are not installed." >&2
  echo "Run: cd agent-gateway && pnpm install" >&2
  exit 1
fi

export PI_WORKSPACE_DIR="${PI_WORKSPACE_DIR:-$PROJECT_ROOT}"
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3000}"

cd "$GATEWAY_ROOT"
echo "Starting Agent Gateway from $GATEWAY_ROOT"
echo "Agent workspace: $PI_WORKSPACE_DIR"
exec pnpm start

