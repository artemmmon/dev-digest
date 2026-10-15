import type { EvalTrendPoint } from "@devdigest/shared";
import { pct } from "../helpers";

/** One plotted run: metrics as whole percentages (null = a gap in the line, AC-34) plus what the tooltip shows. */
export interface TrendRow {
  runId: string;
  /** X-axis label, `v3`. */
  label: string;
  startedAt: string;
  version: number;
  cost: number | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

/** The server sends counted runs oldest first (AC-58); the rows keep that order and never re-sort it. */
export function trendRows(points: readonly EvalTrendPoint[]): TrendRow[] {
  return points.map((p) => ({
    runId: p.run_id,
    label: `v${p.agent_version}`,
    startedAt: p.started_at,
    version: p.agent_version,
    cost: p.cost_usd,
    recall: pct(p.recall),
    precision: pct(p.precision),
    citation_accuracy: pct(p.citation_accuracy),
  }));
}
