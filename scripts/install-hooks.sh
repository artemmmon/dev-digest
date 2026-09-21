#!/usr/bin/env bash
#
# Install the pr-self-review git pre-push hook (symlink into this clone's hooks dir).
# Idempotent. Never overwrites a different existing pre-push hook.
#
#   ./scripts/install-hooks.sh            # install
#   ./scripts/install-hooks.sh --uninstall

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SRC="$ROOT/.claude/skills/pr-self-review/assets/pre-push"
# --git-path on the *directory*: on the file it would resolve our own symlink.
DEST="$(git -C "$ROOT" rev-parse --path-format=absolute --git-path hooks)/pre-push"

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ -L "$DEST" && "$(readlink "$DEST")" == "$SRC" ]]; then
    rm "$DEST"
    echo "removed $DEST"
  else
    echo "nothing to remove: $DEST is not the pr-self-review hook"
  fi
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
if [[ -L "$DEST" && "$(readlink "$DEST")" == "$SRC" ]]; then
  echo "already installed: $DEST"
elif [[ -e "$DEST" || -L "$DEST" ]]; then
  echo "a different pre-push hook already exists: $DEST" >&2
  echo "add this line to it instead:  \"$SRC\" \"\$@\"" >&2
  exit 1
else
  ln -s "$SRC" "$DEST"
  echo "installed: $DEST -> $SRC"
fi
