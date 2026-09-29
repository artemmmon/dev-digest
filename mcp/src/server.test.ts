/**
 * MCP wiring only: tool registration, input validation, structuredContent, and how
 * failures reach the client as `isError`. Behaviour of the tools lives in service.test.ts.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from './api/errors.js';
import { createServer } from './server.js';
import { AGENT_ID, FakeApi, RUN_ID, run } from './test-support/fake-api.js';
import { BLAST_RADIUS_NOT_IMPLEMENTED } from './tools/get-blast-radius.js';
import { ConventionsOut, ListAgentsOut, RunResultOut } from './tools/outputs.js';

const CONFIG = { apiUrl: 'http://localhost:3001', maxWaitS: 90 };

interface CallResult {
  isError?: boolean;
  content: { type: string; text: string }[];
  // Test-only loose view of the structured result; the contract itself is checked by the SDK.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredContent?: Record<string, any>;
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((c) => c()));
});

async function connect(api: FakeApi, config = CONFIG) {
  const server = createServer(api, config, { pollMs: 1 });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  closers.push(() => client.close());
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as CallResult;
  return { client, call, server };
}

const target = { repo: 'acme/api', pr: 7, agent: 'Security Reviewer' };

describe('tools/list', () => {
  it('registers exactly the five tools in order; only the two tools that return findings advertise an output schema', async () => {
    const { client } = await connect(new FakeApi());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);
    for (const t of tools) {
      const advertised = ['run_agent_on_pr', 'get_findings'].includes(t.name);
      expect(t.outputSchema !== undefined, `${t.name} outputSchema`).toBe(advertised);
    }
  });

  it('interpolates the configured maximum wait into the run tool description', async () => {
    const { client } = await connect(new FakeApi(), { ...CONFIG, maxWaitS: 120 });
    const { tools } = await client.listTools();
    const description = tools.find((t) => t.name === 'run_agent_on_pr')!.description!;
    expect(description).toContain('configured maximum (120 s)');
    expect(description).not.toContain('90 s');
  });
});

describe('happy paths (structuredContent and the same JSON as text)', () => {
  it('list_agents', async () => {
    const res = await (await connect(new FakeApi())).call('list_agents', {});
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent!.total).toBe(1);
    expect(JSON.parse(res.content[0]!.text)).toEqual(res.structuredContent);
  });

  it('run_agent_on_pr accepts the agent id and a case-insensitive repo', async () => {
    const res = await (await connect(new FakeApi())).call('run_agent_on_pr', { repo: 'ACME/API', pr: 7, agent: AGENT_ID });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toMatchObject({ status: 'done', run_id: RUN_ID, repo: 'acme/api', pr: 7 });
  });

  it('get_findings defaults limit and detail', async () => {
    const res = await (await connect(new FakeApi())).call('get_findings', target);
    expect(res.structuredContent).toMatchObject({ status: 'done', total: 1 });
    expect(res.structuredContent!.findings[0]).not.toHaveProperty('rationale');
  });

  it('get_conventions defaults to accepted rules', async () => {
    const api = new FakeApi();
    api.conventionList = {
      candidates: [{ id: 'c1', category: 'naming', rule: 'r', evidence_path: 'src/a.ts', evidence_line: 3, confidence: 0.9, status: 'accepted' }],
      last_scan: { at: '2026-09-01T00:00:00Z' },
    };
    const res = await (await connect(api)).call('get_conventions', { repo: 'acme/api' });
    expect(res.structuredContent).toMatchObject({ total: 1, next_step: null });
  });
});

describe('structuredContent parses with each tool\'s own output schema', () => {
  it('list_agents, get_findings, get_conventions and run_agent_on_pr', async () => {
    const api = new FakeApi();
    api.conventionList = {
      candidates: [{ id: 'c1', category: 'naming', rule: 'r', evidence_path: 'src/a.ts', evidence_line: 3, confidence: 0.9, status: 'accepted' }],
      last_scan: { at: '2026-09-01T00:00:00Z' },
    };
    const { call } = await connect(api);
    const agents = await call('list_agents', {});
    expect(ListAgentsOut.parse(agents.structuredContent).agents).toHaveLength(1);
    const findings = await call('get_findings', { ...target, detail: 'detailed' });
    expect(RunResultOut.parse(findings.structuredContent).findings.length).toBeGreaterThan(0);
    const conventions = await call('get_conventions', { repo: 'acme/api' });
    expect(ConventionsOut.parse(conventions.structuredContent).conventions).toHaveLength(1);
    const run = await call('run_agent_on_pr', target);
    expect(RunResultOut.parse(run.structuredContent).status).toBe('done');
  });
});

describe('failures reach the client as isError', () => {
  it('ApiError: API down names the origin and ./scripts/dev.sh', async () => {
    const api = new FakeApi();
    api.failures.set('listAgents', new ApiError('unreachable'));
    const res = await (await connect(api)).call('list_agents', {});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('not reachable at http://localhost:3001');
    expect(res.content[0]!.text).toContain('./scripts/dev.sh');
  });

  it('ApiError: rate limit', async () => {
    const api = new FakeApi();
    api.failures.set('startReview', new ApiError('rate_limited', 429));
    const res = await (await connect(api)).call('run_agent_on_pr', target);
    expect(res.content[0]!.text).toBe('DevDigest rate-limited the request; wait about a minute and retry.');
  });

  it('NextStepError: unknown repo keeps its text', async () => {
    const res = await (await connect(new FakeApi())).call('get_conventions', { repo: 'acme/nope' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toBe('Repo acme/nope is not in DevDigest; add it on the Repos page.');
  });

  it('a failed run is isError with the clipped server error and the next step', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'failed', error: 'quota exceeded' })]];
    const res = await (await connect(api)).call('run_agent_on_pr', target);
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain(`Review run ${RUN_ID} failed: quota exceeded`);
  });

  it('a raw error inside a handler never leaks its message', async () => {
    const api = new FakeApi();
    api.failures.set('listAgents', new Error('ENOENT /Users/me/.devdigest/secrets.json'));
    const res = await (await connect(api)).call('list_agents', {});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).not.toContain('secrets');
  });
});

describe('input validation', () => {
  it('bad input is an isError that says how to fix it, before any API call', async () => {
    const api = new FakeApi();
    const { call } = await connect(api);
    const badRepo = await call('run_agent_on_pr', { ...target, repo: 'x' });
    expect(badRepo.isError).toBe(true);
    expect(badRepo.content[0]!.text).toContain('repo must be owner/name, e.g. acme/api');
    const badPr = await call('run_agent_on_pr', { ...target, pr: 0 });
    expect(badPr.isError).toBe(true);
    expect(badPr.content[0]!.text).toContain('pr must be at least 1');
    const badStatus = await call('get_conventions', { repo: 'acme/api', status: 'x' });
    expect(badStatus.content[0]!.text).toContain("status must be 'accepted', 'pending' or 'all'");
    expect(api.calls).toEqual([]);
  });
});

describe('progress', () => {
  it('notifications are sent while waiting when the client asks, with the configured total', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })], [run({ status: 'running' })], [run()]];
    const { client } = await connect(api);
    const seen: { progress: number; total?: number | undefined; message?: string | undefined }[] = [];
    await client.callTool({ name: 'run_agent_on_pr', arguments: target }, undefined, { onprogress: (p) => seen.push(p) });
    expect(seen.length).toBe(2);
    expect(seen[0]!.total).toBe(90);
    expect(seen[0]!.message).toMatch(/^review running, \d+s$/);
  });
});

describe('get_blast_radius (stub)', () => {
  it('always answers isError, makes no API call, validates its input', async () => {
    const api = new FakeApi();
    const { call } = await connect(api);
    const res = await call('get_blast_radius', { repo: 'acme/api', pr: 7 });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toBe(BLAST_RADIUS_NOT_IMPLEMENTED);
    const bad = await call('get_blast_radius', { repo: 'nope', pr: 7 });
    expect(bad.isError).toBe(true);
    expect(api.calls).toEqual([]);
  });
});
