import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
  PrStatus,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus } from './status.js';
import { latestBatchByPr, latestBatchCostByPr } from './cost.js';
import { latestRoundReviewIds, roundScoreByPr, severityByPr } from './findings.js';
import type { GitHubFactory, PullRecord, PullRepoRef, PullStore, WarnLog } from './ports.js';

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly imported PRs land
 * with zeroed size. Each list read backfills at most this many from the detail
 * endpoint (one fetch each); the periodic refetch chips away at the remainder.
 */
const BACKFILL_LIMIT = 10;

export interface PullsServiceDeps {
  pulls: PullStore;
  github: GitHubFactory;
  log: WarnLog;
}

/**
 * Pull requests: import from GitHub, the PR list with its review rollups, PR
 * detail and inline comments. Local-first — every read works offline from what
 * is already persisted; GitHub only refreshes it when a token is configured.
 * Review triggering is manual and lives in the reviews module.
 */
export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  /** PRs of a repo with their latest-round COST / SCORE / FINDINGS. */
  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const gh = await this.githubOrNull('serving persisted PRs');
    if (gh) await this.syncList(gh, workspaceId, repo);

    const pulls = await this.deps.pulls.listForRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, pulls);
    return this.withRollups(pulls);
  }

  /** Manual poll: sync the PR list and stamp the repo. Never triggers a review. */
  async poll(workspaceId: string, repoId: string): Promise<{ synced: number }> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    const synced = await this.deps.pulls.upsertFromGitHub(workspaceId, repo.id, pulls);
    await this.deps.pulls.markPolled(repo.id);
    return { synced };
  }

  /** Full PR detail, refreshed from GitHub when possible, else the persisted copy. */
  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pull, repo } = await this.requirePull(workspaceId, prId);
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pull.number);
      await this.deps.pulls.replaceDetail(pull.id, detail);
      return { ...detail, id: pull.id };
    } catch (err) {
      this.deps.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const { files, commits } = await this.deps.pulls.persistedDetail(pull.id);
      return {
        id: pull.id,
        number: pull.number,
        title: pull.title,
        author: pull.author,
        branch: pull.branch,
        base: pull.base,
        head_sha: pull.headSha,
        additions: pull.additions,
        deletions: pull.deletions,
        files_count: pull.filesCount,
        status: pull.status as PrStatus,
        opened_at: pull.openedAt?.toISOString() ?? null,
        updated_at: pull.updatedAt?.toISOString() ?? null,
        body: pull.body,
        files,
        commits,
      };
    }
  }

  /** Inline review comments, proxied live to GitHub; [] when offline. */
  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pull, repo } = await this.requirePull(workspaceId, prId);
    const gh = await this.githubOrNull('serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pull.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  /**
   * Post an inline comment on the PR head. GitHub's own failures arrive as
   * AppError from the adapter: 422 for a line outside the diff, 502 for an outage.
   */
  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pull, repo } = await this.requirePull(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    return gh.createReviewComment({ owner: repo.owner, name: repo.name }, pull.number, {
      commitId: pull.headSha,
      path: input.path,
      line: input.line,
      ...(input.side ? { side: input.side } : {}),
      body: input.body,
      ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
    });
  }

  // ---- internals ------------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string): Promise<PullRepoRef> {
    const repo = await this.deps.pulls.repoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requirePull(workspaceId: string, prId: string) {
    const found = await this.deps.pulls.pullInWorkspace(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    return found;
  }

  /** The GitHub client, or null (logged) when no token is configured. */
  private async githubOrNull(fallback: string): Promise<GitHubClient | null> {
    try {
      return await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, `GitHub client unavailable (no token / offline); ${fallback}`);
      return null;
    }
  }

  /** Sync the PR list; a GitHub failure never fails the read. */
  private async syncList(gh: GitHubClient, workspaceId: string, repo: PullRepoRef): Promise<void> {
    try {
      const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
      await this.deps.pulls.upsertFromGitHub(workspaceId, repo.id, pulls);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    }
  }

  /** Fill zeroed diff stats from the detail endpoint (mutates `pulls` in place). */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: PullRepoRef,
    pulls: PullRecord[],
  ): Promise<void> {
    const needStats = pulls
      .filter((p) => p.additions === 0 && p.deletions === 0 && p.filesCount === 0)
      .slice(0, BACKFILL_LIMIT);
    for (const p of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, p.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.deps.pulls.setDiffStats(p.id, stats);
        Object.assign(p, stats);
      } catch (err) {
        this.deps.log.warn({ err, number: p.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /**
   * COST, SCORE and the FINDINGS breakdown all describe a PR's latest review
   * ROUND: every agent started by one Run Review click, i.e. one
   * `agent_runs.batch_id` (see ./cost.ts, ./findings.ts).
   */
  private async withRollups(pulls: PullRecord[]): Promise<PrMeta[]> {
    const { runs, reviews } = await this.deps.pulls.roundInputs(pulls.map((p) => p.id));
    const latestBatch = latestBatchByPr(runs);
    const costByPr = latestBatchCostByPr(runs);
    const roundByPr = latestRoundReviewIds(reviews, runs, latestBatch);
    const scoreByPr = roundScoreByPr(roundByPr, new Map(reviews.map((rv) => [rv.id, rv.score])));
    const severities = await this.deps.pulls.findingSeverities([...roundByPr.values()].flat());
    const severityByPrId = severityByPr(roundByPr, severities);

    const now = Date.now();
    return pulls.map((p) => ({
      id: p.id,
      number: p.number,
      title: p.title,
      author: p.author,
      branch: p.branch,
      base: p.base,
      head_sha: p.headSha,
      additions: p.additions,
      deletions: p.deletions,
      files_count: p.filesCount,
      status: deriveReviewStatus({
        ghStatus: p.status,
        lastReviewedSha: p.lastReviewedSha,
        headSha: p.headSha,
        updatedAt: p.updatedAt,
        now,
      }),
      opened_at: p.openedAt?.toISOString() ?? null,
      updated_at: p.updatedAt?.toISOString() ?? null,
      score: scoreByPr.get(p.id) ?? null,
      cost_usd: costByPr.get(p.id) ?? null,
      findings_by_severity: severityByPrId.get(p.id) ?? null,
    }));
  }
}
