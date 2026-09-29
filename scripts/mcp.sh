#!/usr/bin/env bash
#
# Launch the devdigest-mcp stdio server (mcp/). Claude Code runs this from .mcp.json.
#
# stdout is the MCP protocol channel: nothing here may print to it, and the server is
# started with tsx directly, never through `pnpm run` (which prints a banner to stdout).
# All diagnostics go to stderr. No arguments and no user input reach this script;
# configuration is read from the environment by mcp/src/config.ts
# (DEVDIGEST_API_URL, DEVDIGEST_MCP_MAX_WAIT_S). The DevDigest API must be running
# (./scripts/dev.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Node >= 22 is required. When the shell's node is older, fall back to Homebrew's node@22
# (same rule as scripts/check-changed.sh).
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( node_major < 22 )) && [[ -x /opt/homebrew/opt/node@22/bin/node ]]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

if [[ ! -x "$ROOT/mcp/node_modules/.bin/tsx" ]]; then
  echo "devdigest-mcp: dependencies are missing. Run: cd mcp && pnpm install" >&2
  exit 1
fi

exec "$ROOT/mcp/node_modules/.bin/tsx" "$ROOT/mcp/src/index.ts"
