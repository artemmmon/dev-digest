#!/usr/bin/env node
// Step 1 of pr-self-review: what is in the PR, and which skills review which files.
//
//   node collect-diff.mjs [--base <ref>] [--summary]
//
// Prints one JSON document (or a human table with --summary). Exit 0 always, unless the
// repo/base cannot be read (exit 1) or routing.json references a skill that is not installed (exit 3).
import {
  changedFiles,
  diffHash,
  includedFiles,
  installedSkills,
  loadRouting,
  makeMatcher,
  repoRoot,
} from './lib.mjs';

export function analyse({ routing, root, change, installed }) {
  const isExcluded = makeMatcher(routing.excluded);
  const generatedGroups = routing.generated.map((g) => ({ ...g, match: makeMatcher(g.globs) }));

  const included = includedFiles(routing, change);
  const excluded = change.files.filter((f) => isExcluded(f.path)).map((f) => f.path);

  const generated = [];
  const reviewable = [];
  for (const f of included) {
    const g = generatedGroups.find((x) => x.match(f.path));
    if (g) generated.push({ ...f, group: g.id });
    else if (f.status !== 'D') reviewable.push(f);
  }
  const deleted = included.filter((f) => f.status === 'D' && !generatedGroups.some((x) => x.match(f.path)));

  // --- skill routing -------------------------------------------------------
  const rules = routing.rules.map((r) => ({
    ...r,
    match: makeMatcher(r.globs),
    skip: makeMatcher(r.ignore ?? []),
  }));
  const groups = {}; // skill -> { rules:Set, files:Set }
  const unrouted = [];
  for (const f of reviewable) {
    let hit = false;
    for (const r of rules) {
      if (!r.match(f.path) || r.skip(f.path)) continue;
      hit = true;
      for (const s of r.skills) {
        const g = (groups[s] ??= { rules: new Set(), files: new Set() });
        g.rules.add(r.id);
        g.files.add(f.path);
      }
    }
    if (!hit) unrouted.push(f.path);
  }

  // --- skill drift ---------------------------------------------------------
  const routed = new Set(routing.rules.flatMap((r) => r.skills));
  const known = new Set([...routed, ...Object.keys(routing.nonReviewSkills)]);
  const unmappedSkills = installed.filter((s) => !known.has(s));
  const missingSkills = [...routed].filter((s) => !installed.includes(s)).sort();

  // --- generated files: hand edits ----------------------------------------
  const touched = (glob) => makeMatcher([glob]);
  const anyTouched = (m) => included.some((f) => m(f.path));
  const suspicious = [];
  for (const f of generated) {
    if (f.group === 'migrations') {
      const schemaChanged = anyTouched(touched('server/src/db/schema{.ts,/**}'));
      const journalChanged = anyTouched(touched('server/src/db/migrations/meta/_journal.json'));
      if (!schemaChanged || !journalChanged) {
        suspicious.push({
          path: f.path,
          reason: !schemaChanged
            ? 'migration changed without a schema change'
            : 'migration changed without meta/_journal.json — looks hand-edited',
        });
      }
    } else if (f.group === 'lockfiles') {
      const dir = f.path.split('/')[0];
      if (!anyTouched(touched(`${dir}/package.json`))) {
        suspicious.push({ path: f.path, reason: 'lock file changed without package.json — looks hand-edited' });
      }
    }
  }

  // --- packages and checks -------------------------------------------------
  const packages = Object.entries(routing.packages)
    .filter(([, p]) => included.some((f) => f.path.startsWith(`${p.dir}/`)))
    .map(([name]) => name);
  // server type-checks against reviewer-core source, so a reviewer-core change also runs the server checks.
  if (packages.includes('reviewer-core') && !packages.includes('server')) packages.push('server');
  const checks = [];
  for (const name of packages) {
    for (const c of routing.packages[name].checks) {
      checks.push({ package: name, dir: routing.packages[name].dir, ...c });
    }
  }
  for (const c of routing.extraChecks) {
    const m = makeMatcher(c.when);
    if (included.some((f) => m(f.path))) checks.push({ package: '.', dir: c.dir, id: c.id, cmd: c.cmd });
  }

  const skillsTouched = [
    ...new Set(included.map((f) => f.path.match(/^\.claude\/skills\/([^/]+)\//)?.[1]).filter(Boolean)),
  ].sort();

  return {
    base: change.base,
    merge_base: change.mergeBase,
    head_sha: change.headSha,
    branch: change.branch,
    empty: included.length === 0,
    diff_hash: diffHash(root, change.mergeBase, included.map((f) => f.path)),
    files: included,
    reviewable: reviewable.map((f) => f.path),
    excluded,
    deleted: deleted.map((f) => f.path),
    generated,
    suspicious_generated: suspicious,
    packages,
    checks,
    skill_groups: Object.fromEntries(
      Object.entries(groups)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([s, g]) => [s, { rules: [...g.rules].sort(), files: [...g.files].sort() }]),
    ),
    correctness_only: unrouted.sort(),
    skills_touched: skillsTouched,
    unmapped_skills: unmappedSkills,
    missing_skills: missingSkills,
  };
}

function summary(r) {
  const out = [];
  out.push(`branch ${r.branch}  base ${r.base} @ ${r.merge_base.slice(0, 8)}  head ${r.head_sha.slice(0, 8)}`);
  out.push(`${r.files.length} files in the PR, hash ${r.diff_hash.slice(0, 12)}${r.empty ? '  (EMPTY)' : ''}`);
  out.push(`packages: ${r.packages.join(', ') || '-'}`);
  out.push('');
  for (const [skill, g] of Object.entries(r.skill_groups)) out.push(`  ${skill.padEnd(26)} ${g.files.length} files`);
  out.push(`  ${'(correctness only)'.padEnd(26)} ${r.correctness_only.length} files`);
  if (r.suspicious_generated.length) {
    out.push('', 'SUSPICIOUS generated files:');
    for (const s of r.suspicious_generated) out.push(`  ${s.path}: ${s.reason}`);
  }
  if (r.unmapped_skills.length) out.push('', `WARNING unmapped skills: ${r.unmapped_skills.join(', ')}`);
  if (r.missing_skills.length) out.push('', `ERROR routing.json names skills that are not installed: ${r.missing_skills.join(', ')}`);
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const baseOverride = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const root = repoRoot();
  const routing = loadRouting();
  let result;
  try {
    const change = changedFiles(routing, root, baseOverride);
    result = analyse({ routing, root, change, installed: installedSkills(root) });
  } catch (err) {
    console.error(`collect-diff: ${err.message}`);
    process.exit(1);
  }
  console.log(args.includes('--summary') ? summary(result) : JSON.stringify(result, null, 2));
  if (result.missing_skills.length) process.exit(3);
}
