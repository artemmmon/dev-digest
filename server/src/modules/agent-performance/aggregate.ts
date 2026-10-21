import type { AgentCost, AgentPerformance, AgentStats, ModelCost } from '@devdigest/shared';
import { COST_UNITS_PER_USD } from './constants.js';
import type { CountedRun } from './ports.js';

interface AgentRef {
  id: string;
  name: string;
}

const toUnits = (usd: number): number => Math.round(usd * COST_UNITS_PER_USD);
const fromUnits = (units: number): number => units / COST_UNITS_PER_USD;
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const rateOf = (accepted: number, dismissed: number): number | null =>
  accepted + dismissed > 0 ? accepted / (accepted + dismissed) : null;

/** Cost per model in integer units over the priced rows (a null model is its own group). */
function modelUnits(rows: CountedRun[]): Map<string | null, number> {
  const byModel = new Map<string | null, number>();
  for (const r of rows) {
    if (r.costUsd === null) continue;
    byModel.set(r.model, (byModel.get(r.model) ?? 0) + toUnits(r.costUsd));
  }
  return byModel;
}

function toModelCosts(units: Map<string | null, number>): ModelCost[] {
  return [...units.entries()]
    .map(([model, u]) => ({ model, cost_usd: fromUnits(u) }))
    .sort((a, b) => b.cost_usd - a.cost_usd);
}

/**
 * The single rule behind both reads: every figure of one group of counted runs. `agent` is null
 * for the "Deleted agent" group. Null means "no data", never 0.
 */
export function aggregateAgent(rows: CountedRun[], agent: AgentRef | null): AgentStats {
  const accepted = sum(rows.map((r) => r.accepted));
  const dismissed = sum(rows.map((r) => r.dismissed));
  const priced = rows.filter((r) => r.costUsd !== null);
  const totalUnits = sum(priced.map((r) => toUnits(r.costUsd as number)));
  const total = priced.length > 0 ? fromUnits(totalUnits) : null;
  const durations = rows.flatMap((r) =>
    r.status === 'done' && r.durationMs !== null ? [r.durationMs] : [],
  );
  const lastRun = rows.reduce<Date | null>((max, r) => (max === null || r.ranAt > max ? r.ranAt : max), null);
  return {
    agent_id: agent?.id ?? null,
    agent_name: agent?.name ?? null,
    runs: rows.length,
    runs_done: rows.filter((r) => r.status === 'done').length,
    runs_failed: rows.filter((r) => r.status === 'failed').length,
    runs_cancelled: rows.filter((r) => r.status === 'cancelled').length,
    accepted,
    dismissed,
    pending: sum(rows.map((r) => r.pending)),
    accept_rate: rateOf(accepted, dismissed),
    total_cost_usd: total,
    avg_cost_usd: total === null ? null : total / priced.length,
    cost_partial: priced.length < rows.length,
    avg_duration_ms: durations.length > 0 ? sum(durations) / durations.length : null,
    last_run_at: lastRun === null ? null : lastRun.toISOString(),
    cost_by_model: toModelCosts(modelUnits(rows)),
  };
}

/**
 * Workspace read: one entry per listed agent (also with no run), one "Deleted agent" entry
 * (null id and name) for runs whose agent is gone, totals, and the two cost breakdowns. Money is
 * summed once in integer units so the slices of both breakdowns equal the total.
 */
export function aggregateWorkspace(
  agents: AgentRef[],
  rows: CountedRun[],
  hasRunsOutside: boolean,
): AgentPerformance {
  const listed = new Set(agents.map((a) => a.id));
  const byAgent = new Map<string, CountedRun[]>();
  const orphans: CountedRun[] = [];
  for (const r of rows) {
    if (r.agentId === null || !listed.has(r.agentId)) {
      orphans.push(r);
      continue;
    }
    const bucket = byAgent.get(r.agentId);
    if (bucket) bucket.push(r);
    else byAgent.set(r.agentId, [r]);
  }

  const groups: Array<{ agent: AgentRef | null; rows: CountedRun[] }> = agents.map((a) => ({
    agent: a,
    rows: byAgent.get(a.id) ?? [],
  }));
  if (orphans.length > 0) groups.push({ agent: null, rows: orphans });
  const built = groups
    .map((g, i) => ({ i, rows: g.rows, entry: aggregateAgent(g.rows, g.agent) }))
    .sort((a, b) => b.entry.runs - a.entry.runs || a.i - b.i);
  const sorted = built.map((b) => b.entry);

  // Cost by agent: every entry with a priced run, in integer units.
  const costByAgent: AgentCost[] = built
    .flatMap(({ rows: group, entry }) => {
      const priced = group.filter((r) => r.costUsd !== null);
      return priced.length === 0
        ? []
        : [
            {
              agent_id: entry.agent_id,
              agent_name: entry.agent_name,
              cost_usd: fromUnits(sum(priced.map((r) => toUnits(r.costUsd as number)))),
            },
          ];
    })
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const pricedAll = rows.filter((r) => r.costUsd !== null);
  const accepted = sum(rows.map((r) => r.accepted));
  const dismissed = sum(rows.map((r) => r.dismissed));

  // Most active: an existing agent with runs; ties go to the newer last run (then list order).
  let mostActive: AgentStats | null = null;
  for (const e of sorted) {
    if (e.agent_id === null || e.runs === 0) continue;
    if (
      mostActive === null ||
      e.runs > mostActive.runs ||
      (e.runs === mostActive.runs && (e.last_run_at ?? '') > (mostActive.last_run_at ?? ''))
    ) {
      mostActive = e;
    }
  }

  return {
    totals: {
      runs: rows.length,
      total_cost_usd:
        pricedAll.length > 0 ? fromUnits(sum(pricedAll.map((r) => toUnits(r.costUsd as number)))) : null,
      cost_partial: pricedAll.length < rows.length,
      accepted,
      dismissed,
      accept_rate: rateOf(accepted, dismissed),
      most_active:
        mostActive === null || mostActive.agent_id === null || mostActive.agent_name === null
          ? null
          : { agent_id: mostActive.agent_id, agent_name: mostActive.agent_name, runs: mostActive.runs },
    },
    agents: sorted,
    cost_by_agent: costByAgent,
    cost_by_model: toModelCosts(modelUnits(rows)),
    has_runs_outside_period: hasRunsOutside,
  };
}
