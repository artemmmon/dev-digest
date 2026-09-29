/**
 * Output schemas (`structuredContent`) of the five tools, as zod objects the MCP SDK
 * validates against. The result types themselves live in `../domain.ts`; the checks at
 * the bottom fail `pnpm typecheck` when a schema and its domain type drift apart.
 *
 * Only `run_agent_on_pr` and `get_findings` advertise an output schema (`RunResultOut`,
 * the two tools that return findings; token budget, see docs/devdigest-mcp.md).
 * `ListAgentsOut` and `ConventionsOut` are not advertised, and `get_blast_radius` is a
 * stub that always answers `isError`, so `BlastRadiusOut` is not advertised either; all
 * three are kept as the documented shape, for the drift checks and for tests that parse
 * a tool's `structuredContent`.
 */
import { z } from 'zod';
import type { BlastRadius } from '@devdigest/shared';
import type {
  AgentOut as AgentType,
  ConventionOut as ConventionType,
  ConventionsResult,
  FindingOut as FindingType,
  ListAgentsResult,
  RunResult,
} from '../domain.js';
import { SEVERITIES, VERDICTS } from '../api/schemas.js';

export const RUN_STATUSES = ['done', 'running', 'failed', 'cancelled'] as const;

export const FindingOut = z.object({
  id: z.string(),
  severity: z.enum(SEVERITIES),
  file: z.string(),
  lines: z.string(),
  title: z.string(),
  category: z.string(),
  scope: z.enum(['in_scope', 'out_of_scope']).optional(),
  rationale: z.string().optional(),
  suggestion: z.string().optional(),
});

export const RunResultOut = z.object({
  status: z.enum(RUN_STATUSES),
  run_id: z.string(),
  repo: z.string(),
  pr: z.number().int(),
  agent_id: z.string(),
  agent_name: z.string(),
  verdict: z.enum(VERDICTS).nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  counts: z.object({ critical: z.number().int(), warning: z.number().int(), suggestion: z.number().int() }),
  findings: z.array(FindingOut),
  total: z.number().int(),
  truncated: z.boolean(),
  next_step: z.string().nullable(),
});

export const AgentOut = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  provider: z.string(),
  model: z.string(),
});

export const ListAgentsOut = z.object({
  agents: z.array(AgentOut),
  total: z.number().int(),
  next_step: z.string().nullable(),
});

export const ConventionOut = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence: z.string(),
  confidence: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});

export const ConventionsOut = z.object({
  repo: z.string(),
  last_scan_at: z.string().nullable(),
  conventions: z.array(ConventionOut),
  total: z.number().int(),
  truncated: z.boolean(),
  next_step: z.string().nullable(),
});

/** Mirrors the server's `BlastRadius` contract (contracts/brief.ts). */
export const BlastRadiusOut = z.object({
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
});

// ---- drift checks (compile time only) ---------------------------------------
// Each schema output and its type must be exactly equal, optional properties included:
// `{ a?: string }` and `{ b?: string }` assign both ways (every property is optional), so
// a two-way assignability check misses a renamed optional field. The
// `<T>() => T extends A ? 1 : 2` trick compares the types structurally and strictly.
// A mismatch makes the alias `never`, and the `true` constant below then fails to typecheck.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Check<T extends boolean> = T extends true ? true : never;

export const outputsInSync: [
  Check<Equal<z.output<typeof FindingOut>, FindingType>>,
  Check<Equal<z.output<typeof RunResultOut>, RunResult>>,
  Check<Equal<z.output<typeof ListAgentsOut>, ListAgentsResult>>,
  Check<Equal<z.output<typeof ConventionsOut>, ConventionsResult>>,
  Check<Equal<z.output<typeof BlastRadiusOut>, BlastRadius>>,
  // Nested items are checked on their own too, so a drift inside `agents[]`, `conventions[]`
  // or `findings[]` names the item type it happened in.
  Check<Equal<z.output<typeof ConventionOut>, ConventionType>>,
  Check<Equal<z.output<typeof AgentOut>, AgentType>>,
] = [true, true, true, true, true, true, true];
