import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ValidationError } from '../src/platform/errors.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  retries: 3,
   redisUrl: x,`;

const CLEAN_REVIEW: Review = { verdict: 'approve', summary: 'Nothing to flag.', score: 100, findings: [] };

const skillBody = (name: string) => ({
  name,
  description: `Use when reviewing ${name}.`,
  type: 'rubric' as const,
  body: `# ${name}\nCheck ${name}.`,
});

d('skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const llm = new MockLLMProvider('openai', { structured: CLEAN_REVIEW });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** What the fake fetcher answers per URL; never a real network call. */
  const remoteFiles = new Map<string, Uint8Array>();
  const requested: string[] = [];

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        http: {
          fetch: async (url) => {
            requested.push(url.href);
            const bytes = remoteFiles.get(url.href);
            if (!bytes) throw new ValidationError('The server answered 404 for this URL');
            return bytes;
          },
        },
      },
    });
  }

  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    return res.json() as { id: string; version: number };
  }

  async function newSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: skillBody(name) });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number };
  }

  it('creates, edits, versions, toggles and deletes a skill', async () => {
    const app = await makeApp();
    const created = await newSkill(app, 'crud-skill');
    expect(created.version).toBe(1);

    const detail = (await app.inject({ method: 'GET', url: `/skills/${created.id}` })).json();
    expect(detail).toMatchObject({ name: 'crud-skill', source: 'manual', enabled: true });

    // renaming keeps v1; changing the body makes v2 and stores it in skill_versions
    const renamed = (
      await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { name: 'crud-renamed' } })
    ).json();
    expect(renamed).toMatchObject({ name: 'crud-renamed', version: 1 });
    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: '# new\nbody' } })
    ).json();
    expect(edited.version).toBe(2);
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const off = (
      await app.inject({ method: 'PATCH', url: `/skills/${created.id}/enabled`, payload: { enabled: false } })
    ).json();
    expect(off).toMatchObject({ enabled: false, version: 2 });

    expect((await app.inject({ method: 'DELETE', url: `/skills/${created.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${created.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('keeps a change message per version, newest first, and tokens on the skill', async () => {
    const app = await makeApp();
    const created = await newSkill(app, 'history-skill');
    const put = (payload: object) =>
      app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload });
    await put({ body: '# v2\nbody', message: '  Tightened the rule  ' });
    await put({ name: 'history-renamed', message: 'no body change, so no version' });
    await put({ body: '# v3\nbody' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })).json();
    expect(versions.map((v: { version: number; message: string | null }) => [v.version, v.message])).toEqual([
      [3, null],
      [2, 'Tightened the rule'],
      [1, null],
    ]);
    expect(versions[2].body).toBe('# history-skill\nCheck history-skill.');

    const detail = (await app.inject({ method: 'GET', url: `/skills/${created.id}` })).json();
    expect(detail.body_tokens).toBeGreaterThan(0);
    expect((await app.inject({ method: 'GET', url: '/skills/00000000-0000-0000-0000-000000000000/versions' })).statusCode).toBe(404);
    await app.close();
  });

  it('counts and lists the agents that have a skill switched on', async () => {
    const app = await makeApp();
    const skill = await newSkill(app, 'usage-skill');
    const on = await newAgent(app, 'usage-on');
    const muted = await newAgent(app, 'usage-muted');
    const bind = (id: string, enabled: boolean) =>
      app.inject({
        method: 'PUT',
        url: `/agents/${id}/skills`,
        payload: { skills: [{ skill_id: skill.id, enabled }] },
      });
    await bind(on.id, true);
    await bind(muted.id, false);

    const agents = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/agents` })).json();
    expect(agents).toEqual([{ id: on.id, name: 'usage-on' }]);
    const detail = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(detail.agent_count).toBe(1);
    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{
      id: string;
      agent_count: number;
    }>;
    expect(listed.find((x) => x.id === skill.id)?.agent_count).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/skills/00000000-0000-0000-0000-000000000000/agents' })).statusCode).toBe(404);
    await app.close();
  });

  it('rejects an invalid skill with 422', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...skillBody('x'), type: 'nonsense' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('import preview reads the archive, lists the script as ignored, and saves nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const zip = zipSync({
      'imp-skill/SKILL.md': strToU8('---\nname: imp-skill\ndescription: Use when importing.\n---\n# Imp\nBody.'),
      'imp-skill/scripts/check.sh': strToU8('#!/bin/sh\ntouch /tmp/devdigest-pwned\n'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'imp-skill.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'imp-skill',
      source_file: 'imp-skill/SKILL.md',
      ignored_files: [{ path: 'imp-skill/scripts/check.sh', reason: 'executable' }],
    });

    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    // saving is a separate, explicit call
    const saved = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...skillBody('imp-skill'), source: 'imported_file' },
    });
    expect(saved.json().source).toBe('imported_file');
    await app.close();
  });

  it('import preview answers 422 for a bad archive and a wrong file type', async () => {
    const app = await makeApp();
    for (const [filename, content] of [
      ['x.zip', 'not a zip'],
      ['x.txt', 'hello'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: { filename, content_base64: Buffer.from(content).toString('base64') },
      });
      expect(res.statusCode).toBe(422);
    }
    await app.close();
  });

  it('previews an import from a URL through the fake fetcher and saves nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    remoteFiles.set(
      'https://raw.githubusercontent.com/acme/skills/main/url-skill/SKILL.md',
      strToU8('---\nname: url-skill\ndescription: Use when importing by URL.\ntype: convention\n---\n# Url\nBody.'),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/url',
      payload: { url: 'https://github.com/acme/skills/blob/main/url-skill/SKILL.md' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'url-skill', type: 'convention', source_file: 'SKILL.md' });
    expect(requested.at(-1)).toBe('https://raw.githubusercontent.com/acme/skills/main/url-skill/SKILL.md');
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const saved = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...skillBody('url-skill'), source: 'imported_url' },
    });
    expect(saved.json().source).toBe('imported_url');
    await app.close();
  });

  it('import from URL answers 422 for a bad URL, an unknown file and a body that is not a URL', async () => {
    const app = await makeApp();
    const calls = requested.length;
    for (const url of ['http://example.com/a.md', 'https://example.com/a.txt', 'https://u:p@example.com/a.md', 'https://example.com/missing.md']) {
      const res = await app.inject({ method: 'POST', url: '/skills/import/url', payload: { url } });
      expect(res.statusCode).toBe(422);
    }
    expect(requested.length).toBe(calls + 1); // only the last one passed URL rules and reached the fetcher
    const res = await app.inject({ method: 'POST', url: '/skills/import/url', payload: { url: 'nope' } });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('binds skills to an agent: order, switch, version bump only when the prompt set changes', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'binding-agent');
    const a = await newSkill(app, 'bind-a');
    const b = await newSkill(app, 'bind-b');
    const put = (skills: Array<{ skill_id: string; enabled: boolean }>) =>
      app.inject({ method: 'PUT', url: `/agents/${agent.id}/skills`, payload: { skills } });
    const version = async () =>
      ((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json() as { version: number }).version;

    expect(await version()).toBe(1);
    const first = await put([
      { skill_id: b.id, enabled: true },
      { skill_id: a.id, enabled: true },
    ]);
    expect(first.json().map((l: { skill_id: string; order: number }) => [l.skill_id, l.order])).toEqual([
      [b.id, 0],
      [a.id, 1],
    ]);
    expect(await version()).toBe(2);

    // muting the second binding changes what reaches the prompt
    await put([
      { skill_id: b.id, enabled: true },
      { skill_id: a.id, enabled: false },
    ]);
    expect(await version()).toBe(3);

    // the same enabled list again — no change, no new version
    await put([
      { skill_id: b.id, enabled: true },
      { skill_id: a.id, enabled: false },
    ]);
    expect(await version()).toBe(3);

    // the snapshot holds the enabled skills in prompt order
    const snap = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions/3` })).json();
    expect(snap.config.skills).toEqual([b.id]);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links.map((l: { enabled: boolean }) => l.enabled)).toEqual([true, false]);

    // the card counts skills that reach the prompt
    const listed = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{
      id: string;
      skill_count: number;
    }>;
    expect(listed.find((x) => x.id === agent.id)?.skill_count).toBe(1);
    await app.close();
  });

  it('refuses an unknown skill, a duplicate, and an unknown agent', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'binding-errors');
    const s = await newSkill(app, 'bind-errors');
    const ghost = '00000000-0000-4000-8000-000000000000';
    const put = (id: string, skills: Array<{ skill_id: string; enabled: boolean }>) =>
      app.inject({ method: 'PUT', url: `/agents/${id}/skills`, payload: { skills } });

    expect((await put(agent.id, [{ skill_id: ghost, enabled: true }])).statusCode).toBe(422);
    expect(
      (
        await put(agent.id, [
          { skill_id: s.id, enabled: true },
          { skill_id: s.id, enabled: false },
        ])
      ).statusCode,
    ).toBe(422);
    expect((await put(ghost, [])).statusCode).toBe(404);
    await app.close();
  });

  it('resolvedSkills keeps binding order and drops disabled bindings and disabled skills', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'resolved-agent');
    const [x, y, z] = [
      await newSkill(app, 'res-x'),
      await newSkill(app, 'res-y'),
      await newSkill(app, 'res-z'),
    ];
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: z.id, enabled: true },
          { skill_id: y.id, enabled: false },
          { skill_id: x.id, enabled: true },
        ],
      },
    });
    const repo = new AgentsRepository(pg.handle.db);
    expect((await repo.resolvedSkills(agent.id)).map((s) => s.name)).toEqual(['res-z', 'res-x']);

    await app.inject({ method: 'PATCH', url: `/skills/${z.id}/enabled`, payload: { enabled: false } });
    expect((await repo.resolvedSkills(agent.id)).map((s) => s.name)).toEqual(['res-x']);
    await app.close();
  });

  it('seeds Test Quality and API Contract with bound skills, and re-seeding changes nothing', async () => {
    const boundNames = async (agentName: string) => {
      const [agent] = await pg.handle.db
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
      expect(agent, agentName).toBeDefined();
      return (await new AgentsRepository(pg.handle.db).resolvedSkills(agent!.id)).map((s) => s.name);
    };

    const tq = ['branch-coverage-rubric', 'mocking-discipline', 'flaky-test-patterns'];
    const api = ['route-breaking-change-rubric', 'zod-contract-conventions'];
    expect(await boundNames('Test Quality Reviewer')).toEqual(tq);
    expect(await boundNames('API Contract Reviewer')).toEqual(api);

    await seed(pg.handle.db);
    expect(await boundNames('Test Quality Reviewer')).toEqual(tq);
    const seeded = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, tq[0]!));
    expect(seeded).toHaveLength(1);
  });

  it('a review puts enabled skills in the prompt as separate blocks, in order, and traces them', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'prompt-agent');
    const first = await newSkill(app, 'prompt-first');
    const second = await newSkill(app, 'prompt-second');
    const muted = await newSkill(app, 'prompt-muted');
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: first.id, enabled: true },
          { skill_id: muted.id, enabled: false },
          { skill_id: second.id, enabled: true },
        ],
      },
    });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-repo', fullName: 'acme/skills-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Retry config',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  retries: 3,\n   redisUrl: x,',
    });

    const before = llm.calls.length;
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const call = llm.calls.slice(before).find((c) => c.method === 'completeStructured');
    const messages = (call!.req as { messages: Array<{ role: string; content: string }> }).messages;
    const user = messages.find((m) => m.role === 'user')!.content;
    const iFirst = user.indexOf('### Skill: prompt-first');
    const iSecond = user.indexOf('### Skill: prompt-second');
    expect(user).toContain('## Skills / rules');
    expect(iFirst).toBeGreaterThan(-1);
    expect(iSecond).toBeGreaterThan(iFirst);
    expect(user).not.toContain('prompt-muted');

    const runId = res.json().runs[0].run_id as string;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skill_blocks.map((b: { name: string }) => b.name)).toEqual([
      'prompt-first',
      'prompt-second',
    ]);
    for (const b of trace.prompt_assembly.skill_blocks) expect(b.tokens).toBeGreaterThan(0);
    const logs = trace.log.map((l: { msg: string }) => l.msg).filter((m: string) => m.startsWith('skill '));
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('prompt-first');
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('prompt-muted'))).toBe(false);

    // an agent with nothing bound: no section, no skill_blocks, a "none attached" line
    const bare = await newAgent(app, 'prompt-bare');
    const res2 = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: bare.id },
    });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 2 });
    const trace2 = (
      await app.inject({ method: 'GET', url: `/runs/${res2.json().runs[0].run_id}/trace` })
    ).json();
    expect(trace2.prompt_assembly.skills ?? null).toBeNull();
    expect(trace2.prompt_assembly.skill_blocks ?? null).toBeNull();
    expect(trace2.log.some((l: { msg: string }) => l.msg === 'skills: none attached')).toBe(true);
    await app.close();
  });

  it('applies_to (spec 07): a Dart-scoped skill is skipped on a TS-only PR and a Dart-scoped agent is skipped from "all"', async () => {
    const app = await makeApp();
    const agent = await newAgent(app, 'applies-to-agent');
    const tsSkill = await newSkill(app, 'applies-to-ts-skill');
    const dartSkillRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...skillBody('applies-to-dart-skill'), applies_to: ['*.dart'] },
    });
    const dartSkill = dartSkillRes.json() as { id: string; name: string };

    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: {
        skills: [
          { skill_id: tsSkill.id, enabled: true },
          { skill_id: dartSkill.id, enabled: true },
        ],
      },
    });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'applies-to-repo', fullName: 'acme/applies-to-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 8,
        title: 'TS-only change',
        author: 'dev',
        branch: 'feat/ts',
        base: 'main',
        headSha: 'def456',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  retries: 3,\n   redisUrl: x,',
    });

    // Skill-level gate: the Dart skill is left out of the prompt on a TS-only PR.
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const runId = res.json().runs[0].run_id as string;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skill_blocks.map((b: { name: string }) => b.name)).toEqual([
      'applies-to-ts-skill',
    ]);
    expect(
      trace.log.some((l: { msg: string }) =>
        l.msg.includes('applies-to-dart-skill') && l.msg.includes('skipped'),
      ),
    ).toBe(true);

    // Agent-level gate: an enabled agent scoped to *.dart is left out of "all" on this
    // TS-only PR, reported in skipped_agents, and gets no run at all.
    const dartAgent = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'applies-to-dart-agent',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'review',
        applies_to: ['*.dart'],
      },
    });
    const before = res.json().runs.length;
    const allRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { all: true },
    });
    expect(allRes.statusCode).toBe(200);
    const allBody = allRes.json();
    expect(allBody.skipped_agents).toContainEqual({
      agent_id: dartAgent.json().id,
      agent_name: 'applies-to-dart-agent',
    });
    expect(allBody.runs.some((r: { agent_id: string }) => r.agent_id === dartAgent.json().id)).toBe(false);
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: before + allBody.runs.length });
    await app.close();
  });
});
