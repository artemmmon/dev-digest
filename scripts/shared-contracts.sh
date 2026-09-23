#!/usr/bin/env bash
#
# Keep the two copies of the Zod contracts in sync. The server copy is canonical
# (reviewer-core reads it too); the client keeps a copy because packages don't
# share code (root AGENTS.md → "Cross-package rules").
#
# The two copies are content-identical, NOT byte-identical: the client copy has
# the `.js` extension stripped from every relative import/export specifier
# (`from './contracts/x.js'` -> `from './contracts/x'`). The server needs the
# extension (Node's `NodeNext` ESM resolution requires it, and `tsx` runs the
# server as real ESM); Next's webpack/Turbopack, in this project's Next 15.5.19
# install, fails to resolve it for a client runtime import that reaches the
# barrel for the first time (client/INSIGHTS.md, 2026-09-23) — `tsc`
# (`moduleResolution: "Bundler"`) and vitest's resolver both handle either form
# fine, which is why this went unnoticed until a client file first imported a
# real value (not just a type) from `@devdigest/shared`.
#
#   ./scripts/shared-contracts.sh check   # exit 1 + diff when the copies differ (CI)
#   ./scripts/shared-contracts.sh sync    # overwrite the client copy from the server

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/server/src/vendor/shared"
CLIENT="$ROOT/client/src/vendor/shared"

# Strip the `.js` extension from relative import/export specifiers in every
# .ts file under $1. `sed -i.bak` (not `-i ''` / `-i`) is the one in-place-edit
# form both BSD sed (macOS) and GNU sed (CI, Linux) accept identically.
strip_js_extensions() {
  local dir="$1" f
  while IFS= read -r -d '' f; do
    sed -i.bak -E "s#(from ['\"]\.\.?/[^'\"]+)\.js(['\"])#\1\2#g" "$f"
    rm -f "$f.bak"
  done < <(find "$dir" -name '*.ts' -print0)
}

case "${1:-}" in
  check)
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    cp -R "$SERVER/." "$tmp/"
    strip_js_extensions "$tmp"
    if diff -r "$tmp" "$CLIENT"; then
      echo "vendor/shared: client copy matches the server's (relative-import .js extensions intentionally stripped)"
    else
      echo >&2
      echo "vendor/shared copies differ beyond the .js-extension normalisation" >&2
      echo "(lines marked < are the server's, after normalisation)." >&2
      echo "Edit server/src/vendor/shared, then run: ./scripts/shared-contracts.sh sync" >&2
      exit 1
    fi
    ;;
  sync)
    rsync -a --delete "$SERVER/" "$CLIENT/"
    strip_js_extensions "$CLIENT"
    echo "copied server/src/vendor/shared → client/src/vendor/shared (.js extensions stripped from relative imports for the client bundler)"
    ;;
  *)
    sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
