import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { PullsRepository } from '../modules/pulls/index.js';
import type { ReviewDeps } from '../modules/reviews/deps.js';
import { SettingsRepository } from '../modules/settings/repository.js';
import { RepoRepository } from '../modules/repos/index.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { cpus } from 'node:os';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { RepoIntelRepository } from '../modules/repo-intel/repository.js';
import type { RepoFiles, RepoIntelDeps, SourceParser } from '../modules/repo-intel/ports.js';
import { AstGrepSourceParser } from '../adapters/astgrep/source-parser.js';
import { FsRepoFiles } from '../adapters/repo-files/fs.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** Run-event bus; defaults to the process-wide one. Tests inject a fresh bus. */
  runBus?: RunBus;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  sourceParser?: SourceParser;
  repoFiles?: RepoFiles;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _pullsRepo?: PullsRepository;
  private _settingsRepo?: SettingsRepository;
  private _reposRepo?: RepoRepository;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _repoIntelRepo?: RepoIntelRepository;
  private _sourceParser?: SourceParser;
  private _repoFiles?: RepoFiles;
  private _tokenizer?: Tokenizer;
  private _priceBook?: PriceBook;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = overrides.runBus ?? runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir, () =>
      this.secrets.get('GITHUB_TOKEN'),
    );
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reposRepo(): RepoRepository {
    return (this._reposRepo ??= new RepoRepository(this.db));
  }

  get settingsRepo(): SettingsRepository {
    return (this._settingsRepo ??= new SettingsRepository(this.db));
  }

  get pullsRepo(): PullsRepository {
    return (this._pullsRepo ??= new PullsRepository(this.db));
  }

  /** Collaborators of the review service and run executor, wired from the container. */
  get reviewDeps(): ReviewDeps {
    return {
      reviews: this.reviewRepo,
      agents: this.agentsRepo,
      git: this.git,
      llm: (provider) => this.llm(provider),
      repoIntel: this.repoIntel,
      bus: this.runBus,
    };
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this.repoIntelRepo, this.repoIntelDeps);
    return this._repoIntel;
  }

  get repoIntelRepo(): RepoIntelRepository {
    return (this._repoIntelRepo ??= new RepoIntelRepository(this.db));
  }

  /** Collaborators of the repo-intel service and its indexing pipeline, wired from the container. */
  get repoIntelDeps(): RepoIntelDeps {
    return {
      git: this.git,
      parser: this.sourceParser,
      files: this.repoFiles,
      depgraph: this.depgraph,
      tokenizer: this.tokenizer,
      // leave a core free for the API while a repo is being parsed
      parseConcurrency: Math.max(1, cpus().length - 1),
      jobs: this.jobs,
      codeIndex: this.codeIndex,
      enabled: this.config.repoIntelEnabled,
    };
  }

  get sourceParser(): SourceParser {
    if (this.overrides.sourceParser) return this.overrides.sourceParser;
    this._sourceParser ??= new AstGrepSourceParser();
    return this._sourceParser;
  }

  get repoFiles(): RepoFiles {
    if (this.overrides.repoFiles) return this.overrides.repoFiles;
    this._repoFiles ??= new FsRepoFiles();
    return this._repoFiles;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /**
   * Throwaway clients built from an explicit key — not cached, nothing persisted.
   * test-connection checks a candidate key with these before saving it, so a typo
   * never replaces a working key.
   */
  githubWithToken(token: string): GitHubClient {
    return this.overrides.github ?? new OctokitGitHubClient(token);
  }

  async llmWithKey(id: 'openai' | 'anthropic' | 'openrouter', key: string): Promise<LLMProvider> {
    return this.overrides.llm?.[id] ?? this.buildLlm(id, key);
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(
    id: 'openai' | 'anthropic' | 'openrouter',
    explicitKey?: string,
  ): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = explicitKey ?? (await this.secrets.get('OPENAI_API_KEY'));
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = explicitKey ?? (await this.secrets.get('OPENROUTER_API_KEY'));
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = explicitKey ?? (await this.secrets.get('ANTHROPIC_API_KEY'));
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
  }
}
