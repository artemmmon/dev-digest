import type {
  GitClient,
  LLMProvider,
  PrIntent,
  Provider,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import type { RunBusPort } from '../_shared/ports.js';
import type { AgentStore } from '../agents/types.js';
import type { RepoIntel } from '../repo-intel/types.js';
import type { ReviewStore } from './ports.js';

/**
 * Structural port onto the intent module's service (L03) — reviews reaches it
 * through this narrow interface, not `modules/intent`'s concrete class, so the
 * two modules stay decoupled (onion-architecture: modules meet only through a
 * port wired in the container).
 */
export interface IntentPort {
  /** Never throws (D9, fail-open): a failure is logged via `onEvent` and returns `null`. */
  forRun(
    input: { workspaceId: string; prId: string; diff?: UnifiedDiff },
    onEvent?: (kind: RunEventKind, msg: string, data?: unknown) => void,
  ): Promise<{ intent: PrIntent; stale: boolean } | null>;
}

/** Everything the review service and the run executor collaborate with — narrow ports, no Container. */
export interface ReviewDeps {
  reviews: ReviewStore;
  agents: AgentStore;
  /** `git diff base...head` on the local clone. */
  git: GitClient;
  /** Lazy LLM client by provider id; throws when that provider has no key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** repo-intel facade (callers, repo map, file rank); degrades to empty results. */
  repoIntel: RepoIntel;
  /** Live run-event bus (Live Log, cancellation). */
  bus: RunBusPort;
  /** Token counter for the per-skill breakdown in the run trace. */
  tokenizer: { count(text: string): number };
  /** The PR's derived intent (L03) — shared pre-work, reused across every agent in the batch. */
  intent: IntentPort;
}

/** The repo a PR belongs to — enough to run git against its clone. */
export interface RunRepo {
  id: string;
  owner: string;
  name: string;
}
