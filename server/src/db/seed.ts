import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
  FLUTTER_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  GENERAL_REVIEWER_PROMPT_LEGACY,
  PERFORMANCE_REVIEWER_PROMPT_LEGACY,
} from './seed-prompts-legacy.js';
import {
  API_CONTRACT_SKILLS,
  TEST_QUALITY_SKILLS,
  FLUTTER_REVIEWER_SKILLS,
  FLUTTER_WIDGET_TESTING,
  FLUTTER_REBUILD_PERFORMANCE,
  NODE_TS_CORRECTNESS,
  NODE_FASTIFY_DRIZZLE_PERFORMANCE,
  type SeedSkill,
} from './seed-skills.js';
import { AgentsRepository } from '../modules/agents/repository.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the six built-in agents (General, Security, Performance,
 * Test Quality, API Contract, Flutter Reviewer), all on the default
 * openrouter/deepseek-v4-flash provider+model. Test Quality, API Contract and
 * Flutter Reviewer come with their skills already bound; General and Performance
 * each pick up one stack-specific skill too (spec 07 — Flutter-first).
 *
 * Re-seeding an EXISTING database (not just a fresh install) also: upgrades
 * General/Performance's prompt, but only if it is still the exact pre-Flutter-first
 * text (a prompt you've edited is left alone); appends a newly-introduced skill to
 * an agent that already has other bindings, without re-adding one you removed; and
 * backfills `applies_to` on the pre-existing zod-contract-conventions skill, but only
 * if you've never touched that row.
 *
 * Course lessons populate the other tables (conventions, memory, eval, …) once
 * their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Checks that a PR\'s tests would catch a regression: uncovered branches, missed corner cases, over-mocking, flakes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Finds breaking changes to routes and zod contracts before callers hit them.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Flutter Reviewer',
      description: 'Flutter & Dart: widget lifecycle, Bloc/Cubit, async context, platform & assets.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: FLUTTER_REVIEWER_PROMPT,
      // No repo-intel: the indexer is JS/TS-only, so a Dart repo's skeleton/callers
      // digest is always empty — enrichment would be pure overhead for this agent.
      repoIntel: false,
      appliesTo: ['*.dart', 'pubspec.yaml', '*.arb'],
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- prompt upgrades (Flutter-first): only when the stored prompt is still the
  // exact legacy text — a prompt the user edited in the UI is left alone. Runs
  // through AgentsRepository.update so a real upgrade is versioned and snapshotted
  // like any other config change, the same as an edit made in the Agent editor.
  const agentsRepo = new AgentsRepository(db);
  const upgradePromptIfLegacy = async (agentName: string, legacy: string, next: string) => {
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent) return;
    if (agent.systemPrompt === next) return; // a fresh install already has it — nothing to do
    if (agent.systemPrompt !== legacy) {
      console.log(`seed: skipped prompt upgrade for "${agentName}" — customised prompt`);
      return;
    }
    await agentsRepo.update(workspaceId, agent.id, { systemPrompt: next });
  };
  await upgradePromptIfLegacy('General Reviewer', GENERAL_REVIEWER_PROMPT_LEGACY, GENERAL_REVIEWER_PROMPT);
  await upgradePromptIfLegacy(
    'Performance Reviewer',
    PERFORMANCE_REVIEWER_PROMPT_LEGACY,
    PERFORMANCE_REVIEWER_PROMPT,
  );

  // ---- built-in skills + their bindings (idempotent by name) ----
  const skillIdByName = new Map<string, string>();
  const ensureSkill = async (s: SeedSkill): Promise<{ id: string; created: boolean }> => {
    const cached = skillIdByName.get(s.name);
    if (cached) return { id: cached, created: false };
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    let id = existing?.id;
    let created = false;
    if (!id) {
      const [row] = await db
        .insert(t.skills)
        .values({ workspaceId, ...s, source: 'manual', enabled: true, version: 1 })
        .returning();
      id = row!.id;
      created = true;
      await db.insert(t.skillVersions).values({ skillId: id, version: 1, body: s.body });
    }
    skillIdByName.set(s.name, id);
    return { id, created };
  };
  const bindSkills = async (agentName: string, list: SeedSkill[]) => {
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent) return;
    // Only seed bindings for an agent that has none, so edits made in the UI survive a re-seed.
    const bound = await db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, agent.id));
    if (bound.length > 0) return;
    const ids: string[] = [];
    for (const s of list) ids.push((await ensureSkill(s)).id);
    await db
      .insert(t.agentSkills)
      .values(ids.map((skillId, order) => ({ agentId: agent.id, skillId, order, enabled: true })));
  };
  await bindSkills('Test Quality Reviewer', TEST_QUALITY_SKILLS);
  await bindSkills('API Contract Reviewer', API_CONTRACT_SKILLS);
  await bindSkills('Flutter Reviewer', FLUTTER_REVIEWER_SKILLS);

  // Skills that join an ALREADY-configured agent (Test Quality, Performance, General
  // all had bindings — or, for Performance/General, gain their first ones here — before
  // this skill existed), so `bindSkills`'s zero-bindings guard would never add them.
  // Append only when the skill was CREATED this run: a skill that already existed
  // (a fresh install running this seed for the first time still creates it above, so
  // this only skips a skill a re-seed finds already present) is never re-bound — a
  // user who unbinds it later is respected on every future seed.
  const appendIfCreated = async (agentName: string, skill: SeedSkill) => {
    const { id, created } = await ensureSkill(skill);
    if (!created) return;
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, agentName)));
    if (!agent) return;
    await agentsRepo.appendSkill(workspaceId, agent.id, id);
  };
  await appendIfCreated('Test Quality Reviewer', FLUTTER_WIDGET_TESTING);
  await appendIfCreated('Performance Reviewer', FLUTTER_REBUILD_PERFORMANCE);
  await appendIfCreated('General Reviewer', NODE_TS_CORRECTNESS);
  await appendIfCreated('Performance Reviewer', NODE_FASTIFY_DRIZZLE_PERFORMANCE);

  // ---- applies_to backfill on a pre-Flutter-first skill, only if truly untouched ----
  // (`applies_to` didn't exist when this row was first seeded; give it TS/JS globs
  // now, but only on a row nobody has ever edited via the UI — updated_at = created_at
  // is the closest proxy for "never opened the editor and hit Save" this schema has.)
  await db
    .update(t.skills)
    .set({ appliesTo: NODE_TS_CORRECTNESS.appliesTo })
    .where(
      and(
        eq(t.skills.workspaceId, workspaceId),
        eq(t.skills.name, 'zod-contract-conventions'),
        isNull(t.skills.appliesTo),
        eq(t.skills.updatedAt, t.skills.createdAt),
      ),
    );

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
