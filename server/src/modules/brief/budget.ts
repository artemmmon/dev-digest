import type { BriefMissing } from '@devdigest/shared';
import { BRIEF_BUDGET } from './constants.js';
import { capInputs, renderBriefPrompt, type BriefFileRow, type BriefInputs } from './prompt.js';

/**
 * Fit the brief request into the input budget (spec AC-29, AC-34 – AC-38). Pure: the
 * token counter comes in as a parameter (application code never imports the tokenizer).
 * Linear — at most about 60 counts: the documents, five whole inputs, then the file rows.
 */

export interface FitResult {
  inputs: BriefInputs;
  /** Which `*_trimmed` (and, as a last resort, `blast` / `intent`) values apply. */
  missing: BriefMissing[];
  /** The counted tokens of system text plus user message; at most the budget unless the system text alone is over it. */
  tokens: number;
}

const changed = (f: BriefFileRow) => f.additions + f.deletions;

/** Most changed lines first, then path ascending — the order the "top files" are chosen in. */
function rank(a: BriefFileRow, b: BriefFileRow): number {
  return changed(b) - changed(a) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Documents whole, in candidate order, under the documents' token share. */
function pickDocuments(docs: BriefInputs['documents']): { kept: BriefInputs['documents']; trimmed: boolean } {
  const kept: BriefInputs['documents'] = [];
  let used = 0;
  let trimmed = false;
  for (const doc of docs) {
    if (used + doc.tokens > BRIEF_BUDGET.documentTokens) {
      trimmed = true;
      continue;
    }
    used += doc.tokens;
    kept.push(doc);
  }
  return { kept, trimmed };
}

export function fitToBudget(
  raw: BriefInputs,
  systemText: string,
  count: (text: string) => number,
): FitResult {
  const missing = new Set<BriefMissing>();
  let cur = capInputs(raw);

  const picked = pickDocuments(cur.documents);
  if (picked.trimmed) missing.add('specs_trimmed');
  cur = { ...cur, documents: picked.kept };

  const measure = () => count(`${systemText}\n\n${renderBriefPrompt(cur)}`);
  let tokens = measure();
  const over = () => tokens > BRIEF_BUDGET.requestTokens;
  /** Apply one removal and recount. */
  const apply = (next: BriefInputs, value: BriefMissing) => {
    cur = next;
    missing.add(value);
    tokens = measure();
  };

  // 1. Documents, last to first.
  while (over() && cur.documents.length > 0) {
    apply({ ...cur, documents: cur.documents.slice(0, -1) }, 'specs_trimmed');
  }
  // 2. The linked issue.
  if (over() && cur.issue) apply({ ...cur, issue: undefined }, 'issue_trimmed');
  // 3. The description.
  if (over() && cur.description) apply({ ...cur, description: undefined }, 'description_trimmed');
  // 4. The blast callers.
  if (over() && cur.blast && cur.blast.callers.length > 0) {
    apply({ ...cur, blast: { ...cur.blast, callers: [] } }, 'callers_trimmed');
  }
  // 5. Every hunk header.
  if (over() && cur.files.some((f) => f.headers.length > 0)) {
    apply({ ...cur, files: cur.files.map((f) => ({ ...f, headers: [] })) }, 'hunks_trimmed');
  }
  // 6. File rows outside the top 50 by changed lines.
  if (over() && cur.files.length > BRIEF_BUDGET.topFiles) {
    const keep = new Set(
      [...cur.files].sort(rank).slice(0, BRIEF_BUDGET.topFiles).map((f) => f.path),
    );
    apply({ ...cur, files: cur.files.filter((f) => keep.has(f.path)) }, 'files_trimmed');
  }
  // 7. One file row at a time, fewest changed lines first.
  while (over() && cur.files.length > 0) {
    const last = [...cur.files].sort(rank).at(-1);
    const drop = cur.files.indexOf(last!);
    apply({ ...cur, files: cur.files.filter((_, i) => i !== drop) }, 'files_trimmed');
  }
  // Last resort, only with every file row gone: the blast, then the intent, whole.
  if (over() && cur.blast) apply({ ...cur, blast: undefined }, 'blast');
  if (over() && cur.intent) apply({ ...cur, intent: undefined }, 'intent');

  return { inputs: cur, missing: [...missing], tokens };
}
