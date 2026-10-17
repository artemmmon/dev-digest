import {
  CiTrigger,
  RUNNER_VERSION,
  type CiAgentOverview,
  type CiFailureReason,
  type CiInstallation,
  type CiInstallInput,
  type CiInstallResult,
  type CiPreview,
  type CiPreviewInput,
  type CiRefreshResult,
  type CiRunPage,
  type CiRunsQuery,
  type CiSecretStatus,
  type GitHubClient,
  type RepoRef,
  type RunTrace,
  type WorkflowRunMeta,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { assembleFiles, toPreviewFiles, type BundleFile } from './bundle.js';
import {
  CI_BRANCH,
  COMMIT_MESSAGE,
  PR_BODY,
  PR_TITLE,
  REPLACE_DIRS,
  REVIEW_JOB,
  RUNS_PER_REFRESH,
  SECRET_NAME,
  WORKFLOW_FILE,
} from './constants.js';
import { checkResult, selectResultArtifact, statusFor } from './ingest-check.js';
import { buildManifest, manifestSha256, manifestYaml } from './manifest.js';
import { memoryJsonl } from './memory-export.js';
import type {
  CiAgent,
  CiDeps,
  CiInstallationRecord,
  CiInstallationWithLastRun,
  CiRepo,
  NewCiAgentRun,
  NewCiInstallation,
  NewCiRun,
} from './ports.js';
import { findSecretShapes } from './redact.js';
import { agentSlug, skillSlugs } from './slug.js';
import { generateWorkflow } from './workflow.js';

/** Runs shown on an agent's CI tab. */
const OVERVIEW_RUNS = 20;
const decoder = new TextDecoder('utf-8');

/** The export of an installation: its record plus the zip bytes for a manual export. */
export interface InstallOutcome {
  result: CiInstallResult;
  zip: Uint8Array | null;
}

/** `owner/name` to the GitHub client's repository reference. */
function refOf(fullName: string): RepoRef {
  const [owner, name, ...rest] = fullName.split('/');
  if (!owner || !name || rest.length > 0) throw new ValidationError('The repository name is not valid');
  return { owner, name };
}

/**
 * Fixed, human-readable texts for the errors the GitHub adapter raises (its own messages
 * carry GitHub's response text, which must not reach the browser). The code is kept.
 */
const GITHUB_ERROR_TEXT: Readonly<Record<string, string>> = {
  github_workflow_scope:
    'GitHub refused to write the workflow file: the stored token needs the "workflow" scope',
  github_not_found: 'GitHub could not find the repository, or the token has no access to it',
  github_rejected: 'GitHub rejected the request',
  github_auth_failed: 'GitHub rejected the stored token',
  external_service_error: 'GitHub could not complete the request',
};

/** The same error with a fixed message when it came from the GitHub adapter. */
function withFixedGithubText(err: unknown): unknown {
  if (!(err instanceof AppError)) return err;
  const text = GITHUB_ERROR_TEXT[err.code];
  return text === undefined ? err : new AppError(err.code, text, err.statusCode, err.details);
}

/**
 * Export to CI (SPEC-15): preview and install an agent's bundle, list its installations
 * and runs, and ingest the results of its workflow runs from GitHub. It makes no model
 * calls. Collaborators are ports (`CiDeps`); the GitHub token is read only through
 * `deps.github()`.
 */
export class CiService {
  /**
   * Run ids whose review job was skipped (a fork pull request), per installation. A skipped
   * job is final, so a later refresh does not query those runs again. In memory only: a
   * restart just re-queries them once.
   */
  private readonly skippedRuns = new Map<string, Set<number>>();

  constructor(private readonly deps: CiDeps) {}

  // ---------- Preview and install ----------

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const { agent, repo } = await this.load(workspaceId, agentId, input.repo_id);
    const built = await this.build(workspaceId, agent, repo, input, null);
    const files = assembleFiles(built.bundle);
    return {
      files: toPreviewFiles(files),
      base_branch: repo.defaultBranch,
      replaces: await this.replaces(workspaceId, agent, repo),
      secret_status: await this.secretStatus(repo),
    };
  }

  async install(
    workspaceId: string,
    agentId: string,
    input: CiInstallInput,
    method: 'pr' | 'manual',
  ): Promise<InstallOutcome> {
    if (input.workflow.trim().length === 0) {
      throw new ValidationError('The workflow file is empty', [{ path: 'workflow', message: 'Required' }]);
    }
    const { agent, repo } = await this.load(workspaceId, agentId, input.repo_id);
    const built = await this.build(workspaceId, agent, repo, input, input.workflow);
    const files = assembleFiles(built.bundle);
    this.refuseSecrets(files);

    const replaces = await this.replaces(workspaceId, agent, repo);
    if (replaces && !input.confirm_replace) {
      throw new AppError(
        'ci_replace_unconfirmed',
        'The repository already runs another agent; confirm to replace it',
        409,
        replaces,
      );
    }

    const ref = refOf(repo.fullName);
    let repositoryId: number | null = null;
    let prUrl: string | null = null;
    let zip: Uint8Array | null = null;
    if (method === 'pr') {
      try {
        const gh = await this.deps.github();
        const meta = await gh.getRepository(ref);
        repositoryId = meta.id;
        await gh.commitFiles(ref, {
          branch: CI_BRANCH,
          base: meta.default_branch,
          message: COMMIT_MESSAGE,
          files: files.map((f) => ({ path: f.path, contents: decoder.decode(f.data) })),
          replaceDirs: REPLACE_DIRS,
        });
        const open =
          (await gh.findOpenPr(ref, CI_BRANCH)) ??
          (await gh.openPullRequest(ref, {
            title: PR_TITLE,
            head: CI_BRANCH,
            base: meta.default_branch,
            body: PR_BODY,
          }));
        prUrl = open.url;
      } catch (err) {
        throw withFixedGithubText(err);
      }
    } else {
      repositoryId = await this.tryRepositoryId(ref);
      zip = this.deps.zip.zip(files.map((f) => ({ path: f.path, bytes: f.data })));
    }

    // Read again just before the write: the one that is active now is the one that ends.
    const active = await this.deps.store.activeInstallationForRepo(workspaceId, repo.fullName);
    const next: NewCiInstallation = {
      workspaceId,
      agentId: agent.id,
      repoId: repo.id,
      repo: repo.fullName,
      repositoryId,
      method,
      agentVersion: agent.version,
      runnerVersion: RUNNER_VERSION,
      manifestSha256: built.manifestSha256,
      triggers: built.triggers,
      postAs: input.post_as,
      prUrl,
      installedAt: this.deps.now(),
    };
    const stored = await this.deps.store.replaceInstallation(next, active ? [active.id] : []);
    return {
      result: {
        installation: toWire({ ...stored, lastRunStatus: null, lastRunAt: null }, false),
        pr_url: prUrl,
      },
      zip,
    };
  }

  // ---------- Reads ----------

  async overview(workspaceId: string, agentId: string): Promise<CiAgentOverview> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [installations, runs, currentSha] = await Promise.all([
      this.deps.store.listInstallations(workspaceId, agent.id),
      this.deps.store.listRuns(workspaceId, {
        period: 'all',
        agent_id: agent.id,
        limit: OVERVIEW_RUNS,
      }),
      this.currentManifestSha(agent),
    ]);
    return {
      installations: installations
        .filter((i) => i.endedAt === null)
        .map((i) => toWire(i, currentSha !== null && i.manifestSha256 !== currentSha)),
      runs: runs.runs,
    };
  }

  listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRunPage> {
    return this.deps.store.listRuns(workspaceId, query);
  }

  // ---------- Ingest ----------

  /**
   * Pull the new workflow runs of every active installation. `refreshed` counts the
   * installations that were read (not skipped by the 30 s window). A GitHub failure on one
   * run skips that run only and is reported as a fixed code, never a GitHub message.
   */
  async refresh(workspaceId: string, force: boolean): Promise<CiRefreshResult> {
    const installations = await this.deps.store.listActiveInstallations(workspaceId);
    if (installations.length === 0) return { refreshed: 0, github_error: null };

    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch (err) {
      if (err instanceof AppError) return { refreshed: 0, github_error: err.code };
      throw err;
    }

    let refreshed = 0;
    let githubError: string | null = null;
    for (const installation of installations) {
      if (!(await this.deps.store.claimIngest(installation.id, force))) continue;
      refreshed += 1;
      try {
        githubError = (await this.ingest(workspaceId, gh, installation)) ?? githubError;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        githubError = err.code;
        this.deps.log.warn({ code: err.code, installation_id: installation.id }, 'ci refresh failed');
      }
    }
    return { refreshed, github_error: githubError };
  }

  private async ingest(
    workspaceId: string,
    gh: GitHubClient,
    installation: CiInstallationRecord,
  ): Promise<string | null> {
    const ref = refOf(installation.repo);
    let repositoryId = installation.repositoryId;
    if (repositoryId === null) {
      repositoryId = (await gh.getRepository(ref)).id;
      await this.deps.store.setRepositoryId(installation.id, repositoryId);
    }
    let runs: WorkflowRunMeta[];
    try {
      runs = await gh.listWorkflowRuns(ref, WORKFLOW_FILE, {
        createdAfter: installation.installedAt,
        perPage: RUNS_PER_REFRESH,
      });
    } catch (err) {
      // The workflow file is not in the repository yet (a zip export before the user commits
      // it, a PR export before it merges): there are no runs, which is not an error.
      if (err instanceof AppError && err.code === 'github_not_found') return null;
      throw err;
    }
    const known = await this.deps.store.knownRunIds(
      workspaceId,
      runs.map((r) => r.id),
    );
    const agent = await this.deps.agents.getById(workspaceId, installation.agentId);
    let skipped = this.skippedRuns.get(installation.id);
    if (!skipped) {
      skipped = new Set<number>();
      this.skippedRuns.set(installation.id, skipped);
    }
    let failure: string | null = null;
    for (const run of runs) {
      if (known.has(run.id) || skipped.has(run.id)) continue;
      // A fork pull request runs its OWN copy of the workflow (the fork controls its job
      // names and artifacts), so only a `pull_request` run whose head commit lives in the
      // installed repository is trusted. Checked before any job or artifact is read.
      if (
        run.event !== 'pull_request' ||
        run.head_repository_id !== repositoryId ||
        run.repository_id !== repositoryId
      ) {
        skipped.add(run.id);
        continue;
      }
      try {
        const done = await this.ingestRun(
          workspaceId,
          gh,
          ref,
          installation,
          repositoryId,
          agent?.name ?? null,
          run,
        );
        if (done === 'skipped') skipped.add(run.id);
      } catch (err) {
        // One bad run (an artifact deleted between list and download, a rate limit) must not
        // stop the rest of the installation; it is retried on the next refresh.
        // Also an unexpected failure (a DB constraint on one row): log the code and ids
        // only, so the rest of the refresh is not blocked by one bad run.
        const code = err instanceof AppError ? err.code : 'ci_ingest_failed';
        failure = code;
        this.deps.log.warn(
          { code, installation_id: installation.id, github_run_id: run.id },
          'ci run ingest failed',
        );
      }
    }
    return failure;
  }

  private async ingestRun(
    workspaceId: string,
    gh: GitHubClient,
    ref: RepoRef,
    installation: CiInstallationRecord,
    repositoryId: number,
    agentName: string | null,
    run: WorkflowRunMeta,
  ): Promise<'skipped' | 'stored'> {
    const jobs = await gh.listRunJobs(ref, run.id);
    const review = jobs.find((j) => j.name === REVIEW_JOB);
    // A skipped (or absent) review job means no review ran: nothing to list.
    if (!review || review.conclusion === 'skipped') return 'skipped';

    const artifacts = await gh.listRunArtifacts(ref, run.id);
    const selected = selectResultArtifact(artifacts);
    const outcome = selected.ok
      ? checkResult({
          artifacts,
          // Downloaded only after the size and expiry checks passed.
          archiveBytes: await gh.downloadArtifact(ref, selected.artifact.id),
          run: { id: run.id, head_sha: run.head_sha },
          installation: { repository_id: repositoryId },
          reader: this.deps.archive,
        })
      : selected;

    const ranAt = new Date(run.run_started_at ?? run.updated_at);
    const base = {
      workspaceId,
      installationId: installation.id,
      agentId: installation.agentId,
      agentName,
      repo: installation.repo,
      prTitle: run.display_title,
      githubRunId: run.id,
      commitSha: run.head_sha,
      jobUrl: run.html_url,
      ranAt: Number.isNaN(ranAt.getTime()) ? null : ranAt,
    };

    if (!outcome.ok) {
      this.logRejection(outcome.reason, installation.id, run.id);
      const failed: NewCiRun = {
        ...base,
        prNumber: run.pr_number,
        status: 'failed',
        failureReason: outcome.reason,
        result: null,
      };
      await this.deps.store.storeRun(failed, null, null);
      return 'stored';
    }

    const { result } = outcome;
    const stored: NewCiRun = {
      ...base,
      // Only GitHub's own link: the artifact's `pr_number` is attacker-writable text.
      prNumber: run.pr_number,
      status: statusFor(result),
      failureReason: null,
      result,
    };
    const agentRun: NewCiAgentRun = {
      workspaceId,
      agentId: installation.agentId,
      model: result.model,
      costUsd: result.cost_usd,
      durationMs: result.duration_ms,
      findingsCount: result.findings_count,
      verdict: result.verdict,
      ranAt: base.ranAt,
    };
    const trace: RunTrace = {
      config: {
        agent: result.agent,
        version: String(result.agent_version),
        provider: 'openrouter',
        model: result.model,
        pr: stored.prNumber,
        source: 'ci',
      },
      stats: {
        duration_ms: result.duration_ms,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: result.cost_usd,
        findings: result.findings_count,
        grounding: '',
      },
      prompt_assembly: { system: '', user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      ci: {
        manifest_version: result.manifest_version,
        agent_version: result.agent_version,
        runner_version: result.runner_version,
        commit_sha: result.commit_sha,
        repository: installation.repo,
        run_id: run.id,
      },
      log: [],
    };
    await this.deps.store.storeRun(stored, agentRun, trace);
    return 'stored';
  }

  /** Reason, installation id and run id only: never the result's contents (NFR-9). */
  private logRejection(reason: CiFailureReason, installationId: string, runId: number): void {
    this.deps.log.warn({ reason, installation_id: installationId, run_id: runId }, 'ci result rejected');
  }

  // ---------- Helpers ----------

  private async load(
    workspaceId: string,
    agentId: string,
    repoId: string,
  ): Promise<{ agent: CiAgent; repo: CiRepo }> {
    const [agent, repo] = await Promise.all([
      this.deps.agents.getById(workspaceId, agentId),
      this.deps.repos.getById(workspaceId, repoId),
    ]);
    if (!agent) throw new NotFoundError('Agent not found');
    if (!repo) throw new NotFoundError('Repository not found');
    if (agent.provider !== 'openrouter') {
      throw new AppError(
        'provider_not_supported',
        'Only agents that use OpenRouter can be exported to CI',
        422,
        [{ path: 'provider', message: 'Must be openrouter' }],
      );
    }
    return { agent, repo };
  }

  /** Everything except the workflow comes from the stored agent, never from the request. */
  private async build(
    workspaceId: string,
    agent: CiAgent,
    repo: CiRepo,
    input: CiPreviewInput,
    workflow: string | null,
  ) {
    const skills = await this.deps.agents.resolvedSkills(agent.id);
    const slugs = skillSlugs(skills.map((s) => s.name));
    const manifest = manifestYaml(buildManifest(agent, slugs));
    const triggers = CiTrigger.options.filter((t) => input.triggers.includes(t));
    const [memory, runnerFiles] = await Promise.all([
      this.deps.store.memoryFor(workspaceId, repo.id),
      this.deps.bundle.read(),
    ]);
    return {
      triggers,
      manifestSha256: manifestSha256(manifest),
      bundle: {
        agentSlug: agentSlug(agent.name),
        manifest,
        skills: skills.map((s, i) => ({ slug: slugs[i]!, body: s.body })),
        memory: memoryJsonl(memory),
        runnerFiles,
        workflow: workflow ?? generateWorkflow({ triggers, postAs: input.post_as }),
      },
    };
  }

  /** Refuse to write or zip a file that holds a secret-shaped value, naming only the file (AC-56). */
  private refuseSecrets(files: BundleFile[]): void {
    for (const f of files) {
      const hits = findSecretShapes(decoder.decode(f.data));
      if (hits.length > 0) {
        throw new ValidationError(`The file ${f.path} contains a secret-like value`, [
          { path: f.path, patterns: hits },
        ]);
      }
    }
  }

  /** The installation of another agent that this export would end, if any. */
  private async replaces(
    workspaceId: string,
    agent: CiAgent,
    repo: CiRepo,
  ): Promise<CiPreview['replaces']> {
    const active = await this.deps.store.activeInstallationForRepo(workspaceId, repo.fullName);
    if (!active || active.agentId === agent.id) return null;
    const other = await this.deps.agents.getById(workspaceId, active.agentId);
    return { agent_id: active.agentId, agent_name: other?.name ?? '' };
  }

  /** `unknown` without a token or when GitHub does not let the token read secret names. */
  private async secretStatus(repo: CiRepo): Promise<CiSecretStatus> {
    try {
      const gh = await this.deps.github();
      const names = await gh.listRepoSecretNames(refOf(repo.fullName));
      if (names === null) return 'unknown';
      return names.includes(SECRET_NAME) ? 'present' : 'missing';
    } catch (err) {
      if (err instanceof AppError) return 'unknown';
      throw err;
    }
  }

  /** A zip export works without a token; then the repository id is learned on the first refresh. */
  private async tryRepositoryId(ref: RepoRef): Promise<number | null> {
    try {
      const gh = await this.deps.github();
      return (await gh.getRepository(ref)).id;
    } catch (err) {
      if (err instanceof AppError) return null;
      throw err;
    }
  }

  /** Hash of the manifest the agent would export now; null when it cannot be built. */
  private async currentManifestSha(agent: CiAgent): Promise<string | null> {
    try {
      const skills = await this.deps.agents.resolvedSkills(agent.id);
      const slugs = skillSlugs(skills.map((s) => s.name));
      return manifestSha256(manifestYaml(buildManifest(agent, slugs)));
    } catch (err) {
      if (err instanceof AppError) return null;
      throw err;
    }
  }
}

function toWire(i: CiInstallationWithLastRun, outdated: boolean): CiInstallation {
  return {
    id: i.id,
    agent_id: i.agentId,
    repo: i.repo,
    repository_id: i.repositoryId,
    target_type: 'gha',
    method: i.method,
    agent_version: i.agentVersion,
    runner_version: i.runnerVersion,
    pr_url: i.prUrl,
    installed_at: i.installedAt.toISOString(),
    triggers: i.triggers,
    post_as: i.postAs,
    outdated,
    last_run_status: i.lastRunStatus,
    last_run_at: i.lastRunAt?.toISOString() ?? null,
  };
}
