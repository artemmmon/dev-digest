import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvalCaseSave } from '@devdigest/shared';
import { AppError, ConfigError } from '../src/platform/errors.js';
import { EvalService } from '../src/modules/eval/service.js';
import { MAX_CASES_PER_AGENT } from '../src/modules/eval/constants.js';
import type { EvalSkill } from '../src/modules/eval/ports.js';
import {
  AGENT_ID,
  WS,
  cannedLlm,
  createMemoryEvalStore,
  diffFor,
  evalAgent,
  expectation,
  fakeAgents,
  fakeFindings,
  finding,
  llmFor,
  type CannedLlm,
} from './helpers/eval.js';

/**
 * SPEC-13 EvalService against in-memory ports (no database, no network, no key). Fire-and-forget
 * runs are awaited through the store's `ended()` promise, never a sleep.
 */

const FINDING_ID = '3f2b8c0e-5f0e-4b7a-9d0a-0c2a8f6f1b11';
const OTHER_WS = 'ws-other';

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

function body(over: Partial<EvalCaseSave> = {}): EvalCaseSave {
  return {
    name: 'must-find-sql-injection',
    input_diff: diffFor('src/db.ts'),
    input_meta: { pr_title: 'Posted title', pr_body: 'Posted body' },
    expected_output: expectation('must_find', 'src/db.ts', 10, 12),
    ...over,
  };
}

function setup(
  opts: {
    llm?: CannedLlm;
    skills?: EvalSkill[];
    findings?: Parameters<typeof fakeFindings>[0];
    llmFn?: ReturnType<typeof llmFor>;
  } = {},
) {
  const store = createMemoryEvalStore();
  const agents = fakeAgents(evalAgent(), opts.skills ?? []);
  const llm = opts.llm ?? cannedLlm();
  const service = new EvalService({
    store,
    agents,
    findings: fakeFindings(opts.findings ?? [{ id: FINDING_ID, agentId: AGENT_ID }]),
    llm: opts.llmFn ?? llmFor(llm),
  });
  return { store, agents, llm, service };
}

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(status);
  if (code) expect((err as AppError).code).toBe(code);
  return err as AppError;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EvalService.createCase', () => {
  it('AC-7: a seeded save stores the source finding id and the POSTED diff, PR meta, name and expectation', async () => {
    const { service, store } = setup();
    const posted = body({ source_finding_id: FINDING_ID });

    const created = await service.createCase(WS, AGENT_ID, posted);

    expect(created).toMatchObject({
      source_finding_id: FINDING_ID,
      name: 'must-find-sql-injection',
      input_diff: posted.input_diff,
      input_meta: { pr_title: 'Posted title', pr_body: 'Posted body' },
      expected_output: { type: 'must_find', file: 'src/db.ts', start_line: 10, end_line: 12 },
      owner_kind: 'agent',
      owner_id: AGENT_ID,
    });
    expect(store.cases).toHaveLength(1);
  });

  it('AC-10, EC-4: a second case from the same finding is rejected with 409 and stores nothing', async () => {
    const { service, store } = setup();
    await service.createCase(WS, AGENT_ID, body({ source_finding_id: FINDING_ID }));

    const err = await expectAppError(
      service.createCase(WS, AGENT_ID, body({ source_finding_id: FINDING_ID, name: 'second' })),
      409,
      'eval_case_exists',
    );
    expect(err.message).toMatch(/already exists/i);
    expect(store.cases).toHaveLength(1);
  });

  it('AC-12: the 51st case of an agent is rejected with a message stating the limit of 50', async () => {
    const { service, store } = setup();
    for (let i = 0; i < MAX_CASES_PER_AGENT; i++) {
      store.seedCase({ inputDiff: diffFor('src/db.ts'), expected: expectation('must_find', 'src/db.ts') });
    }

    const err = await expectAppError(service.createCase(WS, AGENT_ID, body()), 422, 'eval_case_limit');
    expect(err.message).toContain('50');
    expect(store.cases).toHaveLength(MAX_CASES_PER_AGENT);
  });

  it('AC-11: a range that intersects no hunk is a 422 naming the expectation field', async () => {
    const { service, store } = setup();
    const err = await expectAppError(
      service.createCase(
        WS,
        AGENT_ID,
        body({ expected_output: expectation('must_find', 'src/db.ts', 400, 410) }),
      ),
      422,
    );
    expect(err.details).toEqual([expect.objectContaining({ path: ['expected_output', 'start_line'] })]);
    expect(store.cases).toHaveLength(0);
  });

  it('AC-63, EC-20: a seeded save on an excluded file is a 422 with the fixed message and stores nothing', async () => {
    const { service, store } = setup();
    const err = await expectAppError(
      service.createCase(
        WS,
        AGENT_ID,
        body({
          source_finding_id: FINDING_ID,
          input_diff: diffFor('package-lock.json'),
          expected_output: expectation('must_find', 'package-lock.json', 10, 12),
        }),
      ),
      422,
    );
    expect(err.message).toBe('This file is excluded from review and can never pass preparation');
    expect(store.cases).toHaveLength(0);
  });

  it('AC-64, EC-20: a hand-written save on an excluded file gets the same 422', async () => {
    const { service } = setup();
    const err = await expectAppError(
      service.createCase(
        WS,
        AGENT_ID,
        body({
          input_diff: diffFor('yarn.lock'),
          expected_output: expectation('must_not_flag', 'yarn.lock', 10, 12),
        }),
      ),
      422,
    );
    expect(err.message).toBe('This file is excluded from review and can never pass preparation');
  });

  it('NFR-4: a finding of another workspace answers 404 and a finding of another agent 422', async () => {
    const { service, store } = setup({
      findings: [
        { id: FINDING_ID, agentId: AGENT_ID, workspaceId: OTHER_WS },
        { id: '8a1d0e2f-3c4b-4d5e-8f60-71829304a5b6', agentId: 'agent-other' },
      ],
    });
    await expectAppError(
      service.createCase(WS, AGENT_ID, body({ source_finding_id: FINDING_ID })),
      404,
    );
    await expectAppError(
      service.createCase(
        WS,
        AGENT_ID,
        body({ source_finding_id: '8a1d0e2f-3c4b-4d5e-8f60-71829304a5b6' }),
      ),
      422,
      'finding_agent_mismatch',
    );
    expect(store.cases).toHaveLength(0);
  });
});

describe('EvalService.updateCase and deleteCase (stretch a)', () => {
  it('AC-54: an edit stores the new values under the same id and keeps the source finding id', async () => {
    const { service, store } = setup();
    const created = await service.createCase(WS, AGENT_ID, body({ source_finding_id: FINDING_ID }));

    const updated = await service.updateCase(
      WS,
      created.id,
      body({
        name: 'renamed',
        input_meta: { pr_title: 'New title', pr_body: '' },
        expected_output: expectation('must_not_flag', 'src/db.ts', 11, 11),
        // a different finding in the body must be ignored: a case never changes finding
        source_finding_id: '8a1d0e2f-3c4b-4d5e-8f60-71829304a5b6',
      }),
    );

    expect(updated).toMatchObject({
      id: created.id,
      source_finding_id: FINDING_ID,
      name: 'renamed',
      expected_output: { type: 'must_not_flag', start_line: 11 },
    });
    expect(store.cases).toHaveLength(1);
  });

  it('AC-64: an edit that moves the expectation onto an excluded file is a 422', async () => {
    const { service } = setup();
    const created = await service.createCase(WS, AGENT_ID, body());
    await expectAppError(
      service.updateCase(
        WS,
        created.id,
        body({
          input_diff: diffFor('yarn.lock'),
          expected_output: expectation('must_find', 'yarn.lock', 10, 12),
        }),
      ),
      422,
    );
  });

  it('AC-57: a delete while a run of the agent runs is a 409 and the case stays', async () => {
    const { service, store } = setup();
    const c = store.seedCase({ inputDiff: diffFor('src/db.ts'), expected: expectation('must_find', 'src/db.ts') });
    store.seedRun({ status: 'running', startedAt: '2026-10-15T10:00:00.000Z', caseIds: [c.id] });

    await expectAppError(service.deleteCase(WS, c.id), 409, 'eval_run_in_progress');
    expect(store.cases).toHaveLength(1);
  });

  it('AC-56: a delete with no run in progress removes the case and leaves past run metrics unchanged', async () => {
    const { service, store } = setup();
    const c = store.seedCase({ inputDiff: diffFor('src/db.ts'), expected: expectation('must_find', 'src/db.ts') });
    const run = store.seedRun({
      status: 'done',
      startedAt: '2026-10-15T10:00:00.000Z',
      caseIds: [c.id],
      metrics: { recall: 0.5, precision: 0.75, citation_accuracy: 1 },
    });

    await service.deleteCase(WS, c.id);

    expect(store.cases).toHaveLength(0);
    const [after] = await store.getRuns(WS, [run.id]);
    expect(after).toMatchObject({ recall: 0.5, precision: 0.75, citation_accuracy: 1 });
  });

  it('NFR-4: editing or deleting a case of another workspace answers 404', async () => {
    const { service, store } = setup();
    const c = store.seedCase({
      workspaceId: OTHER_WS,
      inputDiff: diffFor('src/db.ts'),
      expected: expectation('must_find', 'src/db.ts'),
    });
    await expectAppError(service.updateCase(WS, c.id, body()), 404);
    await expectAppError(service.deleteCase(WS, c.id), 404);
    expect(store.cases).toHaveLength(1);
  });
});

describe('EvalService.startRun', () => {
  const seedOne = (store: ReturnType<typeof createMemoryEvalStore>, file = 'src/db.ts') =>
    store.seedCase({ inputDiff: diffFor(file), expected: expectation('must_find', file, 10, 12) });

  it('AC-25: an agent with no case is rejected with 422 and no run is created', async () => {
    const { service, store } = setup();
    await expectAppError(service.startRun(WS, AGENT_ID), 422, 'eval_no_cases');
    expect(store.runs).toHaveLength(0);
  });

  it('AC-24: a provider with no key is a 422 naming the provider, before any run row exists', async () => {
    const { service, store } = setup({
      llmFn: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not set');
      },
    });
    seedOne(store);

    const err = await expectAppError(service.startRun(WS, AGENT_ID), 422, 'provider_not_configured');
    expect(err.message).toContain('OpenRouter');
    expect(err.message).not.toContain('OPENROUTER_API_KEY');
    expect(store.runs).toHaveLength(0);
    expect(store.claims).toHaveLength(0);
  });

  it('AC-18: the start answers with the run id and `running` before any case completes', async () => {
    const gate = deferred();
    const { service, store, llm } = setup({ llm: cannedLlm({ gate: gate.promise }) });
    seedOne(store);

    const started = await service.startRun(WS, AGENT_ID);

    expect(started).toEqual({ run_id: expect.any(String), status: 'running' });
    expect(store.results).toHaveLength(0);
    expect(store.runs[0]!.summary).toMatchObject({ id: started.run_id, status: 'running', cases_total: 1 });
    gate.release();
    expect(await store.ended(started.run_id)).toBe('done');
    expect(llm.requests).toHaveLength(1);
  });

  it('AC-23, EC-9: a start while a run of the same agent is running is a 409; a later start is accepted', async () => {
    const gate = deferred();
    const { service, store } = setup({ llm: cannedLlm({ gate: gate.promise }) });
    seedOne(store);
    const first = await service.startRun(WS, AGENT_ID);

    await expectAppError(service.startRun(WS, AGENT_ID), 409, 'eval_run_in_progress');
    expect(store.runs).toHaveLength(1);

    gate.release();
    await store.ended(first.run_id);
    const second = await service.startRun(WS, AGENT_ID);
    expect(second.run_id).not.toBe(first.run_id);
    await store.ended(second.run_id);
  });

  it('AC-19: the run stores the agent version, the versions of the skills it applies and the case ids', async () => {
    const skills: EvalSkill[] = [
      { id: 's-dart', name: 'Dart rules', body: 'D', appliesTo: ['*.dart'], version: 2 },
      { id: 's-ts', name: 'TS rules', body: 'T', appliesTo: ['src/**'], version: 5 },
      { id: 's-all', name: 'Always', body: 'A', appliesTo: null, version: 1 },
    ];
    const { service, store } = setup({ skills });
    const a = seedOne(store, 'src/a.ts');
    const b = seedOne(store, 'src/b.ts');

    const started = await service.startRun(WS, AGENT_ID);
    await store.ended(started.run_id);

    expect(store.claims[0]).toMatchObject({
      agentId: AGENT_ID,
      agentVersion: 3,
      caseIds: [a.id, b.id],
      skillVersions: [
        { skill_id: 's-ts', name: 'TS rules', version: 5 },
        { skill_id: 's-all', name: 'Always', version: 1 },
      ],
    });
  });

  it('EC-7, AC-19: a skill body edit that bumps only the skill version is recorded by the next run', async () => {
    const skill: EvalSkill = { id: 's-ts', name: 'TS rules', body: 'T', appliesTo: null, version: 5 };
    const { service, store, agents } = setup({ skills: [skill] });
    seedOne(store);

    const first = await service.startRun(WS, AGENT_ID);
    await store.ended(first.run_id);
    agents.skills = [{ ...skill, body: 'T edited', version: 6 }];
    const second = await service.startRun(WS, AGENT_ID);
    await store.ended(second.run_id);

    expect(store.claims.map((c) => [c.agentVersion, c.skillVersions[0]!.version])).toEqual([
      [3, 5],
      [3, 6],
    ]);
  });

  it('EC-6: an agent edit while the run is running changes nothing; the run keeps the captured version and prompt', async () => {
    const gate = deferred();
    const { service, store, agents, llm } = setup({ llm: cannedLlm({ gate: gate.promise }) });
    seedOne(store, 'src/a.ts');
    seedOne(store, 'src/b.ts');

    const started = await service.startRun(WS, AGENT_ID);
    const readsAtStart = { ...agents.reads };
    const live = agents.agents.get(AGENT_ID)!;
    live.systemPrompt = 'EDITED PROMPT';
    live.version = 4;
    gate.release();
    await store.ended(started.run_id);

    expect(store.runs[0]!.summary.agent_version).toBe(3);
    expect(llm.requests).toHaveLength(2);
    for (const req of llm.requests) {
      expect(req.messages[0]!.content.startsWith('You review code.')).toBe(true);
      expect(req.messages[0]!.content).not.toContain('EDITED PROMPT');
    }
    expect(agents.reads).toEqual(readsAtStart); // the agent is never re-read mid-run
  });

  it('EC-8: a case created while the run is running is not part of it and shows `never run`', async () => {
    const gate = deferred();
    const { service, store, llm } = setup({ llm: cannedLlm({ gate: gate.promise }) });
    const original = seedOne(store, 'src/a.ts');
    const started = await service.startRun(WS, AGENT_ID);

    const added = await service.createCase(WS, AGENT_ID, body());
    gate.release();
    await store.ended(started.run_id);

    expect(store.results.map((r) => r.result.case_id)).toEqual([original.id]);
    expect(store.claims[0]!.caseIds).toEqual([original.id]);
    expect(llm.requests).toHaveLength(1);
    const { cases } = await service.listCases(WS, AGENT_ID);
    expect(cases.find((c) => c.id === added.id)!.latest.status).toBe('never_run');
    expect(cases.find((c) => c.id === original.id)!.latest.status).not.toBe('never_run');
  });

  it('EC-17: an agent disabled for pull-request reviews still starts an eval run', async () => {
    const { service, store, agents } = setup();
    seedOne(store);
    agents.agents.set(AGENT_ID, { ...agents.agents.get(AGENT_ID)!, enabled: false } as never);

    const started = await service.startRun(WS, AGENT_ID);
    expect(await store.ended(started.run_id)).toBe('done');
  });

  it('NFR-4: every agent-scoped call for an agent of another workspace answers 404', async () => {
    const { service, store } = setup();
    seedOne(store);
    await expectAppError(service.listCases(OTHER_WS, AGENT_ID), 404);
    await expectAppError(service.createCase(OTHER_WS, AGENT_ID, body()), 404);
    await expectAppError(service.startRun(OTHER_WS, AGENT_ID), 404);
    await expectAppError(service.listRuns(OTHER_WS, AGENT_ID), 404);
    await expectAppError(service.trend(OTHER_WS, AGENT_ID), 404);
    expect(store.runs).toHaveLength(0);
  });
});

describe('EvalService.listRuns and AC-66', () => {
  function seedHistory(store: ReturnType<typeof createMemoryEvalStore>) {
    const at = (h: number) => `2026-10-1${h}T10:00:00.000Z`;
    return {
      done: store.seedRun({ status: 'done', startedAt: at(1), metrics: { recall: 0.5 } }),
      partial: store.seedRun({ status: 'partial', startedAt: at(2), metrics: { recall: 0.8 } }),
      failed: store.seedRun({ status: 'failed', startedAt: at(3) }),
      running: store.seedRun({ status: 'running', startedAt: at(4) }),
    };
  }

  it('AC-66: the counted pair skips running and failed runs even when they are the newest', async () => {
    const { service, store } = setup();
    const runs = seedHistory(store);

    const overview = await service.listRuns(WS, AGENT_ID);

    expect(overview.runs.map((r) => r.status)).toEqual(['running', 'failed', 'partial', 'done']);
    expect(overview.latest_counted?.id).toBe(runs.partial.id);
    expect(overview.previous_counted?.id).toBe(runs.done.id);
  });

  it('AC-66: a set of failed and running runs only has no counted run', async () => {
    const { service, store } = setup();
    store.seedRun({ status: 'failed', startedAt: '2026-10-11T10:00:00.000Z' });
    store.seedRun({ status: 'running', startedAt: '2026-10-12T10:00:00.000Z' });
    const overview = await service.listRuns(WS, AGENT_ID);
    expect(overview.latest_counted).toBeNull();
    expect(overview.previous_counted).toBeNull();
  });

  it('AC-38, AC-44: the list is 10 runs by default and at most 50 whatever the caller asks', async () => {
    const { service, store } = setup();
    const spy = vi.spyOn(store, 'listRuns');
    await service.listRuns(WS, AGENT_ID);
    await service.listRuns(WS, AGENT_ID, 500);
    await service.listRuns(WS, AGENT_ID, 0);
    expect(spy.mock.calls.map((c) => c[2])).toEqual([10, 50, 1]);
  });

  it('AC-58, AC-66: the trend lists counted runs only, oldest first', async () => {
    const { service, store } = setup();
    const runs = seedHistory(store);
    const { points } = await service.trend(WS, AGENT_ID);
    expect(points.map((p) => p.run_id)).toEqual([runs.done.id, runs.partial.id]);
    expect(points[1]).toMatchObject({ recall: 0.8, agent_version: 1 });
  });
});

describe('EvalService.dashboard', () => {
  it('AC-42, AC-66: every agent of the workspace with its latest counted run, or null', async () => {
    const { service, store, agents } = setup();
    agents.agents.set('agent-2', { ...evalAgent({ id: 'agent-2', name: 'Style' }), workspaceId: WS });
    agents.agents.set('agent-3', { ...evalAgent({ id: 'agent-3', name: 'Other ws' }), workspaceId: OTHER_WS });
    const counted = store.seedRun({ status: 'done', startedAt: '2026-10-11T10:00:00.000Z' });
    store.seedRun({ status: 'running', startedAt: '2026-10-12T10:00:00.000Z' }); // newer, not counted

    const dash = await service.dashboard(WS);

    expect(dash.agents).toEqual([
      { agent_id: AGENT_ID, name: 'Security', latest: expect.objectContaining({ id: counted.id }) },
      { agent_id: 'agent-2', name: 'Style', latest: null },
    ]);
  });

  it('AC-43, AC-66: the 6 newest counted runs across agents, newest first, with the agent name', async () => {
    const { service, store, agents } = setup();
    agents.agents.set('agent-2', { ...evalAgent({ id: 'agent-2', name: 'Style' }), workspaceId: WS });
    for (let day = 1; day <= 8; day++) {
      store.seedRun({
        agentId: day % 2 ? AGENT_ID : 'agent-2',
        status: 'done',
        startedAt: `2026-10-0${day}T10:00:00.000Z`,
      });
    }
    store.seedRun({ status: 'failed', startedAt: '2026-10-09T10:00:00.000Z' });
    store.seedRun({ status: 'running', startedAt: '2026-10-10T10:00:00.000Z' });

    const { recent_runs } = await service.dashboard(WS);

    expect(recent_runs).toHaveLength(6);
    expect(recent_runs.map((r) => r.started_at.slice(0, 10))).toEqual([
      '2026-10-08',
      '2026-10-07',
      '2026-10-06',
      '2026-10-05',
      '2026-10-04',
      '2026-10-03',
    ]);
    expect(recent_runs[0]!.agent_name).toBe('Style');
    expect(recent_runs[1]!.agent_name).toBe('Security');
  });
});

describe('EvalService.compare', () => {
  function seedPair() {
    const ctx = setup();
    const { store, agents } = ctx;
    agents.versions.set(`${AGENT_ID}:1`, { system_prompt: 'Be strict about SQL.', model: 'model-a' });
    agents.versions.set(`${AGENT_ID}:2`, { system_prompt: 'Be strict about SQL and XSS.', model: 'model-b' });
    for (const [id, name] of [
      ['c1', 'alpha'],
      ['c2', 'beta'],
      ['c4', 'delta'],
    ] as const) {
      store.seedCase({ id, name, inputDiff: diffFor('src/db.ts'), expected: expectation('must_find', 'src/db.ts') });
    }
    const res = (case_id: string, status: 'pass' | 'fail') => ({
      case_id,
      status,
      expected_count: 1,
      matched_count: status === 'pass' ? 1 : 0,
      kept: 1,
      dropped: 0,
      findings: [],
      duration_ms: 1,
      cost_usd: 0.1,
    });
    const older = store.seedRun({
      id: 'run-old',
      status: 'done',
      startedAt: '2026-10-10T10:00:00.000Z',
      agentVersion: 1,
      caseIds: ['c1', 'c2', 'c3'],
      metrics: { recall: 0.5 },
      results: [res('c1', 'pass'), res('c2', 'fail'), res('c3', 'pass')],
    });
    const newer = store.seedRun({
      id: 'run-new',
      status: 'partial',
      startedAt: '2026-10-12T10:00:00.000Z',
      agentVersion: 2,
      caseIds: ['c1', 'c2', 'c4'],
      metrics: { recall: 0.75 },
      results: [res('c1', 'fail'), res('c2', 'pass'), res('c4', 'pass')],
    });
    return { ...ctx, older, newer };
  }

  it('AC-46, AC-48: older and newer by start time whatever the argument order, with prompt and model of each version', async () => {
    const { service } = seedPair();
    const cmp = await service.compare(WS, 'run-new', 'run-old');

    expect(cmp.older.run.id).toBe('run-old');
    expect(cmp.newer.run.id).toBe('run-new');
    expect(cmp.older).toMatchObject({ system_prompt: 'Be strict about SQL.', model: 'model-a' });
    expect(cmp.newer).toMatchObject({ system_prompt: 'Be strict about SQL and XSS.', model: 'model-b' });
    expect(cmp.older.run.agent_version).toBe(1);
    expect(cmp.newer.run.agent_version).toBe(2);
  });

  it('AC-49: lists the cases present in both runs whose outcome changed between pass and fail, with direction', async () => {
    const { service } = seedPair();
    const cmp = await service.compare(WS, 'run-old', 'run-new');
    expect(cmp.flipped).toEqual([
      { case_id: 'c1', name: 'alpha', from: 'pass', to: 'fail' },
      { case_id: 'c2', name: 'beta', from: 'fail', to: 'pass' },
    ]);
  });

  it('AC-50: different case sets are flagged with the counts only in the older and only in the newer run', async () => {
    const { service } = seedPair();
    const cmp = await service.compare(WS, 'run-old', 'run-new');
    expect(cmp).toMatchObject({ case_sets_differ: true, only_in_older: 1, only_in_newer: 1 });
  });

  it('AC-50: identical case sets are not flagged', async () => {
    const { service, store } = seedPair();
    store.runs.find((r) => r.summary.id === 'run-new')!.caseIds = ['c1', 'c2', 'c3'];
    const cmp = await service.compare(WS, 'run-old', 'run-new');
    expect(cmp).toMatchObject({ case_sets_differ: false, only_in_older: 0, only_in_newer: 0 });
  });

  it('EC-19, AC-56: a case deleted after both runs no longer appears among flipped cases; run metrics stay', async () => {
    const { service, store } = seedPair();
    await service.deleteCase(WS, 'c1');

    const cmp = await service.compare(WS, 'run-old', 'run-new');

    expect(cmp.flipped.map((f) => f.case_id)).toEqual(['c2']);
    expect(store.runs.find((r) => r.summary.id === 'run-old')!.summary.recall).toBe(0.5);
    expect(cmp.newer.run.recall).toBe(0.75);
  });

  it('EC-11, AC-45: a failed or running run cannot be compared (422)', async () => {
    const { service, store } = seedPair();
    store.seedRun({ id: 'run-failed', status: 'failed', startedAt: '2026-10-13T10:00:00.000Z' });
    store.seedRun({ id: 'run-running', status: 'running', startedAt: '2026-10-14T10:00:00.000Z' });
    await expectAppError(service.compare(WS, 'run-old', 'run-failed'), 422, 'eval_run_not_counted');
    await expectAppError(service.compare(WS, 'run-running', 'run-new'), 422, 'eval_run_not_counted');
  });

  it('AC-45: the same run twice, runs of different agents and unknown runs are rejected', async () => {
    const { service, store, agents } = seedPair();
    agents.agents.set('agent-2', { ...evalAgent({ id: 'agent-2' }), workspaceId: WS });
    store.seedRun({ id: 'run-other', agentId: 'agent-2', status: 'done', startedAt: '2026-10-13T10:00:00.000Z' });
    await expectAppError(service.compare(WS, 'run-old', 'run-old'), 422);
    await expectAppError(service.compare(WS, 'run-old', 'run-other'), 422, 'eval_runs_of_different_agents');
    await expectAppError(service.compare(WS, 'run-old', 'nope'), 404);
  });

  it('NFR-4: a run of another workspace answers 404', async () => {
    const { service } = seedPair();
    await expectAppError(service.compare(OTHER_WS, 'run-old', 'run-new'), 404);
  });
});

describe('EvalService.reapInterrupted — AC-28, EC-18', () => {
  it('AC-28: every run still running becomes failed and is no longer a running run', async () => {
    const { service, store } = setup();
    store.seedRun({ id: 'r1', status: 'running', startedAt: '2026-10-11T10:00:00.000Z' });
    store.seedRun({ id: 'r2', status: 'done', startedAt: '2026-10-12T10:00:00.000Z' });

    expect(await service.reapInterrupted()).toBe(1);

    expect(store.runs.map((r) => [r.summary.id, r.summary.status])).toEqual([
      ['r1', 'failed'],
      ['r2', 'done'],
    ]);
  });
});

describe('metrics end to end — AC-31, AC-32, AC-33, AC-35, AC-36 over a run', () => {
  it('AC-31, AC-32, AC-33, AC-35, AC-36: a run over four cases stores the hand-computed run metrics', async () => {
    const llm = cannedLlm({
      answers: {
        'src/a.ts': [finding('f1', 'src/a.ts', 11)], // TP
        'src/b.ts': [finding('f2', 'src/b.ts', 11)], // FP (must_not_flag matched)
        'src/c.ts': [finding('f3', 'src/c.ts', 40), finding('f4', 'src/c.ts', 11)], // line 40 dropped; 11 TP
        'src/d.ts': [], // must_find missed
      },
    });
    const { service, store } = setup({ llm });
    store.seedCase({ inputDiff: diffFor('src/a.ts'), expected: expectation('must_find', 'src/a.ts') });
    store.seedCase({ inputDiff: diffFor('src/b.ts'), expected: expectation('must_not_flag', 'src/b.ts') });
    store.seedCase({ inputDiff: diffFor('src/c.ts'), expected: expectation('must_find', 'src/c.ts') });
    store.seedCase({ inputDiff: diffFor('src/d.ts'), expected: expectation('must_find', 'src/d.ts') });

    const started = await service.startRun(WS, AGENT_ID);
    await store.ended(started.run_id);

    const run = store.runs[0]!.summary;
    expect(run.status).toBe('done');
    expect(run.recall).toBeCloseTo(2 / 3); // a, c passed of a, c, d
    expect(run.precision).toBeCloseTo(2 / 3); // TP 2, FP 1
    expect(run.citation_accuracy).toBeCloseTo(3 / 4); // 3 kept (a, b, c), 1 dropped
    expect(run.unlabelled_findings).toBe(0);
    expect(run.cost_usd).toBeCloseTo(2); // four cases at 0.5
    expect(run).toMatchObject({ cases_total: 4, cases_completed: 4, cases_errored: 0, cases_passed: 2 });
  });

  it('AC-16, AC-66: a case row shows the outcome of the latest COUNTED run, with expected and matched counts', async () => {
    const { service, store } = setup();
    const c = store.seedCase({ inputDiff: diffFor('src/a.ts'), expected: expectation('must_find', 'src/a.ts') });
    const result = (status: 'pass' | 'fail', matched: number) => ({
      case_id: c.id,
      status,
      expected_count: 1,
      matched_count: matched,
      kept: matched,
      dropped: 0,
      findings: [],
      duration_ms: 1,
      cost_usd: null,
    });
    store.seedRun({
      status: 'done',
      startedAt: '2026-10-10T10:00:00.000Z',
      caseIds: [c.id],
      results: [result('pass', 1)],
    });
    // a newer failed run holding an error for the same case must not set the outcome
    store.seedRun({
      status: 'failed',
      startedAt: '2026-10-12T10:00:00.000Z',
      caseIds: [c.id],
      results: [{ ...result('fail', 0), status: 'error' }],
    });

    const { cases } = await service.listCases(WS, AGENT_ID);

    expect(cases[0]!.latest).toEqual({ status: 'pass', expected_count: 1, matched_count: 1 });
  });
});
