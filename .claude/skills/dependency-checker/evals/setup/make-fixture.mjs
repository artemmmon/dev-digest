#!/usr/bin/env node
/**
 * Builds the `mini-repo` fixture for the dependency-checker evals: four tiny packages with
 * hand-made `node_modules` whose files are sparse, so sizes are exact and nothing big is
 * committed. Nothing in the generated files hints at what is planted.
 *
 *   node make-fixture.mjs <dest> [--no-modules] [--with-skill]
 *
 * `--with-skill` copies this skill (without its evals/) into <dest>/.claude/skills/, so the
 * documented command `node .claude/skills/dependency-checker/assets/dep-report.mjs` works
 * from <dest>; leave it out for the baseline arm.
 *
 * Planted (the answer key lives in ../evals.json, never in the fixture):
 *   server  -> moment declared, never imported; relative import into reviewer-core
 *   client  -> lodash imported, declared nowhere (hoisted by npm); zod one minor behind
 *   next    -> 132 MB runtime dependency; react-dom is its peer and never imported
 */
import { cpSync, existsSync, mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dest = resolve(process.argv[2] ?? '');
const withModules = !process.argv.includes('--no-modules');
const withSkill = process.argv.includes('--with-skill');
if (!process.argv[2]) {
  console.error('usage: make-fixture.mjs <dest> [--no-modules]');
  process.exit(2);
}
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });

const MB = 1024 * 1024;
const put = (rel, text = '') => {
  const p = join(dest, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};
const json = (rel, obj) => put(rel, JSON.stringify(obj, null, 2) + '\n');
/** A fake installed package: a manifest plus one sparse file of `bytes`. */
const mod = (pkg, name, version, bytes, extra = {}) => {
  if (!withModules) return;
  const dir = `${pkg}/node_modules/${name}`;
  json(`${dir}/package.json`, { name, version, main: 'index.js', ...extra });
  put(`${dir}/index.js`);
  truncateSync(join(dest, dir, 'index.js'), Math.round(bytes));
};

// ---- server (pnpm) ---------------------------------------------------------------------
json('server/package.json', {
  name: '@mini/api', version: '0.1.0', private: true, type: 'module',
  scripts: { start: 'node dist/server.js', test: 'vitest run', typecheck: 'tsc --noEmit' },
  dependencies: { fastify: '^5.1.0', zod: '^3.23.8', pg: '^8.13.0', moment: '^2.30.1' },
  devDependencies: { vitest: '^2.1.4', typescript: '^5.6.3' },
});
put('server/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
json('server/tsconfig.json', { compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./src/vendor/shared/*'] } } });
put('server/src/vendor/shared/review-types.ts', "export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';\n");
put('server/src/index.ts', [
  "import Fastify from 'fastify';",
  "import { z } from 'zod';",
  "import pg from 'pg';",
  "import type { Severity } from '@shared/review-types';",
  "import { runPipeline } from '../../reviewer-core/src/pipeline.js';",
  '',
  'const app = Fastify();',
  'const Body = z.object({ diff: z.string() });',
  "app.post('/review', async (req) => runPipeline(Body.parse(req.body).diff));",
  'export const pool = new pg.Pool();',
  "export const level: Severity = 'WARNING';",
  'export default app;',
  '',
].join('\n'));
put('server/test/index.test.ts', "import { describe, it, expect } from 'vitest';\ndescribe('x', () => it('y', () => expect(1).toBe(1)));\n");
mod('server', 'fastify', '5.1.0', 6.5 * MB);
mod('server', 'zod', '3.23.8', 2.1 * MB);
mod('server', 'pg', '8.13.0', 3.8 * MB);
mod('server', 'moment', '2.30.1', 4.2 * MB);
mod('server', 'vitest', '2.1.4', 21 * MB, { bin: { vitest: 'index.js' } });
mod('server', 'typescript', '5.6.3', 22 * MB, { bin: { tsc: 'index.js' } });

// ---- client (npm) ----------------------------------------------------------------------
json('client/package.json', {
  name: '@mini/web', version: '0.1.0', private: true,
  scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
  dependencies: { next: '15.0.3', react: '19.0.0', 'react-dom': '19.0.0', zod: '^3.22.4', 'date-fns': '^4.1.0' },
  devDependencies: { typescript: '^5.6.3' },
});
put('client/package-lock.json', '{ "lockfileVersion": 3 }\n');
json('client/tsconfig.json', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } });
put('client/src/app/page.tsx', [
  "import Link from 'next/link';",
  "import { format } from 'date-fns';",
  "import { z } from 'zod';",
  "import { slug } from '@/lib/util';",
  '',
  'const Query = z.object({ q: z.string() });',
  'export default function Page() {',
  "  return <Link href={`/${slug('Home')}`}>{format(new Date(), 'PP')}</Link>;",
  '}',
  '',
].join('\n'));
put('client/src/lib/util.ts', "import kebabCase from 'lodash/kebabCase';\nexport const slug = (s: string) => kebabCase(s);\n");
mod('client', 'next', '15.0.3', 132 * MB, { peerDependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' } });
mod('client', 'react', '19.0.0', 0.4 * MB);
mod('client', 'react-dom', '19.0.0', 6.9 * MB);
mod('client', 'zod', '3.22.4', 1.9 * MB);
mod('client', 'date-fns', '4.1.0', 22 * MB);
mod('client', 'lodash', '4.17.21', 1.4 * MB);
mod('client', 'typescript', '5.6.3', 22 * MB, { bin: { tsc: 'index.js' } });

// ---- reviewer-core (npm) ---------------------------------------------------------------
json('reviewer-core/package.json', {
  name: '@mini/reviewer-core', version: '0.1.0', private: true,
  scripts: { typecheck: 'tsc --noEmit' },
  dependencies: { zod: '^3.23.8' }, devDependencies: { typescript: '^5.6.3' },
});
put('reviewer-core/package-lock.json', '{ "lockfileVersion": 3 }\n');
json('reviewer-core/tsconfig.json', { compilerOptions: {} });
put('reviewer-core/src/pipeline.ts', "import { z } from 'zod';\nconst Diff = z.string();\nexport const runPipeline = (d: string) => Diff.parse(d).length;\n");
mod('reviewer-core', 'zod', '3.23.8', 2.1 * MB);
mod('reviewer-core', 'typescript', '5.6.3', 22 * MB, { bin: { tsc: 'index.js' } });

// ---- e2e (npm) -------------------------------------------------------------------------
json('e2e/package.json', {
  name: '@mini/e2e', version: '0.1.0', private: true,
  scripts: { test: 'playwright test' },
  devDependencies: { playwright: '^1.48.2', typescript: '^5.6.3' },
});
put('e2e/package-lock.json', '{ "lockfileVersion": 3 }\n');
json('e2e/tsconfig.json', { compilerOptions: {} });
put('e2e/tests/smoke.spec.ts', "import { test } from 'playwright';\ntest('opens', async () => {});\n");
mod('e2e', 'playwright', '1.48.2', 210 * MB, { bin: { playwright: 'index.js' } });
mod('e2e', 'typescript', '5.6.3', 22 * MB, { bin: { tsc: 'index.js' } });

if (withSkill) {
  const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  cpSync(skillDir, join(dest, '.claude', 'skills', basename(skillDir)), {
    recursive: true,
    filter: (src) => !/[\\/]evals([\\/]|$)/.test(src.slice(skillDir.length)),
  });
}

console.log(dest);
