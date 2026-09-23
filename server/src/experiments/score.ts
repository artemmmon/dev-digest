import { z } from 'zod';
import type { Finding } from '@devdigest/shared';

/**
 * Scoring for the skill experiments: which of a control PR's planted contract
 * changes a review caught. Pure — the runner feeds it grounded findings.
 */

/** One planted change in a control PR (`expected.json`). Lines are new-side diff lines. */
export const ExpectedChange = z.object({
  id: z.string(),
  label: z.string(),
  /** The skill whose rule covers this change. */
  skill: z.string(),
  /** A finding must name one of these (case-insensitive) to count for this change. */
  keywords: z.array(z.string()).min(1),
  locations: z
    .array(z.object({ file: z.string(), lines: z.tuple([z.number().int(), z.number().int()]) }))
    .min(1),
});
export type ExpectedChange = z.infer<typeof ExpectedChange>;
export const ExpectedChanges = z.array(ExpectedChange).min(1);

/**
 * How far (in lines) a cited range may sit from a planted change and still count. The model's
 * line numbers drift by up to 6 lines even when grounding accepts them; the keyword does the
 * real matching, the slack only keeps a finding in the right part of the file.
 */
export const LINE_SLACK = 5;

const POLICY_RE = /deprecat|semver|major (version|bump)|sunset/i;

export type ScoredRun = {
  /** change id → caught. */
  caught: Record<string, boolean>;
  /** Every planted change caught. */
  full: boolean;
  /** Findings that match no planted change (noise, or a real issue the fixture does not plant). */
  extra: number;
  /** Findings that talk about deprecation / semver policy. */
  policyMentions: number;
};

function text(f: Finding): string {
  return `${f.title}\n${f.rationale}\n${f.suggestion ?? ''}`.toLowerCase();
}

/** True when `f` cites a location of `change` (± LINE_SLACK) and names one of its keywords. */
export function matches(f: Finding, change: ExpectedChange): boolean {
  const body = text(f);
  if (!change.keywords.some((k) => body.includes(k.toLowerCase()))) return false;
  return change.locations.some(
    ({ file, lines: [start, end] }) =>
      f.file === file && f.start_line <= end + LINE_SLACK && f.end_line >= start - LINE_SLACK,
  );
}

export function scoreRun(findings: Finding[], expected: ExpectedChange[]): ScoredRun {
  const caught = Object.fromEntries(
    expected.map((c) => [c.id, findings.some((f) => matches(f, c))]),
  );
  return {
    caught,
    full: expected.every((c) => caught[c.id]),
    extra: findings.filter((f) => !expected.some((c) => matches(f, c))).length,
    policyMentions: findings.filter((f) => POLICY_RE.test(text(f))).length,
  };
}
