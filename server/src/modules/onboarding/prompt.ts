import { wrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_EXCERPT_PROMPT_CHARS, MAX_RUN_FILE_PROMPT_CHARS, MIN_BLOCK_TOKENS, PROMPT_TOKEN_BUDGET } from './constants.js';

/**
 * Assembles the user message of a generation. Pure: text in, text out.
 *
 * Every piece of repository text — names, paths, the repo map, file contents — goes inside a
 * `wrapUntrusted` block, which escapes the closing marker. Labels are fixed strings plus an
 * index; a file's path travels inside its block, never in the label.
 */

export interface PromptFile {
  path: string;
  text: string;
}

export interface TourPromptInput {
  repoFullName: string;
  /** Language mix of the tracked files (see `summarizeTracked`). */
  stack: string;
  /** Top-level layout of the tracked files. */
  tree: string;
  repoMap: string;
  /** Ranked file paths, best first. */
  candidates: readonly string[];
  chains: readonly (readonly string[])[];
  /** README, manifests, compose and example env files, in priority order. */
  runFiles: readonly PromptFile[];
  /** Excerpts of the best-ranked source files. */
  excerpts: readonly PromptFile[];
}

export interface BuiltTourPrompt {
  prompt: string;
  /** Paths whose content is in the prompt (possibly clipped). */
  files: string[];
  tokens: number;
}

const CLIP_NOTE = '\n… (clipped)';

function clipToChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lineEnd = cut.lastIndexOf('\n');
  return (lineEnd > max / 2 ? cut.slice(0, lineEnd) : cut) + CLIP_NOTE;
}

/** Shrinks `text` until its wrapped block fits `room` tokens; null when it cannot. */
function fitBlock(
  label: string,
  heading: string,
  text: string,
  room: number,
  count: (text: string) => number,
): { block: string; tokens: number } | null {
  if (room < MIN_BLOCK_TOKENS) return null;
  let limit = text.length;
  for (let attempt = 0; attempt < 5; attempt++) {
    const body = limit >= text.length ? text : clipToChars(text, limit);
    const block = wrapUntrusted(label, `${heading}${body}`);
    const tokens = count(block);
    if (tokens <= room) return { block, tokens };
    limit = Math.floor(Math.min(limit, text.length) * (room / tokens) * 0.9);
    if (limit <= 0) return null;
  }
  return null;
}

export function buildTourPrompt(
  input: TourPromptInput,
  countTokens: (text: string) => number,
  budget: number = PROMPT_TOKEN_BUDGET,
): BuiltTourPrompt {
  const parts: string[] = [];
  const files: string[] = [];
  let used = 0;

  const add = (label: string, heading: string, text: string, path?: string): void => {
    if (text.trim() === '') return;
    const fit = fitBlock(label, heading, text, budget - used, countTokens);
    if (!fit) return;
    parts.push(fit.block);
    used += fit.tokens;
    if (path !== undefined) files.push(path);
  };

  parts.push('Write the onboarding tour for the repository in the blocks below.');
  used += countTokens(parts[0]!);

  add('repository', '', input.repoFullName);
  // 1. README, then manifests / compose / example env
  input.runFiles.forEach((f, i) =>
    add(`run-file-${i + 1}`, `path: ${f.path}\n`, clipToChars(f.text, MAX_RUN_FILE_PROMPT_CHARS), f.path),
  );
  // 2. stack, layout, repo map, candidates, chains
  add('stack', '', input.stack);
  add('layout', '', input.tree);
  add('repo-map', '', input.repoMap);
  add('candidate-files', '', input.candidates.join('\n'));
  add('dependency-chains', '', input.chains.map((c) => c.join(' -> ')).join('\n'));
  // 3. excerpts of the best files
  input.excerpts.forEach((f, i) =>
    add(`excerpt-${i + 1}`, `path: ${f.path}\n`, clipToChars(f.text, MAX_EXCERPT_PROMPT_CHARS), f.path),
  );

  return { prompt: parts.join('\n\n'), files, tokens: used };
}
