import { BLAST_LIMITS } from '@devdigest/shared';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { blastReason, emptyBlast, shouldQueryFacade, toBlastRadius, toDegradedReason } from './map.js';
import type { BlastDeps } from './ports.js';

/**
 * Blast radius for a PR: precomputed repo-intel data, never an LLM call.
 * Constructor-injected ports only (onion: application ring).
 */
export class BlastService {
  constructor(private deps: BlastDeps) {}

  async forPull(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const { store, intel, log } = this.deps;
    const pull = await store.pullInWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [paths, state] = await Promise.all([
      store.changedPaths(pull.id),
      intel.indexState(pull.repoId),
    ]);
    let reason = blastReason(intel.enabled, state);

    let mapped = emptyBlast();
    let facade: 'skipped' | 'persistent-index' = 'skipped';
    // The facade's fallback parses the clone from disk and always says `no_data`:
    // only ask it when the persistent index can answer.
    if (shouldQueryFacade(reason, paths.length)) {
      facade = 'persistent-index';
      const result = await intel.blastRadius(pull.repoId, paths);
      // Index changed between the two reads: the facade fell back and produced nothing usable.
      if (result.degraded === true) reason = toDegradedReason(result.reason);
      mapped = toBlastRadius(result, BLAST_LIMITS.maxCallersPerSymbol);
    }

    // One line per request: proves the ready index was read, not rebuilt (no parse, no LLM).
    log.info(
      {
        prId: pull.id,
        repoId: pull.repoId,
        facade,
        indexStatus: state.status,
        indexedSha: state.lastIndexedSha || null,
        reason,
        changedFiles: paths.length,
        symbols: mapped.counts.symbols,
        callers: mapped.counts.callers,
        endpoints: mapped.counts.endpoints,
        crons: mapped.counts.crons,
        truncated: mapped.truncated,
        source: 'repo-intel index (read-only, no re-parse, no LLM)',
      },
      'blast radius served from the precomputed index',
    );

    return {
      blast: mapped.blast,
      head_sha: pull.headSha,
      index: {
        status: state.status,
        degraded: reason !== null,
        reason,
        indexed_sha: state.lastIndexedSha || null,
      },
      limits: { max_callers_per_symbol: BLAST_LIMITS.maxCallersPerSymbol },
      counts: { changed_files: paths.length, ...mapped.counts },
      truncated: mapped.truncated,
    };
  }
}
