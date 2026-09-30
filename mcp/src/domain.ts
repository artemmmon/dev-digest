/**
 * Core result types of the five tools. Types only: no runtime code and no imports, so
 * every other file can depend on this one and it depends on nothing. `tools/outputs.ts`
 * holds the zod output schemas and asserts at compile time that they match these types.
 *
 * Text fields come from LLM output or PR/repo content; `format.ts` clips them and they
 * are returned as data in named fields, never as instructions.
 */

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
export type Verdict = 'approve' | 'comment' | 'request_changes';
/** The API's free-form run status, folded into the four states the tools report. */
export type RunStatus = 'done' | 'running' | 'failed' | 'cancelled';

export type FindingOut = {
  id: string;
  severity: Severity;
  file: string;
  lines: string;
  title: string;
  category: string;
  scope?: 'in_scope' | 'out_of_scope';
  rationale?: string;
  suggestion?: string;
};

/** What `run_agent_on_pr` and `get_findings` return. */
export type RunResult = {
  status: RunStatus;
  run_id: string;
  repo: string;
  pr: number;
  agent_id: string;
  agent_name: string;
  verdict: Verdict | null;
  score: number | null;
  summary: string | null;
  counts: { critical: number; warning: number; suggestion: number };
  findings: FindingOut[];
  total: number;
  truncated: boolean;
  next_step: string | null;
};

export type AgentOut = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  provider: string;
  model: string;
};

export type ListAgentsResult = {
  agents: AgentOut[];
  total: number;
  next_step: string | null;
};

export type ConventionOut = {
  id: string;
  category: string;
  rule: string;
  /** `path:line` pointer. */
  evidence: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
};

export type ConventionsResult = {
  repo: string;
  last_scan_at: string | null;
  conventions: ConventionOut[];
  total: number;
  truncated: boolean;
  next_step: string | null;
};

export type BlastReason = 'flag_off' | 'no_data' | 'index_failed' | 'index_partial' | 'repo_too_large';

/** What `get_blast_radius` returns: the route's map (repo text clipped) plus index state. */
export type BlastRadiusResult = {
  repo: string;
  pr: number;
  changed_symbols: { name: string; file: string; kind: string }[];
  downstream: {
    symbol: string;
    callers: { name: string; file: string; line: number }[];
    endpoints_affected: string[];
    crons_affected: string[];
  }[];
  summary: string;
  counts: { symbols: number; callers: number; endpoints: number; crons: number };
  degraded: boolean;
  reason: BlastReason | null;
  truncated: boolean;
  next_step: string | null;
};
