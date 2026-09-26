import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { latestBatchByPr, latestRoundReviewIds } from '../pulls/index.js';
import { buildSmartDiff } from './build.js';
import type { SmartDiffStore } from './ports.js';

export interface SmartDiffServiceDeps {
  store: SmartDiffStore;
}

/**
 * Smart Diff (spec 09): classify a PR's changed files into role groups and
 * attach its latest review round's finding lines. No LLM, GitHub or git
 * dependency — the structural guarantee that grouping works before any review
 * has run (P2.3).
 *
 * "Latest round" is the exact rule the PR list uses (server INSIGHTS `:77`):
 * every agent run started by one Run Review click shares one
 * `agent_runs.batch_id`; `latestBatchByPr` + `latestRoundReviewIds` (re-exported
 * from `../pulls/index.js`) pick that round out of the newest-first rows.
 */
export class SmartDiffService {
  constructor(private deps: SmartDiffServiceDeps) {}

  async forPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.deps.store.pullInWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.deps.store.files(prId);
    const { runs, reviews } = await this.deps.store.roundInputs(prId);
    const latestBatch = latestBatchByPr(runs);
    const roundByPr = latestRoundReviewIds(reviews, runs, latestBatch);
    const reviewIds = roundByPr.get(prId) ?? [];
    const findings = await this.deps.store.findingLocations(reviewIds);

    return buildSmartDiff(files, findings);
  }
}
