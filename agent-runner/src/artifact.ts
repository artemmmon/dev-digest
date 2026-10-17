import { CiResultArtifact, RUNNER_VERSION } from '@devdigest/shared';
import type { Finding, Verdict } from '@devdigest/shared';
import { RunnerError } from './errors.js';

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  /** Agent name from the manifest. */
  agent: string;
  /** Model id from the manifest. */
  model: string;
  manifestVersion: number;
  agentVersion: number;
  /** True when a finding is at or above the manifest's `ci_fail_on`. */
  gateTriggered: boolean;
  prNumber: number;
  /** PR head commit from `DEVDIGEST_HEAD_SHA` (AC-118). */
  commitSha: string;
  repositoryId: number;
  runId: number;
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Build + validate the `devdigest-result.json` artifact (AC-71). It holds
 * counts and ids only: no PR title or body, diff, finding text or env value
 * (AC-72). Validated
 * against the SAME `CiResultArtifact` Zod contract the studio's ingest path
 * (T6) will `safeParse` on the way back in, so a malformed artifact fails
 * loudly here rather than silently on ingest.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  // Deterministic, never the model's own verdict: the gate decides.
  const verdict: Verdict = input.gateTriggered ? 'request_changes' : 'comment';
  const candidate = {
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    verdict,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    // Capped to the contract's string limit so a long agent name cannot fail the run.
    agent: input.agent.slice(0, 200),
    manifest_version: input.manifestVersion,
    agent_version: input.agentVersion,
    runner_version: RUNNER_VERSION,
    model: input.model.slice(0, 200),
    commit_sha: input.commitSha,
    repository_id: input.repositoryId,
    run_id: input.runId,
    pr_number: input.prNumber,
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Should be unreachable — every field above is shaped to the schema. If
    // this ever fires it's a genuine internal bug, not a user/config error.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
