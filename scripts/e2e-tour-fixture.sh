#!/usr/bin/env bash
#
# Build the onboarding-tour e2e fixture checkout: a tiny git repository holding
# e2e/fixtures/tour-repo, placed where the API's GitClient looks for the clone of
# `devdigest-fixtures/tour-sample` (<clone-dir>/<owner>/<name>).
#
#   scripts/e2e-tour-fixture.sh <clone-dir>
#
# Prints the checkout path on stdout. Idempotent: an existing checkout is rebuilt.
# No network; the commit has a fixed author and date so the sha is stable.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/e2e/fixtures/tour-repo"

[ "$#" -eq 1 ] && [ -n "$1" ] || { echo "usage: $0 <clone-dir>" >&2; exit 2; }
[ -d "$SRC" ] || { echo "fixture tree not found: $SRC" >&2; exit 1; }

CLONE_DIR="$1"
mkdir -p "$CLONE_DIR"
CLONE_DIR="$(cd "$CLONE_DIR" && pwd)"
DEST="$CLONE_DIR/devdigest-fixtures/tour-sample"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"

GIT_DATE="2026-01-01T00:00:00Z"
export GIT_AUTHOR_DATE="$GIT_DATE" GIT_COMMITTER_DATE="$GIT_DATE"

git -C "$DEST" init --quiet --initial-branch=main
git -C "$DEST" add --all --force
git -C "$DEST" \
  -c user.name="DevDigest Fixtures" -c user.email="fixtures@devdigest.invalid" \
  -c commit.gpgsign=false \
  commit --quiet --message "fixture: tour-sample"

printf '%s\n' "$DEST"
