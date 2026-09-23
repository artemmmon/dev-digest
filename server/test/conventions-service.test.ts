import { describe, it, expect } from 'vitest';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import type {
  ConventionRecord,
  ConventionRepo,
  ConventionStore,
  ConventionsDeps,
  DecidedRule,
  NewConvention,
} from '../src/modules/conventions/ports.js';
import { AppError } from '../src/platform/errors.js';

/** ConventionsService against in-memory ports, MockLLMProvider and MockGitClient. */

const WS = 'ws-1';
const REPO: ConventionRepo = { id: 'repo-1', owner: 'acme', name: 'api', fullName: 'acme/api', clonePath: '/c/acme/api' };

const ROUTES = [
  "import { z } from 'zod';",
  '',
  'export async function handler(req) {',
  '  const body = Body.parse(req.body);',
  '  return service.create(body);',
  '}',
].join('\n');
const SERVICE = ['export class UserService {', '  constructor(private repo: Repo) {}', '}'].join('\n');
const FILES: Record<string, string> = {
  'src/routes.ts': ROUTES,
  'src/user-service.ts': SERVICE,
  'src/routes.test.ts': "it('creates a user', () => { expect(create()).toBeTruthy(); });\n",
  'package.json': JSON.stringify({ name: 'api', scripts: { test: 'vitest' }, dependencies: { zod: '^3' } }),
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n',
  'pnpm-lock.yaml': 'lock: true\n',
  '.env': 'SECRET=1\n',
};

class MemStore implements ConventionStore {
  rows: ConventionRecord[] = [];
  private seq = 0;
  async list(ws: string, repoId: string) {
    return this.rows.filter((r) => r.workspaceId === ws && r.repoId === repoId);
  }
  async listDecided(ws: string, repoId: string): Promise<DecidedRule[]> {
    return (await this.list(ws, repoId))
      .filter((r) => r.status !== 'pending')
      .map((r) => ({ rule: r.rule, status: r.status as DecidedRule['status'] }));
  }
  async replacePending(ws: string, repoId: string, rows: NewConvention[]) {
    this.rows = this.rows.filter((r) => !(r.workspaceId === ws && r.repoId === repoId && r.status === 'pending'));
    const made = rows.map(
      (r): ConventionRecord => ({
        id: `c-${++this.seq}`,
        workspaceId: ws,
        repoId,
        category: r.category,
        rule: r.rule,
        evidencePath: r.evidencePath,
        evidenceLine: r.evidenceLine,
        evidenceEndLine: r.evidenceEndLine,
        evidenceSnippet: r.evidenceSnippet,
        confidence: r.confidence,
        status: 'pending',
        commitSha: r.commitSha,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    this.rows.push(...made);
    return made;
  }
  async getById(ws: string, repoId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.workspaceId === ws && r.repoId === repoId);
  }
  async getByIds(ws: string, repoId: string, ids: string[]) {
    return this.rows.filter((r) => ids.includes(r.id) && r.workspaceId === ws && r.repoId === repoId);
  }
  async update(ws: string, repoId: string, id: string, patch: { status?: ConventionRecord['status']; rule?: string }) {
    const row = await this.getById(ws, repoId, id);
    if (row) Object.assign(row, patch);
    return row;
  }
}

const EXTRACTION = {
  conventions: [
    {
      category: 'api',
      rule: 'Validate request bodies with zod at the route edge.',
      evidence: { file: 'src/routes.ts', line: 4, snippet: 'const body = Body.parse(req.body);' },
      confidence: 0.9,
    },
    {
      // wrong line: corrected
      category: 'structure',
      rule: 'Services take their collaborators through the constructor.',
      evidence: { file: './src/user-service.ts', line: 30, snippet: 'constructor(private repo: Repo) {}' },
      confidence: 0.8,
    },
    {
      category: 'api',
      rule: 'Invented evidence file.',
      evidence: { file: 'src/ghost.ts', line: 1, snippet: 'export const ghost = 1;' },
      confidence: 0.9,
    },
    {
      category: 'api',
      rule: 'Snippet missing from the file.',
      evidence: { file: 'src/routes.ts', line: 1, snippet: 'this line is nowhere in the file' },
      confidence: 0.9,
    },
    {
      category: 'naming',
      rule: 'Trivial snippet.',
      evidence: { file: 'src/routes.ts', line: 6, snippet: '}' },
      confidence: 0.9,
    },
    {
      category: 'api',
      rule: 'Validate request bodies with zod at the route edge',
      evidence: { file: 'src/routes.ts', line: 4, snippet: 'const body = Body.parse(req.body);' },
      confidence: 0.5,
    },
  ],
};

function setup(opts: { samples?: string[]; files?: Record<string, string>; repo?: ConventionRepo | null; extraction?: unknown } = {}) {
  const store = new MemStore();
  const llm = new MockLLMProvider('openai', {
    structuredBySchema: { ConventionExtraction: opts.extraction ?? EXTRACTION },
  });
  const git = new MockGitClient({ files: opts.files ?? FILES, head: 'sha-abc' });
  const sampleCalls: Array<[string, number]> = [];
  const modelCalls: string[] = [];
  const skills: Array<Record<string, unknown>> = [];
  const bound: Array<[string, string]> = [];
  const agentIds = new Set(['agent-1']);
  const logged: unknown[] = [];
  const repo = opts.repo === null ? undefined : (opts.repo ?? REPO);
  const deps: ConventionsDeps = {
    store,
    repos: { getById: async (ws, id) => (ws === WS && id === REPO.id ? repo : undefined) },
    git,
    skills: {
      insert: async (v) => {
        skills.push(v as unknown as Record<string, unknown>);
        return { id: `skill-${skills.length}`, name: v.name };
      },
    },
    agents: {
      getById: async (_ws, id) => (agentIds.has(id) ? { id } : undefined),
      appendSkill: async (_ws, a, s) => {
        bound.push([a, s]);
        return true;
      },
    },
    samples: async (repoId, n) => {
      sampleCalls.push([repoId, n]);
      return opts.samples ?? [];
    },
    resolveModel: async () => {
      modelCalls.push('resolve');
      return { provider: 'openai', model: 'picked-model' };
    },
    llm: async () => llm,
    systemPrompt: async (vars) => `SYSTEM max=${vars.max} cats=${vars.categories}`,
    logger: { info: (obj) => logged.push(obj) },
  };
  return { service: new ConventionsService(deps), store, llm, sampleCalls, modelCalls, skills, bound, logged, deps };
}

describe('ConventionsService.extract', () => {
  it('runs the pipeline: sample, one structured call, gate, dedup, store', async () => {
    const { service, store, llm, modelCalls } = setup();
    const res = await service.extract(WS, REPO.id);

    expect(modelCalls).toEqual(['resolve']);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const req = llm.calls[0]!.req as { model: string; schemaName: string; temperature: number; maxTokens: number; messages: Array<{ content: string }> };
    expect(req.model).toBe('picked-model');
    expect(req.schemaName).toBe('ConventionExtraction');
    expect(req.temperature).toBe(0.2);
    expect(req.maxTokens).toBe(4000);
    expect(req.messages[0]!.content).toMatch(/^SYSTEM max=\d+ cats=naming, structure/);

    // the user prompt has numbered lines, the tree, and the summarised manifest — never the secrets
    const prompt = req.messages[1]!.content;
    expect(prompt).toContain('Repository: acme/api');
    expect(prompt).toContain('<file path="src/routes.ts">');
    expect(prompt).toContain('4|   const body = Body.parse(req.body);');
    expect(prompt).toContain('scripts: test');
    expect(prompt).toContain('<file path="tsconfig.json">');
    expect(prompt).not.toContain('SECRET=1');
    expect(prompt).not.toContain('pnpm-lock');

    expect(res.candidates.map((c) => c.rule)).toEqual([
      'Validate request bodies with zod at the route edge.',
      'Services take their collaborators through the constructor.',
    ]);
    expect(store.rows).toHaveLength(2);
    expect(res.candidates[0]).toMatchObject({
      status: 'pending',
      commit_sha: 'sha-abc',
      evidence_path: 'src/routes.ts',
      evidence_line: 4,
      evidence_url: 'https://github.com/acme/api/blob/sha-abc/src/routes.ts#L4',
    });
    // line 30 was wrong; the constructor is on line 2
    expect(res.candidates[1]).toMatchObject({ evidence_path: 'src/user-service.ts', evidence_line: 2 });
    expect(res.candidates[1]!.evidence_snippet).toBe('  constructor(private repo: Repo) {}');
  });

  it('reports what was sampled, dropped and spent', async () => {
    const { service, logged } = setup();
    const { report } = await service.extract(WS, REPO.id);
    expect(report).toMatchObject({
      provider: 'openai',
      model: 'picked-model',
      commit_sha: 'sha-abc',
      raw_candidates: 6,
      kept: 2,
      line_corrected: 1,
      sample_source: 'fallback',
      dropped: { unknown_file: 1, snippet_not_found: 1, trivial_snippet: 1, duplicate: 1, known_decision: 0, category_cap: 0 },
      categories: { api: 1, structure: 1 },
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
    });
    expect(report.config_files).toEqual(['package.json', 'tsconfig.json']);
    expect(report.sampled_files.sort()).toEqual(['src/routes.test.ts', 'src/routes.ts', 'src/user-service.ts']);
    expect(logged).toHaveLength(1);
  });

  it('falls back to a code-only pick when repo-intel has nothing, and asks for 12', async () => {
    const { service, sampleCalls } = setup({ samples: [] });
    const { report } = await service.extract(WS, REPO.id);
    expect(sampleCalls).toEqual([[REPO.id, 12]]);
    expect(report.sample_source).toBe('fallback');
    expect(report.sampled_files).toContain('src/user-service.ts');
  });

  it('uses repo-intel samples first, drops paths not in the tree, and tops up', async () => {
    const { service } = setup({ samples: ['src/routes.ts', 'src/gone.ts'] });
    const { report } = await service.extract(WS, REPO.id);
    expect(report.sample_source).toBe('mixed');
    expect(report.sampled_files[0]).toBe('src/routes.ts');
    expect(report.sampled_files).not.toContain('src/gone.ts');
  });

  it('is repo_intel when it alone fills the sample', async () => {
    const { service } = setup({ samples: ['src/routes.ts', 'src/user-service.ts'], files: { 'src/routes.ts': ROUTES, 'src/user-service.ts': SERVICE } });
    const { report } = await service.extract(WS, REPO.id);
    expect(report.sample_source).toBe('repo_intel');
  });

  it('skips unreadable or empty files (the mock returns "" for a missing one)', async () => {
    // 'src/empty.ts' is tracked but blank; it must not reach the prompt or the sample list
    const s = setup({ files: { ...FILES, 'src/empty.ts': '   \n' } });
    const { report } = await s.service.extract(WS, REPO.id);
    expect(report.sampled_files).not.toContain('src/empty.ts');
    expect(report.sampled_files).toContain('src/routes.ts');
  });

  it('never re-suggests accepted or rejected rules, and rescan replaces only pending', async () => {
    const { service, store } = setup();
    await service.extract(WS, REPO.id);
    store.rows[0]!.status = 'rejected';
    store.rows[1]!.status = 'accepted';
    const again = await service.extract(WS, REPO.id);
    // the low-confidence near-duplicate of the first rule matches the decided rule too
    expect(again.report.dropped.known_decision).toBe(3);
    expect(again.report.kept).toBe(0);
    expect(store.rows.map((r) => r.status).sort()).toEqual(['accepted', 'rejected']);
    // rejected stays hidden, accepted stays visible
    expect(again.candidates.map((c) => c.status)).toEqual(['accepted']);
  });

  it('rejects a second scan of the same repo while one runs (409 scan_in_progress)', async () => {
    const s = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = s.deps.resolveModel;
    s.deps.resolveModel = async (ws) => {
      await gate;
      return inner(ws);
    };
    const service = new ConventionsService(s.deps);
    const first = service.extract(WS, REPO.id);
    await new Promise((r) => setTimeout(r, 10));
    await expect(service.extract(WS, REPO.id)).rejects.toMatchObject({ code: 'scan_in_progress', statusCode: 409 });
    release();
    await first;
    // the guard is released afterwards
    await expect(service.extract(WS, REPO.id)).resolves.toBeDefined();
  });

  it('releases the guard when the scan fails', async () => {
    const s = setup();
    s.deps.llm = async () => {
      throw new Error('boom');
    };
    const service = new ConventionsService(s.deps);
    await expect(service.extract(WS, REPO.id)).rejects.toThrow('boom');
    await expect(service.extract(WS, REPO.id)).rejects.toThrow('boom');
  });

  it('maps a provider failure to a 502', async () => {
    const s = setup();
    s.llm.completeStructured = async () => {
      throw new Error('rate limited');
    };
    const err = await s.service.extract(WS, REPO.id).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 502 });
    expect(err.message).toContain('rate limited');
  });

  it('404 for an unknown repo, 409 when the repo is not cloned, 422 when nothing is readable', async () => {
    await expect(setup().service.extract(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    await expect(setup({ repo: { ...REPO, clonePath: null } }).service.extract(WS, REPO.id)).rejects.toMatchObject({
      code: 'repo_not_cloned',
      statusCode: 409,
    });
    await expect(setup({ files: { 'README.md': '# hi' } }).service.extract(WS, REPO.id)).rejects.toMatchObject({
      code: 'no_source_files',
      statusCode: 422,
    });
  });

  it('can cite a config file that was shown, but not the summarised package.json', async () => {
    const extraction = {
      conventions: [
        {
          category: 'types',
          rule: 'TypeScript runs in strict mode.',
          evidence: { file: 'tsconfig.json', line: 1, snippet: '"compilerOptions": { "strict": true }' },
          confidence: 0.9,
        },
        {
          category: 'config',
          rule: 'Tests run through vitest.',
          evidence: { file: 'package.json', line: 1, snippet: '"scripts": { "test": "vitest" }' },
          confidence: 0.9,
        },
      ],
    };
    const { service } = setup({ extraction });
    const res = await service.extract(WS, REPO.id);
    expect(res.candidates.map((c) => c.evidence_path)).toEqual(['tsconfig.json']);
    expect(res.report.dropped.unknown_file).toBe(1);
  });
});

describe('ConventionsService list / patch / skills', () => {
  async function scanned() {
    const s = setup();
    await s.service.extract(WS, REPO.id);
    return s;
  }

  it('lists non-rejected candidates with last_scan from the newest row', async () => {
    const s = await scanned();
    s.store.rows[0]!.status = 'rejected';
    const list = await s.service.list(WS, REPO.id);
    expect(list.candidates).toHaveLength(1);
    expect(list.last_scan).toEqual({ at: '2026-01-01T00:00:00.000Z', commit_sha: 'sha-abc' });
    const empty = await setup().service.list(WS, REPO.id);
    expect(empty).toEqual({ candidates: [], last_scan: null });
  });

  it('patch changes status or rule; 404 for an id outside the repo', async () => {
    const s = await scanned();
    const id = s.store.rows[0]!.id;
    expect((await s.service.patch(WS, REPO.id, id, { status: 'accepted' })).status).toBe('accepted');
    expect((await s.service.patch(WS, REPO.id, id, { rule: 'New wording.' })).rule).toBe('New wording.');
    await expect(s.service.patch(WS, REPO.id, 'other-id', { status: 'accepted' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('skill-draft rejects any id that is not accepted in this repo (422)', async () => {
    const s = await scanned();
    const [a, b] = s.store.rows;
    a!.status = 'accepted';
    await expect(s.service.skillDraft(WS, REPO.id, { convention_ids: [a!.id, b!.id] })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(s.service.skillDraft(WS, REPO.id, { convention_ids: [a!.id, 'ghost'] })).rejects.toMatchObject({
      statusCode: 422,
    });
    const draft = await s.service.skillDraft(WS, REPO.id, { convention_ids: [a!.id] });
    expect(draft.type).toBe('convention');
    expect(draft.evidence_files).toEqual([a!.evidencePath]);
    expect(draft.body).toContain(a!.rule);
    expect(draft.body).not.toContain(b!.rule);
  });

  it('createSkill derives evidence_files and source itself, and binds the agent', async () => {
    const s = await scanned();
    s.store.rows.forEach((r) => (r.status = 'accepted'));
    const out = await s.service.createSkill(WS, REPO.id, {
      convention_ids: s.store.rows.map((r) => r.id),
      name: 'my-conventions',
      description: 'Use when ...',
      body: '# edited body',
      agent_id: 'agent-1',
    });
    expect(out).toEqual({ skill_id: 'skill-1', name: 'my-conventions', agent_id: 'agent-1' });
    expect(s.skills[0]).toMatchObject({
      type: 'convention',
      source: 'extracted',
      body: '# edited body',
      evidenceFiles: ['src/routes.ts', 'src/user-service.ts'],
    });
    expect(s.bound).toEqual([['agent-1', 'skill-1']]);
  });

  it('createSkill validates the agent before writing anything', async () => {
    const s = await scanned();
    s.store.rows.forEach((r) => (r.status = 'accepted'));
    await expect(
      s.service.createSkill(WS, REPO.id, {
        convention_ids: [s.store.rows[0]!.id],
        name: 'x',
        description: 'y',
        body: 'z',
        agent_id: 'missing-agent',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(s.skills).toHaveLength(0);
  });

  it('createSkill refuses non-accepted ids and writes nothing', async () => {
    const s = await scanned();
    await expect(
      s.service.createSkill(WS, REPO.id, { convention_ids: [s.store.rows[0]!.id], name: 'x', description: 'y', body: 'z' }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(s.skills).toHaveLength(0);
  });
});
