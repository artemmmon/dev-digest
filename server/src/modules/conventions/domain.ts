import { z } from 'zod';

/**
 * What the model returns for one scan. Kept strict-json-safe (structured-output modes reject
 * anything else): every field required, no optional / default, no numeric min / max, plain
 * strings for category. Ranges, the category list and lengths are enforced in code (verify.ts).
 * Field order matters: the model writes the category and rule before the evidence it cites.
 */
export const ConventionExtraction = z.object({
  conventions: z.array(
    z.object({
      category: z.string(),
      rule: z.string(),
      evidence: z.object({
        file: z.string(),
        line: z.number(),
        snippet: z.string(),
      }),
      confidence: z.number(),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
export type RawConvention = ConventionExtraction['conventions'][number];

/** A candidate whose evidence was checked against the real file. */
export interface VerifiedConvention {
  category: string;
  rule: string;
  evidencePath: string;
  /** 1-based, first line of the evidence in the file. */
  evidenceLine: number;
  /** 1-based, last line of the evidence (>= evidenceLine). */
  evidenceEndLine: number;
  /** Sliced from the file, never the model's text. */
  evidenceSnippet: string;
  /** Clamped to [0, 1]. */
  confidence: number;
}

/** Why a candidate was dropped by the evidence gate. */
export type DropReason = 'unknown_file' | 'snippet_not_found' | 'trivial_snippet';

export type DedupDropReason = 'duplicate' | 'known_decision' | 'category_cap';

export interface DropCounts {
  unknown_file: number;
  snippet_not_found: number;
  trivial_snippet: number;
  duplicate: number;
  known_decision: number;
  category_cap: number;
}
