import type { SmartDiffRole } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { BRIEF_BUDGET, BRIEF_INPUT_CAPS } from './constants.js';

/**
 * The brief's user message. Facts only — hunk bodies never enter `BriefInputs`.
 * Every repo-, PR-, issue- or intent-derived string (paths and symbol names included)
 * is the CONTENT of a `wrapUntrusted` block; the block labels are fixed literals, so no
 * untrusted value ever lands in a header or an attribute. Each section is optional and
 * leaves no text when absent. Pure: no I/O, no tokenizer.
 */

export interface BriefFileRow {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  /** `@@ … @@` header lines only, at most 5, each cut to 120 chars. */
  headers: string[];
}

export interface BriefIntentInput {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  /** Labels of the intent's risk signals. */
  risk_labels: string[];
}

export interface BriefBlastInput {
  summary: string;
  symbols: { name: string; file: string; kind: string }[];
  callers: { symbol: string; name: string; file: string; line: number }[];
  endpoints: string[];
  crons: string[];
}

export interface BriefDocumentInput {
  path: string;
  text: string;
  tokens: number;
}

export interface BriefInputs {
  title: string;
  description?: string;
  intent?: BriefIntentInput;
  blast?: BriefBlastInput;
  files: BriefFileRow[];
  /** The linked issue's title and body as one text. */
  issue?: string;
  documents: BriefDocumentInput[];
}

const C = BRIEF_INPUT_CAPS;

const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);
const cutName = (text: string) => cut(text, C.nameChars);

/**
 * Apply the caps on inputs the budget cannot remove, plus the per-input character caps
 * of the spec (description, issue). Idempotent; returns a new value.
 */
export function capInputs(inputs: BriefInputs): BriefInputs {
  const description = inputs.description?.trim();
  const issue = inputs.issue?.trim();
  const { intent, blast } = inputs;
  return {
    title: cut(inputs.title, C.titleChars),
    description: description ? cut(description, BRIEF_BUDGET.descriptionChars) : undefined,
    intent: intent
      ? {
          summary: cut(intent.summary, C.intentSummaryChars),
          in_scope: intent.in_scope.slice(0, C.maxIntentItems).map((s) => cut(s, C.intentItemChars)),
          out_of_scope: intent.out_of_scope
            .slice(0, C.maxIntentItems)
            .map((s) => cut(s, C.intentItemChars)),
          risk_labels: intent.risk_labels
            .slice(0, C.maxIntentLabels)
            .map((s) => cut(s, C.intentLabelChars)),
        }
      : undefined,
    blast: blast
      ? {
          summary: cut(blast.summary, C.blastSummaryChars),
          symbols: blast.symbols.slice(0, C.maxChangedSymbols).map((s) => ({
            name: cutName(s.name),
            file: cutName(s.file),
            kind: cutName(s.kind),
          })),
          callers: blast.callers.map((c) => ({
            symbol: cutName(c.symbol),
            name: cutName(c.name),
            file: cutName(c.file),
            line: c.line,
          })),
          endpoints: blast.endpoints.slice(0, C.maxEndpoints).map(cutName),
          crons: blast.crons.slice(0, C.maxCrons).map(cutName),
        }
      : undefined,
    files: inputs.files.map((f) => ({ ...f, path: cutName(f.path) })),
    issue: issue ? cut(issue, BRIEF_BUDGET.issueChars) : undefined,
    documents: inputs.documents.map((d) => ({ ...d, path: cutName(d.path) })),
  };
}

function section(heading: string, body: string): string {
  return `## ${heading}\n${body}`;
}

function intentText(intent: BriefIntentInput): string {
  const lines = [`Summary: ${intent.summary}`];
  if (intent.in_scope.length > 0) lines.push('In scope:', ...intent.in_scope.map((s) => `- ${s}`));
  if (intent.out_of_scope.length > 0) {
    lines.push('Out of scope:', ...intent.out_of_scope.map((s) => `- ${s}`));
  }
  if (intent.risk_labels.length > 0) {
    lines.push('Risk signals:', ...intent.risk_labels.map((s) => `- ${s}`));
  }
  return lines.join('\n');
}

function blastText(blast: BriefBlastInput): string {
  const lines: string[] = [];
  if (blast.summary) lines.push(`Summary: ${blast.summary}`);
  if (blast.symbols.length > 0) {
    lines.push('Changed symbols:', ...blast.symbols.map((s) => `- ${s.name} (${s.kind}) in ${s.file}`));
  }
  if (blast.callers.length > 0) {
    lines.push(
      'Callers:',
      ...blast.callers.map((c) => `- ${c.name} in ${c.file}:${c.line} calls ${c.symbol}`),
    );
  }
  if (blast.endpoints.length > 0) lines.push('Endpoints affected:', ...blast.endpoints.map((e) => `- ${e}`));
  if (blast.crons.length > 0) lines.push('Cron jobs affected:', ...blast.crons.map((e) => `- ${e}`));
  return lines.join('\n');
}

function filesText(files: BriefFileRow[]): string {
  return files
    .map((f) => {
      const row = `${f.path} | +${f.additions} -${f.deletions} | ${f.role}`;
      return f.headers.length > 0 ? [row, ...f.headers.map((h) => `  ${h}`)].join('\n') : row;
    })
    .join('\n');
}

/** Render the user message from (capped) inputs. */
export function renderBriefPrompt(raw: BriefInputs): string {
  const inputs = capInputs(raw);
  const parts: string[] = [section('Pull request', wrapUntrusted('title', inputs.title))];
  if (inputs.description) {
    parts.push(section('Description', wrapUntrusted('description', inputs.description)));
  }
  if (inputs.intent) parts.push(section('Intent', wrapUntrusted('intent', intentText(inputs.intent))));
  if (inputs.blast) {
    const text = blastText(inputs.blast);
    if (text) parts.push(section('Blast radius', wrapUntrusted('blast', text)));
  }
  if (inputs.files.length > 0) {
    parts.push(section('Changed files', wrapUntrusted('files', filesText(inputs.files))));
  }
  if (inputs.issue) parts.push(section('Linked issue', wrapUntrusted('issue', inputs.issue)));
  if (inputs.documents.length > 0) {
    parts.push(
      section(
        'Project documents',
        inputs.documents
          .map((d, i) => wrapUntrusted(`document-${i + 1}`, `${d.path}\n\n${d.text}`))
          .join('\n'),
      ),
    );
  }
  return parts.join('\n\n');
}
