import {
  MAX_CONFIG_PROMPT_CHARS,
  MAX_SAMPLE_PROMPT_CHARS,
  PROMPT_CHAR_BUDGET,
} from './constants.js';
import { clipToChars, numberLines } from './sampling.js';

/** Assembles the user message of a scan. Pure: text in, text out. */

export interface PromptFile {
  path: string;
  text: string;
}

export interface PromptInput {
  repoFullName: string;
  tree: string;
  /** Root-most first; already summarised (see `summarizePackageJson`). */
  packages: Array<{ path: string; summary: string }>;
  configs: PromptFile[];
  samples: PromptFile[];
}

export interface BuiltPrompt {
  prompt: string;
  /** Files whose numbered text is in the prompt — the only ones the model may cite. */
  configs: string[];
  samples: string[];
}

const MIN_USEFUL_CHARS = 1_500;
const PACKAGE_SUMMARY_CHARS = 2_000;

/** The file text is data; a stray closing tag in it must not end the block early. */
function escapeBlock(text: string): string {
  return text.replace(/<\/file>/gi, '<\\/file>');
}

/** The block counts the line-number gutter and the tags against `limit`, not just the file text. */
function fileBlock(path: string, text: string, maxChars: number, room: number): string | null {
  const limit = Math.min(maxChars, room);
  if (limit < MIN_USEFUL_CHARS && text.length > limit) return null;
  let clipAt = Math.min(limit, text.length);
  for (let attempt = 0; attempt < 5 && clipAt > 0; attempt++) {
    const clipped = clipToChars(text, clipAt);
    const note = clipped.truncated > 0 ? `\n… (${clipped.truncated} more lines not shown)` : '';
    const block = `<file path="${path}">\n${escapeBlock(numberLines(clipped.text))}${note}\n</file>`;
    if (block.length <= limit) return block;
    clipAt = Math.min(clipAt, clipped.text.length) - (block.length - limit) - 1;
  }
  return null;
}

export function buildUserPrompt(input: PromptInput, budget = PROMPT_CHAR_BUDGET): BuiltPrompt {
  const parts: string[] = [`Repository: ${input.repoFullName}`, `Layout:\n${input.tree}`];
  let used = parts.join('\n\n').length;

  const packageText = input.packages
    .map((p) => `${p.path}\n${p.summary.slice(0, PACKAGE_SUMMARY_CHARS)}`)
    .join('\n\n');
  if (packageText) {
    const section = `Package manifests (summarised):\n${packageText}`;
    parts.push(section);
    used += section.length;
  }

  const configs: string[] = [];
  const samples: string[] = [];
  const add = (files: PromptFile[], maxChars: number, included: string[], title: string) => {
    const blocks: string[] = [];
    for (const f of files) {
      const room = budget - used - 2;
      if (room <= 0) break;
      const block = fileBlock(f.path, f.text, maxChars, room);
      if (!block) continue;
      blocks.push(block);
      included.push(f.path);
      used += block.length + 2;
    }
    if (blocks.length) parts.push(`${title}\n\n${blocks.join('\n\n')}`);
  };
  add(input.configs, MAX_CONFIG_PROMPT_CHARS, configs, 'Config files (numbered lines):');
  add(input.samples, MAX_SAMPLE_PROMPT_CHARS, samples, 'Source files (numbered lines):');
  return { prompt: parts.join('\n\n'), configs, samples };
}
