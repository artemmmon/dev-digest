import type { IntentSource, IntentSourceKind, IntentSourceStatus } from '@devdigest/shared';
import { INTENT_LIMITS } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { FileHunkHeaders } from './hunks.js';
import type { PromptHunk } from './domain.js';

/**
 * The classifier's user prompt (section 5): a header table for every source,
 * then one `wrapUntrusted` block per `used` source, then a fenced `files`
 * section (paths + hunk headers, D11 — no diff bodies, ever). Sources that
 * are not `used` appear ONLY in the header. Never touches the network.
 */

/**
 * One classifier input, already fetched/capped by the service. `text` is
 * present only for `used` sources — it is fenced into the prompt and NEVER
 * persisted (the stored `sources[]` keeps metadata only, section 3).
 */
export interface ClassifierSource {
  id: string;
  kind: IntentSourceKind;
  ref: string;
  status: IntentSourceStatus;
  via?: IntentSource['via'];
  text?: string;
  /** Set by the caller when a PER-SOURCE cap already cut this source's text. */
  truncated?: boolean;
}

export interface PromptSection {
  label: string;
  chars: number;
}

export interface IntentPromptResult {
  /** The full user-message text. */
  user: string;
  /** Size breakdown for the Live Log (section 7). */
  sections: PromptSection[];
  /** Final per-source metadata (chars actually sent, truncated flag) for persistence. */
  sources: IntentSource[];
  /** Every hunk id that made it into the prompt → its path and header. */
  hunks: Map<string, PromptHunk>;
}

interface WorkingSource extends ClassifierSource {
  /** Whether this source's block still renders after total-budget trimming. */
  included: boolean;
}

function headerRow(n: number, s: WorkingSource): string {
  const via = s.via ? ` via=${s.via}` : '';
  return `S${n}: ${s.kind} · ${s.ref} · ${s.status}${via}`;
}

/** Number every hunk header globally (`H1`…) so the classifier can cite it. */
function numberHunks(files: FileHunkHeaders[]): PromptHunk[] {
  const hunks: PromptHunk[] = [];
  for (const f of files) {
    for (const header of f.headers) hunks.push({ id: `H${hunks.length + 1}`, path: f.path, header });
  }
  return hunks;
}

function filesSectionText(files: FileHunkHeaders[], hunks: PromptHunk[]): string {
  return files
    .filter((f) => f.headers.length > 0)
    .map((f) => {
      const lines = hunks.filter((h) => h.path === f.path).map((h) => `  ${h.id} ${h.header}`);
      return `${f.path}\n${lines.join('\n')}`;
    })
    .join('\n');
}

function totalChars(header: string, working: WorkingSource[], filesText: string): number {
  const used = working
    .filter((s) => s.included && s.text)
    .reduce((sum, s) => sum + s.text!.length, 0);
  const files = filesText.length > 0 ? filesText.length + 10 : 0;
  return header.length + used + files;
}

/**
 * Build the classifier prompt. Trims the LEAST important content first when
 * over `INTENT_LIMITS.promptTotalChars` — hunk headers, then docs, then
 * issues (section 5); title and body (never in this list) are never dropped.
 */
export function buildIntentPrompt(
  sources: ClassifierSource[],
  files: FileHunkHeaders[],
): IntentPromptResult {
  const working: WorkingSource[] = sources.map((s) => ({
    ...s,
    included: s.status === 'used' && Boolean(s.text),
  }));
  const numbered = numberHunks(files);
  const fullFilesText = filesSectionText(files, numbered);
  let filesText = fullFilesText;

  const header = () => working.map((s, i) => headerRow(i + 1, s)).join('\n');

  // Trim order: files/hunk-headers first (shrink by half repeatedly), then
  // docs (drop one at a time, largest last-added first), then issues.
  const docs = working.filter((s) => s.kind === 'doc' && s.included);
  const issues = working.filter((s) => s.kind === 'issue' && s.included);

  while (totalChars(header(), working, filesText) > INTENT_LIMITS.promptTotalChars) {
    if (filesText.length > 0) {
      filesText = filesText.slice(0, Math.floor(filesText.length / 2));
      continue;
    }
    const doc = docs.pop();
    if (doc) {
      doc.included = false;
      doc.truncated = true;
      continue;
    }
    const issue = issues.pop();
    if (issue) {
      issue.included = false;
      issue.truncated = true;
      continue;
    }
    break; // nothing left to trim (title/body only) — accept over-budget
  }

  const headerTable = header();
  const blocks = working
    .map((s, i) => (s.included && s.text ? wrapUntrusted(`S${i + 1}:${s.kind}`, s.text) : null))
    .filter((b): b is string => b !== null);
  const filesBlock = filesText.length > 0 ? `## files\n${wrapUntrusted('files', filesText)}` : '';

  const userParts = [`## sources\n${headerTable}`, ...blocks];
  if (filesBlock) userParts.push(filesBlock);

  const sections: PromptSection[] = [
    { label: 'header', chars: headerTable.length },
    ...working
      .filter((s) => s.included && s.text)
      .map((s) => ({ label: `${s.kind}:${s.ref}`, chars: s.text!.length })),
    { label: 'files', chars: filesText.length },
  ];

  const resultSources: IntentSource[] = working.map((s) => ({
    id: s.id,
    kind: s.kind,
    ref: s.ref,
    status: s.status,
    via: s.via,
    chars: s.included ? s.text?.length : undefined,
    truncated: s.truncated,
  }));

  // `files` is its own fenced section (not one of the numbered S1..Sn blocks),
  // but section 1 still lists it as a source (S-files) — record it for
  // persistence/observability, omitted entirely when there is nothing to show.
  if (filesText.length > 0) {
    resultSources.push({
      id: 'files',
      kind: 'files',
      ref: 'files',
      status: 'used',
      chars: filesText.length,
      truncated: filesText.length < fullFilesText.length,
    });
  }

  // Only hunks whose id survived the files-section trim can be cited back.
  const hunks = new Map(
    numbered.filter((h) => filesText.includes(`  ${h.id} `)).map((h) => [h.id, h] as const),
  );

  return { user: userParts.join('\n\n'), sections, sources: resultSources, hunks };
}
