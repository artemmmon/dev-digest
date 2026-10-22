/**
 * SPEC-16 — the pure aggregator behind GET /agents/:id/stats and GET /agent-performance.
 * Rows in, figures out: no database, no clock.
 */
import { describe, expect, it } from 'vitest';
import { aggregateAgent, aggregateWorkspace } from '../src/modules/agent-performance/aggregate.js';
import type { CountedRun } from '../src/modules/agent-performance/ports.js';

const A = { id: 'agent-a', name: 'Alpha' };
const B = { id: 'agent-b', name: 'Beta' };
const C = { id: 'agent-c', name: 'Gamma' };

let seq = 0;
function run(over: Partial<CountedRun> = {}): CountedRun {
  seq += 1;
  return {
    agentId: A.id,
    model: 'model-1',
    status: 'done',
    costUsd: 0.1,
    durationMs: 1000,
    ranAt: new Date(Date.UTC(2026, 9, 1, 0, seq)),
    accepted: 0,
    dismissed: 0,
    pending: 0,
    ...over,
  };
}
const runs = (n: number, over: Partial<CountedRun> = {}) => Array.from({ length: n }, () => run(over));
const units = (usd: number) => Math.round(usd * 1e9);

describe('aggregateAgent — one rule for every figure', () => {
  it('AC-13 / AC-25: runs is the number of counted runs', () => {
    expect(aggregateAgent(runs(4), A).runs).toBe(4);
  });

  it('AC-44: runs are split by done, failed and cancelled', () => {
    const stats = aggregateAgent(
      [run(), run(), run({ status: 'failed' }), run({ status: 'cancelled' }), run({ status: 'cancelled' })],
      A,
    );
    expect([stats.runs_done, stats.runs_failed, stats.runs_cancelled]).toEqual([2, 1, 2]);
  });

  it('AC-14: total cost is the sum of the priced runs', () => {
    const stats = aggregateAgent([run({ costUsd: 0.25 }), run({ costUsd: 0.5 }), run({ costUsd: null })], A);
    expect(stats.total_cost_usd).toBeCloseTo(0.75, 12);
  });

  it('AC-14: summing 0.1 + 0.2 in integer units gives exactly 0.3', () => {
    const stats = aggregateAgent([run({ costUsd: 0.1 }), run({ costUsd: 0.2 })], A);
    expect(stats.total_cost_usd).toBe(0.3);
  });

  it('AC-15 / AC-27 / EC-1: a run with no stored cost counts as a run and marks the cost partial', () => {
    const stats = aggregateAgent([run({ costUsd: 0.2 }), run({ status: 'failed', costUsd: null })], A);
    expect(stats.runs).toBe(2);
    expect(stats.cost_partial).toBe(true);
    expect(stats.total_cost_usd).toBeCloseTo(0.2, 12);
  });

  it('AC-15: when every run is priced the cost is not partial', () => {
    expect(aggregateAgent(runs(3), A).cost_partial).toBe(false);
  });

  it('AC-26: avg cost is the cost sum divided by the number of priced runs, not of all runs', () => {
    const stats = aggregateAgent([run({ costUsd: 0.2 }), run({ costUsd: 0.4 }), run({ costUsd: null })], A);
    expect(stats.avg_cost_usd).toBeCloseTo(0.3, 12);
  });

  it('AC-33: no priced run gives a null total and a null avg cost, never 0', () => {
    const stats = aggregateAgent(runs(2, { costUsd: null }), A);
    expect(stats.total_cost_usd).toBeNull();
    expect(stats.avg_cost_usd).toBeNull();
    expect(stats.cost_partial).toBe(true);
  });

  it('AC-26: a priced run that cost exactly 0 is a priced run', () => {
    const stats = aggregateAgent(runs(2, { costUsd: 0 }), A);
    expect(stats.total_cost_usd).toBe(0);
    expect(stats.avg_cost_usd).toBe(0);
    expect(stats.cost_partial).toBe(false);
  });

  it('AC-28: avg duration is the mean over done runs only', () => {
    const stats = aggregateAgent(
      [
        run({ durationMs: 1000 }),
        run({ durationMs: 3000 }),
        run({ status: 'failed', durationMs: 90_000 }),
        run({ status: 'cancelled', durationMs: 90_000 }),
      ],
      A,
    );
    expect(stats.avg_duration_ms).toBe(2000);
  });

  it('AC-34: no done run with a duration gives a null avg duration', () => {
    const stats = aggregateAgent([run({ durationMs: null }), run({ status: 'failed', durationMs: 500 })], A);
    expect(stats.avg_duration_ms).toBeNull();
  });

  it('AC-29: accept rate is accepted / (accepted + dismissed), pending is not a decision', () => {
    const stats = aggregateAgent([run({ accepted: 3, dismissed: 1, pending: 6 }), run({ accepted: 0, dismissed: 0, pending: 2 })], A);
    expect(stats.accepted).toBe(3);
    expect(stats.dismissed).toBe(1);
    expect(stats.accept_rate).toBe(0.75);
  });

  it('AC-45: accepted, dismissed and pending are summed over the counted runs', () => {
    const stats = aggregateAgent(
      [run({ accepted: 2, dismissed: 1, pending: 4 }), run({ accepted: 1, dismissed: 0, pending: 1 })],
      A,
    );
    expect([stats.accepted, stats.dismissed, stats.pending]).toEqual([3, 1, 5]);
  });

  it('AC-32: no decision gives a null accept rate, never 0', () => {
    expect(aggregateAgent([run({ pending: 3 })], A).accept_rate).toBeNull();
  });

  it('EC-3: a CI run with no findings adds to runs, cost and duration but not to the rate', () => {
    const stats = aggregateAgent([run({ accepted: 1, dismissed: 1 }), run({ accepted: 0, dismissed: 0, pending: 0 })], A);
    expect(stats.runs).toBe(2);
    expect(stats.accept_rate).toBe(0.5);
    expect(stats.total_cost_usd).toBeCloseTo(0.2, 12);
  });

  it('EC-15: decisions but no priced run shows the rate and no cost', () => {
    const stats = aggregateAgent([run({ costUsd: null, accepted: 4, dismissed: 1 })], A);
    expect(stats.accept_rate).toBe(0.8);
    expect(stats.avg_cost_usd).toBeNull();
  });

  it('AC-31: last_run_at is the start of the newest counted run', () => {
    const newest = new Date('2026-10-05T12:00:00.000Z');
    const stats = aggregateAgent([run({ ranAt: new Date('2026-10-01T00:00:00Z') }), run({ ranAt: newest }), run({ ranAt: new Date('2026-10-03T00:00:00Z') })], A);
    expect(stats.last_run_at).toBe(newest.toISOString());
  });

  it('AC-46 / EC-11: cost per model uses the model stored on each run, priced runs only', () => {
    const stats = aggregateAgent(
      [
        run({ model: 'm-old', costUsd: 0.1 }),
        run({ model: 'm-new', costUsd: 0.3 }),
        run({ model: 'm-new', costUsd: 0.2 }),
        run({ model: 'm-old', costUsd: null }),
      ],
      A,
    );
    expect(stats.cost_by_model).toEqual([
      { model: 'm-new', cost_usd: 0.5 },
      { model: 'm-old', cost_usd: 0.1 },
    ]);
  });

  it('AC-49: a run with no model is its own null-model group', () => {
    const stats = aggregateAgent([run({ model: null, costUsd: 0.4 }), run({ model: 'm', costUsd: 0.1 })], A);
    expect(stats.cost_by_model).toContainEqual({ model: null, cost_usd: 0.4 });
  });

  it('AC-35: an agent with no counted run has zero counts and null figures', () => {
    expect(aggregateAgent([], A)).toEqual({
      agent_id: A.id,
      agent_name: A.name,
      runs: 0,
      runs_done: 0,
      runs_failed: 0,
      runs_cancelled: 0,
      accepted: 0,
      dismissed: 0,
      pending: 0,
      accept_rate: null,
      total_cost_usd: null,
      avg_cost_usd: null,
      cost_partial: false,
      avg_duration_ms: null,
      last_run_at: null,
      cost_by_model: [],
    });
  });

  it('AC-36: a null agent is the Deleted agent entry (null id and name)', () => {
    const stats = aggregateAgent(runs(2, { agentId: null }), null);
    expect(stats.agent_id).toBeNull();
    expect(stats.agent_name).toBeNull();
    expect(stats.runs).toBe(2);
  });
});

describe('aggregateWorkspace', () => {
  it('AC-23: one entry per listed agent, also an agent with no run', () => {
    const perf = aggregateWorkspace([A, B, C], [run({ agentId: A.id }), run({ agentId: B.id })], false);
    expect(perf.agents.map((a) => a.agent_id).sort()).toEqual([A.id, B.id, C.id]);
    expect(perf.agents.find((a) => a.agent_id === C.id)?.runs).toBe(0);
  });

  it('AC-35: rows are ordered by runs, most first (OQ-1), ties keep the agent order', () => {
    const rows = [...runs(1, { agentId: A.id }), ...runs(3, { agentId: B.id }), ...runs(1, { agentId: C.id })];
    expect(aggregateWorkspace([A, B, C], rows, false).agents.map((a) => a.agent_id)).toEqual([B.id, A.id, C.id]);
  });

  it('AC-13: totals.runs counts every counted run', () => {
    const rows = [...runs(2, { agentId: A.id }), ...runs(3, { agentId: B.id }), run({ agentId: null })];
    expect(aggregateWorkspace([A, B], rows, false).totals.runs).toBe(6);
  });

  it('AC-14 / AC-15: totals sum the cost and flag a run without cost as partial', () => {
    const rows = [run({ costUsd: 0.2 }), run({ agentId: B.id, costUsd: 0.3 }), run({ agentId: B.id, costUsd: null })];
    const { totals } = aggregateWorkspace([A, B], rows, false);
    expect(totals.total_cost_usd).toBeCloseTo(0.5, 12);
    expect(totals.cost_partial).toBe(true);
  });

  it('AC-19: no priced run gives a null total, not 0', () => {
    const { totals } = aggregateWorkspace([A], runs(2, { costUsd: null }), false);
    expect(totals.total_cost_usd).toBeNull();
    expect(totals.cost_partial).toBe(true);
  });

  it('AC-16 / AC-17: the page-wide rate pools every decision (sum accepted / sum decisions)', () => {
    const rows = [
      run({ agentId: A.id, accepted: 1, dismissed: 0 }), // 100 % alone
      run({ agentId: B.id, accepted: 1, dismissed: 3 }), // 25 % alone
    ];
    const { totals } = aggregateWorkspace([A, B], rows, false);
    expect(totals.accepted).toBe(2);
    expect(totals.dismissed).toBe(3);
    expect(totals.accept_rate).toBe(0.4); // not the mean of 1 and 0.25
  });

  it('AC-19: no decision gives a null page-wide rate', () => {
    expect(aggregateWorkspace([A], [run({ pending: 4 })], false).totals.accept_rate).toBeNull();
  });

  it('AC-20 / AC-21: most active is the agent with the most counted runs and its run count', () => {
    const rows = [...runs(2, { agentId: A.id }), ...runs(5, { agentId: B.id })];
    expect(aggregateWorkspace([A, B], rows, false).totals.most_active).toEqual({
      agent_id: B.id,
      agent_name: 'Beta',
      runs: 5,
    });
  });

  it('AC-22 / EC-10: a tie goes to the agent whose newest run started last', () => {
    const rows = [
      run({ agentId: A.id, ranAt: new Date('2026-10-01T00:00:00Z') }),
      run({ agentId: A.id, ranAt: new Date('2026-10-09T00:00:00Z') }),
      run({ agentId: B.id, ranAt: new Date('2026-10-02T00:00:00Z') }),
      run({ agentId: B.id, ranAt: new Date('2026-10-10T00:00:00Z') }),
    ];
    expect(aggregateWorkspace([A, B], rows, false).totals.most_active?.agent_id).toBe(B.id);
    expect(aggregateWorkspace([B, A], rows, false).totals.most_active?.agent_id).toBe(B.id);
  });

  it('OQ-2: the Deleted agent is never the most active; with no existing agent run it is null', () => {
    const many = runs(9, { agentId: null });
    const withOne = aggregateWorkspace([A], [...many, run({ agentId: A.id })], false);
    expect(withOne.totals.most_active?.agent_id).toBe(A.id);
    expect(aggregateWorkspace([A], many, false).totals.most_active).toBeNull();
    expect(aggregateWorkspace([A], [], false).totals.most_active).toBeNull();
  });

  it('AC-36 / EC-2: runs of a deleted agent are one entry with a null id and name', () => {
    const rows = [...runs(2, { agentId: null }), run({ agentId: A.id })];
    const perf = aggregateWorkspace([A], rows, false);
    const deleted = perf.agents.filter((a) => a.agent_id === null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ agent_name: null, runs: 2 });
  });

  it('AC-36: no deleted entry when no run lost its agent', () => {
    expect(aggregateWorkspace([A], [run()], false).agents.some((a) => a.agent_id === null)).toBe(false);
  });

  it('AC-48: cost by agent has one slice per agent with a priced run, the deleted agent included', () => {
    const rows = [
      run({ agentId: A.id, costUsd: 0.3 }),
      run({ agentId: B.id, costUsd: null }),
      run({ agentId: null, costUsd: 0.2 }),
    ];
    const perf = aggregateWorkspace([A, B], rows, false);
    expect(perf.cost_by_agent).toEqual([
      { agent_id: A.id, agent_name: 'Alpha', cost_usd: 0.3 },
      { agent_id: null, agent_name: null, cost_usd: 0.2 },
    ]);
  });

  it('AC-49 / EC-11: cost by model has one slice per model stored on a priced run', () => {
    const rows = [
      run({ model: 'm1', costUsd: 0.3 }),
      run({ agentId: B.id, model: 'm1', costUsd: 0.1 }),
      run({ agentId: B.id, model: 'm2', costUsd: 0.2 }),
      run({ agentId: B.id, model: 'm3', costUsd: null }),
    ];
    expect(aggregateWorkspace([A, B], rows, false).cost_by_model).toEqual([
      { model: 'm1', cost_usd: 0.4 },
      { model: 'm2', cost_usd: 0.2 },
    ]);
  });

  it('AC-50 / AC-51: both breakdowns add up to the total, exactly in integer units', () => {
    const rows = [
      run({ agentId: A.id, model: 'm1', costUsd: 0.1 }),
      run({ agentId: A.id, model: 'm2', costUsd: 0.2 }),
      run({ agentId: B.id, model: 'm1', costUsd: 0.3 }),
      run({ agentId: null, model: null, costUsd: 0.0000123 }),
      run({ agentId: B.id, model: 'm2', costUsd: 1 / 3 }),
      run({ agentId: C.id, model: 'm3', costUsd: null }),
    ];
    const perf = aggregateWorkspace([A, B, C], rows, false);
    const total = units(perf.totals.total_cost_usd as number);
    expect(perf.cost_by_agent.reduce((s, c) => s + units(c.cost_usd), 0)).toBe(total);
    expect(perf.cost_by_model.reduce((s, c) => s + units(c.cost_usd), 0)).toBe(total);
  });

  it('AC-52: a run without cost marks the totals partial', () => {
    expect(aggregateWorkspace([A], [run(), run({ costUsd: null })], false).totals.cost_partial).toBe(true);
    expect(aggregateWorkspace([A], [run()], false).totals.cost_partial).toBe(false);
  });

  it('AC-53: no priced run leaves both breakdowns empty and the total null', () => {
    const perf = aggregateWorkspace([A], runs(2, { costUsd: null }), false);
    expect(perf.cost_by_agent).toEqual([]);
    expect(perf.cost_by_model).toEqual([]);
    expect(perf.totals.total_cost_usd).toBeNull();
  });

  it('AC-62: has_runs_outside_period is passed through', () => {
    expect(aggregateWorkspace([A], [], true).has_runs_outside_period).toBe(true);
    expect(aggregateWorkspace([A], [], false).has_runs_outside_period).toBe(false);
  });

  it('empty workspace: zero totals, null figures, no entries beyond the agents', () => {
    const perf = aggregateWorkspace([], [], false);
    expect(perf.totals).toEqual({
      runs: 0,
      total_cost_usd: null,
      cost_partial: false,
      accepted: 0,
      dismissed: 0,
      accept_rate: null,
      most_active: null,
    });
    expect(perf.agents).toEqual([]);
  });
});

describe('dashboard equals the Stats tab', () => {
  const rows = [
    run({ agentId: A.id, accepted: 4, dismissed: 1, pending: 2, costUsd: 0.12, durationMs: 1500, model: 'm1' }),
    run({ agentId: A.id, status: 'failed', costUsd: null, durationMs: 9000 }),
    run({ agentId: A.id, accepted: 1, dismissed: 3, costUsd: 0.33, durationMs: 2500, model: 'm2' }),
    run({ agentId: B.id, accepted: 2, costUsd: 0.5 }),
    run({ agentId: null }),
  ];
  const perf = aggregateWorkspace([A, B], rows, false);
  const entry = perf.agents.find((a) => a.agent_id === A.id);
  const alone = aggregateAgent(rows.filter((r) => r.agentId === A.id), A);

  it('AC-83: same run count', () => expect(entry?.runs).toBe(alone.runs));
  it('AC-84: same avg cost', () => expect(entry?.avg_cost_usd).toBe(alone.avg_cost_usd));
  it('AC-85: same avg duration', () => expect(entry?.avg_duration_ms).toBe(alone.avg_duration_ms));
  it('AC-86: same accept rate', () => expect(entry?.accept_rate).toBe(alone.accept_rate));
  it('AC-87: same decision count', () => {
    expect((entry?.accepted ?? 0) + (entry?.dismissed ?? 0)).toBe(alone.accepted + alone.dismissed);
  });
  it('AC-89: the whole entry is identical', () => expect(entry).toEqual(alone));
});
