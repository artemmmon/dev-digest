#!/usr/bin/env node
// Final step of pr-self-review: turn checks + findings into a verdict and store it where the gate reads it.
//
//   node write-verdict.mjs --collect collect.json --checks checks.json --findings findings.json
//
// The verdict is computed here, not by the model: BLOCK iff there is at least one blocking item.
//   blocking = failed check  |  finding with severity CRITICAL  |  suspicious generated file
// Findings must carry file, line, rule, severity; incomplete findings are rejected (exit 2).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { repoRoot, verdictPath } from './lib.mjs';

const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];

export function buildVerdict({ collect, checks, findings, now = new Date() }) {
  const problems = [];
  findings.forEach((f, i) => {
    for (const k of ['severity', 'file', 'line', 'rule', 'title']) {
      if (f[k] === undefined || f[k] === null || f[k] === '') problems.push(`finding #${i}: missing "${k}"`);
    }
    if (f.severity && !SEVERITIES.includes(f.severity)) problems.push(`finding #${i}: severity must be one of ${SEVERITIES.join('|')}`);
  });
  if (problems.length) return { error: problems };

  const blocking = [
    ...checks.filter((c) => c.status === 'fail').map((c) => ({ source: 'check', package: c.package, id: c.id, cmd: c.cmd, exit_code: c.exit_code })),
    ...findings.filter((f) => f.severity === 'CRITICAL').map((f) => ({ source: 'finding', file: f.file, line: f.line, rule: f.rule, title: f.title })),
    ...collect.suspicious_generated.map((s) => ({ source: 'generated', file: s.path, reason: s.reason })),
  ];
  const count = (sev) => findings.filter((f) => f.severity === sev).length;
  return {
    schema: 1,
    verdict: blocking.length ? 'BLOCK' : 'PASS',
    created_at: now.toISOString(),
    branch: collect.branch,
    head_sha: collect.head_sha,
    base: collect.base,
    merge_base: collect.merge_base,
    diff_hash: collect.diff_hash,
    counts: { critical: count('CRITICAL') + blocking.filter((b) => b.source !== 'finding').length, warning: count('WARNING') + collect.unmapped_skills.length, suggestion: count('SUGGESTION') },
    blocking,
    not_verified: checks.filter((c) => c.status === 'error').map((c) => ({ package: c.package, id: c.id, why: c.output_tail.split('\n')[0] })),
    unmapped_skills: collect.unmapped_skills,
    findings,
    override: null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const read = (name) => {
    const p = arg(name);
    if (!p) { console.error(`write-verdict: ${name} <file> is required`); process.exit(2); }
    return JSON.parse(readFileSync(p, 'utf8'));
  };
  const collect = read('--collect');
  const checks = read('--checks');
  const findings = read('--findings');
  const v = buildVerdict({ collect, checks, findings });
  if (v.error) {
    console.error(`write-verdict: refusing incomplete findings:\n  ${v.error.join('\n  ')}`);
    process.exit(2);
  }
  const root = repoRoot();
  const path = verdictPath(root, collect.branch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(v, null, 2));
  console.log(JSON.stringify({ verdict: v.verdict, path, counts: v.counts, blocking: v.blocking }, null, 2));
  process.exit(v.verdict === 'BLOCK' ? 1 : 0);
}
