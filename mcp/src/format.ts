/**
 * Response shaping. Everything derived from LLM output or PR/repo content passes
 * through `clip` before it reaches the model: control and invisible characters are stripped and
 * length is bounded. The text is returned as data in named fields, never as prose
 * the model is expected to follow.
 */
import type { BlastInfo, FindingInfo, ReviewInfo, ConventionInfo } from './api/schemas.js';
import type { BlastRadiusResult, ConventionOut, FindingOut, RunResult } from './domain.js';

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

/**
 * The route's blast radius as the tool result. Every repo-derived string is clipped (repo
 * text is data, never instructions); the counts are the server's, so they still describe the
 * whole map after `capBlastResponse` drops entries. `next_step` is filled in by the caller.
 */
export function toBlastResult(info: BlastInfo, repo: string, pr: number): BlastRadiusResult {
  return {
    repo: clip(repo, 200),
    pr,
    changed_symbols: info.blast.changed_symbols.map((s) => ({
      name: clip(s.name, 120),
      file: clip(s.file, 200),
      kind: clip(s.kind, 40),
    })),
    downstream: info.blast.downstream.map((d) => ({
      symbol: clip(d.symbol, 120),
      callers: d.callers.map((c) => ({ name: clip(c.name, 120), file: clip(c.file, 200), line: c.line })),
      endpoints_affected: d.endpoints_affected.map((e) => clip(e, 160)),
      crons_affected: d.crons_affected.map((c) => clip(c, 160)),
    })),
    summary: clip(info.blast.summary, 300),
    counts: {
      symbols: info.counts.symbols,
      callers: info.counts.callers,
      endpoints: info.counts.endpoints,
      crons: info.counts.crons,
    },
    degraded: info.index.degraded,
    reason: info.index.reason,
    truncated: info.truncated,
    next_step: null,
  };
}

/**
 * Keeps the serialized blast result under `maxChars`: first drops trailing `downstream` entries
 * (the server ranks them, lowest last), then, if still too big, trailing `changed_symbols`. `counts`
 * always describes the whole map. Says so in `truncated` / `next_step`.
 */
export function capBlastResponse(
  result: BlastRadiusResult,
  maxChars: number = DEFAULT_RESPONSE_CAP,
): BlastRadiusResult {
  if (JSON.stringify(result).length <= maxChars) return result;
  const note =
    `Response capped at ${maxChars} characters; the lowest-ranked symbols were dropped from downstream ` +
    'and, if still too large, the tail of changed_symbols (counts describe the whole map).';
  // Flag and note first, so the size checks below already count them.
  const capped = {
    ...result,
    changed_symbols: [...result.changed_symbols],
    downstream: [...result.downstream],
    truncated: true,
    next_step: result.next_step ? `${result.next_step} ${note}` : note,
  };
  while (capped.downstream.length > 0 && JSON.stringify(capped).length > maxChars) {
    capped.downstream.pop();
  }
  if (JSON.stringify(capped).length <= maxChars) return capped;

  // Downstream is empty and it still does not fit: binary-search the longest fitting `changed_symbols` prefix
  // (a PR can change thousands of symbols, so popping one by one would re-serialize the result each time).
  const all = capped.changed_symbols;
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (JSON.stringify({ ...capped, changed_symbols: all.slice(0, mid) }).length <= maxChars) lo = mid;
    else hi = mid - 1;
  }
  capped.changed_symbols = all.slice(0, lo);
  return capped;
}
