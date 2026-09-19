/**
 * Onion Architecture dependency rules for DevDigest `server/`.
 *
 * Lives in the onion-architecture skill; `pnpm arch` (server/) runs it, also in CI. The server
 * currently has zero violations, so there is no baseline — any violation is new. Run from `server/`:
 *
 *   pnpm exec depcruise src --config ../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs --output-type err
 *
 * Adding a third-party SDK? Add it to SDK_PKGS. Adding a pure library that application code
 * may use (no I/O)? Add it to APPLICATION_PKGS.
 *
 * Rings (inside → out):
 *   core         src/vendor/shared/**, modules/<m>/domain.ts, modules/<m>/ports.ts
 *   application  every other file under modules/<m>/ (service.ts, run-executor.ts, pure helpers)
 *   outer        modules/<m>/routes.ts, modules/<m>/repository(.ts|/), modules/_shared/context.ts,
 *                src/adapters/**,
 *                src/db/**, src/platform/** (container.ts = composition root)
 */

/**
 * An npm package, resolved (`node_modules/…`, incl. pnpm's `.pnpm/<pkg>@<ver>/node_modules/<pkg>/`)
 * or unresolved (bare name, e.g. an ESM-only package without a `require` export).
 */
const npm = (pkgs) => `(^|node_modules/)(${pkgs.join('|')})(/|$)`;

const DB_PKGS = ['drizzle-orm', 'postgres'];
const HTTP_PKGS = ['fastify', '@fastify/[^/]+', 'fastify-[^/]+'];
const SDK_PKGS = [
  'octokit',
  '@octokit/[^/]+',
  'openai',
  '@anthropic-ai/sdk',
  'simple-git',
  '@ast-grep/napi',
  '@vscode/ripgrep',
  'dependency-cruiser',
  'js-tiktoken',
];

/**
 * Fail-closed allowlist: the only packages / Node built-ins application code may import.
 * Everything else (DB drivers, SDKs, fs, net, child_process, …) is I/O and belongs behind a port.
 */
const APPLICATION_PKGS = ['zod', 'graphology', 'graphology-[^/]+', 'p-queue'];
const APPLICATION_BUILTINS = '^(node:)?(crypto|path|util)$';

const CORE = ['^src/vendor/shared/', '^src/modules/[^/]+/(domain|ports)\\.ts$'];
// `_shared/context.ts` reads the FastifyRequest, so it is HTTP glue (outer ring) too.
const OUTER_IN_MODULE = '^src/modules/([^/]+/(routes\\.ts|repository\\.ts|repository/|index\\.ts)|_shared/context\\.ts)';

module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      severity: 'error',
      comment:
        'The core (contracts, domain.ts, ports.ts) depends on nothing but zod and other core files. ' +
        'Move the I/O behind a port and implement it in an outer ring.',
      from: { path: CORE },
      to: { pathNot: [npm(['zod']), ...CORE] },
    },
    {
      name: 'application-no-outer-ring',
      severity: 'error',
      comment:
        'Application code (service.ts, run-executor.ts, helpers) must not import the database layer ' +
        'or a concrete adapter. Depend on a port from vendor/shared/adapters.ts or the module ports.ts; ' +
        'return domain types, not Drizzle rows.',
      from: { path: '^src/modules/[^/]+/', pathNot: OUTER_IN_MODULE },
      to: { path: ['^src/db/', '^src/adapters/'] },
    },
    {
      name: 'application-allowed-packages',
      severity: 'error',
      comment:
        'Application code may import only the pure packages in APPLICATION_PKGS / APPLICATION_BUILTINS. ' +
        'A DB driver, Fastify, an SDK or fs/net is I/O: put it in an adapter behind a port. ' +
        'A new pure library? Add it to the allowlist in this file.',
      from: { path: '^src/modules/[^/]+/', pathNot: OUTER_IN_MODULE },
      to: {
        dependencyTypesNot: ['local', 'aliased', 'aliased-tsconfig', 'aliased-tsconfig-paths', 'type-only'],
        pathNot: [npm(APPLICATION_PKGS), APPLICATION_BUILTINS],
      },
    },
    {
      name: 'application-no-container',
      severity: 'warn',
      comment:
        'A service receives narrow ports in its constructor, not the whole Container ' +
        '(which exposes `db`). Only routes.ts and platform/container.ts know the Container.',
      from: { path: '^src/modules/[^/]+/', pathNot: OUTER_IN_MODULE },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'routes-no-persistence',
      severity: 'error',
      comment:
        'routes.ts is a driving adapter: parse (zod schema), call the service, map the result. ' +
        'Queries go into the module repository behind a port.',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: [npm(DB_PKGS), '^src/db/'] },
    },
    {
      name: 'sdk-only-in-adapters',
      severity: 'error',
      comment:
        'Third-party SDKs belong to the outer ring. Wrap them in src/adapters/<name>/ behind a port ' +
        '(anti-corruption layer): SDK types never leave the adapter.',
      from: { path: '^src/', pathNot: '^src/adapters/' },
      to: { path: npm(SDK_PKGS) },
    },
    {
      name: 'adapters-not-to-modules',
      severity: 'error',
      comment: 'Adapters implement core ports; they never import feature modules (arrows point inward).',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'A module may use another module only through its public index.ts / types.ts, ' +
        'or better, through a port wired in platform/container.ts.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/($1|_shared)/', '^src/modules/[^/]+/(index|types)\\.ts$'],
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependency: some arrow points outward. Find the ring that is importing the wrong way.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: ['node_modules', '^\\.\\./reviewer-core/'] },
    exclude: { path: ['^clones/', '^src/db/migrations/', '^test/', '\\.test\\.ts$'] },
  },
};
