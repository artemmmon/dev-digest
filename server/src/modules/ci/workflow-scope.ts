import { AppError } from '../../platform/errors.js';

const WORKFLOWS_DIR = '.github/workflows/';

/**
 * A commit that writes under `.github/workflows/` is refused for a token without the
 * `workflow` permission, but GitHub's REST body does not always say so (an Actions token
 * gets 403 "Resource not accessible by integration"). So the commit payload decides: when a
 * commit-files call fails with 403 or 422 (404 only after the repository was read) and
 * writes a workflow file, the failure is `github_workflow_scope`. Anything else, and an
 * error that is already mapped, is returned unchanged. Only the code and status travel on;
 * the caller replaces the message with a fixed text.
 */
export function asWorkflowScopeError(
  err: unknown,
  files: ReadonlyArray<{ path: string }>,
  repositoryRead: boolean,
): unknown {
  if (!(err instanceof AppError) || err.code === 'github_workflow_scope') return err;
  if (!files.some((f) => f.path.startsWith(WORKFLOWS_DIR))) return err;
  const status = (err.details as { status?: unknown } | undefined)?.status;
  const refused = status === 403 || status === 422 || (status === 404 && repositoryRead);
  return refused ? new AppError('github_workflow_scope', err.message, 403, err.details) : err;
}
