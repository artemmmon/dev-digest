/**
 * @devdigest/shared — single source of truth for cross-package contracts.
 *
 * Exports (Zod schemas + inferred TS types):
 *  - contracts/findings   Review, Finding, Severity, Verdict, FindingAction, trifecta
 *  - contracts/brief      Intent, BlastRadius, Risks, PrHistory, SmartDiff, PrBrief
 *  - contracts/knowledge  Conformance, EvalRun/EvalCase, MemoryItem,
 *                         Skill/CommunitySkill, ConventionCandidate, Agent
 *  - contracts/onboarding-tour  Tour, TourRead, TourGeneration (five-section onboarding tour)
 *  - contracts/trace      RunTrace, RunEvent, RunLogLine (single-document trace)
 *  - contracts/platform   Settings, ConnTestResult, Repo, PrMeta/PrDetail, …
 *  - contracts/project-context  ProjectDocument(List), ContextDocRecord, Agent/SkillContext
 *  - contracts/languages  ext -> language table, generated/junk/lockfile/scaffold patterns
 *  - adapters             adapter interfaces + ModelInfo
 *
 * Feature agents (A1–A6) and F2 import everything from here. The barrel is
 * stable — feature agents EXTEND with new files, they do not edit existing ones.
 */

export * from './contracts/findings.js';
export * from './contracts/review-api.js';
export * from './contracts/brief.js';
export * from './contracts/knowledge.js';
export * from './contracts/onboarding-tour.js';
export * from './contracts/trace.js';
export * from './contracts/platform.js';
export * from './contracts/project-context.js';
export * from './contracts/why.js';
export * from './contracts/eval-ci.js';
export * from './contracts/observability.js';
export * from './contracts/productionize.js';
export * from './contracts/code-index.js';
export * from './contracts/languages.js';
export * from './adapters.js';
