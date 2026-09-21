import type {
  ConventionCandidate,
  ConventionIds,
  ConventionList,
  ConventionPatch,
  ConventionScanReport,
  ConventionScanResult,
  ConventionSkillCreate,
  ConventionSkillCreated,
  ConventionSkillDraft,
  GitClient,
  RepoRef,
} from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  CATEGORY_ORDER,
  LLM_MAX_RETRIES,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  MAX_CONFIG_FILES,
  MAX_FILE_CHARS,
  MAX_PER_CATEGORY,
  MAX_TOTAL,
  REQUESTED_CONVENTIONS,
  SOURCE_SAMPLE_COUNT,
  TEST_SAMPLE_COUNT,
} from './constants.js';
import { dedupeCandidates } from './dedup.js';
import { ConventionExtraction } from './domain.js';
import { toCandidateDto } from './helpers.js';
import type { ConventionRecord, ConventionRepo, ConventionsDeps } from './ports.js';
import { buildUserPrompt } from './prompt.js';
import {
  isSampleableSource,
  pickConfigFiles,
  pickFallbackSamples,
  pickTestSamples,
  summarizePackageJson,
  treeSummary,
} from './sampling.js';
import { buildSkillDraft, evidenceFilesOf } from './skill-body.js';
import { verifyCandidates } from './verify.js';

/**
 * Conventions extractor: sample the repo → one structured LLM call → evidence gate → dedup →
 * store as pending. A person then accepts / rejects / edits each rule and turns the accepted
 * ones into a skill. The server builds the skill so `source` and `evidence_files` cannot be forged.
 */

/** The run is synchronous, so a second click on the same repo must not start a second scan. */
const SCAN_IN_PROGRESS = 'scan_in_progress';

export class ConventionsService {
  private inFlight = new Set<string>();

  constructor(private deps: ConventionsDeps) {}

  private async requireRepo(workspaceId: string, repoId: string): Promise<ConventionRepo> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private dto(row: ConventionRecord, repo: ConventionRepo): ConventionCandidate {
    return toCandidateDto(row, repo);
  }

  /** Everything not rejected; `last_scan` is the newest row (a rejected row still marks a scan). */
  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.deps.store.list(workspaceId, repoId);
    const newest = rows[0];
    return {
      candidates: rows.filter((r) => r.status !== 'rejected').map((r) => this.dto(r, repo)),
      last_scan: newest ? { at: newest.createdAt.toISOString(), commit_sha: newest.commitSha } : null,
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionScanResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new AppError('repo_not_cloned', 'The repository is not cloned yet; wait for the import to finish.', 409);
    }
    if (this.inFlight.has(repoId)) {
      throw new AppError(SCAN_IN_PROGRESS, 'A scan of this repository is already running.', 409);
    }
    this.inFlight.add(repoId);
    try {
      return await this.runScan(workspaceId, repo);
    } finally {
      this.inFlight.delete(repoId);
    }
  }

  private async runScan(workspaceId: string, repo: ConventionRepo): Promise<ConventionScanResult> {
    const { deps } = this;
    const now = deps.now ?? Date.now;
    const started = now();
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    const [sha, paths] = await Promise.all([deps.git.currentHead(ref), deps.git.listFiles(ref)]);
    const tracked = new Set(paths);

    // 1. what to show the model
    const fromIntel = (await deps.samples(repo.id, SOURCE_SAMPLE_COUNT).catch(() => []))
      .filter((p) => tracked.has(p) && isSampleableSource(p))
      .slice(0, SOURCE_SAMPLE_COUNT);
    const intelSet = new Set(fromIntel);
    const fallback = pickFallbackSamples(paths, SOURCE_SAMPLE_COUNT - fromIntel.length, intelSet);
    const sourcePaths = [...fromIntel, ...fallback];
    const tests = pickTestSamples(paths, TEST_SAMPLE_COUNT, new Set(sourcePaths));
    const configPaths = pickConfigFiles(paths, MAX_CONFIG_FILES);
    const sampleSource: ConventionScanReport['sample_source'] =
      fromIntel.length === 0 ? 'fallback' : fallback.length === 0 ? 'repo_intel' : 'mixed';

    const read = await readFiles(deps.git, ref, [...configPaths, ...sourcePaths, ...tests]);

    const packages: Array<{ path: string; summary: string }> = [];
    const configs: Array<{ path: string; text: string }> = [];
    for (const path of configPaths) {
      const text = read.get(path);
      if (text === undefined) continue;
      if (path.endsWith('package.json')) {
        const summary = summarizePackageJson(text);
        if (summary) packages.push({ path, summary });
      } else {
        configs.push({ path, text });
      }
    }
    const samples = [...sourcePaths, ...tests]
      .filter((p) => read.has(p))
      .map((path) => ({ path, text: read.get(path)! }));
    if (samples.length === 0) {
      throw new AppError('no_source_files', 'No readable source files were found in this repository.', 422);
    }

    const built = buildUserPrompt({
      repoFullName: repo.fullName,
      tree: treeSummary(paths),
      packages,
      configs,
      samples,
    });
    // the model may cite only files it was shown (whole text, so line numbers stay valid)
    const shown = new Map<string, string>();
    for (const p of [...built.configs, ...built.samples]) shown.set(p, read.get(p)!);

    // 2. one structured call
    const choice = await deps.resolveModel(workspaceId);
    const provider = await deps.llm(choice.provider);
    const system = await deps.systemPrompt({
      max: String(REQUESTED_CONVENTIONS),
      categories: CATEGORY_ORDER.join(', '),
    });
    let result;
    try {
      result = await provider.completeStructured({
        model: choice.model,
        schema: ConventionExtraction,
        schemaName: 'ConventionExtraction',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: built.prompt },
        ],
        temperature: LLM_TEMPERATURE,
        maxTokens: LLM_MAX_TOKENS,
        maxRetries: LLM_MAX_RETRIES,
        timeoutMs: LLM_TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `The model call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 3. evidence gate → dedup → store
    const raw = result.data.conventions;
    const verified = verifyCandidates(raw, shown);
    const decided = await deps.store.listDecided(workspaceId, repo.id);
    const deduped = dedupeCandidates(
      verified.kept,
      decided.map((d) => d.rule),
      { perCategory: MAX_PER_CATEGORY, total: MAX_TOTAL },
    );
    await deps.store.replacePending(
      workspaceId,
      repo.id,
      deduped.kept.map((c) => ({ ...c, category: c.category as ConventionRecord['category'], commitSha: sha })),
    );

    const categories: Record<string, number> = {};
    for (const c of deduped.kept) categories[c.category] = (categories[c.category] ?? 0) + 1;
    const report: ConventionScanReport = {
      provider: choice.provider,
      model: result.model || choice.model,
      commit_sha: sha,
      duration_ms: Math.max(0, Math.round(now() - started)),
      config_files: [...packages.map((p) => p.path), ...built.configs],
      sampled_files: built.samples,
      sample_source: sampleSource,
      raw_candidates: raw.length,
      kept: deduped.kept.length,
      line_corrected: verified.lineCorrected,
      dropped: { ...verified.dropped, ...deduped.dropped },
      categories,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
    };
    deps.logger?.info({ repo: repo.fullName, ...report }, 'conventions scan finished');

    // the whole current list (accepted + fresh pending), so a client can replace its cache
    const rows = (await deps.store.list(workspaceId, repo.id)).filter((r) => r.status !== 'rejected');
    return { candidates: rows.map((r) => this.dto(r, repo)), report };
  }

  async patch(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionCandidate> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const row = await this.deps.store.update(workspaceId, repoId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
    });
    if (!row) throw new NotFoundError('Convention not found');
    return this.dto(row, repo);
  }

  /** The rows behind a skill: all must exist in this repo and be accepted. */
  private async acceptedRows(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]> {
    const wanted = [...new Set(ids)];
    const rows = await this.deps.store.getByIds(workspaceId, repoId, wanted);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const notAccepted = wanted.filter((id) => byId.get(id)?.status !== 'accepted');
    if (notAccepted.length > 0) {
      throw new ValidationError('Only accepted conventions of this repository can go into a skill.', {
        convention_ids: notAccepted,
      });
    }
    return wanted.map((id) => byId.get(id)!);
  }

  async skillDraft(workspaceId: string, repoId: string, body: ConventionIds): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.acceptedRows(workspaceId, repoId, body.convention_ids);
    return buildSkillDraft(repo.fullName, rows);
  }

  async createSkill(
    workspaceId: string,
    repoId: string,
    body: ConventionSkillCreate,
  ): Promise<ConventionSkillCreated> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.acceptedRows(workspaceId, repoId, body.convention_ids);
    // validate the agent before anything is written
    if (body.agent_id && !(await this.deps.agents.getById(workspaceId, body.agent_id))) {
      throw new NotFoundError('Agent not found');
    }
    const skill = await this.deps.skills.insert({
      workspaceId,
      name: body.name,
      description: body.description,
      type: 'convention',
      source: 'extracted',
      body: body.body,
      evidenceFiles: evidenceFilesOf(rows),
    });
    if (body.agent_id) {
      await this.deps.agents.appendSkill(workspaceId, body.agent_id, skill.id);
    }
    return { skill_id: skill.id, name: skill.name, agent_id: body.agent_id ?? null };
  }
}

/** Reads `paths` from the clone; an unreadable, empty, binary or oversized file is left out. */
async function readFiles(git: GitClient, ref: RepoRef, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const texts = await Promise.all(
    unique.map(async (path) => {
      try {
        const text = await git.readFile(ref, path);
        if (text.trim() === '' || text.length > MAX_FILE_CHARS || text.includes('\0')) return undefined;
        return text;
      } catch {
        return undefined;
      }
    }),
  );
  const out = new Map<string, string>();
  unique.forEach((p, i) => {
    const text = texts[i];
    if (text !== undefined) out.set(p, text);
  });
  return out;
}
