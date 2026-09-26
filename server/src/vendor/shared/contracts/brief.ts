import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** Where one intent source came from. */
export const IntentSourceKind = z.enum(['title', 'body', 'issue', 'ticket', 'doc', 'files']);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** Whether a linked/referenced source's content actually reached the classifier prompt. */
export const IntentSourceStatus = z.enum(['used', 'unreachable', 'not_found', 'too_large']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

export const IntentSource = z.object({
  id: z.string(),
  kind: IntentSourceKind,
  ref: z.string(),
  status: IntentSourceStatus,
  via: z.enum(['graphql', 'regex', 'link', 'pr_added', 'clone-head']).nullish(),
  chars: z.number().int().nullish(),
  truncated: z.boolean().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** What a risk chip flags about the changed paths. */
export const RiskAreaKind = z.enum([
  'auth',
  'dependency',
  'migration',
  'ci_config',
  'secrets_config',
  'performance',
  'api_contract',
  'data',
  'other',
]);
export type RiskAreaKind = z.infer<typeof RiskAreaKind>;

/** One risk-area chip on the Intent card. `origin` marks which producer made it (D13). */
export const RiskArea = z.object({
  kind: RiskAreaKind,
  label: z.string(),
  origin: z.enum(['rule', 'model']),
});
export type RiskArea = z.infer<typeof RiskArea>;

/**
 * A changed hunk the classifier judged unrelated to the PR's stated intent (e.g. a
 * different endpoint touched "while here"). New-side line range, from the hunk header.
 * The scope policy treats any finding inside it as out of scope, deterministically.
 */
export const IncidentalChange = z.object({
  path: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  /** The `@@ … @@ <context>` header the classifier saw. */
  header: z.string(),
  reason: z.string().nullish(),
});
export type IncidentalChange = z.infer<typeof IncidentalChange>;

export const IntentConfidenceTier = z.enum(['high', 'medium', 'low']);
export type IntentConfidenceTier = z.infer<typeof IntentConfidenceTier>;

export const IntentBasis = z.enum(['documented', 'inferred']);
export type IntentBasis = z.infer<typeof IntentBasis>;

/** Stored per-PR intent row (`pr_intent`), the classifier output plus evidence metadata. */
export const PrIntent = Intent.extend({
  pr_id: z.string(),
  confidence_tier: IntentConfidenceTier,
  basis: IntentBasis,
  missing_context: z.boolean(),
  sources: z.array(IntentSource),
  risk_areas: z.array(RiskArea),
  /** Hunks unrelated to the stated intent (nullish: rows derived before this field). */
  incidental_changes: z.array(IncidentalChange).nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  head_sha: z.string().nullish(),
  tokens_in: z.number().int().nullish(),
  tokens_out: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
  derived_at: z.string().nullish(),
});
export type PrIntent = z.infer<typeof PrIntent>;

/** GET /pulls/:id/intent response. */
export const PrIntentResponse = z.object({
  intent: PrIntent.nullable(),
  stale: z.boolean(),
  current_head_sha: z.string(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Size/count caps shared by the intent classifier prompt and the doc-fetch adapter. */
export const INTENT_LIMITS = {
  titleChars: 300,
  bodyChars: 6000,
  maxIssues: 3,
  issueChars: 3000,
  maxTicketKeys: 5,
  maxDocs: 3,
  docMaxBytes: 64 * 1024,
  docChars: 6000,
  maxFiles: 100,
  maxHunkHeadersPerFile: 5,
  hunkHeaderChars: 120,
  promptTotalChars: 20000,
  maxInScope: 5,
  maxOutOfScope: 5,
  scopeItemChars: 160,
  summaryChars: 280,
  maxModelRiskAreas: 3,
  maxRuleRiskAreas: 5,
  maxRiskAreas: 6,
  riskAreaLabelChars: 60,
  maxIncidentalChanges: 20,
  incidentalReasonChars: 160,
} as const;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
