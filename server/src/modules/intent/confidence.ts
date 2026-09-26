import type { IntentBasis, IntentConfidenceTier, IntentSource } from '@devdigest/shared';
import { SUBSTANTIVE_BODY_CHARS } from './constants.js';

/**
 * D3 — evidence-tier confidence, never the model's self-report.
 * `basis = documented` when the body is substantive OR at least one linked
 * (issue/doc/ticket) source is `used`; otherwise `inferred`. Tier starts at
 * `high` (documented) or `low` (inferred); each linked source that is not
 * `used` lowers it one step, floored at `low`. `missing_context` is set
 * whenever the basis is `inferred` OR any linked source is not `used`.
 */

const TIER_ORDER: readonly IntentConfidenceTier[] = ['low', 'medium', 'high'];

/** Non-heading, non-blank chars in a PR body (heading lines start with `#`). */
export function substantiveBodyChars(body: string | null | undefined): number {
  if (!body) return 0;
  return body
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .replace(/\s/g, '').length;
}

export interface ConfidenceResult {
  basis: IntentBasis;
  tier: IntentConfidenceTier;
  missingContext: boolean;
}

/** `sources` = every LINKED source (issue/ticket/doc) — never title/body/files. */
export function computeConfidence(
  body: string | null | undefined,
  linkedSources: Pick<IntentSource, 'status'>[],
): ConfidenceResult {
  const bodySubstantive = substantiveBodyChars(body) >= SUBSTANTIVE_BODY_CHARS;
  const anyLinkedUsed = linkedSources.some((s) => s.status === 'used');
  const anyLinkedNotUsed = linkedSources.some((s) => s.status !== 'used');
  const basis: IntentBasis = bodySubstantive || anyLinkedUsed ? 'documented' : 'inferred';

  let idx = basis === 'documented' ? TIER_ORDER.indexOf('high') : TIER_ORDER.indexOf('low');
  for (const s of linkedSources) {
    if (s.status !== 'used') idx = Math.max(TIER_ORDER.indexOf('low'), idx - 1);
  }

  return {
    basis,
    tier: TIER_ORDER[idx]!,
    missingContext: basis === 'inferred' || anyLinkedNotUsed,
  };
}
