#!/usr/bin/env bash
#
# Keep the two copies of the Zod contracts identical. The server copy is canonical
# (reviewer-core reads it too); the client keeps a copy because packages don't
# share code (root AGENTS.md → "Cross-package rules").
#
#   ./scripts/shared-contracts.sh check   # exit 1 + diff when the copies differ (CI)
#   ./scripts/shared-contracts.sh sync    # overwrite the client copy from the server

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server/src/vendor/shared"
CLIENT="$ROOT/client/src/vendor/shared"

case "${1:-}" in
  check)
    if diff -r "$SERVER" "$CLIENT"; then
      echo "vendor/shared: server and client copies are identical"
    else
      echo >&2
      echo "vendor/shared copies differ (lines marked < are the server's)." >&2
      echo "Edit server/src/vendor/shared, then run: ./scripts/shared-contracts.sh sync" >&2
      exit 1
    fi
    ;;
  sync)
    rsync -a --delete "$SERVER/" "$CLIENT/"
    echo "copied server/src/vendor/shared → client/src/vendor/shared"
    ;;
  *)
    sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
