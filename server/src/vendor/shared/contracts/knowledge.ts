import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual',
  'imported_url',
  'imported_file',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /** Agents with an enabled binding to this skill. */
  agent_count: z.number().int().nullish(),
  /** Tokens the body adds to a prompt. */
  body_tokens: z.number().int().nullish(),
});
export type Skill = z.infer<typeof Skill>;

/** One saved body of a skill. `message` says what changed; v1 and old rows have none. */
export const SkillVersion = z.object({
  version: z.number().int(),
  body: z.string(),
  message: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** An agent that has this skill switched on. */
export const SkillAgentUse = z.object({ id: z.string(), name: z.string() });
export type SkillAgentUse = z.infer<typeof SkillAgentUse>;

/** Create / update body. `description` is the skill's interface — written as a directive. */
export const SkillInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  type: SkillType,
  body: z.string().min(1).max(200_000),
  source: SkillSource.optional(),
});
export type SkillInput = z.infer<typeof SkillInput>;

/** A file in an imported archive that the product read but did not use. */
export const IgnoredFile = z.object({
  path: z.string(),
  reason: z.enum(['executable', 'not_used']),
});
export type IgnoredFile = z.infer<typeof IgnoredFile>;

/** What an import extracted — shown for confirmation, nothing is saved yet. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source_file: z.string(),
  ignored_files: z.array(IgnoredFile),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const SkillImportBody = z.object({
  filename: z.string().min(1).max(255),
  // base64 of the 2 MiB import cap: ceil(2 * 1024 * 1024 / 3) * 4
  content_base64: z.string().min(1).max(2_796_204),
});
export type SkillImportBody = z.infer<typeof SkillImportBody>;

/** Import from a public https URL to a `.md` or `.zip` (GitHub `blob` links are accepted). */
export const SkillImportUrlBody = z.object({ url: z.string().trim().url().max(2048) });
export type SkillImportUrlBody = z.infer<typeof SkillImportUrlBody>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'types',
  'imports',
  'async',
  'testing',
  'api',
  'logging',
  'config',
  'formatting',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** One rule the repo already follows, with the code that proves it. */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  evidence_end_line: z.number().int().nullish(),
  evidence_snippet: z.string(),
  /** GitHub permalink to the evidence lines (pinned to `commit_sha`). */
  evidence_url: z.string().nullish(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  commit_sha: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionList = z.object({
  candidates: z.array(ConventionCandidate),
  last_scan: z.object({ at: z.string(), commit_sha: z.string().nullish() }).nullable(),
});
export type ConventionList = z.infer<typeof ConventionList>;

/** Accept / reject / undo (`status`) or reword (`rule`) one candidate. */
export const ConventionPatch = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(3).max(500).optional(),
  })
  .refine((p) => p.status !== undefined || p.rule !== undefined, {
    message: 'Provide status or rule',
  });
export type ConventionPatch = z.infer<typeof ConventionPatch>;

/** What one scan did — sampled inputs, what the evidence gate dropped, what it cost. */
export const ConventionScanReport = z.object({
  provider: z.string(),
  model: z.string(),
  commit_sha: z.string().nullish(),
  duration_ms: z.number().int(),
  config_files: z.array(z.string()),
  sampled_files: z.array(z.string()),
  sample_source: z.enum(['repo_intel', 'fallback', 'mixed']),
  raw_candidates: z.number().int(),
  kept: z.number().int(),
  line_corrected: z.number().int(),
  dropped: z.object({
    unknown_file: z.number().int(),
    snippet_not_found: z.number().int(),
    trivial_snippet: z.number().int(),
    duplicate: z.number().int(),
    known_decision: z.number().int(),
    category_cap: z.number().int(),
  }),
  categories: z.record(z.string(), z.number().int()),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number().nullish(),
});
export type ConventionScanReport = z.infer<typeof ConventionScanReport>;

export const ConventionScanResult = z.object({
  candidates: z.array(ConventionCandidate),
  report: ConventionScanReport,
});
export type ConventionScanResult = z.infer<typeof ConventionScanResult>;

export const ConventionIds = z.object({
  convention_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type ConventionIds = z.infer<typeof ConventionIds>;

/** A proposed skill assembled from accepted candidates — nothing is saved yet. */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: z.literal('convention'),
  body: z.string(),
  evidence_files: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

export const ConventionSkillCreate = ConventionIds.extend({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(200_000),
  /** Link the new skill to this agent (enabled, last in order). */
  agent_id: z.string().uuid().nullish(),
});
export type ConventionSkillCreate = z.infer<typeof ConventionSkillCreate>;

export const ConventionSkillCreated = z.object({
  skill_id: z.string(),
  name: z.string(),
  agent_id: z.string().nullish(),
});
export type ConventionSkillCreated = z.infer<typeof ConventionSkillCreated>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Enabled skill bindings; drives the "N skills" badge on the agent card.
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean().default(true),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

/** Replace an agent's skill bindings: array order is the prompt order. */
export const SetAgentSkillsBody = z.object({
  skills: z.array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean() })).max(100),
});
export type SetAgentSkillsBody = z.infer<typeof SetAgentSkillsBody>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
