/* helpers.ts — pure mapping helpers for IntentCard: enum → icon and enum → i18n key.
   No JSX, no hooks — kept testable and out of the component body. */
import type {
  IntentBasis,
  IntentConfidenceTier,
  IntentSource,
  IntentSourceKind,
  IntentSourceStatus,
  RiskAreaKind,
} from "@devdigest/shared";

// Shared with the PR Brief block: promoted to the Overview tab on its second consumer.
export { riskAreaIcon, shortSha } from "../../helpers";

export function tierMessageKey(tier: IntentConfidenceTier): `card.tier.${IntentConfidenceTier}` {
  return `card.tier.${tier}`;
}

export function basisMessageKey(basis: IntentBasis): `card.basis.${IntentBasis}` {
  return `card.basis.${basis}`;
}

export function sourceKindMessageKey(
  kind: IntentSourceKind,
): `card.sourceKind.${IntentSourceKind}` {
  return `card.sourceKind.${kind}`;
}

export function sourceStatusMessageKey(
  status: IntentSourceStatus,
): `card.sourceStatus.${IntentSourceStatus}` {
  return `card.sourceStatus.${status}`;
}

/** i18n key naming what a risk-area kind means — used for the chip icon's `aria-label`/`title`,
   never as the chip's visible text (that's the server-supplied `label`, rendered as plain text). */
export function riskAreaMessageKey(kind: RiskAreaKind): `card.riskArea.${RiskAreaKind}` {
  return `card.riskArea.${kind}`;
}

/** Linked sources that never reached the classifier prompt — what `missing_context` refers to. */
export function missingContextSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((source) => source.status !== "used");
}
