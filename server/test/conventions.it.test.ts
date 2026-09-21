import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type {
  ConventionCandidate,
  ConventionList,
  ConventionScanResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const ROUTES = [
  "import { z } from 'zod';",
  '',
  'export async function handler(req) {',
  '  const body = Body.parse(req.body);',
  '  return service.create(body);',
  '}',
].join('\n');
const SERVICE = ['export class UserService {', '  constructor(private repo: Repo) {}', '}'].join('\n');
const FILES = {
  'src/routes.ts': ROUTES,
  'src/user-service.ts': SERVICE,
  'package.json': JSON.stringify({ name: 'api', scripts: { test: 'vitest' } }),
};

const RULE_A = 'Validate request bodies with zod at the route edge.';
const RULE_B = 'Services take their collaborators through the constructor.';
const RULE_C = 'Route handlers return the service result unchanged.';

const cand = (category: string, rule: string, file: string, line: number, snippet: string, confidence = 0.8) => ({
  category,
  rule,
  evidence: { file, line, snippet },
  confidence,
});
const A = cand('api', RULE_A, 'src/routes.ts', 4, 'const body = Body.parse(req.body);', 0.9);
const B = cand('structure', RULE_B, 'src/user-service.ts', 2, 'constructor(private repo: Repo) {}');
const C = cand('api', RULE_C, 'src/routes.ts', 5, 'return service.create(body);', 0.6);

d('conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const fixtures: { ConventionExtraction: unknown } = { ConventionExtraction: { conventions: [A, B] } };
  const llm = new MockLLMProvider('openai', { structuredBySchema: fixtures });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES, head: 'deadbeef' }),
        github: new MockGitHubClient(),
        // the conventions feature defaults to openrouter
        llm: { openrouter: llm },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function newRepo(name: string, clonePath: string | null = `/clones/acme/${name}`) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!.id;
  }

  const extract = async (app: App, repoId: string) => {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    return { status: res.statusCode, body: res.json() as ConventionScanResult };
  };
  const list = async (app: App, repoId: string) =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionList;
  const patch = (app: App, repoId: string, id: string, payload: object) =>
    app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${id}`, payload });

  it('extracts, persists and serves the candidates with GitHub links pinned to the commit', async () => {
    fixtures.ConventionExtraction = { conventions: [A, B] };
    const app = await makeApp();
    const repoId = await newRepo('persist');
    expect((await list(app, repoId))).toEqual({ candidates: [], last_scan: null });

    const { status, body } = await extract(app, repoId);
    expect(status).toBe(200);
    expect(body.report).toMatchObject({ kept: 2, raw_candidates: 2, model: 'deepseek/deepseek-v4-flash', provider: 'openrouter' });
    expect(body.candidates.map((c) => c.rule)).toEqual([RULE_A, RULE_B]);

    const loaded = await list(app, repoId);
    expect(loaded.candidates).toHaveLength(2);
    expect(loaded.last_scan?.commit_sha).toBe('deadbeef');
    expect(loaded.candidates[0]).toMatchObject({
      status: 'pending',
      category: 'api',
      evidence_path: 'src/routes.ts',
      evidence_line: 4,
      evidence_url: 'https://github.com/acme/persist/blob/deadbeef/src/routes.ts#L4',
    });
    expect(loaded.candidates[0]!.evidence_snippet).toBe('  const body = Body.parse(req.body);');
    await app.close();
  });

  it('accepts, rejects (hidden afterwards), edits and undoes', async () => {
    fixtures.ConventionExtraction = { conventions: [A, B] };
    const app = await makeApp();
    const repoId = await newRepo('patch');
    const { body } = await extract(app, repoId);
    const [a, b] = body.candidates as [ConventionCandidate, ConventionCandidate];

    const accepted = await patch(app, repoId, a.id, { status: 'accepted' });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ id: a.id, status: 'accepted' });

    const edited = await patch(app, repoId, a.id, { rule: '  Validate bodies with zod.  ' });
    expect(edited.json()).toMatchObject({ rule: 'Validate bodies with zod.', status: 'accepted' });

    expect((await patch(app, repoId, b.id, { status: 'rejected' })).statusCode).toBe(200);
    expect((await list(app, repoId)).candidates.map((c) => c.id)).toEqual([a.id]);

    const undone = await patch(app, repoId, a.id, { status: 'pending' });
    expect(undone.json()).toMatchObject({ status: 'pending' });

    expect((await patch(app, repoId, a.id, {})).statusCode).toBe(422);
    expect((await patch(app, repoId, a.id, { status: 'maybe' })).statusCode).toBe(422);
    await app.close();
  });

  it('rescan replaces only pending rows; accepted stay, rejected stay hidden and are not re-suggested', async () => {
    fixtures.ConventionExtraction = { conventions: [A, B] };
    const app = await makeApp();
    const repoId = await newRepo('rescan');
    const first = (await extract(app, repoId)).body;
    const [a, b] = first.candidates as [ConventionCandidate, ConventionCandidate];
    await patch(app, repoId, a.id, { status: 'accepted' });
    await patch(app, repoId, b.id, { status: 'rejected' });

    fixtures.ConventionExtraction = { conventions: [A, B, C] };
    const { body } = await extract(app, repoId);
    expect(body.report).toMatchObject({ raw_candidates: 3, kept: 1 });
    expect(body.report.dropped.known_decision).toBe(2);

    const shown = (await list(app, repoId)).candidates;
    expect(shown.map((c) => [c.rule, c.status]).sort()).toEqual([
      [RULE_C, 'pending'],
      [RULE_A, 'accepted'],
    ]);
    const rows = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === b.id)?.status).toBe('rejected');

    // a second rescan keeps decisions and swaps the pending row, never duplicating it
    await extract(app, repoId);
    const again = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    expect(again).toHaveLength(3);
    await app.close();
  });

  it('answers 404 for an unknown repo and 409 for a repo that is not cloned', async () => {
    const app = await makeApp();
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'POST', url: `/repos/${missing}/conventions/extract` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/repos/${missing}/conventions` })).statusCode).toBe(404);
    const repoId = await newRepo('nocline', null);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_cloned');
    await app.close();
  });

  it('builds a skill draft from accepted candidates only', async () => {
    fixtures.ConventionExtraction = { conventions: [A, B] };
    const app = await makeApp();
    const repoId = await newRepo('draft');
    const [a, b] = (await extract(app, repoId)).body.candidates as [ConventionCandidate, ConventionCandidate];
    const draftUrl = `/repos/${repoId}/conventions/skill-draft`;

    // pending -> 422
    const bad = await app.inject({ method: 'POST', url: draftUrl, payload: { convention_ids: [a.id] } });
    expect(bad.statusCode).toBe(422);

    await patch(app, repoId, a.id, { status: 'accepted' });
    await patch(app, repoId, b.id, { status: 'rejected' });
    const mixed = await app.inject({ method: 'POST', url: draftUrl, payload: { convention_ids: [a.id, b.id] } });
    expect(mixed.statusCode).toBe(422);

    const ok = await app.inject({ method: 'POST', url: draftUrl, payload: { convention_ids: [a.id] } });
    expect(ok.statusCode).toBe(200);
    const draft = ok.json();
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', evidence_files: ['src/routes.ts'] });
    expect(draft.body).toContain('# Conventions — acme/draft');
    expect(draft.body).toContain(RULE_A);
    expect(draft.body).not.toContain(RULE_B);
    expect(draft.description.length).toBeLessThanOrEqual(500);
    await app.close();
  });

  it('creates an extracted convention skill and binds it to an agent (enabled, version bumped)', async () => {
    fixtures.ConventionExtraction = { conventions: [A, B] };
    const app = await makeApp();
    const repoId = await newRepo('skill');
    const [a, b] = (await extract(app, repoId)).body.candidates as [ConventionCandidate, ConventionCandidate];
    await patch(app, repoId, a.id, { status: 'accepted' });
    await patch(app, repoId, b.id, { status: 'accepted' });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'conv-agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json() as { id: string; version: number };
    const skillsUrl = `/repos/${repoId}/conventions/skills`;
    const payload = {
      convention_ids: [a.id, b.id],
      name: 'acme-conventions',
      description: 'Use when reviewing acme code. Do NOT apply to generated files.',
      body: '# edited by the reviewer',
    };

    // unknown agent: 404 and no skill written
    const before = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'acme-conventions'));
    const ghost = await app.inject({
      method: 'POST',
      url: skillsUrl,
      payload: { ...payload, agent_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(ghost.statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'acme-conventions'))).toHaveLength(before.length);

    const res = await app.inject({ method: 'POST', url: skillsUrl, payload: { ...payload, agent_id: agent.id } });
    expect(res.statusCode).toBe(201);
    const created = res.json() as { skill_id: string; name: string; agent_id: string };
    expect(created).toMatchObject({ name: 'acme-conventions', agent_id: agent.id });

    const skill = (await app.inject({ method: 'GET', url: `/skills/${created.skill_id}` })).json();
    expect(skill).toMatchObject({
      source: 'extracted',
      type: 'convention',
      version: 1,
      body: '# edited by the reviewer',
      evidence_files: ['src/routes.ts', 'src/user-service.ts'],
      agent_count: 1,
    });

    const [link] = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, created.skill_id)));
    expect(link).toMatchObject({ enabled: true, order: 0 });
    const [row] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    expect(row!.version).toBe(agent.version + 1);

    // without an agent, only the skill is created
    const solo = await app.inject({ method: 'POST', url: skillsUrl, payload: { ...payload, name: 'acme-conventions-2', convention_ids: [a.id] } });
    expect(solo.statusCode).toBe(201);
    expect(solo.json().agent_id).toBeNull();
    await app.close();
  });

  it('appendSkill is idempotent and appends after existing bindings', async () => {
    const app = await makeApp();
    const agentsRepo = app.container.agentsRepo;
    const skillsRepo = app.container.skillsRepo;
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'append-agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json() as { id: string; version: number };
    const mk = (name: string) =>
      skillsRepo.insert({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: name });
    const s1 = await mk('append-1');
    const s2 = await mk('append-2');
    expect(await agentsRepo.appendSkill(workspaceId, agent.id, s1.id)).toBe(true);
    expect(await agentsRepo.appendSkill(workspaceId, agent.id, s2.id)).toBe(true);
    expect(await agentsRepo.appendSkill(workspaceId, agent.id, s1.id)).toBe(true);
    const links = await agentsRepo.linkedSkills(agent.id);
    expect(links.map((l) => [l.skillId, l.order, l.enabled])).toEqual([
      [s1.id, 0, true],
      [s2.id, 1, true],
    ]);
    const [row] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    expect(row!.version).toBe(agent.version + 2);
    expect(await agentsRepo.appendSkill(workspaceId, '00000000-0000-0000-0000-000000000000', s1.id)).toBe(false);
    await app.close();
  });

  it('never touches a convention of another repo (404 on patch, 422 in a skill)', async () => {
    fixtures.ConventionExtraction = { conventions: [A, B] };
    const app = await makeApp();
    const repoX = await newRepo('cross-x');
    const repoY = await newRepo('cross-y');
    const [a] = (await extract(app, repoX)).body.candidates as [ConventionCandidate];
    await patch(app, repoX, a.id, { status: 'accepted' });

    const res = await patch(app, repoY, a.id, { status: 'rejected' });
    expect(res.statusCode).toBe(404);
    const [row] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.id, a.id));
    expect(row!.status).toBe('accepted');

    const draft = await app.inject({
      method: 'POST',
      url: `/repos/${repoY}/conventions/skill-draft`,
      payload: { convention_ids: [a.id] },
    });
    expect(draft.statusCode).toBe(422);
    await app.close();
  });
});
