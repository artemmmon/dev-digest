/**
 * Narrow response schemas: only the fields the tools read. They use this package's
 * own zod (the vendored contracts load the server's copy at runtime, which the MCP
 * SDK cannot share). Each block ends with a compile-time drift check against the
 * server contract: if the server drops or retypes a field used here, `pnpm typecheck`
 * fails.
 */
import { z } from 'zod';
import type {
  Agent,
  BlastRadiusResponse,
  ConventionList,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
export const VERDICTS = ['approve', 'comment', 'request_changes'] as const;

export const RepoLite = z.object({ id: z.string(), full_name: z.string() });
export const RepoListLite = z.array(RepoLite);

export const AgentLite = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  provider: z.string(),
  model: z.string(),
});
export const AgentListLite = z.array(AgentLite);

export const PrLite = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
});
export const PrListLite = z.array(PrLite);

export const RunLite = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  score: z.number().int().nullable(),
  ran_at: z.string().nullable(),
});
export const RunListLite = z.array(RunLite);

/** `GET /pulls/:id/runs/active` has no server response schema; this is its handler's shape. */
export const ActiveRunLite = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
});
export const ActiveRunListLite = z.array(ActiveRunLite);

export const StartedReviewLite = z.object({
  runs: z.array(z.object({ run_id: z.string(), agent_id: z.string(), agent_name: z.string() })),
});

export const FindingLite = z.object({
  id: z.string(),
  severity: z.enum(SEVERITIES),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  scope: z.enum(['in_scope', 'out_of_scope']).nullish(),
  dismissed_at: z.string().nullable(),
});
export const ReviewLite = z.object({
  id: z.string(),
  run_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  verdict: z.enum(VERDICTS).nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  created_at: z.string(),
  findings: z.array(FindingLite),
});
export const ReviewListLite = z.array(ReviewLite);

export const ConventionLite = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  confidence: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});
export const ConventionListResponseLite = z.object({
  candidates: z.array(ConventionLite),
  last_scan: z.object({ at: z.string() }).nullable(),
});

/** Same five strings as the server's `BlastDegradedReason` (drift-checked below). */
export const BLAST_REASONS = ['flag_off', 'no_data', 'index_failed', 'index_partial', 'repo_too_large'] as const;

/** `GET /pulls/:id/blast`: only the fields the tool reads. */
export const BlastResponseLite = z.object({
  blast: z.object({
    changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
    downstream: z.array(
      z.object({
        symbol: z.string(),
        callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.number().int() })),
        endpoints_affected: z.array(z.string()),
        crons_affected: z.array(z.string()),
      }),
    ),
    summary: z.string(),
  }),
  head_sha: z.string(),
  index: z.object({ degraded: z.boolean(), reason: z.enum(BLAST_REASONS).nullable() }),
  counts: z.object({
    changed_files: z.number().int(),
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  truncated: z.boolean(),
});

// ---- drift checks (compile time only) ---------------------------------------
type Assignable<Server, Local> = Server extends Local ? true : false;
// `Assignable` alone cannot see a renamed field the local schema marks `.nullish()`: an
// absent optional property still assigns. `HasKey` asserts the server type still has the key.
type HasKey<Server, K extends string> = K extends keyof Server ? true : false;
type AllTrue<T extends true[]> = T;
export type DriftChecks = AllTrue<[
  Assignable<Repo, z.input<typeof RepoLite>>,
  Assignable<Agent, z.input<typeof AgentLite>>,
  Assignable<PrMeta, z.input<typeof PrLite>>,
  Assignable<RunSummary, z.input<typeof RunLite>>,
  Assignable<ReviewRecord, z.input<typeof ReviewLite>>,
  Assignable<ConventionList, z.input<typeof ConventionListResponseLite>>,
  Assignable<BlastRadiusResponse, z.input<typeof BlastResponseLite>>,
  // Fields the local schemas mark `.nullish()`: a server rename must fail typecheck.
  HasKey<PrMeta, 'id'>,
  HasKey<FindingRecord, 'suggestion'>,
  HasKey<FindingRecord, 'scope'>,
]>;

export type RepoInfo = z.output<typeof RepoLite>;
export type AgentInfo = z.output<typeof AgentLite>;
export type PrInfo = z.output<typeof PrLite>;
export type RunInfo = z.output<typeof RunLite>;
export type ActiveRunInfo = z.output<typeof ActiveRunLite>;
export type FindingInfo = z.output<typeof FindingLite>;
export type ReviewInfo = z.output<typeof ReviewLite>;
export type ConventionInfo = z.output<typeof ConventionLite>;
export type ConventionListInfo = z.output<typeof ConventionListResponseLite>;
export type BlastInfo = z.output<typeof BlastResponseLite>;
