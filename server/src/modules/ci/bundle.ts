import { createHash } from 'node:crypto';
import type { CiFile } from '@devdigest/shared';
import {
  AGENTS_DIR,
  MEMORY_PATH,
  RUNNER_DIR,
  SKILLS_DIR,
  WORKFLOW_PATH,
} from './constants.js';

export interface BundleInput {
  /** Slug of the agent: the manifest is `.devdigest/agents/<slug>.yaml`. */
  agentSlug: string;
  manifest: string;
  /** Enabled bound skills in binding order, each with its unique slug. */
  skills: Array<{ slug: string; body: string }>;
  memory: string;
  runnerFiles: Array<{ name: string; bytes: Uint8Array }>;
  workflow: string;
}

/** A file ready to commit or zip: the preview shape plus the raw bytes. */
export type BundleFile = CiFile & { data: Uint8Array };

const encoder = new TextEncoder();

function file(path: string, data: Uint8Array, text: string | null, editable = false): BundleFile {
  return {
    path,
    contents: text,
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
    editable,
    data,
  };
}

/**
 * Every file of the export, in the order of AC-13: the manifest, one file per skill,
 * the memory file, the runner files, then the workflow. Only the workflow is editable.
 */
export function assembleFiles(input: BundleInput): BundleFile[] {
  const text = (path: string, contents: string, editable = false) =>
    file(path, encoder.encode(contents), contents, editable);
  return [
    text(`${AGENTS_DIR}${input.agentSlug}.yaml`, input.manifest),
    ...input.skills.map((s) => text(`${SKILLS_DIR}${s.slug}.md`, s.body)),
    text(MEMORY_PATH, input.memory),
    ...input.runnerFiles.map((r) => file(`${RUNNER_DIR}${r.name}`, r.bytes, null)),
    text(WORKFLOW_PATH, input.workflow, true),
  ];
}

/** The wire shape: runner files show their size and hash in place of their contents (AC-15). */
export function toPreviewFiles(files: BundleFile[]): CiFile[] {
  return files.map(({ data: _data, ...rest }) => ({
    ...rest,
    contents: rest.path.startsWith(RUNNER_DIR) ? null : rest.contents,
  }));
}
