/* helpers.ts — pure helpers shared by the Overview tab's cards (Intent, PR Brief, Risk areas). */
import type { IconName } from "@devdigest/ui";
import type { RiskAreaKind } from "@devdigest/shared";

const RISK_ICON: Record<RiskAreaKind, IconName> = {
  auth: "Shield",
  dependency: "Boxes",
  migration: "Database",
  ci_config: "Workflow",
  secrets_config: "Lock",
  performance: "Zap",
  api_contract: "Link",
  data: "Layers",
  other: "AlertTriangle",
};

/** Icon chip for a risk-area kind (both `origin: 'rule'` and `'model'` chips render the same way). */
export function riskAreaIcon(kind: RiskAreaKind): IconName {
  return RISK_ICON[kind] ?? "AlertTriangle";
}

/** First 7 chars of a head SHA for the stale note, or null if there is none to show. */
export function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 7) : null;
}
