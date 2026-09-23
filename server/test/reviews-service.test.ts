import { describe, it, expect } from 'vitest';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { ReviewDeps } from '../src/modules/reviews/deps.js';
import type {
  FindingRow,
  PullRow,
  ReviewRow,
  ReviewStore,
} from '../src/modules/reviews/ports.js';
import type { AgentRecord, AgentStore } from '../src/modules/agents/types.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * ReviewService against fakes. Only the store methods these tests reach are
 * implemented (the rest throw), so a test that strays into an unmocked call fails loudly.
 */

function agent(o: Partial<AgentRecord>): AgentRecord {
  return {
    id: 'a1',
    workspaceId: 'ws',
    name: 'Security',
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 's',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: true,
    appliesTo: null,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
    ...o,
  };
}

function fakeAgents(list: AgentRecord[]): AgentStore {
  const byId = new Map(list.map((a) => [a.id, a]));
  return {
    listEnabled: async () => list.filter((a) => a.enabled),
    getById: async (ws: string, id: string) => {
      const a = byId.get(id);
      return a && a.workspaceId === ws ? a : undefined;
    },
    namesByIds: async (_ws: string, ids: string[]) =>
      new Map(ids.flatMap((id) => (byId.has(id) ? [[id, byId.get(id)!.name] as const] : []))),
  } as unknown as AgentStore;
}

interface StoreState {
  runs: Map<string, string>; // runId → status (in workspace 'ws')
  cancelled: string[];
  reviews: { review: ReviewRow; findings: FindingRow[]; batchId: string | null }[];
  prFiles: string[];
}

function fakeStore(state: StoreState): ReviewStore {
  const pull = { id: 'pr1', workspaceId: 'ws' } as PullRow;
  return {
    runStatus: async (ws: string, runId: string) => (ws === 'ws' ? state.runs.get(runId) : undefined),
    cancelRunIfRunning: async (_ws: string, runId: string) => {
      state.cancelled.push(runId);
      return true;
    },
    getPull: async (ws: string, id: string) => (ws === 'ws' && id === 'pr1' ? pull : undefined),
    reviewsForPull: async () => state.reviews,
    getPrFiles: async () => state.prFiles.map((path) => ({ path }) as never),
  } as unknown as ReviewStore;
}

function setup(agents: AgentRecord[] = [agent({})], prFiles: string[] = []) {
  const state: StoreState = { runs: new Map(), cancelled: [], reviews: [], prFiles };
  const bus = new RunBus(1_000);
  const deps: ReviewDeps = {
    reviews: fakeStore(state),
    agents: fakeAgents(agents),
    git: new MockGitClient(),
    llm: async () => new MockLLMProvider('openai'),
    repoIntel: {} as RepoIntel,
    bus,
  };
  return { state, bus, service: new ReviewService(deps) };
}

describe('ReviewService.resolveTargets', () => {
  it('all → every enabled agent', async () => {
    const { service } = setup([agent({ id: 'a1' }), agent({ id: 'a2', enabled: false })]);
    const { targets, skipped } = await service.resolveTargets('ws', 'pr1', { all: true });
    expect(targets.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toEqual([]);
  });

  it('agentId → that agent; unknown or foreign → 404; nothing → 400', async () => {
    const { service } = setup();
    expect((await service.resolveTargets('ws', 'pr1', { agentId: 'a1' })).targets[0]!.id).toBe('a1');
    await expect(service.resolveTargets('ws', 'pr1', { agentId: 'nope' })).rejects.toThrow('Agent not found');
    await expect(service.resolveTargets('other', 'pr1', { agentId: 'a1' })).rejects.toThrow('Agent not found');
    await expect(service.resolveTargets('ws', 'pr1', {})).rejects.toMatchObject({
      code: 'invalid_run_request',
      statusCode: 400,
    });
  });

  it('all → drops an enabled agent whose applies_to matches none of the PR\'s changed files', async () => {
    const { service } = setup(
      [
        agent({ id: 'a1', name: 'General' }),
        agent({ id: 'a2', name: 'Flutter Reviewer', appliesTo: ['*.dart'] }),
      ],
      ['src/config.ts', 'src/app.ts'],
    );
    const { targets, skipped } = await service.resolveTargets('ws', 'pr1', { all: true });
    expect(targets.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toEqual([{ agent_id: 'a2', agent_name: 'Flutter Reviewer' }]);
  });

  it('all → keeps a scoped agent when a changed file matches its applies_to', async () => {
    const { service } = setup(
      [agent({ id: 'a1', name: 'Flutter Reviewer', appliesTo: ['*.dart'] })],
      ['lib/main.dart'],
    );
    const { targets, skipped } = await service.resolveTargets('ws', 'pr1', { all: true });
    expect(targets.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toEqual([]);
  });

  it('all → fails open (runs a scoped agent) when the PR has no pr_files yet', async () => {
    const { service } = setup([agent({ id: 'a1', appliesTo: ['*.dart'] })], []);
    const { targets, skipped } = await service.resolveTargets('ws', 'pr1', { all: true });
    expect(targets.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toEqual([]);
  });

  it('an explicitly chosen agent always runs, even when applies_to matches nothing', async () => {
    const { service } = setup(
      [agent({ id: 'a1', appliesTo: ['*.dart'] })],
      ['src/config.ts'],
    );
    const { targets, skipped } = await service.resolveTargets('ws', 'pr1', { agentId: 'a1' });
    expect(targets.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toEqual([]);
  });
});

describe('ReviewService runs', () => {
  it('cancelRun 404s an unknown run without touching the bus', async () => {
    const { service, bus, state } = setup();
    await expect(service.cancelRun('ws', 'ghost')).rejects.toThrow('Run not found');
    expect(bus.knows('ghost')).toBe(false);
    expect(state.cancelled).toEqual([]);
  });

  it('cancelRun flags the bus, marks the row and completes the stream', async () => {
    const { service, bus, state } = setup();
    state.runs.set('run1', 'running');

    await service.cancelRun('ws', 'run1');

    expect(bus.isCancelled('run1')).toBe(false); // complete() clears the flag
    expect(bus.isComplete('run1')).toBe(true);
    expect(state.cancelled).toEqual(['run1']);
    expect(bus.buffer('run1').map((e) => e.msg)).toEqual(['Cancellation requested — stopping…']);
  });

  it('runStream: 404 for another workspace, live while running, closed once the bus forgot it', async () => {
    const { service, bus, state } = setup();
    state.runs.set('run1', 'running');
    state.runs.set('run2', 'done');

    await expect(service.runStream('other', 'run1')).rejects.toThrow('Run not found');
    expect(await service.runStream('ws', 'run1')).toEqual({ live: true });
    expect(await service.runStream('ws', 'run2')).toEqual({ live: false });

    bus.publish('run2', 'info', 'late');
    expect(await service.runStream('ws', 'run2')).toEqual({ live: true });
  });
});

describe('ReviewService.reviewsForPull', () => {
  it('404s an unknown PR', async () => {
    const { service } = setup();
    await expect(service.reviewsForPull('ws', 'nope')).rejects.toThrow('Pull request not found');
  });

  it('attaches the agent name to each review (one lookup for all of them)', async () => {
    const { service, state } = setup([agent({ id: 'a1', name: 'Security' })]);
    const review = (id: string, agentId: string | null) =>
      ({
        id,
        workspaceId: 'ws',
        prId: 'pr1',
        agentId,
        runId: null,
        kind: 'review',
        verdict: 'comment',
        summary: null,
        score: 90,
        model: 'm',
        createdAt: new Date(),
      }) as ReviewRow;
    state.reviews = [
      { review: review('r1', 'a1'), findings: [], batchId: 'b1' },
      { review: review('r2', null), findings: [], batchId: null },
    ];

    const dtos = await service.reviewsForPull('ws', 'pr1');

    expect(dtos.map((d) => [d.id, d.agent_name])).toEqual([
      ['r1', 'Security'],
      ['r2', null],
    ]);
  });
});
