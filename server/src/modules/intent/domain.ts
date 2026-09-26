import { z } from 'zod';
import type { IncidentalChange, RiskArea, RiskAreaKind } from '@devdigest/shared';
import { INTENT_LIMITS, RiskAreaKind as RiskAreaKindEnum } from '@devdigest/shared';

/**
 * Loose LLM structured-output schema (`server/INSIGHTS.md:431` — deepseek-v4-flash
 * intermittently fails strict schema validation). Every field is `.nullish()`:
 * strict structured outputs want each key nullable (a bare `.optional()` makes the
 * OpenAI SDK warn), and a model that drops a key still parses. No `.default()` —
 * it changes the schema's Input/Output types. `clampClassification` applies the
 * fallbacks and limits instead of the schema.
 */
export const IntentClassification = z.object({
  summary: z.string().nullish(),
  in_scope: z.array(z.string()).nullish(),
  out_of_scope: z.array(z.string()).nullish(),
  risk_areas: z
    .array(z.object({ kind: z.string().nullish(), label: z.string().nullish() }))
    .nullish(),
  /** Hunk ids (`H3`) from the files section that are unrelated to the stated intent. */
  incidental_hunks: z
    .array(z.object({ hunk: z.string().nullish(), reason: z.string().nullish() }))
    .nullish(),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

/**
 * Dependency manifests and lockfiles support whatever code change needs them, so a
 * hunk in one is never "incidental" to the intent (the model tends to flag them).
 */
export const NEVER_INCIDENTAL_PATTERN =
  /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pubspec\.yaml|pubspec\.lock)$/;

/** A hunk as numbered in the classifier prompt (`H1`, `H2`, …) so the model can cite it. */
export interface PromptHunk {
  id: string;
  path: string;
  header: string;
}

const KNOWN_RISK_KINDS = new Set<string>(RiskAreaKindEnum.options);

export interface ClampedClassification {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  /** ≤ `maxModelRiskAreas`, unknown `kind` mapped to `other`, always `origin: 'model'`. */
  modelRiskAreas: RiskArea[];
}

/**
 * Cut `text` to at most `max` chars on a word boundary, ending in "…" when cut —
 * never mid-word ("…if not properly configu").
 */
export function clampText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace >= max / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,.;:–-]+$/, '')}…`;
}

function clampItems(items: string[], max: number, itemChars: number): string[] {
  return items.slice(0, max).map((s) => clampText(s, itemChars));
}

const HUNK_NEW_RANGE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Map the classifier's `incidental_hunks` ids back to new-side line ranges via the
 * prompt's hunk index. Unknown ids, duplicates, pure-deletion hunks (no new lines) and
 * dependency manifests/lockfiles (`NEVER_INCIDENTAL_PATTERN`) are ignored — the model can
 * only point at hunks it was actually shown.
 */
export function toIncidentalChanges(
  raw: IntentClassification,
  hunks: Map<string, PromptHunk>,
): IncidentalChange[] {
  const out: IncidentalChange[] = [];
  const seen = new Set<string>();
  for (const item of raw.incidental_hunks ?? []) {
    const id = (item.hunk ?? '').trim().toUpperCase();
    const hunk = hunks.get(id);
    if (!hunk || seen.has(id) || NEVER_INCIDENTAL_PATTERN.test(hunk.path)) continue;
    seen.add(id);
    const m = hunk.header.match(HUNK_NEW_RANGE);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) continue;
    const reason = clampText(item.reason ?? '', INTENT_LIMITS.incidentalReasonChars);
    out.push({
      path: hunk.path,
      start_line: start,
      end_line: start + count - 1,
      header: hunk.header,
      reason: reason.length > 0 ? reason : null,
    });
    if (out.length >= INTENT_LIMITS.maxIncidentalChanges) break;
  }
  return out;
}

/** Apply section 5's clamp rules to the raw classifier output. */
export function clampClassification(raw: IntentClassification): ClampedClassification {
  const modelRiskAreas: RiskArea[] = (raw.risk_areas ?? [])
    .slice(0, INTENT_LIMITS.maxModelRiskAreas)
    .map((r) => ({
      kind: (KNOWN_RISK_KINDS.has(r.kind ?? '') ? (r.kind as RiskAreaKind) : 'other'),
      label: clampText(r.label ?? '', INTENT_LIMITS.riskAreaLabelChars),
      origin: 'model' as const,
    }))
    .filter((r) => r.label.trim().length > 0);

  return {
    summary: clampText(raw.summary ?? '', INTENT_LIMITS.summaryChars),
    inScope: clampItems(raw.in_scope ?? [], INTENT_LIMITS.maxInScope, INTENT_LIMITS.scopeItemChars),
    outOfScope: clampItems(
      raw.out_of_scope ?? [],
      INTENT_LIMITS.maxOutOfScope,
      INTENT_LIMITS.scopeItemChars,
    ),
    modelRiskAreas,
  };
}
