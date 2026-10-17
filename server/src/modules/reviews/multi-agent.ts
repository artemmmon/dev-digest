import type {
  AgentColumn,
  AgentRunEstimate,
  ColumnState,
  FindingGroup,
  GroupTake,
  MultiAgentFinding,
  RunEvent,
  Severity,
} from '@devdigest/shared';
import { AGENT_STARTED_PHASE, PREP_ERROR_PREFIX } from './constants.js';
import type { ReviewDto } from './helpers.js';
import type { BatchRunRow, DoneRunSample } from './ports.js';

/**
 * Multi-agent review, computed on read (no table, no stored state): a "multi-agent
 * run" is one review batch of a PR. Everything here is pure; the bus buffer comes
 * in as an argument.
 */

/** How many batches the run selector lists. */
export const BATCH_LIST_LIMIT = 10;

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** A review batch of a PR: its id, when it started and its runs (oldest first). */
export interface Batch {
  id: string;
  ranAt: Date;
  rows: BatchRunRow[];
}

/**
 * The multi-agent run id of a run row: its `batch_id`, or its own id for a local run
 * that has no batch (one-column run, OQ-1).
 */
export function batchKey(row: Pick<BatchRunRow, 'id' | 'batchId'>): string {
  return row.batchId ?? row.id;
}

/** Batches of a PR, newest first, at most `limit`. CI runs (`source='ci'`) are hidden. */
export function listBatches(rows: BatchRunRow[], limit: number = BATCH_LIST_LIMIT): Batch[] {
  const byKey = new Map<string, BatchRunRow[]>();
  for (const row of rows) {
    if (row.source === 'ci') continue;
    const key = batchKey(row);
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }
  const batches: Batch[] = [];
  for (const [id, group] of byKey) {
    const sorted = [...group].sort(
      (a, b) => a.ranAt.getTime() - b.ranAt.getTime() || a.id.localeCompare(b.id),
    );
    batches.push({ id, ranAt: sorted[0]!.ranAt, rows: sorted });
  }
  batches.sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime() || a.id.localeCompare(b.id));
  return batches.slice(0, limit);
}

/**
 * Column state. `queued` is derived: a `running` row whose bus buffer holds no
 * `agent-started` event has not begun its agent yet. A null status counts as failed.
 */
export function columnState(status: string | null, buffer: readonly RunEvent[]): ColumnState {
  if (status === 'running') {
    const started = buffer.some(
      (e) => (e.data as { phase?: unknown } | null | undefined)?.phase === AGENT_STARTED_PHASE,
    );
    return started ? 'running' : 'queued';
  }
  if (status === 'done' || status === 'failed' || status === 'cancelled') return status;
  return 'failed';
}

/** One column per run row (ordered as given), with the findings of the matching review. */
export function buildColumns(
  rows: BatchRunRow[],
  reviews: ReviewDto[],
  bufferOf: (runId: string) => readonly RunEvent[],
): AgentColumn[] {
  return rows.map((row) => {
    const review =
      reviews.find((r) => r.run_id === row.id && r.kind === 'review') ??
      reviews.find((r) => r.run_id === row.id);
    const findings: MultiAgentFinding[] = (review?.findings ?? []).map((f) => ({
      ...f,
      agent_id: row.agentId,
      agent_name: row.agentName,
      run_id: row.id,
    }));
    return {
      run_id: row.id,
      agent_id: row.agentId,
      agent_name: row.agentName,
      state: columnState(row.status, bufferOf(row.id)),
      error: row.error,
      duration_ms: row.durationMs,
      cost_usd: row.costUsd,
      tokens_in: row.tokensIn,
      tokens_out: row.tokensOut,
      score: row.score ?? review?.score ?? null,
      verdict: review?.verdict ?? null,
      summary: review?.summary ?? null,
      findings,
    };
  });
}

/** Earlier line first, then higher severity, then lowest id. */
function byLineSeverityId(a: MultiAgentFinding, b: MultiAgentFinding): number {
  return (
    a.start_line - b.start_line ||
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.id.localeCompare(b.id)
  );
}

/** Higher severity first, then earlier line, then lowest id. */
function bySeverityLineId(a: MultiAgentFinding, b: MultiAgentFinding): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    a.start_line - b.start_line ||
    a.id.localeCompare(b.id)
  );
}

/**
 * One take per column on a group's findings: failed/cancelled → `failed`,
 * queued/running → `running`, done with a finding in the group → `flagged` (its
 * representative finding: highest severity, earliest line, lowest id), done without
 * → `did_not_flag`.
 */
export function takesFor(columns: AgentColumn[], groupFindings: MultiAgentFinding[]): GroupTake[] {
  return columns.map((col): GroupTake => {
    const base = { run_id: col.run_id, agent_id: col.agent_id, agent_name: col.agent_name };
    const none = { finding_id: null, severity: null, title: null };
    if (col.state === 'failed' || col.state === 'cancelled') return { ...base, take: 'failed', ...none };
    if (col.state === 'queued' || col.state === 'running') return { ...base, take: 'running', ...none };
    const own = groupFindings.filter((f) => f.run_id === col.run_id).sort(bySeverityLineId);
    const rep = own[0];
    if (!rep) return { ...base, take: 'did_not_flag', ...none };
    return { ...base, take: 'flagged', finding_id: rep.id, severity: rep.severity, title: rep.title };
  });
}

/**
 * Group the findings of all columns by file: sort by `start_line` and sweep, extending
 * the group's end while the next finding starts inside it (transitive overlap, EC-11).
 */
export function groupFindings(columns: AgentColumn[]): FindingGroup[] {
  const byFile = new Map<string, MultiAgentFinding[]>();
  for (const col of columns) {
    for (const f of col.findings) {
      const list = byFile.get(f.file);
      if (list) list.push(f);
      else byFile.set(f.file, [f]);
    }
  }
  const groups: FindingGroup[] = [];
  for (const file of [...byFile.keys()].sort()) {
    const sorted = [...byFile.get(file)!].sort(byLineSeverityId);
    let current: MultiAgentFinding[] = [];
    let start = 0;
    let end = 0;
    const flush = () => {
      if (current.length === 0) return;
      groups.push({
        id: `${file}:${start}-${end}`,
        file,
        start_line: start,
        end_line: end,
        title: current[0]!.title,
        finding_ids: current.map((f) => f.id),
        takes: takesFor(columns, current),
      });
    };
    for (const f of sorted) {
      if (current.length > 0 && f.start_line <= end) {
        current.push(f);
        end = Math.max(end, f.end_line);
      } else {
        flush();
        current = [f];
        start = f.start_line;
        end = f.end_line;
      }
    }
    flush();
  }
  return groups;
}

/**
 * Ids of the groups where the agents disagree: some take is `did_not_flag`, or the
 * `flagged` severities differ. A single column can never conflict with itself (EC-10).
 */
export function conflictIds(groups: FindingGroup[]): string[] {
  return groups
    .filter((g) => {
      if (g.takes.length < 2) return false;
      if (g.takes.some((t) => t.take === 'did_not_flag')) return true;
      const severities = new Set(g.takes.filter((t) => t.take === 'flagged').map((t) => t.severity));
      return severities.size > 1;
    })
    .map((g) => g.id);
}

export interface BatchTotals {
  total_duration_ms: number | null;
  total_cost_usd: number | null;
  cost_partial: boolean;
  tokens_in: number;
  tokens_out: number;
}

/**
 * Batch totals: wall time = the longest finished column; cost = sum of the known
 * costs (`cost_partial` when a done column has none); tokens sum, null as 0.
 */
export function totals(columns: AgentColumn[]): BatchTotals {
  const finished = columns.filter(
    (c) => (c.state === 'done' || c.state === 'failed' || c.state === 'cancelled') && c.duration_ms !== null,
  );
  const total_duration_ms =
    finished.length > 0 ? Math.max(...finished.map((c) => c.duration_ms ?? 0)) : null;
  const costs = columns.flatMap((c) => (c.cost_usd === null ? [] : [c.cost_usd]));
  return {
    total_duration_ms,
    total_cost_usd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    cost_partial: columns.some((c) => c.state === 'done' && c.cost_usd === null),
    tokens_in: columns.reduce((a, c) => a + (c.tokens_in ?? 0), 0),
    tokens_out: columns.reduce((a, c) => a + (c.tokens_out ?? 0), 0),
  };
}

/**
 * The shared error when every column failed in the shared preparation (the PR diff
 * could not be loaded), else null.
 */
export function preparationError(columns: AgentColumn[]): string | null {
  if (columns.length === 0) return null;
  const all = columns.every(
    (c) => c.state === 'failed' && c.error !== null && c.error.startsWith(PREP_ERROR_PREFIX),
  );
  return all ? (columns[0]!.error ?? null) : null;
}

/**
 * Per agent, the average duration and cost over its recent done runs (each average
 * over the non-null values only). Agents with no sample are absent.
 */
export function estimateByAgent(samples: DoneRunSample[]): AgentRunEstimate[] {
  const byAgent = new Map<string, DoneRunSample[]>();
  for (const s of samples) {
    const list = byAgent.get(s.agentId);
    if (list) list.push(s);
    else byAgent.set(s.agentId, [s]);
  }
  const avg = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return [...byAgent.entries()].map(([agent_id, list]) => ({
    agent_id,
    avg_duration_ms: avg(list.flatMap((s) => (s.durationMs === null ? [] : [s.durationMs]))),
    avg_cost_usd: avg(list.flatMap((s) => (s.costUsd === null ? [] : [s.costUsd]))),
    runs: list.length,
  }));
}
