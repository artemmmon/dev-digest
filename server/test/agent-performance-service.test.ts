/** SPEC-16 — AgentPerformanceService against in-memory fakes of its two ports and a fixed clock. */
import { describe, expect, it } from 'vitest';
import { AgentPerformanceService } from '../src/modules/agent-performance/service.js';
import type {
  CountedRun,
  PerformanceAgentSource,
  RunStatsStore,
  StatsWindow,
} from '../src/modules/agent-performance/ports.js';
import { NotFoundError } from '../src/platform/errors.js';

const WS = 'ws-1';
const OTHER_WS = 'ws-2';
const NOW = new Date('2026-10-21T12:00:00.000Z');
const DAY = 24 * 3_600_000;

interface StoredRun extends CountedRun {
  workspaceId: string;
}

class FakeStore implements RunStatsStore {
  calls: Array<{ workspaceId: string; window: StatsWindow; agentId?: string }> = [];
  constructor(readonly runs: StoredRun[]) {}
  private inWindow(r: StoredRun, w: StatsWindow) {
    return r.ranAt >= w.from && r.ranAt <= w.to;
  }
  async countedRuns(workspaceId: string, window: StatsWindow, agentId?: string) {
    this.calls.push({ workspaceId, window, agentId });
    return this.runs.filter(
      (r) =>
        r.workspaceId === workspaceId &&
        this.inWindow(r, window) &&
        (agentId === undefined || r.agentId === agentId),
    );
  }
  async hasCountedRunsOutside(workspaceId: string, window: StatsWindow) {
    return this.runs.some((r) => r.workspaceId === workspaceId && !this.inWindow(r, window));
  }
}

class FakeAgents implements PerformanceAgentSource {
  constructor(private readonly all: Array<{ id: string; name: string; workspaceId: string }>) {}
  async list(ws: string) {
    return this.all.filter((a) => a.workspaceId === ws).map(({ id, name }) => ({ id, name }));
  }
  async getById(ws: string, id: string) {
    const a = this.all.find((x) => x.id === id && x.workspaceId === ws);
    return a ? { id: a.id, name: a.name } : undefined;
  }
}

function run(agentId: string | null, hoursAgo: number, over: Partial<StoredRun> = {}): StoredRun {
  return {
    workspaceId: WS,
    agentId,
    model: 'm',
    status: 'done',
    costUsd: 0.1,
    durationMs: 1000,
    ranAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
    accepted: 1,
    dismissed: 1,
    pending: 0,
    ...over,
  };
}

function setup(runs: StoredRun[]) {
  const store = new FakeStore(runs);
  const agents = new FakeAgents([
    { id: 'a1', name: 'Alpha', workspaceId: WS },
    { id: 'a2', name: 'Beta', workspaceId: WS },
    { id: 'x1', name: 'Foreign', workspaceId: OTHER_WS },
  ]);
  return { store, service: new AgentPerformanceService({ store, agents, now: () => NOW }) };
}

describe('agentStats', () => {
  it('AC-88: answers with the agent figures over its counted runs in the period', async () => {
    const { service } = setup([
      run('a1', 2),
      run('a1', 5, { status: 'failed', costUsd: null }),
      run('a1', 24 * 40), // 40 days ago: outside 30d
      run('a2', 1),
    ]);
    const stats = await service.agentStats(WS, 'a1', { period: '30d' });
    expect(stats).toMatchObject({ agent_id: 'a1', agent_name: 'Alpha', runs: 2, runs_failed: 1, cost_partial: true });
  });

  it('AC-88: asks the store for that one agent and the resolved window', async () => {
    const { service, store } = setup([]);
    await service.agentStats(WS, 'a1', { period: '1d' });
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]).toMatchObject({ workspaceId: WS, agentId: 'a1' });
    expect(store.calls[0]!.window.to).toEqual(NOW);
    expect(NOW.getTime() - store.calls[0]!.window.from.getTime()).toBe(DAY);
  });

  it('AC-88: a custom range reads exactly the requested instants', async () => {
    const { service } = setup([run('a1', 3), run('a1', 24 * 10)]);
    const stats = await service.agentStats(WS, 'a1', {
      period: 'custom',
      from: new Date(NOW.getTime() - 5 * DAY).toISOString(),
      to: NOW.toISOString(),
    });
    expect(stats.runs).toBe(1);
  });

  it('AC-90 / NFR-2: an agent that does not exist is a not-found error', async () => {
    const { service } = setup([]);
    await expect(service.agentStats(WS, 'missing', { period: '30d' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("AC-90 / NFR-2: an agent of another workspace is a not-found error, and no run is read", async () => {
    const { service, store } = setup([run('x1', 1, { workspaceId: OTHER_WS })]);
    await expect(service.agentStats(WS, 'x1', { period: '30d' })).rejects.toBeInstanceOf(NotFoundError);
    expect(store.calls).toEqual([]);
  });

  it('AC-35: an agent with no run in the period answers with zero runs and null figures', async () => {
    const { service } = setup([run('a2', 1)]);
    const stats = await service.agentStats(WS, 'a1', { period: '30d' });
    expect(stats).toMatchObject({ runs: 0, accept_rate: null, avg_cost_usd: null, avg_duration_ms: null });
  });
});

describe('workspace', () => {
  it('AC-89: one entry per agent of the caller workspace, computed by the same rule as agentStats', async () => {
    const { service } = setup([
      run('a1', 2),
      run('a1', 3, { costUsd: null }),
      run('a2', 1),
      run('x1', 1, { workspaceId: OTHER_WS }),
    ]);
    const perf = await service.workspace(WS, { period: '30d' });
    expect(perf.agents.map((a) => a.agent_id).sort()).toEqual(['a1', 'a2']);
    for (const entry of perf.agents) {
      expect(entry).toEqual(await service.agentStats(WS, entry.agent_id as string, { period: '30d' }));
    }
    expect(perf.totals.runs).toBe(3);
  });

  it("NFR-2: another workspace's runs and agents never appear", async () => {
    const { service } = setup([run('x1', 1, { workspaceId: OTHER_WS })]);
    const perf = await service.workspace(WS, { period: '30d' });
    expect(perf.totals.runs).toBe(0);
    expect(perf.agents.every((a) => a.agent_id !== 'x1')).toBe(true);
    expect(perf.has_runs_outside_period).toBe(false);
  });

  it('EC-6: runs only outside the period set has_runs_outside_period', async () => {
    const { service } = setup([run('a1', 24 * 60)]);
    const perf = await service.workspace(WS, { period: '1d' });
    expect(perf.totals.runs).toBe(0);
    expect(perf.has_runs_outside_period).toBe(true);
  });

  it('EC-6: a workspace that never ran an agent has no runs and none outside', async () => {
    const { service } = setup([]);
    const perf = await service.workspace(WS, { period: '30d' });
    expect(perf.totals.runs).toBe(0);
    expect(perf.has_runs_outside_period).toBe(false);
  });

  it('EC-2: runs of a deleted agent come back as the Deleted agent entry', async () => {
    const { service } = setup([run(null, 2), run('a1', 1)]);
    const perf = await service.workspace(WS, { period: '30d' });
    expect(perf.agents.find((a) => a.agent_id === null)).toMatchObject({ agent_name: null, runs: 1 });
  });
});
