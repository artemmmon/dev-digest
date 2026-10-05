import { z } from 'zod';
import type { ReviewFocusItem as ReviewFocusItemType, Risk as RiskType } from '@devdigest/shared';
import { ReviewFocusItem, Risk } from '@devdigest/shared';

/** What a stored answer may hold (spec AC-48 – AC-51). Lives here: core imports only zod and shared. */
export const BRIEF_ANSWER_LIMITS = {
  maxRisks: 5,
  maxFocus: 7,
  maxFileRefs: 3,
  summaryChars: 400,
  riskTitleChars: 80,
  riskExplanationChars: 400,
  focusReasonChars: 160,
} as const;

/**
 * What the model must answer. The contract is strict (a wrong `kind` or a missing key
 * fails and, after the provider's one re-ask, ends the generation); lengths and counts
 * are NOT limited here — `validateAnswer` cuts them, so a long answer is trimmed, not rejected.
 */
export const BriefModelAnswer = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type BriefModelAnswer = z.infer<typeof BriefModelAnswer>;

/** A changed new-side line range (structural twin of `_shared/hunks.ts` `LineRange`). */
export interface AnswerRange {
  start: number;
  end: number;
}

export interface AnswerFacts {
  /** Every path of the pull request's own file list. */
  prPaths: ReadonlySet<string>;
  /** Changed-symbol and caller files of the blast radius; empty when it names no changed symbol. */
  blastPaths: ReadonlySet<string>;
  /** New-side ranges by file path. */
  rangesByPath: ReadonlyMap<string, readonly AnswerRange[]>;
}

export interface ValidatedAnswer {
  summary: string;
  risks: RiskType[];
  review_focus: ReviewFocusItemType[];
  droppedRisks: number;
  droppedFocus: number;
}

/** Cut `text` to at most `max` chars on a word boundary, ending in "…" when cut. */
export function cutText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace >= max / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.trimEnd()}…`;
}

function inRanges(line: number, ranges: readonly AnswerRange[] | undefined): boolean {
  return ranges !== undefined && ranges.some((r) => line >= r.start && line <= r.end);
}

/**
 * Check the model's answer against the facts we hold (spec AC-44 – AC-51). Paths are
 * compared by exact equality only — a model path is never used to read or link anything.
 * Order: keep the first risks / focus items, filter `file_refs`, keep the first refs,
 * drop what is left empty or ungrounded, then cut the texts.
 */
export function validateAnswer(answer: BriefModelAnswer, facts: AnswerFacts): ValidatedAnswer {
  const L = BRIEF_ANSWER_LIMITS;
  const known = (path: string) => facts.prPaths.has(path) || facts.blastPaths.has(path);

  const risks: RiskType[] = [];
  for (const risk of answer.risks.slice(0, L.maxRisks)) {
    const refs = risk.file_refs.filter(known).slice(0, L.maxFileRefs);
    if (refs.length === 0) continue;
    risks.push({
      kind: risk.kind,
      severity: risk.severity,
      title: cutText(risk.title, L.riskTitleChars),
      explanation: cutText(risk.explanation, L.riskExplanationChars),
      file_refs: refs,
    });
  }

  const focus: ReviewFocusItemType[] = [];
  for (const item of answer.review_focus.slice(0, L.maxFocus)) {
    if (!facts.prPaths.has(item.file)) continue;
    if (!inRanges(item.line, facts.rangesByPath.get(item.file))) continue;
    focus.push({ file: item.file, line: item.line, reason: cutText(item.reason, L.focusReasonChars) });
  }

  return {
    summary: cutText(answer.summary, L.summaryChars),
    risks,
    review_focus: focus,
    droppedRisks: answer.risks.length - risks.length,
    droppedFocus: answer.review_focus.length - focus.length,
  };
}
