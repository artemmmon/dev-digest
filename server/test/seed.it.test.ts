import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { GENERAL_REVIEWER_PROMPT, PERFORMANCE_REVIEWER_PROMPT } from '../src/db/seed-prompts.js';
import { GENERAL_REVIEWER_PROMPT_LEGACY } from '../src/db/seed-prompts-legacy.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[seed] Docker not available — skipping integration tests.');
}

/**
 * The Flutter-first seed migration (spec 07, part 2): a fresh Flutter Reviewer with
 * its skills, a guarded prompt upgrade for pre-existing agents, and skills appended
 * to already-configured agents without disturbing what the user removed.
 */
d('Flutter-first seed', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function agentByName(name: string) {
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, ws!.id), eq(t.agents.name, name)));
    return agent;
  }

  it('a fresh seed creates Flutter Reviewer with its 8 skills in order, scoped and repo-intel off', async () => {
    await seed(pg.handle.db);
    const agent = await agentByName('Flutter Reviewer');
    expect(agent).toMatchObject({
      repoIntel: false,
      appliesTo: ['*.dart', 'pubspec.yaml', '*.arb'],
      enabled: true,
    });

    const skills = await new AgentsRepository(pg.handle.db).resolvedSkills(agent!.id);
    expect(skills.map((s) => s.name)).toEqual([
      'flutter-async-context-safety',
      'flutter-resource-disposal',
      'bloc-cubit-conventions',
      'dart-null-safety-and-types',
      'dart-async-correctness',
      'flutter-platform-and-assets',
      'dart-codegen-sources',
      'flutter-ui-accessibility-and-theming',
    ]);

    // fresh install: General/Performance already have the neutral prompt, nothing to upgrade
    expect((await agentByName('General Reviewer'))?.systemPrompt).toBe(GENERAL_REVIEWER_PROMPT);
    expect((await agentByName('Performance Reviewer'))?.systemPrompt).toBe(PERFORMANCE_REVIEWER_PROMPT);

    // node-ts-correctness / node-fastify-drizzle-performance joined the existing agents
    const generalAgent = await agentByName('General Reviewer');
    const generalSkills = (await new AgentsRepository(pg.handle.db).resolvedSkills(generalAgent!.id)).map(
      (s) => s.name,
    );
    expect(generalSkills).toEqual(['node-ts-correctness']);
    const perfAgent = await agentByName('Performance Reviewer');
    const perfSkills = (await new AgentsRepository(pg.handle.db).resolvedSkills(perfAgent!.id)).map(
      (s) => s.name,
    );
    expect(perfSkills).toEqual(['flutter-rebuild-performance', 'node-fastify-drizzle-performance']);
  });

  it('a second seed changes nothing: no duplicate skills, no extra bindings, versions unchanged', async () => {
    const flutterBefore = await agentByName('Flutter Reviewer');
    const generalBefore = await agentByName('General Reviewer');

    await seed(pg.handle.db); // re-seed

    const flutterAfter = await agentByName('Flutter Reviewer');
    const generalAfter = await agentByName('General Reviewer');
    expect(flutterAfter?.version).toBe(flutterBefore?.version);
    expect(generalAfter?.version).toBe(generalBefore?.version);

    const skillRows = await pg.handle.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.name, 'flutter-async-context-safety'));
    expect(skillRows).toHaveLength(1);

    const skills = await new AgentsRepository(pg.handle.db).resolvedSkills(flutterAfter!.id);
    expect(skills).toHaveLength(8);
  });

  it('a customised General prompt is left alone; a legacy one gets upgraded and versioned', async () => {
    const custom = 'You are MY OWN custom general reviewer. Be nice.';
    let agent = await agentByName('General Reviewer');
    await new AgentsRepository(pg.handle.db).update(
      (await pg.handle.db.select().from(t.workspaces))[0]!.id,
      agent!.id,
      { systemPrompt: custom },
    );

    await seed(pg.handle.db); // must not touch the customised prompt

    agent = await agentByName('General Reviewer');
    expect(agent?.systemPrompt).toBe(custom);

    // Roll it back to the legacy text directly (simulating an old, pre-upgrade install)
    // and confirm THAT does get upgraded, versioned, and snapshotted.
    await pg.handle.db
      .update(t.agents)
      .set({ systemPrompt: GENERAL_REVIEWER_PROMPT_LEGACY })
      .where(eq(t.agents.id, agent!.id));
    const versionBefore = (await agentByName('General Reviewer'))!.version;

    await seed(pg.handle.db);

    const upgraded = await agentByName('General Reviewer');
    expect(upgraded?.systemPrompt).toBe(GENERAL_REVIEWER_PROMPT);
    expect(upgraded!.version).toBe(versionBefore + 1);
    const versions = await new AgentsRepository(pg.handle.db).listVersions(upgraded!.id);
    expect((versions[0]!.configJson as { system_prompt: string }).system_prompt).toBe(
      GENERAL_REVIEWER_PROMPT,
    );
  });

  it('a skill binding the user removed is never re-added by a later seed', async () => {
    const workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    const agent = await agentByName('Flutter Reviewer');
    const repo = new AgentsRepository(pg.handle.db);
    const links = await repo.linkedSkills(agent!.id);
    const withoutFirst = links
      .filter((l) => l.skillId !== links[0]!.skillId)
      .map((l) => ({ skillId: l.skillId, enabled: l.enabled }));
    await repo.setSkills(workspaceId, agent!.id, withoutFirst);
    expect(await repo.resolvedSkills(agent!.id)).toHaveLength(7);

    await seed(pg.handle.db);

    expect(await repo.resolvedSkills(agent!.id)).toHaveLength(7);
  });

  it('backfills applies_to on zod-contract-conventions only if it was never edited', async () => {
    const untouched = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'zod-contract-conventions'));
    expect(untouched[0]?.appliesTo).toEqual(['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs']);
  });

  it('does not backfill applies_to on a row the user has already edited', async () => {
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.name, 'route-breaking-change-rubric'));
    // Simulate a user edit: updated_at moves away from created_at, applies_to stays null.
    await pg.handle.db
      .update(t.skills)
      .set({ description: 'edited by the user', updatedAt: new Date() })
      .where(eq(t.skills.id, row!.id));

    await seed(pg.handle.db);

    const after = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, row!.id));
    expect(after[0]?.appliesTo).toBeNull();
  });
});
