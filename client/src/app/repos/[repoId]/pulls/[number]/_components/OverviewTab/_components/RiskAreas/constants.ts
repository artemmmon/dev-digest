import type { RiskSeverity } from "@devdigest/shared";

/** Icon colour per risk severity (design `screen_pr_detail.jsx:21`): high = critical, medium = warning, low = info. */
export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};
