#!/usr/bin/env node
/**
 * dep-report.mjs — facts about the npm dependencies of a repo made of separate packages
 * (no workspace): what each package declares, what is installed, how much it weighs, what
 * is unused / undeclared / drifting, and how the packages depend on each other.
 *
 *   node dep-report.mjs [--root <repo>] [--packages server,client] [--format md|json|mermaid]
 *                       [--top 8] [--audit]
 *
 * Default format is `md`: sections 1-4 of the report (scope, graph, sizes, findings), ready
 * to paste. `json` is the same data for the model to read details from. Sizes come from the
 * installed `node_modules` only; a package that is not installed gets `null`, never a guess.
 * `--audit` runs `pnpm audit` / `npm audit` per package (needs network); nothing else does.
 *
 * Node >= 18, no dependencies. Read-only: never installs, never edits.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

// ---------------------------------------------------------------------------------------
// Tunables. Every threshold of the severity ladder lives here and in references/severity.md.
// ---------------------------------------------------------------------------------------
const HEAVY_BYTES = 25 * 1024 * 1024; // a dependency that pulls >= 25 MB (with its own deps)
const DUP_WASTE_BYTES = 5 * 1024 * 1024; // duplicated installs wasting >= 5 MB
/** Packages whose copies exchange runtime values (schemas, errors): drift is never harmless. */
const CONTRACT_PKGS = new Set(['zod']);
/** The framework a package is built on: big by nature, nothing to act on, so not a `heavy-dependency` finding. */
const FRAMEWORK_PKGS = new Set(['next', 'react', 'react-dom', 'fastify', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', '@angular/core']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', 'clones', 'results', 'out', '.turbo', 'docs']);
const SRC_EXT = /\.(?:[cm]?[jt]sx?)$/;
const CONFIG_EXT = /\.(?:[cm]?[jt]s|json|ya?ml)$/;
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

// ---------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const has = (n) => argv.includes(`--${n}`);
const FORMAT = flag('format', 'md');
const TOP = Number(flag('top', '8'));
const ROOT = resolve(flag('root', gitRoot() ?? process.cwd()));
const ONLY = flag('packages', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!['md', 'json', 'mermaid'].includes(FORMAT)) die(`--format must be md, json or mermaid, got "${FORMAT}"`);

function die(msg) {
  process.stderr.write(`dep-report: ${msg}\n`);
  process.exit(2);
}
function gitRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// ---------------------------------------------------------------------------------------
// Small fs helpers
// ---------------------------------------------------------------------------------------
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
/** tsconfig is JSONC: drop comments and trailing commas without touching strings. */
function parseJsonc(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}
function walkFiles(dir, visit, depth = 0) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walkFiles(join(dir, e.name), visit, depth + 1);
    } else if (e.isFile()) visit(join(dir, e.name), depth);
  }
}

// ---------------------------------------------------------------------------------------
// Installed sizes: resolve like Node does, so the pnpm symlink layout and the npm hoisted
// layout both work. Size = apparent bytes of the package's own files; its dependencies are
// separate nodes of the closure, so nothing is counted twice.
// ---------------------------------------------------------------------------------------
const selfSizeCache = new Map();
function selfSize(realDir) {
  if (selfSizeCache.has(realDir)) return selfSizeCache.get(realDir);
  let total = 0;
  const stack = [realDir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') stack.push(p);
      } else if (e.isFile()) {
        try {
          total += lstatSync(p).size;
        } catch {
          /* vanished */
        }
      }
    }
  }
  selfSizeCache.set(realDir, total);
  return total;
}
function resolveInstalled(name, fromRealDir, stopAt = null) {
  let d = fromRealDir;
  for (;;) {
    const cand = basename(d) === 'node_modules' ? join(d, name) : join(d, 'node_modules', name);
    if (existsSync(join(cand, 'package.json'))) {
      try {
        return realpathSync(cand);
      } catch {
        return cand;
      }
    }
    const up = dirname(d);
    if (up === d || d === stopAt) return null;
    d = up;
  }
}
const pkgJsonCache = new Map();
const pkgJsonAt = (realDir) => {
  if (!pkgJsonCache.has(realDir)) pkgJsonCache.set(realDir, readJson(join(realDir, 'package.json')) ?? {});
  return pkgJsonCache.get(realDir);
};
/** Everything one install pulls: Map<realDir, {name, version, bytes}>. */
function closure(realDir, acc = new Map()) {
  if (acc.has(realDir)) return acc;
  const pj = pkgJsonAt(realDir);
  acc.set(realDir, { name: pj.name ?? basename(realDir), version: pj.version ?? '?', bytes: selfSize(realDir) });
  const next = { ...(pj.dependencies ?? {}), ...(pj.optionalDependencies ?? {}) };
  for (const dep of Object.keys(next)) {
    const r = resolveInstalled(dep, realDir);
    if (r) closure(r, acc);
  }
  return acc;
}
const sumBytes = (m) => [...m.values()].reduce((a, v) => a + v.bytes, 0);

// ---------------------------------------------------------------------------------------
// Discover packages
// ---------------------------------------------------------------------------------------
function discoverPackages() {
  const found = [];
  if (existsSync(join(ROOT, 'package.json')) && readJson(join(ROOT, 'package.json'))?.dependencies) {
    found.push({ dirName: '.', dir: ROOT });
  }
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    if (existsSync(join(ROOT, e.name, 'package.json'))) found.push({ dirName: e.name, dir: join(ROOT, e.name) });
  }
  // Every package, always: `--packages` narrows what is analysed and reported, not what is known.
  // An alias or a relative import that leaves a narrowed package must still resolve to its target.
  return found;
}
function hasTsconfigText(dir) {
  try {
    return readFileSync(join(dir, 'tsconfig.json'), 'utf8');
  } catch {
    return '';
  }
}
function lockfileManager(dir) {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun';
  return 'none';
}

// ---------------------------------------------------------------------------------------
// Import scanning
// ---------------------------------------------------------------------------------------
// Statement forms only (line start), so prose and string literals that merely contain the
// word `import ... from '...'` are not read as imports.
const RE_FROM = /^[ \t]*(?:import|export)\s+(type\s+)?(?:[\w$]+\s*,?\s*)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})?\s*from\s*["']([^"']+)["']/gm;
const RE_SIDE = /^[ \t]*import\s+["']([^"']+)["']/gm;
const RE_DYN = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']([^"']+)["']/g;
const RE_REQ = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
const isTestPath = (rel) =>
  /(^|\/)(test|tests|__tests__|__mocks__|e2e|specs)\//.test(rel) || /\.(?:test|spec|eval)\.[cm]?[jt]sx?$/.test(rel);
function bareName(spec) {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}
function scanSources(pkg, aliases, declaredNames) {
  const strRefs = new Map(); // dep name -> files that mention it as a string literal ('pino-pretty')
  const strRe = declaredNames.length
    ? new RegExp(`["'\`](${declaredNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=["'\`/])`, 'g')
    : null;
  const uses = new Map(); // dep name -> {src, test, typeOnlySrc, files:Set}
  const undeclaredCandidates = []; // {name,file,line,test}
  const relativeEscapes = []; // {file,line,spec,resolved}
  const aliasUse = new Map(); // alias key -> Set(files)
  let fileCount = 0;
  const pkgRoot = pkg.dir;
  walkFiles(pkgRoot, (file, depth) => {
    const rel = relative(pkgRoot, file).split(sep).join('/');
    if (/\.css$/.test(file) && strRe) {
      // Tailwind v4 pulls packages in from CSS (`@import "tailwindcss"`, `@plugin "x"`)
      try {
        for (const m of readFileSync(file, 'utf8').matchAll(strRe)) strRefs.set(m[1], (strRefs.get(m[1]) ?? 0) + 1);
      } catch {
        /* unreadable */
      }
      return;
    }
    if (!SRC_EXT.test(file)) return;
    let text;
    try {
      if (statSync(file).size > 1_000_000) return;
      text = readFileSync(file, 'utf8');
    } catch {
      return;
    }
    fileCount++;
    const isTest = isTestPath(rel);
    const isClient = /^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*)*["']use client["']/.test(text);
    // A file at the package root is config only when it looks like config (vite.config.ts,
    // eslint.config.mjs, vitest.setup.ts, .eslintrc.cjs, next-env.d.ts). An entry point such as
    // server.mjs, cli.ts or Next's middleware.ts is source: its imports are the package's runtime use.
    const isConfigFile =
      /\.config\.[cm]?[jt]s$/.test(rel) ||
      (depth === 0 && (/\.(?:setup|workspace)\.[cm]?[jt]s$/.test(rel) || /^\.?[\w-]*rc\.[cm]?[jt]s$/.test(rel) || /\.d\.ts$/.test(rel)));
    const category = isTest ? 'test' : isConfigFile ? 'config' : /^scripts\//.test(rel) ? 'scripts' : 'src';
    const lineAt = (idx) => text.slice(0, idx).split('\n').length;
    const stripped = text.replace(/^\s*(?:\/\/.*|\*.*|\/\*.*)$/gm, (m) => ' '.repeat(m.length));
    const hits = [];
    if (strRe) for (const m of stripped.matchAll(strRe)) strRefs.set(m[1], (strRefs.get(m[1]) ?? 0) + 1);
    for (const m of stripped.matchAll(RE_FROM)) hits.push({ spec: m[2], typeOnly: !!m[1], idx: m.index });
    for (const m of stripped.matchAll(RE_SIDE)) hits.push({ spec: m[1], typeOnly: false, idx: m.index });
    for (const m of stripped.matchAll(RE_DYN)) hits.push({ spec: m[1], typeOnly: false, idx: m.index });
    for (const m of stripped.matchAll(RE_REQ)) hits.push({ spec: m[1], typeOnly: false, idx: m.index });
    for (const h of hits) {
      const spec = h.spec;
      if (spec.startsWith('.')) {
        const resolved = resolve(dirname(file), spec);
        // Only a real file counts: a template literal that *generates* an import is not one.
        if (relative(pkgRoot, resolved).startsWith('..') && moduleExists(resolved)) {
          relativeEscapes.push({ file: rel, line: lineAt(h.idx), spec, resolved, category });
        }
        continue;
      }
      if (spec.startsWith('/') || spec.startsWith('#') || NODE_BUILTINS.has(spec) || /^[a-z]+:/.test(spec)) continue;
      const aliasKey = matchAlias(spec, aliases);
      if (aliasKey) {
        if (!aliasUse.has(aliasKey)) aliasUse.set(aliasKey, new Set());
        aliasUse.get(aliasKey).add(rel);
        continue;
      }
      const name = bareName(spec);
      if (NODE_BUILTINS.has(name)) continue;
      const u = uses.get(name) ?? { src: 0, test: 0, config: 0, scripts: 0, typeOnlySrc: 0, files: new Set(), clientFiles: new Set() };
      u[category] += 1;
      if (category === 'src' && isClient) u.clientFiles.add(rel);
      if (category === 'src' && h.typeOnly) u.typeOnlySrc += 1;
      u.files.add(rel);
      uses.set(name, u);
      undeclaredCandidates.push({ name, file: rel, line: lineAt(h.idx), category });
    }
  });
  return { uses, undeclaredCandidates, relativeEscapes, aliasUse, fileCount, strRefs };
}
function moduleExists(p) {
  const swaps = [['.js', ['.ts', '.tsx']], ['.jsx', ['.tsx']], ['.mjs', ['.mts']], ['.cjs', ['.cts']]];
  const cands = [p];
  for (const [from, tos] of swaps) if (p.endsWith(from)) for (const to of tos) cands.push(p.slice(0, -from.length) + to);
  for (const ext of ['.ts', '.tsx', '.js', '.mjs', '.json']) cands.push(p + ext, join(p, `index${ext}`));
  return cands.some((c) => {
    try {
      return statSync(c).isFile();
    } catch {
      return false;
    }
  });
}
function matchAlias(spec, aliases) {
  for (const a of aliases) {
    if (a.kind === 'pin') continue; // `zod -> ./node_modules/zod` still imports the package
    if (a.wildcard ? spec === a.prefix.slice(0, -1) || spec.startsWith(a.prefix) : spec === a.key) return a.key;
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// tsconfig path aliases -> internal edges
// ---------------------------------------------------------------------------------------
function readAliases(pkg, allPackages) {
  const tsconfig = parseJsonc(existsSync(join(pkg.dir, 'tsconfig.json')) ? readFileSync(join(pkg.dir, 'tsconfig.json'), 'utf8') : '') ?? {};
  const opts = tsconfig.compilerOptions ?? {};
  const base = resolve(pkg.dir, opts.baseUrl ?? '.');
  const out = [];
  for (const [key, targets] of Object.entries(opts.paths ?? {})) {
    const target = Array.isArray(targets) ? targets[0] : null;
    if (!target) continue;
    const abs = resolve(base, target.replace(/\/\*$/, ''));
    const wildcard = key.endsWith('/*');
    const inside = !relative(pkg.dir, abs).startsWith('..');
    const toPkg = allPackages.find((p) => p.dir !== pkg.dir && !relative(p.dir, abs).startsWith('..'));
    let kind = 'self'; // @/* -> ./src/*
    if (!inside && toPkg) kind = 'cross-package';
    else if (inside && /(^|\/)vendor(\/|$)/.test(relative(pkg.dir, abs))) kind = 'vendored-copy';
    else if (inside && /node_modules/.test(target)) kind = 'pin'; // zod -> ./node_modules/zod
    out.push({
      key: wildcard ? key.slice(0, -2) : key,
      prefix: wildcard ? key.slice(0, -1) : key,
      wildcard,
      kind,
      to: toPkg?.dirName ?? null,
      target: relative(ROOT, abs).split(sep).join('/'),
    });
  }
  // `@x/shared` and `@x/shared/*` are one alias
  const seen = new Map();
  for (const a of out) if (!seen.has(a.key) || a.wildcard) seen.set(a.key, a);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------------------
// Analyse one package
// ---------------------------------------------------------------------------------------
function analysePackage(pkg, allPackages) {
  const pj = readJson(join(pkg.dir, 'package.json')) ?? {};
  const manager = lockfileManager(pkg.dir);
  const nmDir = join(pkg.dir, 'node_modules');
  const installed = existsSync(nmDir);
  const aliases = readAliases(pkg, allPackages);
  const declared = [];
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(pj[section] ?? {})) declared.push({ name, range, section });
  }
  const declaredNames = new Set(declared.map((d) => d.name));
  const scan = scanSources(pkg, aliases, [...declaredNames]);
  const tsTypes = new Set(
    (parseJsonc(hasTsconfigText(pkg.dir)) ?? {}).compilerOptions?.types ?? [],
  );
  const scriptsText = Object.values(pj.scripts ?? {}).join('\n');
  const hasTsconfig = existsSync(join(pkg.dir, 'tsconfig.json'));
  const startText = pj.scripts?.start ?? '';

  const configText = [];
  for (const e of readdirSync(pkg.dir, { withFileTypes: true })) {
    if (!e.isFile() || !CONFIG_EXT.test(e.name) || /lock|^package\.json$|^tsconfig/.test(e.name)) continue;
    try {
      if (statSync(join(pkg.dir, e.name)).size < 200_000) configText.push(readFileSync(join(pkg.dir, e.name), 'utf8'));
    } catch {
      /* skip */
    }
  }
  const configBlob = configText.join('\n');

  // Installed facts + closures
  const closures = new Map();
  const installedDeps = [];
  for (const d of declared) {
    let real = null;
    if (installed) {
      const direct = join(nmDir, d.name);
      if (existsSync(join(direct, 'package.json'))) {
        try {
          real = realpathSync(direct);
        } catch {
          real = direct;
        }
      }
    }
    d.real = real;
    d.version = real ? (pkgJsonAt(real).version ?? null) : null;
    if (real && d.section !== 'peerDependencies') {
      const c = closure(real);
      closures.set(d.name, c);
      installedDeps.push(d);
    }
  }
  const countOf = new Map(); // realDir -> how many direct deps pull it
  for (const d of installedDeps) for (const k of closures.get(d.name).keys()) countOf.set(k, (countOf.get(k) ?? 0) + 1);
  const unionOf = (filter) => {
    const u = new Map();
    for (const d of installedDeps) if (filter(d)) for (const [k, v] of closures.get(d.name)) u.set(k, v);
    return u;
  };
  const allUnion = unionOf(() => true);
  const prodUnion = unionOf((d) => d.section === 'dependencies' || d.section === 'optionalDependencies');

  // Per-dependency entries
  const refsFor = (name) => scan.uses.get(name) ?? { src: 0, test: 0, config: 0, scripts: 0, typeOnlySrc: 0, files: new Set(), clientFiles: new Set() };
  const binsOf = (d) => {
    if (!d.real) return [];
    const b = pkgJsonAt(d.real).bin;
    return typeof b === 'string' ? [d.name.split('/').pop()] : Object.keys(b ?? {});
  };
  const inText = (text, token) => new RegExp(`(^|[\\s;&|"'=/(])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s;&|"')]|$|/)`).test(text);
  const inConfig = (name) => new RegExp(`["'\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:["'\`/@:]|$)`).test(configBlob);
  const peerNeededBy = new Map(); // name -> declared dependency whose peerDependencies list it
  for (const d of installedDeps) {
    for (const peer of Object.keys(pkgJsonAt(d.real).peerDependencies ?? {})) if (!peerNeededBy.has(peer)) peerNeededBy.set(peer, d.name);
  }
  const entries = declared.map((d) => {
    const r = refsFor(d.name);
    const strs = scan.strRefs.get(d.name) ?? 0;
    let scripts = r.scripts + (inText(scriptsText, d.name) || binsOf(d).some((b) => inText(scriptsText, b)) ? 1 : 0);
    let config = r.config + (inConfig(d.name) ? 1 : 0) + strs;
    let src = r.src;
    let test = r.test;
    if (d.name === 'typescript' && hasTsconfig) config += 1;
    if (d.name.startsWith('@types/')) {
      const target = d.name.slice(7).replace('__', '/');
      const mapped = target.includes('/') ? `@${target}` : target;
      // an @types package is justified by its subject being declared here, imported or named in tsconfig `types`
      if (d.name === '@types/node' || declaredNames.has(mapped) || tsTypes.has(target) || refsFor(mapped).src) config += 1;
    }
    const c = closures.get(d.name);
    let exclusiveBytes = null;
    if (c) {
      exclusiveBytes = 0;
      for (const [k, v] of c) if (countOf.get(k) === 1) exclusiveBytes += v.bytes;
    }
    const peerOf = peerNeededBy.get(d.name);
    const status = src > 0 ? 'used' : test > 0 ? 'test-only' : scripts + config > 0 ? 'tooling' : peerOf ? 'peer-of' : d.section === 'peerDependencies' ? 'peer' : 'unused';
    return {
      name: d.name,
      range: d.range,
      section: d.section,
      version: d.version,
      selfBytes: d.real ? selfSize(d.real) : null,
      closureBytes: c ? sumBytes(c) : null,
      closurePackages: c ? c.size : null,
      exclusiveBytes,
      refs: { src, test, scripts, config, typeOnlySrc: r.typeOnlySrc, srcFiles: [...r.files].filter((f) => !isTestPath(f)).length, clientFiles: r.clientFiles.size },
      runsAtStart: inText(startText, d.name) || binsOf(d).some((b) => inText(startText, b)),
      status,
      peerOf: peerOf ?? null,
    };
  });

  // Duplicated installs inside this package's tree
  // Platform binaries (`@esbuild/darwin-arm64`) ride on their parent: count them with it.
  const family = (n) => (n.startsWith('@esbuild/') ? 'esbuild' : n.startsWith('@rollup/rollup-') ? 'rollup' : n);
  const byName = new Map();
  for (const [, v] of allUnion) {
    const m = byName.get(family(v.name)) ?? new Map();
    m.set(v.version, (m.get(v.version) ?? 0) + v.bytes);
    byName.set(family(v.name), m);
  }
  const duplicates = [];
  for (const [name, versions] of byName) {
    if (versions.size < 2) continue;
    const sizes = [...versions.values()].sort((a, b) => b - a);
    duplicates.push({ name, versions: [...versions.keys()].sort(), wastedBytes: sizes.slice(1).reduce((a, b) => a + b, 0) });
  }
  duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);

  // A string literal that only looks like an import is not installed anywhere; a real phantom is.
  const undeclared = scan.undeclaredCandidates.filter(
    (u) => !declaredNames.has(u.name) && u.name !== pj.name && (!installed || resolveInstalled(u.name, pkg.dir, ROOT)),
  );
  return {
    name: pj.name ?? pkg.dirName,
    dir: pkg.dirName,
    manager,
    installed,
    counts: {
      dependencies: Object.keys(pj.dependencies ?? {}).length,
      devDependencies: Object.keys(pj.devDependencies ?? {}).length,
      peerDependencies: Object.keys(pj.peerDependencies ?? {}).length,
      optionalDependencies: Object.keys(pj.optionalDependencies ?? {}).length,
    },
    sourceFiles: scan.fileCount,
    deployable: !!(pj.main || pj.bin || pj.exports || pj.scripts?.start),
    prodBytes: installed ? sumBytes(prodUnion) : null,
    totalBytes: installed ? sumBytes(allUnion) : null,
    installedPackages: installed ? allUnion.size : null,
    entries,
    aliases: aliases.map((a) => ({ ...a, files: scan.aliasUse.get(a.key)?.size ?? 0 })),
    relativeEscapes: scan.relativeEscapes.map((e) => ({
      file: e.file,
      line: e.line,
      spec: e.spec,
      category: e.category,
      toPackage: allPackages.find((p) => p.dir !== pkg.dir && !relative(p.dir, e.resolved).startsWith('..'))?.dirName ?? null,
    })),
    undeclared,
    duplicates,
  };
}

// ---------------------------------------------------------------------------------------
// Cross-package analysis + findings
// ---------------------------------------------------------------------------------------
const mb = (b) => (b == null ? 'n/a' : b === 0 ? '0 B' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const majorOf = (v) => {
  const m = String(v ?? '').match(/(\d+)(?:\.\d+)?/);
  return m ? Number(m[1]) : null;
};

function buildReport(packages, everyPackage = packages) {
  const internal = [];
  for (const p of packages) {
    for (const a of p.aliases) {
      if (a.kind === 'cross-package') internal.push({ from: p.dir, to: a.to, kind: 'alias', via: a.key, files: a.files, target: a.target });
      else if (a.kind === 'vendored-copy') internal.push({ from: p.dir, to: p.dir, kind: 'vendored', via: a.key, files: a.files, target: a.target });
    }
    for (const e of p.entries) {
      const m = String(e.range).match(/^(?:file|link):(.+)$/);
      if (m) {
        const abs = resolve(ROOT, p.dir, m[1]);
        const to = everyPackage.find((q) => q.dir !== p.dir && !relative(join(ROOT, q.dir), abs).startsWith('..'));
        internal.push({ from: p.dir, to: to?.dir ?? m[1], kind: 'file-dependency', via: e.name, files: e.refs.src, target: m[1] });
      }
    }
  }
  const violations = packages.flatMap((p) =>
    p.relativeEscapes.map((e) => ({ from: p.dir, to: e.toPackage, file: e.file, line: e.line, spec: e.spec, category: e.category })),
  );

  // Drift: same name declared (dependencies/devDependencies) in >= 2 packages
  const groups = new Map();
  for (const p of packages)
    for (const e of p.entries)
      if (e.section === 'dependencies' || e.section === 'devDependencies' || e.section === 'optionalDependencies') {
        const g = groups.get(e.name) ?? [];
        g.push({ package: p.dir, range: e.range, section: e.section, installed: e.version });
        groups.set(e.name, g);
      }
  const drift = [];
  for (const [name, g] of groups) {
    if (g.length < 2) continue;
    const ranges = new Set(g.map((x) => x.range));
    const versions = new Set(g.map((x) => x.installed).filter(Boolean));
    if (ranges.size < 2 && versions.size < 2) continue;
    // Per entry: the installed version where there is one, else its range. A partly installed
    // repo is the usual state of a worktree, and a major mismatch must not hide behind it.
    const basis = g.map((x) => x.installed ?? x.range);
    const majors = new Set(basis.map(majorOf));
    const kind = majors.size > 1 ? 'major' : versions.size > 1 ? (ranges.size < 2 ? 'lock-skew' : 'minor-or-patch') : 'range-only';
    drift.push({ name, kind, contract: CONTRACT_PKGS.has(name), declared: g });
  }

  const findings = [];
  const add = (severity, rule, pkg, subject, detail, fix) =>
    findings.push({ severity, rule, package: pkg, subject, detail, fix });

  for (const v of violations) {
    add(v.category === 'test' ? 'P1' : 'P0', 'cross-package-relative-import', v.from, `${v.file}:${v.line}`,
      `imports \`${v.spec}\` — a relative path out of the package${v.to ? ` into \`${v.to}/\`` : ''}${v.category === 'test' ? ' (test code)' : ''}`,
      'Import through a tsconfig `paths` alias (add one if the package has none for the target) or the target package\'s public entry point, not a relative path');
  }
  for (const p of packages) {
    const phantoms = new Map();
    for (const u of p.undeclared) {
      const g = phantoms.get(u.name) ?? { first: u, count: 0, src: false };
      g.count += 1;
      g.src ||= u.category === 'src';
      phantoms.set(u.name, g);
    }
    for (const [name, g] of phantoms) {
      const sev = !p.installed ? 'Info' : g.src ? 'P0' : 'P1';
      add(sev, 'undeclared-dependency', p.dir, `${name} (${g.first.file}:${g.first.line}${g.count > 1 ? `, +${g.count - 1} more` : ''})`,
        `imported${g.src ? '' : ' by test/config code'} but not listed in ${p.dir}/package.json${p.installed ? '; it resolves only through the install layout (hoisting)' : ' (unverified: not installed, so a string that looks like an import cannot be ruled out)'}`,
        `Add \`${name}\` to ${p.dir}/package.json, or remove the import`);
    }
    for (const e of p.entries) {
      const prod = e.section === 'dependencies' || e.section === 'optionalDependencies';
      const where = `${p.dir}/package.json`;
      if (e.status === 'unused' && prod) {
        add(p.installed ? 'P1' : 'P2', 'unused-dependency', p.dir, e.name,
          `declared in ${e.section}, no import, script or config references it${e.closureBytes ? ` — removing frees ${mb(e.exclusiveBytes)}` : ''}${p.installed ? '' : ' (not installed: use as another package\'s peer dependency cannot be ruled out)'}`,
          `Confirm, then remove \`${e.name}\` from ${where}`);
      } else if (e.status === 'unused' && e.section === 'devDependencies') {
        add('P2', 'unused-dev-dependency', p.dir, e.name, 'declared in devDependencies, nothing references it',
          `Check for an implicit use (plugin, preset, peer of another tool), then remove from ${where}`);
      } else if (e.status === 'test-only' && prod) {
        add('P1', 'prod-dependency-used-only-in-tests', p.dir, e.name, 'imported only from test files',
          `Move \`${e.name}\` to devDependencies in ${where}`);
      } else if (e.status === 'tooling' && e.section === 'dependencies' && e.refs.src === 0 && !e.runsAtStart) {
        add('P2', 'prod-dependency-used-only-by-tooling', p.dir, e.name, 'referenced by scripts or config, never imported by code',
          `Verify it must exist at runtime (container, start script); otherwise move to devDependencies in ${where}`);
      }
      if (e.section === 'devDependencies' && e.refs.src > e.refs.typeOnlySrc && !e.name.startsWith('@types/')) {
        add(p.deployable ? 'P1' : 'P2', 'dev-dependency-imported-by-shipped-code', p.dir, e.name,
          `devDependency imported at runtime from ${e.refs.src - e.refs.typeOnlySrc} non-test source file(s)${p.deployable ? '' : ' (package has no main/bin/exports/start: probably a dev-only tool)'}`,
          `Move \`${e.name}\` to dependencies in ${where}, or make the import type-only`);
      }
      if (prod && e.closureBytes != null && e.closureBytes >= HEAVY_BYTES && !FRAMEWORK_PKGS.has(e.name)) {
        const where = e.refs.clientFiles > 0
          ? `imported by ${e.refs.clientFiles} client component file(s): it can reach the browser bundle`
          : `imported by ${e.refs.srcFiles} non-test file(s), none a client component: install cost, not page weight`;
        add('P2', 'heavy-dependency', p.dir, e.name,
          `${mb(e.closureBytes)} with its own dependencies (${mb(e.exclusiveBytes)} only it pulls); ${where}`,
          e.refs.clientFiles > 0
            ? `Measure its share of the client bundle with the app's analyzer; load it lazily (dynamic import) if it is large and not needed on first paint`
            : `Check whether a lighter or built-in alternative exists, or whether this package needs it`);
      }
    }
    for (const d of p.duplicates) {
      if (d.wastedBytes < DUP_WASTE_BYTES) continue;
      add('P2', 'duplicate-install', p.dir, d.name, `${d.versions.length} versions installed (${d.versions.join(', ')}), ${mb(d.wastedBytes)} duplicated`,
        `Align the ranges that pull them, or add an override / run the manager's dedupe`);
    }
    if (!p.installed) {
      add('Info', 'not-installed', p.dir, 'node_modules', 'no node_modules: sizes, duplicates and installed versions are unavailable',
        `Run \`${p.manager === 'none' ? 'npm' : p.manager} install\` in ${p.dir}/ and re-run the report`);
    }
    if (p.manager === 'none') {
      add('P1', 'no-lockfile', p.dir, p.dir, 'no lockfile: installs are not reproducible', 'Commit a lockfile from the package\'s own manager');
    }
  }
  for (const d of drift) {
    const spread = d.declared.map((x) => `${x.package}: ${x.installed ?? x.range}`).join(', ');
    if (d.kind === 'major' || (d.contract && (d.kind === 'minor-or-patch' || d.kind === 'lock-skew'))) {
      add('P1', 'version-drift', d.declared.map((x) => x.package).join(', '), d.name,
        `${d.kind === 'major' ? 'different major versions' : 'different versions of a package whose values cross package boundaries'} — ${spread}`,
        `Pin one version across the packages and re-install`);
    } else if (d.kind === 'minor-or-patch') {
      add('P2', 'version-drift', d.declared.map((x) => x.package).join(', '), d.name, `different ranges and different installed versions — ${spread}`, 'Align the ranges at the next dependency update');
    } else if (d.kind === 'lock-skew') {
      add('Info', 'lockfile-skew', d.declared.map((x) => x.package).join(', '), d.name, `same range, lockfiles resolved different versions — ${spread}`, 'Resolves itself at the next lockfile refresh');
    } else if (d.contract && d.declared.some((x) => !x.installed)) {
      add('P2', 'version-drift', d.declared.map((x) => x.package).join(', '), d.name, `ranges allow different versions of a package whose values cross package boundaries — ${spread}`, 'Install and compare the resolved versions; pin one range');
    } else {
      const known = d.declared.every((x) => x.installed);
      add('Info', 'range-drift', d.declared.map((x) => x.package).join(', '), d.name, `${known ? 'same installed version, ' : ''}different ranges — ${spread}`, 'Optional: use one range spelling');
    }
  }
  const managers = new Set(packages.map((p) => p.manager).filter((m) => m !== 'none'));
  if (managers.size > 1) {
    add('Info', 'mixed-package-managers', packages.map((p) => p.dir).join(', '), [...managers].join(' + '),
      packages.map((p) => `${p.dir}: ${p.manager}`).join(', '), 'Fine while each package keeps its own lockfile; CI must use the matching manager per package');
  }
  const order = { P0: 0, P1: 1, P2: 2, Info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule) || a.subject.localeCompare(b.subject));
  findings.forEach((f, i) => (f.id = `DEP-${String(i + 1).padStart(2, '0')}`));
  return { internal, violations, drift, findings };
}

// ---------------------------------------------------------------------------------------
// Optional: advisories
// ---------------------------------------------------------------------------------------
function runAudit(p) {
  if (p.manager !== 'pnpm' && p.manager !== 'npm') return { available: false, reason: `no audit for manager "${p.manager}"` };
  const r = spawnSync(p.manager, ['audit', '--json'], { cwd: join(ROOT, p.dir), encoding: 'utf8', timeout: 90_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { available: false, reason: String(r.error.message ?? r.error) };
  try {
    const j = JSON.parse(r.stdout);
    const v = j.metadata?.vulnerabilities;
    if (!v) return { available: false, reason: 'audit output has no metadata.vulnerabilities' };
    return { available: true, counts: v };
  } catch {
    return { available: false, reason: (r.stderr || r.stdout || 'unparseable audit output').toString().slice(0, 160).trim() };
  }
}

// ---------------------------------------------------------------------------------------
// Markdown / Mermaid rendering
// ---------------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/\|/g, '\\|');
const cell = (s) => esc(String(s).replace(/\n/g, ' '));
function mermaid(packages, rep) {
  const L = ['flowchart LR'];
  const id = (x) => x.replace(/[^A-Za-z0-9]/g, '_');
  const live = new Set();
  for (const p of packages) {
    L.push(`  subgraph P_${id(p.dir)}["${p.dir} · ${p.manager} · ${mb(p.prodBytes)} prod"]`);
    L.push('    direction TB');
    const sized = p.entries.filter((e) => e.section !== 'peerDependencies' && e.closureBytes != null).sort((a, b) => b.closureBytes - a.closureBytes);
    const top = [...sized.filter((e) => e.section !== 'devDependencies').slice(0, TOP), ...sized.filter((e) => e.section === 'devDependencies').slice(0, 2)];
    for (const e of top) {
      const nid = `D_${id(p.dir)}_${id(e.name)}`;
      live.add(nid);
      L.push(`    ${nid}["${e.name} ${e.version ?? ''}<br/>${mb(e.closureBytes)}${e.section === 'devDependencies' ? ' · dev' : ''}"]`);
    }
    if (top.length === 0) L.push(`    E_${id(p.dir)}["${p.installed ? 'no dependencies' : 'not installed'}"]`);
    L.push('  end');
  }
  // Edges go subgraph -> subgraph: they describe packages, not any one dependency.
  const pairs = new Map();
  for (const e of rep.internal) {
    if (e.kind === 'vendored' || !e.to || e.to === e.from) continue;
    const k = `${e.from}>${e.to}`;
    pairs.set(k, [...(pairs.get(k) ?? []), e.via]);
  }
  // A target outside a narrowed run still needs a node, or the edge would point at nothing.
  const inScope = new Set(packages.map((p) => p.dir));
  const outside = new Set(
    [...pairs.keys()].map((k) => k.split('>')[1]).concat(rep.violations.map((v) => v.to).filter(Boolean)).filter((t) => !inScope.has(t)),
  );
  for (const o of outside) L.push(`  P_${id(o)}["${o} · not analysed"]`);
  for (const [k, via] of pairs) {
    const [from, to] = k.split('>');
    L.push(`  P_${id(from)} -->|"${[...new Set(via)].join(', ')}"| P_${id(to)}`);
  }
  for (const v of rep.violations) {
    if (v.to) L.push(`  P_${id(v.from)} ==>|"relative import (${v.category})"| P_${id(v.to)}`);
  }
  const heavy = [];
  const unused = [];
  for (const p of packages)
    for (const e of p.entries.filter((x) => x.closureBytes != null)) {
      const nid = `D_${id(p.dir)}_${id(e.name)}`;
      if (!live.has(nid)) continue;
      if (e.closureBytes >= HEAVY_BYTES) heavy.push(nid);
      if (e.status === 'unused') unused.push(nid);
    }
  L.push('  classDef heavy fill:#ffe8cc,stroke:#d9480f,color:#222;');
  L.push('  classDef unused fill:#ffe3e3,stroke:#c92a2a,stroke-dasharray:4 3,color:#222;');
  if (heavy.length) L.push(`  class ${heavy.join(',')} heavy;`);
  if (unused.length) L.push(`  class ${unused.join(',')} unused;`);
  return L.join('\n');
}

function table(head, rows) {
  if (rows.length === 0) return '_none_\n';
  return `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}\n`;
}

function renderMd(packages, rep, audit) {
  const out = [];
  const declaredTotal = packages.reduce((a, p) => a + p.counts.dependencies + p.counts.devDependencies, 0);
  out.push(`# Dependency report — ${basename(ROOT)}\n`);
  out.push(`Packages: ${packages.length} · declared dependencies: ${declaredTotal} · generated ${new Date().toISOString().slice(0, 10)}\n`);
  out.push('## 1. Scope\n');
  out.push(table(['Package', 'Manager', 'Prod', 'Dev', 'Installed', 'Prod footprint', 'Total footprint', 'Source files'],
    packages.map((p) => [p.dir, p.manager, p.counts.dependencies, p.counts.devDependencies, p.installed ? `yes (${p.installedPackages} pkgs)` : 'no', mb(p.prodBytes), mb(p.totalBytes), p.sourceFiles])));
  if (ONLY.length) {
    out.push(`_Narrowed with \`--packages ${ONLY.join(',')}\`: aliases and relative imports are resolved against all ${EVERY_COUNT} packages of the repo; version drift and duplicates are computed among the packages above only._\n`);
  }
  out.push('_Footprint = unique installed bytes of the declared dependencies and everything they pull in (apparent file size, `node_modules` only). 1 MB = 1,048,576 bytes, like `du -h`._\n');
  out.push('## 2. Dependency graph\n');
  out.push('```mermaid\n' + mermaid(packages, rep) + '\n```\n');
  out.push(`_Boxes: the heaviest declared dependencies of each package with their footprint (up to ${TOP} runtime + 2 dev). Orange = ≥ 25 MB, red dashed = unused. Arrows between packages are tsconfig path aliases; a thick arrow is a relative import across packages (not allowed)._\n`);
  const internalRows = [
    ...rep.internal.map((e) => [e.from, e.kind === 'vendored' ? '(own copy)' : e.to, e.kind, e.via, e.files, e.target]),
    ...rep.violations.map((v) => [v.from, v.to ?? '(outside the repo)', 'relative import ✗', v.spec, 1, `${v.file}:${v.line}${v.category === 'test' ? ' (test)' : ''}`]),
  ];
  out.push('### Internal dependencies (between packages)\n');
  out.push(table(['From', 'To', 'Kind', 'Via', 'Files', 'Resolves to'], internalRows));
  out.push('## 3. Sizes\n');
  const all = packages.flatMap((p) => p.entries.filter((e) => e.closureBytes != null).map((e) => ({ ...e, pkg: p.dir })));
  out.push(`### Heaviest dependencies (top ${Math.min(TOP, all.length)})\n`);
  out.push(table(['Package', 'Dependency', 'Version', 'Section', 'Own', 'With its deps', 'Only it pulls', 'Status (src/test refs)'],
    all.sort((a, b) => b.closureBytes - a.closureBytes).slice(0, TOP)
      .map((e) => [e.pkg, e.name, e.version ?? '?', e.section.replace('Dependencies', ''), mb(e.selfBytes), mb(e.closureBytes), mb(e.exclusiveBytes), e.status === 'peer-of' ? `peer-of ${e.peerOf}` : e.status])));
  for (const p of packages.filter((x) => x.installed)) {
    const top = p.entries.filter((e) => e.closureBytes != null && e.section !== 'peerDependencies').sort((a, b) => b.closureBytes - a.closureBytes).slice(0, TOP);
    out.push(`### ${p.dir} — ${mb(p.totalBytes)} total, ${mb(p.prodBytes)} prod\n`);
    out.push(table(['Dependency', 'Declared', 'Installed', 'Section', 'Own', 'With its deps', 'Only it pulls', 'Status (src/test refs)'],
      top.map((e) => [e.name, e.range, e.version ?? '?', e.section.replace('Dependencies', ''), mb(e.selfBytes), mb(e.closureBytes), mb(e.exclusiveBytes), `${e.status === 'peer-of' ? `peer-of ${e.peerOf}` : e.status} (${e.refs.src}s/${e.refs.test}t)`])));
  }
  const dups = packages.flatMap((p) => p.duplicates.slice(0, 5).map((d) => [p.dir, d.name, d.versions.join(', '), mb(d.wastedBytes)]));
  out.push('### Duplicated installs\n');
  out.push(table(['Package', 'Dependency', 'Versions', 'Duplicated'], dups));
  out.push('### Version drift between packages\n');
  out.push(table(['Dependency', 'Kind', 'Declared / installed per package'],
    rep.drift.sort((a, b) => a.name.localeCompare(b.name)).map((d) => [d.name + (d.contract ? ' (contract)' : ''), d.kind, d.declared.map((x) => `${x.package}: ${x.range} → ${x.installed ?? 'n/a'}`).join('; ')])));
  if (audit) {
    out.push('### Advisories\n');
    out.push(table(['Package', 'Critical', 'High', 'Moderate', 'Low', 'Note'],
      Object.entries(audit).map(([dir, a]) => a.available ? [dir, a.counts.critical ?? 0, a.counts.high ?? 0, a.counts.moderate ?? 0, a.counts.low ?? 0, ''] : [dir, '–', '–', '–', '–', a.reason])));
  }
  out.push('## 4. Findings & priorities\n');
  for (const [sev, title] of [['P0', 'P0 — fix now (breaks builds or the architecture rules)'], ['P1', 'P1 — fix soon (waste, drift, wrong section)'], ['P2', 'P2 — worth doing (size, hygiene)'], ['Info', 'Info — for the record']]) {
    const f = rep.findings.filter((x) => x.severity === sev);
    out.push(`### ${title}\n`);
    out.push(table(['ID', 'Where', 'What', 'Why', 'Fix'], f.map((x) => [x.id, `${x.package} · ${x.subject}`, x.rule, x.detail, x.fix])));
  }
  out.push('## 5. Summary\n');
  out.push('<!-- Write 3-5 actions in priority order: **verb + object** (`DEP-nn`, file) — gain. See references/report-format.md. -->\n');
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------
const everything = discoverPackages();
const EVERY_COUNT = everything.length;
if (everything.length === 0) die(`no package.json found under ${ROOT} (use --root)`);
const discovered = everything.filter((p) => ONLY.length === 0 || ONLY.includes(p.dirName));
if (discovered.length === 0) {
  die(`--packages ${ONLY.join(',')} matched none of: ${everything.map((p) => p.dirName).join(', ')}`);
}
const packages = discovered.map((p) => analysePackage(p, everything));
const report = buildReport(packages, everything.map((p) => ({ dir: p.dirName })));
let audit = null;
if (has('audit')) {
  audit = {};
  for (const p of packages) audit[p.dir] = runAudit(p);
  for (const [dir, a] of Object.entries(audit)) {
    if (!a.available) continue;
    const c = a.counts;
    const sev = c.critical || c.high ? 'P0' : c.moderate ? 'P1' : c.low ? 'P2' : null;
    if (sev) {
      report.findings.push({ severity: sev, rule: 'advisories', package: dir, subject: 'npm advisories',
        detail: `critical ${c.critical ?? 0}, high ${c.high ?? 0}, moderate ${c.moderate ?? 0}, low ${c.low ?? 0}`,
        fix: `Run \`${packages.find((p) => p.dir === dir).manager} audit\` in ${dir}/ and update the vulnerable packages` });
    }
  }
  const order = { P0: 0, P1: 1, P2: 2, Info: 3 };
  report.findings.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule) || a.subject.localeCompare(b.subject));
  report.findings.forEach((f, i) => (f.id = `DEP-${String(i + 1).padStart(2, '0')}`));
}

if (FORMAT === 'json') {
  const strip = (e) => e;
  process.stdout.write(JSON.stringify({ root: ROOT, generatedAt: new Date().toISOString(),
    thresholds: { heavyBytes: HEAVY_BYTES, duplicateWasteBytes: DUP_WASTE_BYTES, contractPackages: [...CONTRACT_PKGS] },
    packages: packages.map((p) => ({ ...p, entries: p.entries.map(strip) })), ...report, audit }, null, 2) + '\n');
} else if (FORMAT === 'mermaid') {
  process.stdout.write(mermaid(packages, report) + '\n');
} else {
  process.stdout.write(renderMd(packages, report, audit) + '\n');
}
