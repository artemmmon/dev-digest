import { describe, it, expect } from 'vitest';
import type { CommitFilesPayload, RepoRef } from '@devdigest/shared';
import { MockGitHubClient } from '../../adapters/mocks.js';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { CiService } from './service.js';
import type { CiDeps, CiInstallationRecord, NewCiInstallation } from './ports.js';

/** A GitHub client whose commit is refused the way the Octokit adapter reports it. */
class RefusingGitHub extends MockGitHubClient {
  constructor(private readonly refusal: AppError) {
    super();
  }
  override async commitFiles(_repo: RepoRef, _payload: CommitFilesPayload): Promise<{ branch: string }> {
    throw this.refusal;
  }
}

const message = "GitHub couldn't commit files: Resource not accessible by integration";

function service(github: MockGitHubClient): CiService {
  const deps = {
    store: {
      memoryFor: async () => [],
      activeInstallationForRepo: async () => undefined,
      replaceInstallation: async (next: NewCiInstallation) =>
        ({ ...next, id: 'inst-1', endedAt: null, lastIngestedAt: null }) as CiInstallationRecord,
    },
    agents: {
      getById: async () => ({
        id: 'agent-1',
        name: 'Reviewer',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        systemPrompt: 'Review.',
        strategy: 'single-pass',
        ciFailOn: 'never',
        version: 1,
      }),
      resolvedSkills: async () => [],
    },
    repos: { getById: async () => ({ id: 'repo-1', fullName: 'acme/api', defaultBranch: 'main' }) },
    github: async () => github,
    bundle: { read: async () => [{ name: 'index.js', bytes: new Uint8Array([1]) }] },
    zip: { zip: () => new Uint8Array() },
    archive: { list: () => [], readText: () => '' },
    now: () => new Date('2026-10-17T00:00:00Z'),
    log: { info: () => undefined, warn: () => undefined },
  } as unknown as CiDeps;
  return new CiService(deps);
}

async function install(github: MockGitHubClient): Promise<unknown> {
  const svc = service(github);
  // The default workflow of the preview, committed as written.
  const preview = await svc.preview('ws', 'agent-1', {
    repo_id: 'repo-1',
    triggers: ['opened'],
    post_as: 'none',
  } as never);
  const workflow = preview.files.find((f) => f.editable)!.contents!;
  return svc
    .install(
      'ws',
      'agent-1',
      { repo_id: 'repo-1', triggers: ['opened'], post_as: 'none', workflow, confirm_replace: false } as never,
      'pr',
    )
    .catch((err: unknown) => err);
}

describe('CiService.install commit refusal', () => {
  it('AC-57: a 403 "Resource not accessible by integration" becomes github_workflow_scope with a fixed text', async () => {
    const err = (await install(
      new RefusingGitHub(new AppError('github_auth_failed', message, 502, { status: 403 })),
    )) as AppError;
    expect(err.code).toBe('github_workflow_scope');
    expect(err.statusCode).toBe(403);
    expect(err.message).not.toContain('Resource not accessible');
    expect(err.message).toContain('"workflow" scope');
  });

  it('AC-57: a 404 after the repository was read becomes github_workflow_scope', async () => {
    const err = (await install(
      new RefusingGitHub(new AppError('github_not_found', message, 404, { status: 404 })),
    )) as AppError;
    expect(err.code).toBe('github_workflow_scope');
  });

  it('a 500 is not mapped and keeps a fixed text', async () => {
    const err = (await install(new RefusingGitHub(new ExternalServiceError(message, { status: 500 })))) as AppError;
    expect(err.code).toBe('external_service_error');
    expect(err.message).toBe('GitHub could not complete the request');
  });
});
