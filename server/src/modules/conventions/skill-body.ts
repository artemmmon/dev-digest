import type { ConventionSkillDraft } from '@devdigest/shared';
import {
  CATEGORY_ORDER,
  DEFAULT_SKILL_NAME,
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_SNIPPET_LINES,
} from './constants.js';

/** Turns accepted conventions into a skill draft. Pure: the caller decides what to save. */

export interface SkillDraftRule {
  category: string;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence?: number;
}

const CATEGORY_TITLES: Record<string, string> = {
  'error-handling': 'Error handling',
  api: 'API',
};

export function categoryTitle(category: string): string {
  return (
    CATEGORY_TITLES[category] ?? category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ')
  );
}

/** Unique, sorted evidence paths — what `skills.evidence_files` stores. */
export function evidenceFilesOf(rules: ReadonlyArray<Pick<SkillDraftRule, 'evidencePath'>>): string[] {
  return [...new Set(rules.map((r) => r.evidencePath))].sort();
}

/** A code fence longer than any backtick run inside the snippet, so the snippet cannot close it. */
function fenceFor(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function languageOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

function trimSnippet(snippet: string): string[] {
  const lines = snippet.replace(/\s+$/, '').split(/\r?\n/);
  // drop the common indentation so a nested snippet does not drift right
  const indents = lines.filter((l) => l.trim() !== '').map((l) => /^[ \t]*/.exec(l)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.slice(0, MAX_SKILL_SNIPPET_LINES).map((l) => l.slice(cut).replace(/\s+$/, ''));
}

function ruleBlock(r: SkillDraftRule): string {
  const snippet = trimSnippet(r.evidenceSnippet);
  const text = snippet.join('\n');
  const fence = fenceFor(text);
  const lines = [
    `- ${r.rule.replace(/\s*\n\s*/g, ' ').trim()}`,
    `  Evidence: \`${r.evidencePath}:${r.evidenceLine}\``,
    `  ${fence}${languageOf(r.evidencePath)}`,
    ...snippet.map((l) => `  ${l}`.trimEnd()),
    `  ${fence}`,
  ];
  return lines.join('\n');
}

function describe(repoFullName: string, categories: string[]): string {
  const areas = categories.map((c) => categoryTitle(c).toLowerCase()).join(', ');
  const text =
    `Use when writing or reviewing code in ${repoFullName} to check it follows the conventions this repo already uses` +
    (areas ? ` (${areas})` : '') +
    '. Do NOT apply to generated or vendored files (lockfiles, build output, *.g.dart, node_modules) or to code outside ' +
    `${repoFullName}.`;
  return text.length <= MAX_SKILL_DESCRIPTION_CHARS
    ? text
    : `${text.slice(0, MAX_SKILL_DESCRIPTION_CHARS - 1).trimEnd()}…`;
}

/** Group by category in a fixed order; inside a group, highest confidence first. */
export function buildSkillDraft(
  repoFullName: string,
  rules: readonly SkillDraftRule[],
): ConventionSkillDraft {
  const known = new Set<string>(CATEGORY_ORDER);
  const order = [...CATEGORY_ORDER, ...new Set(rules.map((r) => r.category).filter((c) => !known.has(c)))];
  const sections: string[] = [];
  const used: string[] = [];
  for (const category of order) {
    const inCategory = rules
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.category === category)
      .sort((a, b) => (b.r.confidence ?? 0) - (a.r.confidence ?? 0) || a.i - b.i)
      .map((x) => x.r);
    if (inCategory.length === 0) continue;
    used.push(category);
    sections.push(`## ${categoryTitle(category)}\n\n${inCategory.map(ruleBlock).join('\n\n')}`);
  }

  const body = [
    `# Conventions — ${repoFullName}`,
    'Rules this repository already follows, each confirmed by a reviewer and backed by code that exists in the repo.',
    [
      '## How to apply',
      '',
      '- Compare the changed code with the rules below and flag a clear deviation, naming the rule it breaks.',
      '- A rule describes the dominant pattern, not a law: do not flag untouched legacy code or a justified exception.',
      '- Skip generated and vendored files.',
    ].join('\n'),
    ...sections,
  ].join('\n\n');

  return {
    name: DEFAULT_SKILL_NAME,
    description: describe(repoFullName, used),
    type: 'convention',
    body: `${body}\n`,
    evidence_files: evidenceFilesOf(rules),
  };
}
