import type { SkillImportPreview, SkillType } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_SKILL_TYPE,
  EXECUTABLE_DIRS,
  EXECUTABLE_EXT,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_TOTAL_BYTES,
  MAX_DESCRIPTION_CHARS,
  MAX_SKILL_BODY_CHARS,
  MAX_SKILL_FILE_BYTES,
} from './constants.js';
import type { ArchiveEntry, ArchiveReader } from './ports.js';

/**
 * Pure import logic: turn an uploaded `.md` or `.zip` into the core of a skill.
 * Only text is ever read. Archive entries other than the chosen markdown file are
 * reported as ignored and never decompressed, let alone run.
 */

export interface ImportInput {
  filename: string;
  bytes: Uint8Array;
}

interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

/** `key: value` lines only — no nesting, no lists. Enough for name / description / type. */
export function parseFrontmatter(text: string): Frontmatter {
  const m = FRONTMATTER.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    fields[line.slice(0, i).trim().toLowerCase()] = unquote(line.slice(i + 1));
  }
  return { fields, body: text.slice(m[0].length) };
}

function extOf(path: string): string {
  const base = path.split('/').pop() ?? '';
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
}

function isMarkdown(path: string): boolean {
  return extOf(path) === '.md';
}

function stripExt(filename: string): string {
  return filename.replace(/\.[^./]+$/, '');
}

function isExecutable(path: string): boolean {
  const parts = path.split('/');
  return (
    EXECUTABLE_EXT.has(extOf(path)) || parts.slice(0, -1).some((p) => EXECUTABLE_DIRS.has(p))
  );
}

function isUnsafePath(path: string): boolean {
  return path.startsWith('/') || /^[a-z]:/i.test(path) || path.split(/[\\/]/).includes('..');
}

function firstHeading(body: string): string | undefined {
  const m = /^#{1,6}\s+(.+)$/m.exec(body);
  return m?.[1]?.trim();
}

function firstParagraph(body: string): string | undefined {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith('#') && !line.startsWith('```')) return line;
  }
  return undefined;
}

function toPreview(sourceFile: string, text: string, ignored: SkillImportPreview['ignored_files']): SkillImportPreview {
  const { fields, body } = parseFrontmatter(text);
  const trimmedBody = body.trim();
  if (!trimmedBody) throw new ValidationError('The skill file is empty');
  if (trimmedBody.length > MAX_SKILL_BODY_CHARS) {
    throw new ValidationError(`The skill body is longer than ${MAX_SKILL_BODY_CHARS} characters`);
  }

  const name =
    fields.name?.trim() ||
    firstHeading(trimmedBody) ||
    stripExt(sourceFile.split('/').pop() ?? sourceFile);
  const description = (fields.description?.trim() || firstParagraph(trimmedBody) || name).slice(
    0,
    MAX_DESCRIPTION_CHARS,
  );
  const parsedType = SkillTypeSchema.safeParse(fields.type?.trim().toLowerCase());
  const type: SkillType = parsedType.success ? parsedType.data : DEFAULT_SKILL_TYPE;

  return {
    name: name.slice(0, 120),
    description,
    type,
    body: trimmedBody,
    source_file: sourceFile,
    ignored_files: ignored,
  };
}

/** `SKILL.md` at the root or one directory deep, else the only markdown file. */
function pickSkillFile(entries: ArchiveEntry[]): ArchiveEntry {
  const isSkillMd = (e: ArchiveEntry) => {
    const parts = e.path.split('/');
    return parts.length <= 2 && parts[parts.length - 1]!.toLowerCase() === 'skill.md';
  };
  const named = entries.filter(isSkillMd);
  if (named.length === 1) return named[0]!;
  if (named.length > 1) {
    throw new ValidationError('The archive has more than one SKILL.md', {
      files: named.map((e) => e.path),
    });
  }
  const markdown = entries.filter((e) => isMarkdown(e.path));
  if (markdown.length === 1) return markdown[0]!;
  throw new ValidationError(
    markdown.length === 0
      ? 'The archive has no markdown file (expected SKILL.md)'
      : 'The archive has several markdown files and no SKILL.md',
    { files: markdown.map((e) => e.path) },
  );
}

export function parseSkillImport(input: ImportInput, archive: ArchiveReader): SkillImportPreview {
  const ext = extOf(input.filename);

  if (ext === '.md') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
    return toPreview(input.filename, text, []);
  }

  if (ext !== '.zip') {
    throw new ValidationError('Only .md and .zip files can be imported', { filename: input.filename });
  }

  let entries: ArchiveEntry[];
  try {
    entries = archive.list(input.bytes);
  } catch {
    throw new ValidationError('The file is not a valid .zip archive');
  }
  entries = entries.filter((e) => !e.path.endsWith('/'));

  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new ValidationError(`The archive has more than ${MAX_ARCHIVE_ENTRIES} files`);
  }
  if (entries.reduce((sum, e) => sum + e.size, 0) > MAX_ARCHIVE_TOTAL_BYTES) {
    throw new ValidationError('The archive is too large once unpacked');
  }
  const unsafe = entries.find((e) => isUnsafePath(e.path));
  if (unsafe) throw new ValidationError('The archive contains an unsafe path', { path: unsafe.path });

  const chosen = pickSkillFile(entries);
  if (chosen.size > MAX_SKILL_FILE_BYTES) {
    throw new ValidationError('The skill file is too large');
  }

  const ignored = entries
    .filter((e) => e.path !== chosen.path)
    .map((e) => ({
      path: e.path,
      reason: isExecutable(e.path) ? ('executable' as const) : ('not_used' as const),
    }));

  let text: string;
  try {
    text = archive.readText(input.bytes, chosen.path, MAX_SKILL_FILE_BYTES);
  } catch {
    throw new ValidationError('The skill file could not be read from the archive');
  }
  return toPreview(chosen.path, text, ignored);
}
