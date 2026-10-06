import { describe, it, expect } from 'vitest';
import { Tour } from '@devdigest/shared';
import type { TourDraft } from '../src/modules/onboarding/domain.js';
import { buildTour, stripImageEmbeds, type TourMeta } from '../src/modules/onboarding/tour.js';

/**
 * SPEC-11 grounding: `buildTour` turns the model's draft into the stored tour. Pure, no mocks —
 * the path check (AC-21/22), the per-section maxima (AC-23..26, AC-29), an emptied section
 * (AC-30), section order (AC-18), metadata (AC-19/20/32) and the overview cut (AC-62, OQ-3).
 */

const REPO_ID = '11111111-1111-4111-8111-111111111111';

const META: TourMeta = {
  repoId: REPO_ID,
  generatedAt: '2026-10-05T10:00:00.000Z',
  commitSha: 'abc1234',
  filesIndexed: 42,
  limitedIndex: false,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  tokensIn: 1200,
  tokensOut: 340,
  costUsd: 0.0123,
};

const emptyDraft = (): TourDraft => ({
  architecture_overview: { body: 'Overview', diagram: null },
  critical_paths: { files: [] },
  how_to_run: { steps: [] },
  guided_reading: { reading: [] },
  first_tasks: { tasks: [] },
});

const files = (n: number, prefix = 'src/f') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}.ts`);
const trackedOf = (...lists: string[][]) => new Set(lists.flat());

function build(draft: TourDraft, tracked: Set<string>, meta: Partial<TourMeta> = {}) {
  return buildTour(draft, { tracked, meta: { ...META, ...meta } });
}

describe('buildTour — structure and metadata', () => {
  it('AC-18: stores exactly the five sections in the fixed order, whatever the draft key order', () => {
    const { tour } = build(emptyDraft(), new Set());
    expect(tour.sections.map((s) => s.kind)).toEqual([
      'architecture_overview',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ]);
    expect(Tour.safeParse(tour).success).toBe(true);
  });

  it('AC-19: stores the commit, the indexed-file count and the generation time it was given', () => {
    const { tour } = build(emptyDraft(), new Set(), {
      commitSha: 'deadbeef',
      filesIndexed: 7,
      generatedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(tour.commit_sha).toBe('deadbeef');
    expect(tour.files_indexed).toBe(7);
    expect(tour.generated_at).toBe('2026-01-02T03:04:05.000Z');
    expect(tour.repo_id).toBe(REPO_ID);
  });

  it('AC-20: stores provider, model, tokens and cost of the model call', () => {
    const { tour } = build(emptyDraft(), new Set());
    expect(tour).toMatchObject({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 1200,
      tokens_out: 340,
      cost_usd: 0.0123,
    });
  });

  it('AC-20: keeps a null cost as null (the page shows an em dash)', () => {
    const { tour } = build(emptyDraft(), new Set(), { costUsd: null });
    expect(tour.cost_usd).toBeNull();
  });

  it('AC-32: carries limited_index through to the stored tour', () => {
    expect(build(emptyDraft(), new Set(), { limitedIndex: true }).tour.limited_index).toBe(true);
    expect(build(emptyDraft(), new Set(), { limitedIndex: false }).tour.limited_index).toBe(false);
  });
});

describe('buildTour — path check (AC-21, AC-22)', () => {
  it('AC-21, AC-22, EC-3: drops critical_paths and guided_reading items that are not tracked files and counts them', () => {
    const draft = emptyDraft();
    draft.critical_paths.files = [
      { path: 'src/real.ts', note: 'entry' },
      { path: 'src/ghost.ts', note: 'invented' },
    ];
    draft.guided_reading.reading = [
      { path: 'src/ghost2.ts', why: 'invented' },
      { path: 'README.md', why: 'start here' },
      { path: 'src/ghost3.ts', why: 'invented' },
    ];
    const { tour, dropped } = build(draft, trackedOf(['src/real.ts', 'README.md']));

    expect(tour.sections[1]).toEqual({ kind: 'critical_paths', files: [{ path: 'src/real.ts', note: 'entry' }] });
    expect(tour.sections[3]).toEqual({
      kind: 'guided_reading',
      reading: [{ path: 'README.md', why: 'start here' }],
    });
    expect(dropped).toBe(3);
    expect(tour.dropped_items).toBe(3);
  });

  it('AC-22: dropped_items is 0 when every path is tracked', () => {
    const draft = emptyDraft();
    draft.critical_paths.files = [{ path: 'src/a.ts', note: 'n' }];
    const { tour } = build(draft, trackedOf(['src/a.ts']));
    expect(tour.dropped_items).toBe(0);
  });

  it('AC-21: a path is matched exactly — a folder or a case variant is not a tracked file', () => {
    const draft = emptyDraft();
    draft.critical_paths.files = [
      { path: 'src', note: 'folder' },
      { path: 'SRC/A.ts', note: 'case' },
      { path: '../etc/passwd', note: 'escape' },
    ];
    const { tour, dropped } = build(draft, trackedOf(['src/a.ts']));
    expect(tour.sections[1]).toEqual({ kind: 'critical_paths', files: [] });
    expect(dropped).toBe(3);
  });

  it('AC-21: a leading "./" is cut and the cleaned path is what gets stored', () => {
    const draft = emptyDraft();
    draft.guided_reading.reading = [{ path: './src/a.ts', why: 'why' }];
    const { tour, dropped } = build(draft, trackedOf(['src/a.ts']));
    expect(tour.sections[3]).toEqual({ kind: 'guided_reading', reading: [{ path: 'src/a.ts', why: 'why' }] });
    expect(dropped).toBe(0);
  });

  it('AC-28: keeps the run step\'s source file on every stored step', () => {
    const draft = emptyDraft();
    draft.how_to_run.steps = [{ command: 'pnpm dev', source: 'package.json' }];
    const { tour } = build(draft, trackedOf(['package.json']));
    expect(tour.sections[2]).toEqual({
      kind: 'how_to_run',
      steps: [{ command: 'pnpm dev', source: 'package.json' }],
    });
  });

  it('OQ-4: a how_to_run step whose source is not a tracked file is dropped and counted', () => {
    const draft = emptyDraft();
    draft.how_to_run.steps = [
      { command: 'make run', source: 'Makefile' },
      { command: 'rm -rf /', source: 'nowhere.sh' },
    ];
    const { tour, dropped } = build(draft, trackedOf(['Makefile']));
    expect(tour.sections[2]).toEqual({ kind: 'how_to_run', steps: [{ command: 'make run', source: 'Makefile' }] });
    expect(dropped).toBe(1);
  });

  it('EC-20: a first task scope that names no tracked file is kept as text and not counted', () => {
    const draft = emptyDraft();
    draft.first_tasks.tasks = [{ title: 'Add a test', scope: 'src/not-yet.ts', complexity: 'low' }];
    const { tour, dropped } = build(draft, new Set());
    expect(tour.sections[4]).toEqual({
      kind: 'first_tasks',
      tasks: [{ title: 'Add a test', scope: 'src/not-yet.ts', complexity: 'low' }],
    });
    expect(dropped).toBe(0);
  });
});

describe('buildTour — maxima (AC-23..AC-29)', () => {
  it('AC-23, AC-29: keeps the first 8 critical_paths files', () => {
    const paths = files(12);
    const draft = emptyDraft();
    draft.critical_paths.files = paths.map((path) => ({ path, note: `n ${path}` }));
    const { tour } = build(draft, trackedOf(paths));
    const section = tour.sections[1];
    expect(section.kind === 'critical_paths' && section.files.map((f) => f.path)).toEqual(paths.slice(0, 8));
  });

  it('AC-24, AC-29, EC-5: keeps the first 8 of 12 guided_reading files', () => {
    const paths = files(12);
    const draft = emptyDraft();
    draft.guided_reading.reading = paths.map((path) => ({ path, why: 'w' }));
    const { tour } = build(draft, trackedOf(paths));
    const section = tour.sections[3];
    expect(section.kind === 'guided_reading' && section.reading.map((r) => r.path)).toEqual(paths.slice(0, 8));
  });

  it('AC-25, AC-29: keeps the first 8 how_to_run steps', () => {
    const draft = emptyDraft();
    draft.how_to_run.steps = Array.from({ length: 11 }, (_, i) => ({ command: `step ${i + 1}`, source: 'Makefile' }));
    const { tour } = build(draft, trackedOf(['Makefile']));
    const section = tour.sections[2];
    expect(section.kind === 'how_to_run' && section.steps.map((s) => s.command)).toEqual(
      Array.from({ length: 8 }, (_, i) => `step ${i + 1}`),
    );
  });

  it('AC-26, AC-29: keeps the first 3 first_tasks', () => {
    const draft = emptyDraft();
    draft.first_tasks.tasks = ['a', 'b', 'c', 'd', 'e'].map((title) => ({ title, scope: 's', complexity: 'medium' as const }));
    const { tour } = build(draft, new Set());
    const section = tour.sections[4];
    expect(section.kind === 'first_tasks' && section.tasks.map((t) => t.title)).toEqual(['a', 'b', 'c']);
  });

  it('AC-27: keeps each first task\'s complexity (low, medium, high)', () => {
    const draft = emptyDraft();
    draft.first_tasks.tasks = [
      { title: 'a', scope: 's', complexity: 'low' },
      { title: 'b', scope: 's', complexity: 'medium' },
      { title: 'c', scope: 's', complexity: 'high' },
    ];
    const { tour } = build(draft, new Set());
    const section = tour.sections[4];
    expect(section.kind === 'first_tasks' && section.tasks.map((t) => t.complexity)).toEqual(['low', 'medium', 'high']);
  });

  it('AC-29: items cut for length are not counted as dropped (only the path check counts)', () => {
    const paths = files(10);
    const draft = emptyDraft();
    draft.critical_paths.files = [
      ...paths.map((path) => ({ path, note: 'n' })),
      { path: 'src/ghost.ts', note: 'n' },
    ];
    const { tour, dropped } = build(draft, trackedOf(paths));
    expect(dropped).toBe(1);
    expect(tour.dropped_items).toBe(1);
  });

  it('AC-29: the maxima apply after the path check — dropped items do not use up slots', () => {
    const real = files(9);
    const draft = emptyDraft();
    draft.guided_reading.reading = [
      { path: 'src/ghost.ts', why: 'invented' },
      ...real.map((path) => ({ path, why: 'w' })),
    ];
    const { tour } = build(draft, trackedOf(real));
    const section = tour.sections[3];
    expect(section.kind === 'guided_reading' && section.reading.map((r) => r.path)).toEqual(real.slice(0, 8));
  });
});

describe('buildTour — thin sections (AC-30)', () => {
  it('AC-30, EC-4: every critical_paths item dropped → the tour is still produced with an empty section', () => {
    const draft = emptyDraft();
    draft.critical_paths.files = [
      { path: 'x.ts', note: 'n' },
      { path: 'y.ts', note: 'n' },
    ];
    const { tour } = build(draft, new Set(['z.ts']));
    expect(tour.sections[1]).toEqual({ kind: 'critical_paths', files: [] });
    expect(tour.dropped_items).toBe(2);
    expect(tour.sections).toHaveLength(5);
  });

  it('AC-30, EC-6: 2 first tasks instead of 3 are stored as 2', () => {
    const draft = emptyDraft();
    draft.first_tasks.tasks = [
      { title: 'a', scope: 's', complexity: 'low' },
      { title: 'b', scope: 's', complexity: 'high' },
    ];
    const { tour } = build(draft, new Set());
    const section = tour.sections[4];
    expect(section.kind === 'first_tasks' && section.tasks).toHaveLength(2);
  });

  it('AC-30, EC-9: no steps at all still stores the tour with an empty how_to_run', () => {
    const { tour } = build(emptyDraft(), new Set());
    expect(tour.sections[2]).toEqual({ kind: 'how_to_run', steps: [] });
  });
});

describe('buildTour — overview (AC-62, OQ-3, NFR-4)', () => {
  it('AC-62: a body of at most 1,200 characters is stored unchanged', () => {
    const body = 'a'.repeat(1200);
    const { tour } = build({ ...emptyDraft(), architecture_overview: { body, diagram: null } }, new Set());
    const overview = tour.sections[0];
    expect(overview.kind === 'architecture_overview' && overview.body).toBe(body);
  });

  it('AC-62, OQ-3: a longer body is cut to 1,200 characters ending with "…" and the tour is still stored', () => {
    const body = 'a'.repeat(5000);
    const { tour } = build({ ...emptyDraft(), architecture_overview: { body, diagram: null } }, new Set());
    const overview = tour.sections[0];
    expect(overview.kind === 'architecture_overview' && overview.body.length).toBe(1200);
    expect(overview.kind === 'architecture_overview' && overview.body.endsWith('…')).toBe(true);
  });

  it('OQ-3: the cut never leaves half a surrogate pair', () => {
    // 1198 plain characters, then emoji (2 UTF-16 units each): the cut falls inside the first pair.
    const body = `${'a'.repeat(1198)}${'😀'.repeat(5)}`;
    const { tour } = build({ ...emptyDraft(), architecture_overview: { body, diagram: null } }, new Set());
    const overview = tour.sections[0];
    const text = overview.kind === 'architecture_overview' ? overview.body : '';
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text.slice(0, -1)).not.toMatch(/[\ud800-\udbff]$/);
  });

  it('AC-63: a blank diagram is stored as null, a real one is trimmed and kept', () => {
    const blank = build({ ...emptyDraft(), architecture_overview: { body: 'b', diagram: '   ' } }, new Set());
    const real = build({ ...emptyDraft(), architecture_overview: { body: 'b', diagram: '  graph TD; A-->B  ' } }, new Set());
    const a = blank.tour.sections[0];
    const b = real.tour.sections[0];
    expect(a.kind === 'architecture_overview' && a.diagram).toBeNull();
    expect(b.kind === 'architecture_overview' && b.diagram).toBe('graph TD; A-->B');
  });

  it('NFR-4, NFR-6: markdown images and <img> tags in the body are replaced by their alt text / removed', () => {
    const body = 'See ![diagram](https://evil.example/x.png) and <img src="https://evil.example/y.png"> done';
    const { tour } = build({ ...emptyDraft(), architecture_overview: { body, diagram: null } }, new Set());
    const overview = tour.sections[0];
    const text = overview.kind === 'architecture_overview' ? overview.body : '';
    expect(text).not.toContain('evil.example');
    expect(text).toContain('diagram');
  });
});

describe('stripImageEmbeds', () => {
  it('cannot rebuild a tag from the pieces left after removing another', () => {
    expect(stripImageEmbeds('<im<img src=x>g src=https://evil.example/a.png>')).not.toMatch(/<img/i);
  });

  it('leaves plain links alone', () => {
    expect(stripImageEmbeds('[docs](https://example.com)')).toBe('[docs](https://example.com)');
  });
});
