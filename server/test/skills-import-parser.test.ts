import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { FflateZipReader } from '../src/adapters/archive/zip.js';
import { parseFrontmatter, parseSkillImport } from '../src/modules/skills/import-parser.js';

/** The import parser against the real in-memory zip reader — no disk, nothing executed. */

const archive = new FflateZipReader();
const md = (text: string) => strToU8(text);
const preview = (filename: string, bytes: Uint8Array) => parseSkillImport({ filename, bytes }, archive);

const SKILL = `---
name: boundary-cases
description: "Use when reviewing tests: flag missing edges."
type: rubric
---

# Boundary cases

Check the edges.
`;

describe('parseFrontmatter', () => {
  it('reads key: value lines, unquotes, and returns the rest as the body', () => {
    const { fields, body } = parseFrontmatter(SKILL);
    expect(fields).toEqual({
      name: 'boundary-cases',
      description: 'Use when reviewing tests: flag missing edges.',
      type: 'rubric',
    });
    expect(body.trim().startsWith('# Boundary cases')).toBe(true);
  });

  it('treats a file without frontmatter as all body', () => {
    expect(parseFrontmatter('# Hi\ntext')).toEqual({ fields: {}, body: '# Hi\ntext' });
  });
});

describe('parseSkillImport — .md', () => {
  it('takes name, description and type from the frontmatter', () => {
    const p = preview('boundary-cases.md', md(SKILL));
    expect(p).toMatchObject({
      name: 'boundary-cases',
      description: 'Use when reviewing tests: flag missing edges.',
      type: 'rubric',
      source_file: 'boundary-cases.md',
      ignored_files: [],
    });
    expect(p.body).not.toContain('---');
  });

  it('falls back to the heading, the first paragraph and the custom type', () => {
    const p = preview('notes.md', md('# Naming rules\n\nUse kebab-case for files.\n'));
    expect(p).toMatchObject({
      name: 'Naming rules',
      description: 'Use kebab-case for files.',
      type: 'custom',
    });
  });

  it('uses the file name when there is no heading, and an unknown type becomes custom', () => {
    const p = preview('style.md', md('---\ntype: whatever\n---\nJust text.'));
    expect(p.name).toBe('style');
    expect(p.type).toBe('custom');
  });

  it('rejects an empty body', () => {
    expect(() => preview('a.md', md('---\nname: x\n---\n'))).toThrow(/empty/);
  });

  it('rejects other file types', () => {
    expect(() => preview('a.txt', md('hi'))).toThrow(/\.md and \.zip/);
    expect(() => preview('a.tar.gz', md('hi'))).toThrow(/\.md and \.zip/);
  });
});

describe('parseSkillImport — .zip', () => {
  it('reads SKILL.md and lists scripts as executable and the rest as not used', () => {
    const zip = zipSync({
      'boundary-cases/SKILL.md': md(SKILL),
      'boundary-cases/scripts/check.sh': md('#!/bin/sh\nrm -rf /\n'),
      'boundary-cases/tools/run.py': md('print(1)'),
      'boundary-cases/notes.txt': md('hello'),
      'boundary-cases/assets/logo.png': new Uint8Array([1, 2, 3]),
    });
    const p = preview('boundary-cases.zip', zip);
    expect(p.name).toBe('boundary-cases');
    expect(p.source_file).toBe('boundary-cases/SKILL.md');
    expect(Object.fromEntries(p.ignored_files.map((f) => [f.path, f.reason]))).toEqual({
      'boundary-cases/scripts/check.sh': 'executable',
      'boundary-cases/tools/run.py': 'executable',
      'boundary-cases/notes.txt': 'not_used',
      'boundary-cases/assets/logo.png': 'not_used',
    });
    // the script text never reaches the preview
    expect(JSON.stringify(p)).not.toContain('rm -rf');
  });

  it('accepts SKILL.md at the archive root', () => {
    expect(preview('s.zip', zipSync({ 'SKILL.md': md(SKILL) })).name).toBe('boundary-cases');
  });

  it('takes the only markdown file when there is no SKILL.md', () => {
    const p = preview('s.zip', zipSync({ 'docs/rules.md': md('# Rules\n\nBe kind.') }));
    expect(p.source_file).toBe('docs/rules.md');
  });

  it('rejects an archive with several markdown files and no SKILL.md', () => {
    expect(() =>
      preview('s.zip', zipSync({ 'a.md': md('# A\nx'), 'b.md': md('# B\ny') })),
    ).toThrow(/several markdown/);
  });

  it('rejects an archive with no markdown file', () => {
    expect(() => preview('s.zip', zipSync({ 'run.sh': md('echo') }))).toThrow(/no markdown/);
  });

  it('rejects more than one SKILL.md', () => {
    expect(() =>
      preview('s.zip', zipSync({ 'a/SKILL.md': md('# A\nx'), 'b/SKILL.md': md('# B\ny') })),
    ).toThrow(/more than one SKILL\.md/);
  });

  it('rejects a path that climbs out of the archive', () => {
    expect(() =>
      preview('s.zip', zipSync({ '../evil/SKILL.md': md(SKILL) })),
    ).toThrow(/unsafe path/);
  });

  it('rejects too many entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': md(SKILL) };
    for (let i = 0; i < 200; i++) files[`f${i}.txt`] = md('x');
    expect(() => preview('s.zip', zipSync(files))).toThrow(/more than 200/);
  });

  it('rejects an archive that declares too much once unpacked (zip bomb)', () => {
    const big = new Uint8Array(11 * 1024 * 1024); // compresses to a few KB
    const zip = zipSync({ 'SKILL.md': md(SKILL), 'blob.bin': big });
    expect(zip.byteLength).toBeLessThan(100_000);
    expect(() => preview('s.zip', zip)).toThrow(/too large once unpacked/);
  });

  it('rejects an oversized skill file', () => {
    const zip = zipSync({ 'SKILL.md': new Uint8Array(1024 * 1024 + 1).fill(97) });
    expect(() => preview('s.zip', zip)).toThrow(/too large/);
  });

  it('rejects bytes that are not a zip', () => {
    expect(() => preview('s.zip', md('not a zip at all'))).toThrow(/not a valid \.zip/);
  });
});
