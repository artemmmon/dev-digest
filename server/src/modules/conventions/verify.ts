import { ConventionCategory } from '@devdigest/shared';
import { MAX_EVIDENCE_LINES, MAX_RULE_CHARS, MIN_SNIPPET_CHARS } from './constants.js';
import type { DropReason, RawConvention, VerifiedConvention } from './domain.js';

/**
 * The evidence gate. A candidate survives only if the file it cites was one the model was shown
 * and the snippet it quotes really occurs there. The stored line range and snippet come from the
 * file, never from the model's text, so a card can never show code that is not in the repo.
 */

export interface VerifyResult {
  kept: VerifiedConvention[];
  dropped: Record<DropReason, number>;
  /** Candidates whose line the model got wrong and we moved to the real one. */
  lineCorrected: number;
}

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(ConventionCategory.options);

/** `./src/a.ts`, `/src/a.ts`, `` `src/a.ts:12` ``, `src/a.ts#L12-L14` → `src/a.ts`. */
export function normalizeEvidencePath(raw: string): string {
  let p = raw.trim().replace(/^[`'"]+|[`'"]+$/g, '').trim();
  p = p.replace(/\\/g, '/');
  p = p.replace(/#L\d+(-L?\d+)?$/i, '').replace(/:\d+(-\d+)?$/, '');
  p = p.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  return p;
}

function collapse(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** A gutter such as `  12| ` the model copied from the numbered listing along with the code. */
const GUTTER = /^\s*\d+\s*\|\s?/;

function snippetLines(snippet: string): string[] {
  let lines = snippet.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length > 0 && nonEmpty.every((l) => GUTTER.test(l))) {
    lines = lines.map((l) => l.replace(GUTTER, ''));
  }
  return lines.map(collapse).filter((l) => l !== '');
}

interface Match {
  /** 1-based first and last file line of the match. */
  start: number;
  end: number;
}

/**
 * All places where `needle` (collapsed, non-empty lines) occurs in the file's non-blank lines.
 * Blank lines are skipped on both sides, so a snippet that omits them still matches. A snippet
 * that is only part of one line matches by substring; on several lines the first may be the
 * tail of a file line and the last its head.
 */
function findMatches(fileLines: Array<{ no: number; text: string }>, needle: string[]): Match[] {
  const out: Match[] = [];
  if (needle.length === 0) return out;
  const last = needle.length - 1;
  for (let i = 0; i + last < fileLines.length; i++) {
    let ok = true;
    for (let j = 0; j <= last && ok; j++) {
      const have = fileLines[i + j]!.text;
      const want = needle[j]!;
      if (last === 0) ok = have.includes(want);
      else if (j === 0) ok = have === want || have.endsWith(want);
      else if (j === last) ok = have === want || have.startsWith(want);
      else ok = have === want;
    }
    if (ok) out.push({ start: fileLines[i]!.no, end: fileLines[i + last]!.no });
  }
  return out;
}

function clampConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0.5;
  // a model that answers on a 0-100 scale (85); 1.7 is just too high, not 1.7 %
  const v = raw >= 10 && raw <= 100 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, v));
}

/**
 * @param files path → full text of every file the model was shown (the only paths it may cite).
 */
export function verifyCandidates(
  candidates: RawConvention[],
  files: ReadonlyMap<string, string>,
): VerifyResult {
  const dropped: Record<DropReason, number> = {
    unknown_file: 0,
    snippet_not_found: 0,
    trivial_snippet: 0,
  };
  const kept: VerifiedConvention[] = [];
  let lineCorrected = 0;
  const parsed = new Map<string, { raw: string[]; nonBlank: Array<{ no: number; text: string }> }>();

  const linesOf = (path: string) => {
    let entry = parsed.get(path);
    if (!entry) {
      const raw = files.get(path)!.split(/\r?\n/);
      const nonBlank = raw
        .map((text, i) => ({ no: i + 1, text: collapse(text) }))
        .filter((l) => l.text !== '');
      entry = { raw, nonBlank };
      parsed.set(path, entry);
    }
    return entry;
  };

  for (const c of candidates) {
    const rule = c.rule.trim().slice(0, MAX_RULE_CHARS);
    if (rule === '') continue;

    const path = normalizeEvidencePath(c.evidence.file);
    if (!files.has(path)) {
      dropped.unknown_file++;
      continue;
    }

    const needle = snippetLines(c.evidence.snippet);
    if (needle.join('').replace(/\s/g, '').length < MIN_SNIPPET_CHARS) {
      dropped.trivial_snippet++;
      continue;
    }

    const file = linesOf(path);
    const matches = findMatches(file.nonBlank, needle);
    if (matches.length === 0) {
      dropped.snippet_not_found++;
      continue;
    }

    const claimed = Number.isFinite(c.evidence.line) ? Math.round(c.evidence.line) : 1;
    let best = matches[0]!;
    for (const m of matches) {
      if (Math.abs(m.start - claimed) < Math.abs(best.start - claimed)) best = m;
    }
    if (best.start !== claimed) lineCorrected++;

    const end = Math.min(best.end, best.start + MAX_EVIDENCE_LINES - 1);
    kept.push({
      category: KNOWN_CATEGORIES.has(c.category.trim()) ? c.category.trim() : 'other',
      rule,
      evidencePath: path,
      evidenceLine: best.start,
      evidenceEndLine: end,
      evidenceSnippet: file.raw.slice(best.start - 1, end).join('\n'),
      confidence: clampConfidence(c.confidence),
    });
  }

  return { kept, dropped, lineCorrected };
}
