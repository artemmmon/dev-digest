import type { EvalMetricKey } from "./helpers";

/** Value colour of each metric (design: accent / ok / warn); shared by cards, chart and the compare view. */
export const METRIC_COLOR: Record<EvalMetricKey, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};
