import { DUPLICATE_SIMILARITY, MAX_PER_CATEGORY, MAX_TOTAL } from './constants.js';
import type { DedupDropReason, VerifiedConvention } from './domain.js';

/**
 * Trim a verified batch to what is worth showing: near-duplicates go (the higher-confidence
 * one stays), rules a reviewer already accepted or rejected are never suggested again, and
 * each category and the whole list are capped.
 */

export interface DedupResult {
  kept: VerifiedConvention[];
  dropped: Record<DedupDropReason, number>;
}

export interface DedupOptions {
  perCategory?: number;
  total?: number;
  similarity?: number;
}

/** Lower-cased word set of a rule; punctuation and case do not matter. */
export function ruleWords(rule: string): Set<string> {
  return new Set(rule.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w !== ''));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

export function dedupeCandidates(
  candidates: VerifiedConvention[],
  decidedRules: string[],
  opts: DedupOptions = {},
): DedupResult {
  const perCategory = opts.perCategory ?? MAX_PER_CATEGORY;
  const total = opts.total ?? MAX_TOTAL;
  const similarity = opts.similarity ?? DUPLICATE_SIMILARITY;
  const dropped: Record<DedupDropReason, number> = { duplicate: 0, known_decision: 0, category_cap: 0 };

  const decided = decidedRules.map(ruleWords);
  // stable: equal confidence keeps the model's order
  const ordered = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.confidence - a.c.confidence || a.i - b.i)
    .map((x) => x.c);

  const kept: Array<{ c: VerifiedConvention; words: Set<string> }> = [];
  const perCat = new Map<string, number>();
  for (const c of ordered) {
    const words = ruleWords(c.rule);
    if (decided.some((d) => jaccard(words, d) >= similarity)) {
      dropped.known_decision++;
      continue;
    }
    if (kept.some((k) => jaccard(words, k.words) >= similarity)) {
      dropped.duplicate++;
      continue;
    }
    if (kept.length >= total || (perCat.get(c.category) ?? 0) >= perCategory) {
      dropped.category_cap++;
      continue;
    }
    perCat.set(c.category, (perCat.get(c.category) ?? 0) + 1);
    kept.push({ c, words });
  }
  return { kept: kept.map((k) => k.c), dropped };
}
