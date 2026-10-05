#!/usr/bin/env bash
#
# Run the checks for the packages your change touches and print only what matters:
# one line per check, and the output tail only for a check that failed or could not run.
# Meant for agents (implementer, test-writer, implementation-verifier) and humans alike —
# a passing run costs a few lines of context instead of pages of typecheck/lint/test output.
#
# It is a thin wrapper around the pr-self-review helpers, so "which packages, which checks"
# has one source of truth: .claude/skills/pr-self-review/assets/routing.json
# (`packages.<pkg>.checks` + `extraChecks`; a reviewer-core change also runs the server checks).
# Changed = commits since the merge-base with the base ref + staged, unstaged and untracked files.
#
#   ./scripts/check-changed.sh                    # checks for every touched package
#   ./scripts/check-changed.sh --only server      # just one package (repeatable)
#   ./scripts/check-changed.sh --base HEAD~3      # compare against another ref
#   ./scripts/check-changed.sh --check typecheck  # just one check id (repeatable): typecheck, lint, test, arch …
#   ./scripts/check-changed.sh --quick            # typecheck + only the tests related to the changed files
#   ./scripts/check-changed.sh --all              # keep going after a failure (default: a package stops at its first)
#   ./scripts/check-changed.sh --tail 80          # longer failure excerpts (default 30 lines)
#   ./scripts/check-changed.sh --plan             # list what would run, run nothing
#
# `--check test` also matches `test:unit`. `--quick` is for a step group that is not the last one:
# it swaps each package's test check for `vitest related --run <changed files>` and drops lint and
# arch; the full run belongs to the last group and to implementation-verifier.
# Integration tests (`pnpm test:integration` in server/) are NOT run: they need Postgres.
# Exit: 0 all passed · 1 a check failed · 2 a check could not run (e.g. deps not installed) · 3 usage.
# Full JSON results are kept in the log file printed on the last line.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
ASSETS="$ROOT/.claude/skills/pr-self-review/assets"

base_args=()
only=()
ids=()
tail_lines=30
plan=0
quick=0
fail_fast=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) base_args=(--base "${2:?--base needs a ref}"); shift 2 ;;
    --only) only+=("${2:?--only needs a package name}"); shift 2 ;;
    --check) ids+=("${2:?--check needs a check id}"); shift 2 ;;
    --quick) quick=1; shift ;;
    --all) fail_fast=0; shift ;;
    --tail) tail_lines="${2:?--tail needs a number}"; shift 2 ;;
    --plan) plan=1; shift ;;
    -h|--help) sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "check-changed: unknown argument $1 (see --help)" >&2; exit 3 ;;
  esac
done

# The packages need Node >= 22. When the shell's node is older, fall back to Homebrew's node@22.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if (( node_major < 22 )) && [[ -x /opt/homebrew/opt/node@22/bin/node ]]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/check-changed.XXXXXX")"
collect="$work/collect.json"
results="$work/results.json"

# collect-diff exits 3 when routing.json names an uninstalled skill; the checks are still valid.
( cd "$ROOT" && node "$ASSETS/collect-diff.mjs" ${base_args[@]+"${base_args[@]}"} > "$collect" ) || [[ $? -eq 3 ]]

# Narrow to --only packages (extra checks such as shared-contracts stay when their files changed),
# to --check ids, and in --quick mode to typecheck + the tests related to the changed files.
ONLY="${only[*]:-}" IDS="${ids[*]:-}" QUICK="$quick" node -e '
  const fs = require("fs");
  const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const only = (process.env.ONLY || "").split(" ").filter(Boolean);
  const ids = (process.env.IDS || "").split(" ").filter(Boolean);
  if (only.length) c.checks = c.checks.filter((k) => k.package === "." || only.includes(k.package));
  if (ids.length) c.checks = c.checks.filter((k) => ids.some((id) => k.id === id || k.id.startsWith(id + ":")));
  if (process.env.QUICK === "1") {
    const quote = (s) => `\x27${s.replace(/\x27/g, "")}\x27`;
    c.checks = c.checks.flatMap((k) => {
      if (k.package === "." || k.id === "typecheck") return [k];
      if (!/^test(:|$)/.test(k.id)) return [];
      const files = c.files
        .filter((f) => f.status !== "D" && f.path.startsWith(k.dir + "/") && /\.(ts|tsx)$/.test(f.path) && !f.path.endsWith(".it.test.ts"))
        .map((f) => quote(f.path.slice(k.dir.length + 1)));
      if (!files.length) return [];
      const run = k.cmd.startsWith("pnpm") ? "pnpm exec" : "npx";
      return [{ ...k, id: "test:related", cmd: `${run} vitest related --run --passWithNoTests --exclude \x27**/*.it.test.ts\x27 ${files.join(" ")}` }];
    });
  }
  fs.writeFileSync(process.argv[1], JSON.stringify(c));
  const pk = [...new Set(c.checks.map((k) => k.package).filter((p) => p !== "."))];
  console.log(`check-changed · base ${c.base} @ ${c.merge_base.slice(0, 8)} · ${c.files.length} changed files · packages: ${pk.join(", ") || "none"}`);
' "$collect"

if (( plan )); then
  node -e 'for (const k of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).checks) console.log(`  would run  ${k.dir.padEnd(14)} ${k.cmd}`)' "$collect"
  exit 0
fi

status=0
run_args=()
(( fail_fast )) && run_args=(--fail-fast)
( cd "$ROOT" && node "$ASSETS/run-checks.mjs" ${run_args[@]+"${run_args[@]}"} < "$collect" > "$results" ) || status=$?
if [[ ! -s "$results" ]]; then
  echo "check-changed: run-checks produced no results (exit $status)" >&2
  exit 2
fi

node -e '
  const fs = require("fs");
  const rs = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const tail = Number(process.argv[2]);
  if (!rs.length) { console.log("  nothing to check: no package files changed"); process.exit(0); }
  for (const r of rs) {
    const where = r.package === "." ? r.id : `${r.package} ${r.id}`;
    const cmd = r.cmd.length > 110 ? r.cmd.slice(0, 107) + "..." : r.cmd;
    console.log(`${(r.status === "skipped" ? "skip" : r.status).toUpperCase().padEnd(5)} ${where.padEnd(26)} ${(r.duration_ms / 1000).toFixed(0).padStart(4)}s  ${r.status === "skipped" ? r.output_tail : cmd}`);
    if (r.status === "skipped") continue;
    if (r.status !== "pass") {
      const lines = (r.output_tail || "").split("\n").slice(-tail);
      console.log(lines.map((l) => "      " + l).join("\n"));
    }
  }
  const failed = rs.filter((r) => r.status === "fail").length;
  const errored = rs.filter((r) => r.status === "error").length;
  const skipped = rs.filter((r) => r.status === "skipped").length;
  console.log(failed || errored ? `${failed} failed, ${errored} could not run, ${skipped} skipped, of ${rs.length} checks` : `all ${rs.length} checks passed`);
  process.exit(failed ? 1 : errored ? 2 : 0);
' "$results" "$tail_lines" && status=0 || status=$?
echo "log: $results"
exit "$status"
