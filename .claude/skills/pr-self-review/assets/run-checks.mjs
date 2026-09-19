#!/usr/bin/env node
// Step 2 of pr-self-review: deterministic checks for the packages the diff touches.
//
//   node collect-diff.mjs | node run-checks.mjs > checks.json
//   node run-checks.mjs --plan < collect.json        # print what would run, run nothing
//
// Reads collect-diff's JSON on stdin. Runs packages in parallel, each package's checks in order
// (typecheck before lint before tests). Prints a JSON array of results:
//   status: pass | fail | error   (error = could not run, e.g. dependencies not installed)
// The pnpm/npm children run under the same Node as this script, so start it with Node >= 22 on PATH.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoRoot } from './lib.mjs';

const TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_LINES = 60;

function runOne(root, check) {
  return new Promise((resolve) => {
    const cwd = join(root, check.dir);
    const started = Date.now();
    const base = { package: check.package, id: check.id, cmd: check.cmd, dir: check.dir };
    if (!existsSync(cwd)) return resolve({ ...base, status: 'error', exit_code: null, duration_ms: 0, output_tail: `directory ${check.dir} does not exist` });
    if (check.dir !== '.' && !existsSync(join(cwd, 'node_modules'))) {
      return resolve({ ...base, status: 'error', exit_code: null, duration_ms: 0, output_tail: `${check.dir}/node_modules is missing — install dependencies first` });
    }
    const env = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`, CI: '1', FORCE_COLOR: '0' };
    const child = spawn('sh', ['-c', check.cmd], { cwd, env });
    let out = '';
    const collect = (d) => { out += d; if (out.length > 2_000_000) out = out.slice(-1_000_000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    const finish = (code, note) => {
      clearTimeout(timer);
      const tail = out.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trimEnd().split('\n').slice(-TAIL_LINES).join('\n');
      resolve({
        ...base,
        status: code === 0 ? 'pass' : note ? 'error' : 'fail',
        exit_code: code,
        duration_ms: Date.now() - started,
        output_tail: note ? `${note}\n${tail}` : tail,
      });
    };
    child.on('error', (e) => finish(null, `could not start: ${e.message}`));
    child.on('close', (code, signal) => finish(code, signal ? `killed by ${signal} (timeout ${TIMEOUT_MS / 1000}s)` : undefined));
  });
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22 && !process.argv.includes('--plan')) {
    console.error(`run-checks: Node ${process.versions.node} is too old — the packages need Node >= 22. Put a Node 22 bin directory first on PATH and retry.`);
    process.exit(4);
  }
  const collected = JSON.parse(readFileSync(0, 'utf8'));
  const checks = collected.checks;
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify(checks, null, 2));
    return;
  }
  const root = repoRoot();
  const byPackage = new Map();
  for (const c of checks) (byPackage.get(c.package) ?? byPackage.set(c.package, []).get(c.package)).push(c);
  const lanes = [...byPackage.values()].map(async (lane) => {
    const results = [];
    for (const c of lane) results.push(await runOne(root, c));
    return results;
  });
  const results = (await Promise.all(lanes)).flat();
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}

main();
