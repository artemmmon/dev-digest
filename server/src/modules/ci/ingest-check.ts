import { CiResultArtifact } from '@devdigest/shared';
import type { CiFailureReason, CiRunStatus, WorkflowRunArtifact } from '@devdigest/shared';
import { RESULT_ARTIFACT, RESULT_FILE, RESULT_MAX_BYTES } from './constants.js';
import type { ResultArchiveReader } from './ports.js';
import { findSecretShapes } from './redact.js';

export type CheckOutcome =
  | { ok: true; result: CiResultArtifact }
  | { ok: false; reason: CiFailureReason };

export interface CheckInput {
  /** Artifacts listed for the workflow run (metadata only). */
  artifacts: WorkflowRunArtifact[];
  /** The downloaded archive of the result artifact; absent until the size check passed. */
  archiveBytes?: Uint8Array;
  /** The GitHub workflow run the result was downloaded from. */
  run: { id: number; head_sha: string };
  installation: { repository_id: number | null };
  reader: ResultArchiveReader;
}

/**
 * Steps 1-3 of the ingest check, which need no download: the artifact must exist,
 * be unexpired and not exceed 256 KB. Returns the artifact to download, or the reason.
 */
export function selectResultArtifact(
  artifacts: readonly WorkflowRunArtifact[],
): { ok: true; artifact: WorkflowRunArtifact } | { ok: false; reason: CiFailureReason } {
  const artifact = artifacts.find((a) => a.name === RESULT_ARTIFACT);
  if (!artifact) return { ok: false, reason: 'no_result' };
  if (artifact.expired) return { ok: false, reason: 'result_expired' };
  if (artifact.size_in_bytes > RESULT_MAX_BYTES) return { ok: false, reason: 'result_too_large' };
  return { ok: true, artifact };
}

const fail = (reason: CiFailureReason): CheckOutcome => ({ ok: false, reason });

/** A path that could leave the archive root, or name something other than a plain file. */
const unsafeName = (name: string): boolean =>
  name.includes('/') || name.includes('\\') || name.includes('..');

/**
 * Verify a downloaded CI result before anything is stored. The first failing check
 * decides the reason; reasons are fixed enum values and never carry result content.
 * Without `archiveBytes` (the artifact passed the metadata checks but nothing was
 * downloaded) there is nothing to verify, which is `no_result`.
 */
export function checkResult(input: CheckInput): CheckOutcome {
  const selected = selectResultArtifact(input.artifacts);
  if (!selected.ok) return fail(selected.reason);
  if (!input.archiveBytes) return fail('no_result');

  let entries: Array<{ path: string; size: number }>;
  try {
    entries = input.reader.list(input.archiveBytes);
  } catch {
    return fail('invalid_result');
  }
  const [entry] = entries;
  if (entries.length !== 1 || !entry || entry.path !== RESULT_FILE || unsafeName(entry.path)) {
    return fail('invalid_result');
  }
  if (entry.size > RESULT_MAX_BYTES) return fail('result_too_large');

  let text: string;
  try {
    text = input.reader.readText(input.archiveBytes, RESULT_FILE, RESULT_MAX_BYTES);
  } catch (err) {
    return fail(err instanceof Error && /too large/i.test(err.message) ? 'result_too_large' : 'invalid_result');
  }
  if (findSecretShapes(text).length > 0) return fail('secret_in_result');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('invalid_result');
  }
  const parsed = CiResultArtifact.safeParse(json);
  if (!parsed.success) return fail('invalid_result');
  const result = parsed.data;

  if (result.commit_sha !== input.run.head_sha) return fail('commit_mismatch');
  // An installation whose repository id is still unknown cannot vouch for a result.
  if (input.installation.repository_id === null || result.repository_id !== input.installation.repository_id) {
    return fail('repository_mismatch');
  }
  if (result.run_id !== input.run.id) return fail('run_mismatch');
  return { ok: true, result };
}

/** Succeeded with at least one finding, No findings with none. Every rejection is Failed. */
export function statusFor(result: CiResultArtifact | null): CiRunStatus {
  if (!result) return 'failed';
  return result.findings_count > 0 ? 'succeeded' : 'no_findings';
}
