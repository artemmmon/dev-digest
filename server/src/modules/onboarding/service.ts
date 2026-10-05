import type {
  GitClient,
  Provider,
  RepoRef,
  Tour,
  TourGeneration,
  TourGenerationStarted,
  TourRead,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  EXCERPT_FILE_COUNT,
  GENERATION_TIMEOUT_MS,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  MAX_FILE_CHARS,
  MISSING_KEY_MESSAGE_TEMPLATE,
  MODEL_FAILURE_MESSAGE,
  PROVIDER_DISPLAY_NAMES,
  REPO_MAP_TOKEN_BUDGET,
  RESTART_MESSAGE,
  TIMEOUT_MESSAGE,
  TOP_FILE_COUNT,
  TOUR_SCHEMA_NAME,
} from './constants.js';
import { TourDraft } from './domain.js';
import type { GenerationRecord, OnboardingDeps, TourRepo } from './ports.js';
import { buildTourPrompt } from './prompt.js';
import { isReadable, pickCandidates, pickRunFiles, summarizeTracked } from './sources.js';
import { buildTour } from './tour.js';

/**
 * Onboarding tour: `start` claims the repo's generation and returns at once; the run reads the
 * checkout and the index, sends ONE structured request, checks the result against the tracked
 * files and stores the tour. A person only ever sees the failure texts of `constants.ts` —
 * never a provider message, the model's raw output or repository text.
 */

const GENERATION_IN_PROGRESS = 'generation_in_progress';
const REPO_NOT_CLONED = 'repo_not_cloned';

class DeadlineError extends Error {}
class MissingKeyError extends Error {
  constructor(readonly provider: Provider) {
    super('missing key');
  }
}

/** Rejects with `DeadlineError` when `work` has not settled in `ms`; the timer never outlives the race. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

function failureMessage(err: unknown): string {
  if (err instanceof DeadlineError) return TIMEOUT_MESSAGE;
  if (err instanceof MissingKeyError) {
    return MISSING_KEY_MESSAGE_TEMPLATE.replace('{provider}', PROVIDER_DISPLAY_NAMES[err.provider]);
  }
  return MODEL_FAILURE_MESSAGE;
}

function toGeneration(record: GenerationRecord | null): TourGeneration {
  if (!record) return { status: 'idle', started_at: null };
  return {
    status: record.status,
    started_at: record.startedAt.toISOString(),
    ...(record.status === 'failed' ? { error: record.error } : {}),
  };
}

export class OnboardingService {
  constructor(private deps: OnboardingDeps) {}

  private async requireRepo(workspaceId: string, repoId: string): Promise<TourRepo> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  async read(workspaceId: string, repoId: string): Promise<TourRead> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [tour, generation] = await Promise.all([
      this.deps.store.getTour(repo.id),
      this.deps.store.getGeneration(repo.id),
    ]);
    return { tour, generation: toGeneration(generation) };
  }

  /** Claims the generation and starts the run without waiting for it. */
  async start(workspaceId: string, repoId: string): Promise<TourGenerationStarted> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new AppError(REPO_NOT_CLONED, 'The repository is not cloned yet; wait for the import to finish.', 409);
    }
    const now = this.deps.now ?? Date.now;
    const startedAt = await this.deps.store.claim(repo.id, new Date(now()));
    if (!startedAt) {
      throw new AppError(GENERATION_IN_PROGRESS, 'A tour is already being generated for this repository.', 409);
    }
    // fire-and-forget: the run records its own outcome; this catch only covers a store failure
    void this.run(workspaceId, repo, startedAt).catch((err: unknown) => {
      this.deps.logger?.warn(
        { repoId: repo.id, outcome: 'store_error', error: err instanceof Error ? err.name : 'unknown' },
        'onboarding tour outcome could not be stored',
      );
    });
    return { generation: { status: 'running', started_at: startedAt.toISOString(), error: null } };
  }

  /** Marks every generation a dead process left `running` as failed. Call once on boot. */
  reapInterrupted(): Promise<number> {
    return this.deps.store.reapRunning(RESTART_MESSAGE);
  }

  private async run(workspaceId: string, repo: TourRepo, startedAt: Date): Promise<void> {
    const { store, logger } = this.deps;
    try {
      const tour = await withDeadline(this.generate(workspaceId, repo), GENERATION_TIMEOUT_MS);
      const stored = await store.complete(repo.id, startedAt, tour);
      logger?.info(
        {
          repoId: repo.id,
          outcome: stored ? 'completed' : 'discarded',
          tokensIn: tour.tokens_in,
          tokensOut: tour.tokens_out,
          costUsd: tour.cost_usd,
          droppedItems: tour.dropped_items,
        },
        'onboarding tour generated',
      );
    } catch (err) {
      logger?.info(
        {
          repoId: repo.id,
          outcome: err instanceof DeadlineError ? 'timeout' : err instanceof MissingKeyError ? 'missing_key' : 'failed',
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
          droppedItems: null,
        },
        'onboarding tour generated',
      );
      await store.fail(repo.id, startedAt, failureMessage(err));
    }
  }

  /** Reads the checkout and the index, asks the model once, returns the checked tour. */
  private async generate(workspaceId: string, repo: TourRepo): Promise<Tour> {
    const { deps } = this;
    const now = deps.now ?? Date.now;
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    const [head, tracked] = await Promise.all([deps.git.currentHead(ref), deps.git.listFiles(ref)]);
    const [topFiles, chains, state, repoMap] = await Promise.all([
      deps.intel.topFiles(repo.id, TOP_FILE_COUNT).catch((): string[] => []),
      deps.intel.criticalPaths(repo.id).catch((): string[][] => []),
      deps.intel.indexState(repo.id).catch(() => ({ filesIndexed: 0, lastIndexedSha: '' })),
      deps.intel.repoMap(repo.id, REPO_MAP_TOKEN_BUDGET).catch(() => ''),
    ]);

    const candidates = pickCandidates({ topFiles, chains, tracked });
    const runPaths = pickRunFiles(tracked);
    const runSet = new Set(runPaths);
    const excerptPaths = candidates.files.filter((p) => !runSet.has(p)).slice(0, EXCERPT_FILE_COUNT);
    const texts = await readFiles(deps.git, ref, [...runPaths, ...excerptPaths]);
    const withText = (paths: string[]) =>
      paths.filter((p) => texts.has(p)).map((path) => ({ path, text: texts.get(path)! }));

    const summary = summarizeTracked(tracked);
    const built = buildTourPrompt(
      {
        repoFullName: repo.fullName,
        stack: summary.stack,
        tree: summary.tree,
        repoMap,
        candidates: candidates.files,
        chains: candidates.chains,
        runFiles: withText(runPaths),
        excerpts: withText(excerptPaths),
      },
      (text) => deps.tokenizer.count(text),
    );

    const choice = await deps.resolveModel(workspaceId);
    let provider;
    try {
      provider = await deps.llm(choice.provider);
    } catch (err) {
      if (err instanceof AppError && err.code === 'config_error') throw new MissingKeyError(choice.provider);
      throw err;
    }
    const system = await deps.systemPrompt();
    // exactly one request: no re-prompt on a bad shape, no transport retry
    const result = await provider.completeStructured({
      model: choice.model,
      schema: TourDraft,
      schemaName: TOUR_SCHEMA_NAME,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: built.prompt },
      ],
      temperature: LLM_TEMPERATURE,
      maxTokens: LLM_MAX_TOKENS,
      maxRetries: 0,
      transportRetries: 0,
      timeoutMs: GENERATION_TIMEOUT_MS,
    });

    return buildTour(result.data, {
      tracked: new Set(tracked),
      meta: {
        repoId: repo.id,
        generatedAt: new Date(now()).toISOString(),
        commitSha: head,
        filesIndexed: state.filesIndexed,
        limitedIndex: topFiles.length === 0,
        provider: choice.provider,
        model: result.model || choice.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
      },
    }).tour;
  }
}

/** Reads `paths` from the clone; an unreadable, empty, binary or oversized file is left out. */
async function readFiles(git: GitClient, ref: RepoRef, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)].filter(isReadable);
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
