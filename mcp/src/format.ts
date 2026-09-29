/**
 * Response shaping. Everything derived from LLM output or PR/repo content passes
 * through `clip` before it reaches the model: control and invisible characters are stripped and
 * length is bounded. The text is returned as data in named fields, never as prose
 * the model is expected to follow.
 */
import type { FindingInfo, ReviewInfo, ConventionInfo } from './api/schemas.js';
import type { ConventionOut, FindingOut, RunResult } from './domain.js';

export const DEFAULT_RESPONSE_CAP = 24_000;
const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 } as const;

// C0 controls except \n (and DEL): they can hide text or move a terminal cursor.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f]/g;

// Invisible Unicode that renders as nothing but is still read by a model: tag characters
// (U+E0000-E007F, "ASCII smuggling"), zero-width characters (U+200B-200D, U+2060) and bidi
// controls (U+202A-202E, U+2066-2069). Needs the `u` flag for the astral tag range.
const INVISIBLE_CHARS = /[\u{E0000}-\u{E007F}\u200B-\u200D\u2060\u202A-\u202E\u2066-\u2069]/gu;

/** Strip control and invisible characters (keeping `\n`), trim, and cut to `n` characters with `…`. */
export function clip(text: string, n: number): string {
  const clean = text.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '').trim();
  if (clean.length <= n) return clean;
  let cut = clean.slice(0, Math.max(0, n - 1));
  // Do not leave half of a surrogate pair behind.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** CRITICAL → WARNING → SUGGESTION, then file, then line. Returns a new array. */
export function sortFindings<T extends Pick<FindingInfo, 'severity' | 'file' | 'start_line'>>(
  findings: readonly T[],
): T[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.start_line - b.start_line,
  );
}

export function toFinding(f: FindingInfo, detail: 'concise' | 'detailed'): FindingOut {
  const out: FindingOut = {
    id: f.id,
    severity: f.severity,
    file: clip(f.file, 200),
    lines: f.start_line === f.end_line ? String(f.start_line) : `${f.start_line}-${f.end_line}`,
    title: clip(f.title, 200),
    category: clip(f.category, 40),
  };
  if (f.scope) out.scope = f.scope;
  if (detail === 'detailed') {
    const rationale = clip(f.rationale, 300);
    if (rationale) out.rationale = rationale;
    const suggestion = f.suggestion ? clip(f.suggestion, 200) : '';
    if (suggestion) out.suggestion = suggestion;
  }
  return out;
}

export interface RunResultInput {
  status: RunResult['status'];
  runId: string;
  repo: string;
  pr: number;
  agent: { id: string; name: string };
  /** The review of this run; absent while running, failed or cancelled. */
  review?: ReviewInfo | undefined;
  limit: number;
  detail: 'concise' | 'detailed';
  nextStep: string | null;
}

/** The `RunResult` both `run_agent_on_pr` and `get_findings` return. Dismissed findings are left out. */
export function buildRunResult(input: RunResultInput): RunResult {
  const kept = sortFindings((input.review?.findings ?? []).filter((f) => !f.dismissed_at));
  const counts = {
    critical: kept.filter((f) => f.severity === 'CRITICAL').length,
    warning: kept.filter((f) => f.severity === 'WARNING').length,
    suggestion: kept.filter((f) => f.severity === 'SUGGESTION').length,
  };
  const findings = kept.slice(0, input.limit).map((f) => toFinding(f, input.detail));
  const summary = input.review?.summary ? clip(input.review.summary, 400) : '';
  return capResponse({
    status: input.status,
    run_id: input.runId,
    repo: input.repo,
    pr: input.pr,
    agent_id: input.agent.id,
    agent_name: clip(input.agent.name, 100),
    verdict: input.review?.verdict ?? null,
    score: input.review?.score ?? null,
    summary: summary || null,
    counts,
    findings,
    total: kept.length,
    truncated: findings.length < kept.length,
    next_step: input.nextStep,
  });
}

/** A convention as returned by get_conventions; evidence is a `path:line` pointer. */
export function toConvention(c: ConventionInfo): ConventionOut {
  return {
    id: c.id,
    category: clip(c.category, 40),
    rule: clip(c.rule, 300),
    evidence: `${clip(c.evidence_path, 200)}:${c.evidence_line}`,
    confidence: Math.round(c.confidence * 100) / 100,
    status: c.status,
  };
}

/**
 * Keeps the serialized response under `maxChars` by dropping trailing findings
 * (the least severe, after sorting) and saying so in `truncated` / `next_step`.
 */
export function capResponse<T extends { findings: unknown[]; truncated: boolean; next_step: string | null }>(
  obj: T,
  maxChars: number = DEFAULT_RESPONSE_CAP,
): T {
  if (JSON.stringify(obj).length <= maxChars) return obj;
  const capped = { ...obj, findings: [...obj.findings] };
  while (capped.findings.length > 0 && JSON.stringify(capped).length > maxChars) {
    capped.findings.pop();
  }
  const note = `Response capped at ${maxChars} characters; ask for a smaller limit or detail 'concise'.`;
  capped.truncated = true;
  capped.next_step = capped.next_step ? `${capped.next_step} ${note}` : note;
  return capped;
}
