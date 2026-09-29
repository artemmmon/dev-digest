/** The application service against the fake API: no MCP SDK, no network, no real timers of note. */
import { describe, expect, it } from 'vitest';
import { ApiError } from './api/errors.js';
import { NextStepError } from './errors.js';
import { DevDigestService, type ServiceOptions } from './service.js';
import {
  AGENT2_ID,
  AGENT_ID,
  FakeApi,
  RUN_ID,
  agent,
  finding,
  review,
  run,
} from './test-support/fake-api.js';

const CONFIG = { apiUrl: 'http://localhost:3001', maxWaitS: 90 };
const OLD_RUN = '00000000-0000-4000-8000-0000000000aa';

const make = (api: FakeApi, config = CONFIG, options: ServiceOptions = { pollMs: 1 }) =>
  new DevDigestService(api, config, options);

const target = { repo: 'acme/api', pr: 7, agent: 'Security Reviewer' };
const read = { ...target, limit: 15, detail: 'concise' as const };

async function failureOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof NextStepError) return err.message;
    throw err;
  }
  throw new Error('expected a NextStepError');
}

describe('listAgents', () => {
  it('hides disabled agents, clips descriptions and leaves out the system prompt', async () => {
    const api = new FakeApi();
    api.agents = [agent({ description: 'd'.repeat(400) }), agent({ id: AGENT2_ID, name: 'Off', enabled: false })];
    const res = await make(api).listAgents({ includeDisabled: false });
    expect(res.total).toBe(1);
    expect(res.agents[0]!.description).toHaveLength(160);
    expect(res.agents[0]).not.toHaveProperty('system_prompt');
    expect((await make(api).listAgents({ includeDisabled: true })).total).toBe(2);
  });

  it('no agents: empty list plus a next step, not an error', async () => {
    const api = new FakeApi();
    api.agents = [];
    const res = await make(api).listAgents({ includeDisabled: false });
    expect(res.agents).toEqual([]);
    expect(res.next_step).toBe('No reviewer agents configured; create one on the DevDigest Agents page.');
  });

  it('only disabled agents: says how to see them', async () => {
    const api = new FakeApi();
    api.agents = [agent({ enabled: false })];
    expect((await make(api).listAgents({ includeDisabled: false })).next_step).toContain('include_disabled true');
  });

  it('passes an ApiError through for the edge to map', async () => {
    const api = new FakeApi();
    api.failures.set('listAgents', new ApiError('unreachable'));
    await expect(make(api).listAgents({ includeDisabled: false })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('runAgentOnPr', () => {
  it('refreshes the PR, starts a review, waits, and returns verdict, counts and sorted findings', async () => {
    const api = new FakeApi();
    api.reviewsList = [
      review({
        findings: [
          finding({ id: 'w', severity: 'WARNING' }),
          finding({ id: 'c', severity: 'CRITICAL', file: 'src/b.ts' }),
          finding({ id: 'x', severity: 'SUGGESTION', dismissed_at: '2026-09-29T00:00:00Z' }),
        ],
      }),
    ];
    const r = await make(api).runAgentOnPr(target);
    expect(r).toMatchObject({
      status: 'done',
      run_id: RUN_ID,
      repo: 'acme/api',
      pr: 7,
      agent_id: AGENT_ID,
      verdict: 'request_changes',
      score: 62,
      counts: { critical: 1, warning: 1, suggestion: 0 },
      total: 2,
      truncated: false,
      next_step: null,
    });
    expect(r.findings.map((f) => f.id)).toEqual(['c', 'w']);
    expect(api.calls.indexOf('refreshPull')).toBeLessThan(api.calls.findIndex((c) => c.startsWith('startReview')));
  });

  it('accepts the agent id and a case-insensitive repo', async () => {
    const r = await make(new FakeApi()).runAgentOnPr({ repo: 'ACME/API', pr: 7, agent: AGENT_ID });
    expect(r.status).toBe('done');
  });

  it('attaches to a run already in flight for the same agent (no second start)', async () => {
    const api = new FakeApi();
    api.active = [{ run_id: OLD_RUN, agent_id: AGENT_ID, agent_name: 'Security Reviewer' }];
    api.runsSequence = [[run({ run_id: OLD_RUN })]];
    api.reviewsList = [review({ run_id: OLD_RUN })];
    const r = await make(api).runAgentOnPr(target);
    expect(r.run_id).toBe(OLD_RUN);
    expect(api.count('startReview')).toBe(0);
  });

  it('a run of another agent in flight does not block this one', async () => {
    const api = new FakeApi();
    api.active = [{ run_id: OLD_RUN, agent_id: AGENT2_ID, agent_name: 'Other' }];
    await make(api).runAgentOnPr(target);
    expect(api.count('startReview')).toBe(1);
  });

  it('syncs the PR list once when the PR is unknown locally', async () => {
    const api = new FakeApi();
    api.pulls = [];
    api.remotePulls = [{ id: '00000000-0000-4000-8000-000000000009', number: 7, title: 'x' }];
    const r = await make(api).runAgentOnPr(target);
    expect(r.status).toBe('done');
    expect(api.count('syncPulls')).toBe(1);
  });

  it('timeout is not an error: status running with the configured limit in next_step', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const r = await make(api, { ...CONFIG, maxWaitS: 0 }).runAgentOnPr(target);
    expect(r).toMatchObject({
      status: 'running',
      run_id: RUN_ID,
      next_step: 'Still running after 0s; call get_findings with the same repo, pr and agent in about a minute.',
    });
  });

  it('failed run throws a NextStepError with the clipped server error', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'failed', error: `bad key ${'x'.repeat(500)}\u001b[31m` })]];
    const text = await failureOf(make(api).runAgentOnPr(target));
    expect(text).toContain(`Review run ${RUN_ID} failed: bad key`);
    expect(text).toContain("Check the agent's provider key in DevDigest Settings, then call run_agent_on_pr again.");
    expect(text.includes('\u001b')).toBe(false);
    expect(text.length).toBeLessThan(400);
  });

  it('cancelled run: a non-error result telling how to rerun', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'cancelled' })]];
    const r = await make(api).runAgentOnPr(target);
    expect(r.status).toBe('cancelled');
    expect(r.next_step).toContain('call run_agent_on_pr again');
  });

  it('done but the review row is missing: says to read it later', async () => {
    const api = new FakeApi();
    api.reviewsList = [];
    const r = await make(api).runAgentOnPr(target);
    expect(r.status).toBe('done');
    expect(r.next_step).toContain('not stored yet');
  });

  it('reports progress on each poll with the configured total', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })], [run({ status: 'running' })], [run()]];
    const seen: { elapsedS: number; totalS: number }[] = [];
    await make(api).runAgentOnPr(target, { onProgress: (p) => void seen.push(p) });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.totalS).toBe(90);
  });

  it('a client abort mid-wait ends with running, stops polling, and never cancels the run', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const ac = new AbortController();
    const r = await make(api).runAgentOnPr(target, { signal: ac.signal, onProgress: () => ac.abort() });
    expect(r.status).toBe('running');
    const polls = api.count('listRuns');
    await new Promise((res) => setTimeout(res, 20));
    expect(api.count('listRuns')).toBe(polls);
  });

  it('the shutdown signal ends the wait the same way', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const shutdown = new AbortController();
    const r = await make(api, CONFIG, { pollMs: 1, shutdown: shutdown.signal }).runAgentOnPr(target, {
      onProgress: () => shutdown.abort(),
    });
    expect(r.status).toBe('running');
  });

  it('a server-side PR refresh failure does not block the review', async () => {
    const api = new FakeApi();
    api.failures.set('refreshPull', new ApiError('server', 500));
    expect((await make(api).runAgentOnPr(target)).status).toBe('done');
  });

  it('an unreachable API during the refresh is fatal and nothing is started', async () => {
    const api = new FakeApi();
    api.failures.set('refreshPull', new ApiError('unreachable'));
    await expect(make(api).runAgentOnPr(target)).rejects.toBeInstanceOf(ApiError);
    expect(api.count('startReview')).toBe(0);
  });

  it('error rows: unknown repo, PR, agent, ambiguous agent; rate limit passes through', async () => {
    expect(await failureOf(make(new FakeApi()).runAgentOnPr({ ...target, repo: 'acme/nope' }))).toBe(
      'Repo acme/nope is not in DevDigest; add it on the Repos page.',
    );

    const noPr = new FakeApi();
    noPr.pulls = [];
    expect(await failureOf(make(noPr).runAgentOnPr(target))).toBe('PR #7 not found in acme/api on GitHub.');
    expect(noPr.count('startReview')).toBe(0);

    expect(await failureOf(make(new FakeApi()).runAgentOnPr({ ...target, agent: 'Nobody' }))).toBe(
      "Agent 'Nobody' not found; call list_agents for valid ids.",
    );

    const amb = new FakeApi();
    amb.agents = [agent(), agent({ id: AGENT2_ID, name: 'security reviewer' })];
    expect(await failureOf(make(amb).runAgentOnPr(target))).toBe(
      "'Security Reviewer' matches several agents; pass the id from list_agents.",
    );

    const limited = new FakeApi();
    limited.failures.set('startReview', new ApiError('rate_limited', 429));
    await expect(make(limited).runAgentOnPr(target)).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});

describe('getFindings', () => {
  it('returns the latest finished run; detailed adds rationale; no sync, no start', async () => {
    const api = new FakeApi();
    const svc = make(api);
    const concise = await svc.getFindings(read);
    expect(concise).toMatchObject({ status: 'done', verdict: 'request_changes', total: 1 });
    expect(concise.findings[0]).not.toHaveProperty('rationale');
    const detailed = await svc.getFindings({ ...read, detail: 'detailed' });
    expect(detailed.findings[0]!.rationale).toBe('The value is used without validation.');
    expect(api.count('syncPulls')).toBe(0);
    expect(api.count('startReview')).toBe(0);
  });

  it('honours limit', async () => {
    const api = new FakeApi();
    api.reviewsList = [review({ findings: [finding({ id: 'a' }), finding({ id: 'b', start_line: 11 })] })];
    const r = await make(api).getFindings({ ...read, limit: 1 });
    expect(r).toMatchObject({ total: 2, truncated: true });
    expect(r.findings).toHaveLength(1);
  });

  it('a specific run_id of the agent', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run(), run({ run_id: OLD_RUN })]];
    api.reviewsList = [review(), review({ id: 'rev-old', run_id: OLD_RUN, verdict: 'approve', findings: [] })];
    const r = await make(api).getFindings({ ...read, runId: OLD_RUN });
    expect(r).toMatchObject({ run_id: OLD_RUN, verdict: 'approve', total: 0 });
  });

  it('ignores runs of other agents', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ run_id: OLD_RUN, agent_id: AGENT2_ID }), run()]];
    expect((await make(api).getFindings(read)).run_id).toBe(RUN_ID);
  });

  it('no run yet: a NextStepError pointing at run_agent_on_pr', async () => {
    const api = new FakeApi();
    api.runsSequence = [[]];
    expect(await failureOf(make(api).getFindings(read))).toBe(
      'No review of PR #7 by Security Reviewer yet; call run_agent_on_pr with the same repo, pr and agent.',
    );
  });

  it('run_id that is not this agent/PR: omit run_id', async () => {
    expect(await failureOf(make(new FakeApi()).getFindings({ ...read, runId: OLD_RUN }))).toContain(
      'omit run_id to get the latest run.',
    );
  });

  it('only a running run: non-error, status running', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const r = await make(api).getFindings(read);
    expect(r).toMatchObject({ status: 'running', total: 0 });
    expect(r.next_step).toContain('still in progress');
  });

  it('latest done is returned and a newer running run is mentioned', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ run_id: OLD_RUN, status: 'running' }), run()]];
    const r = await make(api).getFindings(read);
    expect(r).toMatchObject({ status: 'done', run_id: RUN_ID });
    expect(r.next_step).toContain('A newer run is still in progress');
  });

  it('failed latest run is reported with its clipped error; cancelled says how to rerun', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'failed', error: 'quota exceeded' })]];
    const failed = await make(api).getFindings(read);
    expect(failed.status).toBe('failed');
    expect(failed.next_step).toContain('quota exceeded');

    api.runsSequence = [[run({ status: 'cancelled' })]];
    expect((await make(api).getFindings(read)).next_step).toContain('was cancelled');
  });

  it('a done run without a stored review says so', async () => {
    const api = new FakeApi();
    api.reviewsList = [];
    expect((await make(api).getFindings(read)).next_step).toContain('has no stored review');
  });

  it('PR not in the DB: a NextStepError, and it does not sync', async () => {
    const api = new FakeApi();
    api.pulls = [];
    expect(await failureOf(make(api).getFindings(read))).toBe(
      "PR #7 of acme/api is not in DevDigest yet; open the repo's PR list in DevDigest to sync it.",
    );
    expect(api.count('syncPulls')).toBe(0);
  });

  it('caps a huge detailed response at 24,000 characters', async () => {
    const api = new FakeApi();
    api.reviewsList = [
      review({
        findings: Array.from({ length: 50 }, (_, i) =>
          finding({ id: `f${i}`, start_line: i, title: 't'.repeat(200), rationale: 'r'.repeat(900), suggestion: 's'.repeat(900) }),
        ),
      }),
    ];
    const r = await make(api).getFindings({ ...read, limit: 50, detail: 'detailed' });
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(24_000);
    expect(r).toMatchObject({ truncated: true, total: 50 });
  });
});

describe('getConventions', () => {
  const candidates = [
    { id: 'c1', category: 'naming', rule: 'Use kebab-case files', evidence_path: 'src/a.ts', evidence_line: 3, confidence: 0.9, status: 'accepted' as const },
    { id: 'c2', category: 'types', rule: 'Prefer unknown', evidence_path: 'src/b.ts', evidence_line: 8, confidence: 0.7, status: 'pending' as const },
    { id: 'c3', category: 'other', rule: 'Rejected rule', evidence_path: 'src/c.ts', evidence_line: 1, confidence: 0.5, status: 'rejected' as const },
  ];
  const input = { repo: 'acme/api', status: 'accepted' as const, limit: 30 };

  it('returns accepted rules by default with path:line evidence', async () => {
    const api = new FakeApi();
    api.conventionList = { candidates, last_scan: { at: '2026-09-01T00:00:00Z' } };
    const r = await make(api).getConventions(input);
    expect(r).toMatchObject({ repo: 'acme/api', last_scan_at: '2026-09-01T00:00:00Z', total: 1, truncated: false, next_step: null });
    expect(r.conventions[0]).toMatchObject({ id: 'c1', evidence: 'src/a.ts:3', status: 'accepted' });
  });

  it("'pending' and 'all' never include rejected", async () => {
    const api = new FakeApi();
    api.conventionList = { candidates, last_scan: { at: 'x' } };
    const svc = make(api);
    expect((await svc.getConventions({ ...input, status: 'pending' })).total).toBe(1);
    expect((await svc.getConventions({ ...input, status: 'all' })).total).toBe(2);
  });

  it('no scan yet: empty result plus next_step', async () => {
    const r = await make(new FakeApi()).getConventions(input);
    expect(r).toMatchObject({
      conventions: [],
      last_scan_at: null,
      next_step: 'No convention scan yet for acme/api; run one on its Conventions page in DevDigest.',
    });
  });

  it('only pending rules: tells the caller to ask for them', async () => {
    const api = new FakeApi();
    api.conventionList = { candidates: [candidates[1]!], last_scan: { at: 'x' } };
    expect((await make(api).getConventions(input)).next_step).toBe(
      "1 pending conventions await triage; call get_conventions with status 'pending'.",
    );
  });

  it('limit and truncation; unknown repo', async () => {
    const api = new FakeApi();
    api.conventionList = { candidates: [candidates[0]!, { ...candidates[0]!, id: 'c9' }], last_scan: { at: 'x' } };
    const limited = await make(api).getConventions({ ...input, limit: 1 });
    expect(limited).toMatchObject({ total: 2, truncated: true });
    expect(await failureOf(make(api).getConventions({ ...input, repo: 'acme/nope' }))).toBe(
      'Repo acme/nope is not in DevDigest; add it on the Repos page.',
    );
  });
});
