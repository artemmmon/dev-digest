import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { RunBus } from '../src/platform/sse.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

/** Intent classifier fixture (L03): review_intent defaults to openrouter. */
const INTENT_FIXTURE = {
  summary: 'Adds rate limiting to the public API.',
  in_scope: ['rate limiter middleware'],
  out_of_scope: ['auth changes'],
};

/** One out-of-scope SUGGESTION (dropped) + two out-of-scope WARNINGs (folded into one). */
const SCOPE_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Some findings fall outside the stated scope.',
  score: 90,
  findings: [
    {
      id: 's1',
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Unrelated style nit',
      file: 'src/config.ts',
      start_line: 10,
      end_line: 10,
      rationale: 'r',
      confidence: 0.6,
      kind: 'finding',
      scope: 'out_of_scope',
    },
    {
      id: 'w1',
      severity: 'WARNING',
      category: 'bug',
      title: 'Unrelated bug A',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.7,
      kind: 'finding',
      scope: 'out_of_scope',
    },
    {
      id: 'w2',
      severity: 'WARNING',
      category: 'bug',
      title: 'Unrelated bug B',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 12,
      rationale: 'r',
      confidence: 0.75,
      kind: 'finding',
      scope: 'out_of_scope',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
        // L03: every review run also derives/reuses the PR's intent, which
        // defaults to the `openrouter` provider — an empty secrets store keeps
        // that deterministically fail-open (D9) instead of racing a real key
        // that might be configured on the machine running the suite.
        secrets: new MockSecretsProvider({}),
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('L03: trace carries prompt_assembly.intent; the scope policy folds/drops out-of-scope findings; a stale intent disables it', async () => {
    const { pr, repo } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient({
          // PR body says "Closes #471." and targets the default branch (main) —
          // GraphQL resolves it, giving a `documented`/`high` intent.
          closingIssues: {
            [`${repo.owner}/${repo.name}#482`]: [
              { number: 471, title: 'Rate limit abuse', body: 'Public endpoints get hammered.', state: 'open' },
            ],
          },
        }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: SCOPE_FIXTURE }),
          openrouter: new MockLLMProvider('openrouter', { structured: INTENT_FIXTURE }),
        },
      },
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ScopeAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    // ---- Phase 1: a fresh, high-confidence intent — the filter is ON -------
    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const runId1 = first.json().runs[0].run_id;
    const trace1 = (await app.inject({ method: 'GET', url: `/runs/${runId1}/trace` })).json();
    expect(trace1.prompt_assembly.intent).toContain('Adds rate limiting to the public API.');

    const intentRes = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(intentRes.intent.confidence_tier).toBe('high');
    expect(intentRes.stale).toBe(false);

    const reviews1 = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews1).toHaveLength(1);
    // 1 SUGGESTION dropped, 2 WARNINGs folded into exactly one out_of_scope signal
    expect(reviews1[0].findings).toHaveLength(1);
    expect(reviews1[0].findings[0].kind).toBe('out_of_scope');
    expect(reviews1[0].findings[0].severity).toBe('WARNING');
    expect(reviews1[0].findings[0].rationale).toContain('Unrelated bug A');
    expect(reviews1[0].findings[0].rationale).toContain('Unrelated bug B');

    // ---- Phase 2: the PR head moves — the stored intent is now stale, and the
    // scope filter turns off (D2: outdated scope must not delete a finding) ---
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'new-head-sha' }).where(eq(t.pullRequests.id, pr.id));

    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const staleIntent = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).json();
    expect(staleIntent.stale).toBe(true);

    const runId2 = second.json().runs[0].run_id;
    const secondReview = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` }))
      .json()
      .find((r: { run_id: string }) => r.run_id === runId2);
    // identity: all three out-of-scope findings persist, nothing dropped or folded
    expect(secondReview.findings).toHaveLength(3);
    expect(secondReview.findings.every((f: { kind: string | null }) => f.kind !== 'out_of_scope')).toBe(true);

    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    // the stream ends with an explicit terminal event
    expect(sse.payload.trimEnd().endsWith('event: done\ndata: {}')).toBe(true);

    // a reconnect with Last-Event-ID replays only what the client missed
    const seqs = [...sse.payload.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    const last = seqs.at(-1)!;
    const resumed = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/events`,
      headers: { 'last-event-id': String(last - 1) },
    });
    expect([...resumed.payload.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]))).toEqual([last]);
    await app.close();
  });

  it('SSE: an unknown run is 404, not a stream that never ends', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const res = await app.inject({
      method: 'GET',
      url: '/runs/00000000-0000-0000-0000-000000000000/events',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('SSE: a finished run the bus no longer holds ends the stream at once', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseGoneAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    await app.close();

    // Same DB, empty bus — as after an API restart or once retention expired.
    const restarted = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { runBus: new RunBus() },
    });
    const sse = await restarted.inject({ method: 'GET', url: `/runs/${body.runs[0].run_id}/events` });
    expect(sse.statusCode).toBe(200);
    // Closed straight away with just the terminal event, no log frames.
    // (Before, inject() never returned — the stream waited for events forever.)
    expect(sse.payload).toBe('retry: 3000\n\nevent: done\ndata: {}\n\n');
    await restarted.close();
  });

  it('run cost: persisted per run, one batch per request, PR list sums the latest batch', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        // No PRs from "GitHub": the list serves the persisted PR, no network.
        github: new MockGitHubClient({ pulls: [] }),
        // `all: true` also runs seeded (openrouter) and earlier tests' (anthropic)
        // agents — mock every provider so nothing hits the network.
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          anthropic: new MockLLMProvider('anthropic', { structured: REVIEW_FIXTURE }),
          openrouter: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
        },
      },
    });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const createAgent = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
        })
      ).json();
    const a1 = await createAgent('Cost A');

    // Batch 1: a single agent.
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: a1.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    // Batch 2: every enabled agent in one request.
    const batch2 = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    expect(batch2.runs.length).toBeGreaterThanOrEqual(2);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: batch2.runs.length + 1 });

    const rows = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    for (const r of rows) {
      expect(r.status).toBe('done');
      expect(r.costUsd).toBeGreaterThan(0);
    }
    const batch2Ids = new Set(batch2.runs.map((r: { run_id: string }) => r.run_id));
    const batch2Rows = rows.filter((r) => batch2Ids.has(r.id));
    const batch1Row = rows.find((r) => !batch2Ids.has(r.id))!;
    expect(new Set(batch2Rows.map((r) => r.batchId)).size).toBe(1);
    expect(batch2Rows[0]!.batchId).not.toBeNull();
    expect(batch1Row.batchId).not.toBeNull();
    expect(batch1Row.batchId).not.toBe(batch2Rows[0]!.batchId);

    // Timeline + trace carry the per-run cost.
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    for (const r of runs) {
      expect(r.cost_usd).toBe(rows.find((row) => row.id === r.run_id)!.costUsd);
    }
    const trace = (await app.inject({ method: 'GET', url: `/runs/${batch1Row.id}/trace` })).json();
    expect(trace.stats.cost_usd).toBe(batch1Row.costUsd);

    // PR list: only the latest batch (2 runs) is summed.
    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr.id);
    const batch2Cost = batch2Rows.reduce((sum, r) => sum + r.costUsd!, 0);
    expect(listed.cost_usd).toBeCloseTo(batch2Cost, 10);

    // PR list: the whole latest ROUND is summed, not just its newest review — each
    // run in batch 2 keeps one grounded CRITICAL, and batch 1's is excluded.
    expect(batch2Rows.length).toBeGreaterThan(1);
    expect(listed.findings_by_severity).toEqual({
      CRITICAL: batch2Rows.length,
      WARNING: 0,
      SUGGESTION: 0,
    });
    // SCORE is the worst of the round (every agent scores 65 on this fixture).
    expect(listed.score).toBe(65);

    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
