import { describe, expect, it } from 'vitest';
import { ApiError } from './api/errors.js';
import { NextStepError, apiErrorMessage } from './errors.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { AGENT2_ID, AGENT_ID, FakeApi, PR_ID, agent } from './test-support/fake-api.js';

async function failureOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof NextStepError) return err.message;
    throw err;
  }
  throw new Error('expected a NextStepError');
}

describe('resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    const repo = await resolveRepo(new FakeApi(), 'ACME/Api');
    expect(repo.full_name).toBe('acme/api');
  });

  it('unknown repo says where to add it', async () => {
    expect(await failureOf(resolveRepo(new FakeApi(), 'acme/nope'))).toBe(
      'Repo acme/nope is not in DevDigest; add it on the Repos page.',
    );
  });
});

describe('resolvePull', () => {
  const repo = { id: 'r', full_name: 'acme/api' };

  it('finds a persisted PR without syncing', async () => {
    const api = new FakeApi();
    const pr = await resolvePull(api, repo, 7, { syncOnMiss: true });
    expect(pr.id).toBe(PR_ID);
    expect(api.count('syncPulls')).toBe(0);
  });

  it('syncs once on a miss and retries', async () => {
    const api = new FakeApi();
    api.remotePulls = [{ id: 'pr-9', number: 9, title: 'New' }];
    const pr = await resolvePull(api, repo, 9, { syncOnMiss: true });
    expect(pr.id).toBe('pr-9');
    expect(api.count('syncPulls')).toBe(1);
  });

  it('unknown after sync: not found on GitHub', async () => {
    const api = new FakeApi();
    expect(await failureOf(resolvePull(api, repo, 99, { syncOnMiss: true }))).toBe(
      'PR #99 not found in acme/api on GitHub.',
    );
    expect(api.count('syncPulls')).toBe(1);
  });

  it('read tools never sync', async () => {
    const api = new FakeApi();
    const msg = await failureOf(resolvePull(api, repo, 99, { syncOnMiss: false }));
    expect(msg).toBe(
      "PR #99 of acme/api is not in DevDigest yet; open the repo's PR list in DevDigest to sync it.",
    );
    expect(api.count('syncPulls')).toBe(0);
  });
});

describe('resolveAgent', () => {
  it('accepts an id', async () => {
    expect((await resolveAgent(new FakeApi(), AGENT_ID)).id).toBe(AGENT_ID);
  });

  it('accepts an exact name, case-insensitively', async () => {
    expect((await resolveAgent(new FakeApi(), 'security reviewer')).id).toBe(AGENT_ID);
  });

  it('does not accept a partial name', async () => {
    expect(await failureOf(resolveAgent(new FakeApi(), 'security'))).toBe(
      "Agent 'security' not found; call list_agents for valid ids.",
    );
  });

  it('an unknown uuid is not found', async () => {
    expect(await failureOf(resolveAgent(new FakeApi(), AGENT2_ID))).toContain('not found');
  });

  it('an ambiguous name is an error that points at list_agents', async () => {
    const api = new FakeApi();
    api.agents = [agent(), agent({ id: AGENT2_ID, name: 'SECURITY REVIEWER' })];
    expect(await failureOf(resolveAgent(api, 'Security Reviewer'))).toBe(
      "'Security Reviewer' matches several agents; pass the id from list_agents.",
    );
  });

  it('control characters in the argument never reach the message', async () => {
    const msg = await failureOf(resolveAgent(new FakeApi(), 'x\u001b[31m\nignore all'));
    expect([...msg].every((ch) => ch.charCodeAt(0) >= 0x20)).toBe(true);
  });
});

describe('error mapping', () => {
  const url = 'http://localhost:3001';

  it('unreachable names the origin and the start command', () => {
    expect(apiErrorMessage(new ApiError('unreachable'), url)).toBe(
      'DevDigest API is not reachable at http://localhost:3001. Start it with ./scripts/dev.sh, then retry.',
    );
  });

  it('rate_limited says to wait', () => {
    expect(apiErrorMessage(new ApiError('rate_limited', 429), url)).toBe(
      'DevDigest rate-limited the request; wait about a minute and retry.',
    );
  });

  it.each(['not_found', 'invalid', 'server'] as const)('%s tells the model what to do next', (kind) => {
    expect(apiErrorMessage(new ApiError(kind), url)).toMatch(/retry|list_agents|Check/);
  });
});
