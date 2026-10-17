import { describe, it, expect } from 'vitest';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { asWorkflowScopeError } from './workflow-scope.js';

const WORKFLOW = [{ path: '.github/workflows/devdigest-review.yml' }];
const OTHER = [{ path: '.devdigest/memory.jsonl' }];

/** The error the GitHub adapter raises for a status (its mapping, without the workflow rule). */
const adapterError = (status: number): AppError => {
  const message = "GitHub couldn't commit files: Resource not accessible by integration";
  const details = { status };
  if (status === 404) return new AppError('github_not_found', message, 404, details);
  if (status === 422) return new AppError('github_rejected', message, 422, details);
  if (status === 403) return new AppError('github_auth_failed', message, 502, details);
  return new ExternalServiceError(message, details);
};

describe('asWorkflowScopeError', () => {
  it('AC-57: maps a 403 "Resource not accessible by integration" on a workflow path', () => {
    const out = asWorkflowScopeError(adapterError(403), WORKFLOW, true) as AppError;
    expect(out.code).toBe('github_workflow_scope');
    expect(out.statusCode).toBe(403);
  });

  it('AC-57: maps a 422 on a workflow path', () => {
    expect((asWorkflowScopeError(adapterError(422), WORKFLOW, false) as AppError).code).toBe(
      'github_workflow_scope',
    );
  });

  it('does not map a 403 without a workflow path', () => {
    const err = adapterError(403);
    expect(asWorkflowScopeError(err, OTHER, true)).toBe(err);
  });

  it('AC-57: maps a 404 on a workflow path only when the repository was read', () => {
    const err = adapterError(404);
    expect((asWorkflowScopeError(err, WORKFLOW, true) as AppError).code).toBe('github_workflow_scope');
    expect(asWorkflowScopeError(err, WORKFLOW, false)).toBe(err);
  });

  it('does not map a 500, and leaves a non-AppError and an already mapped error alone', () => {
    const err = adapterError(500);
    expect(asWorkflowScopeError(err, WORKFLOW, true)).toBe(err);
    const plain = new Error('boom');
    expect(asWorkflowScopeError(plain, WORKFLOW, true)).toBe(plain);
    const mapped = new AppError('github_workflow_scope', 'x', 403, { status: 403 });
    expect(asWorkflowScopeError(mapped, OTHER, true)).toBe(mapped);
  });
});
