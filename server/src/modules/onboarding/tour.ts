import { TOUR_LIMITS, Tour, type Provider } from '@devdigest/shared';
import type { TourDraft } from './domain.js';
import { normalizePath } from './sources.js';

/** Turns the model's draft into the stored tour. Pure: draft + facts in, tour + drop count out. */

export interface TourMeta {
  repoId: string;
  generatedAt: string;
  commitSha: string;
  filesIndexed: number;
  limitedIndex: boolean;
  provider: Provider;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

const ELLIPSIS = '…';

/** Cut to `max` UTF-16 units ending with an ellipsis, never splitting a surrogate pair. */
function cutBody(body: string, max: number): string {
  if (body.length <= max) return body;
  let end = max - 1;
  const last = body.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return body.slice(0, end) + ELLIPSIS;
}

/**
 * The path check runs first and counts what it drops; only then is the list cut to its
 * limit, so items cut for length are never counted as dropped. `first_tasks.scope` is shown
 * as text and is never checked against the tracked files.
 */
export function buildTour(
  draft: TourDraft,
  input: { tracked: ReadonlySet<string>; meta: TourMeta },
): { tour: Tour; dropped: number } {
  const { tracked, meta } = input;
  let dropped = 0;

  function keepTracked<T>(items: readonly T[], pathOf: (item: T) => string, set: (item: T, path: string) => T): T[] {
    const kept: T[] = [];
    for (const item of items) {
      const path = normalizePath(pathOf(item));
      if (tracked.has(path)) kept.push(set(item, path));
      else dropped += 1;
    }
    return kept;
  }

  const files = keepTracked(draft.critical_paths.files, (f) => f.path, (f, path) => ({ ...f, path }));
  const reading = keepTracked(draft.guided_reading.reading, (r) => r.path, (r, path) => ({ ...r, path }));
  const steps = keepTracked(draft.how_to_run.steps, (s) => s.source, (s, source) => ({ ...s, source }));
  const diagram = draft.architecture_overview.diagram?.trim() ?? '';

  const tour = Tour.parse({
    repo_id: meta.repoId,
    generated_at: meta.generatedAt,
    commit_sha: meta.commitSha,
    files_indexed: meta.filesIndexed,
    limited_index: meta.limitedIndex,
    provider: meta.provider,
    model: meta.model,
    tokens_in: meta.tokensIn,
    tokens_out: meta.tokensOut,
    cost_usd: meta.costUsd,
    dropped_items: dropped,
    sections: [
      {
        kind: 'architecture_overview',
        body: cutBody(draft.architecture_overview.body, TOUR_LIMITS.overviewChars),
        diagram: diagram === '' ? null : diagram,
      },
      { kind: 'critical_paths', files: files.slice(0, TOUR_LIMITS.criticalPaths) },
      { kind: 'how_to_run', steps: steps.slice(0, TOUR_LIMITS.howToRun) },
      { kind: 'guided_reading', reading: reading.slice(0, TOUR_LIMITS.guidedReading) },
      { kind: 'first_tasks', tasks: draft.first_tasks.tasks.slice(0, TOUR_LIMITS.firstTasks) },
    ],
  });
  return { tour, dropped };
}
