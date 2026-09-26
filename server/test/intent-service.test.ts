import { describe, it, expect, vi } from 'vitest';
import type { PrIntent } from '@devdigest/shared';
import { MockGitHubClient, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { IntentService } from '../src/modules/intent/service.js';
import type { IntentContext, IntentDeps, IntentStore } from '../src/modules/intent/ports.js';

/**
 * Fakes with fakes — no DB, no network. `IntentStore` is an in-memory single-PR
 * fake; GitHub/Git/LLM are the server's own `adapters/mocks.ts`.
 */
class FakeIntentStore implements IntentStore {
  public upserts: PrIntent[] = [];
  constructor(private ctx: IntentContext | undefined) {}
  async context(): Promise<IntentContext | undefined> {
    return this.ctx;
  }
  async upsert(_prId: string, intent: PrIntent): Promise<void> {
    this.upserts.push(intent);
    if (this.ctx) this.ctx = { ...this.ctx, stored: intent };
  }
  current(): IntentContext | undefined {
    return this.ctx;
  }
}

function baseContext(overrides: Partial<IntentContext> = {}): IntentContext {
  return {
    pull: {
      id: 'pr-1',
      number: 42,
      title: 'Add rate limiting',
      body: 'Closes #12',
      branch: 'feat/rate-limit',
      base: 'main',
      headSha: 'abc123',
    },
    repo: { owner: 'acme', name: 'payments-api', defaultBranch: 'main' },
    files: [],
    stored: undefined,
    ...overrides,
  };
}

const IDENTITY_FIXTURE = {
  summary: 'Adds a rate limiter to the public API.',
  in_scope: ['rate limiter middleware'],
  out_of_scope: [],
};

function makeDeps(opts: {
  store: IntentStore;
  github?: MockGitHubClient;
  git?: MockGitClient;
  llm?: MockLLMProvider;
}): { deps: IntentDeps; llm: MockLLMProvider } {
  const llm = opts.llm ?? new MockLLMProvider('openai', { structured: IDENTITY_FIXTURE });
  const github = opts.github ?? new MockGitHubClient();
  const git = opts.git ?? new MockGitClient();
  const deps: IntentDeps = {
    store: opts.store,
    github: async () => github,
    git,
    llm: async () => llm,
    resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
    systemPrompt: async () => 'SYSTEM PROMPT',
    tokenizer: { count: (s: string) => Math.ceil(s.length / 4) },
    now: () => 0,
  };
  return { deps, llm };
}

describe('IntentService.derive — issue sourcing (D6)', () => {
  it('uses GraphQL on the default branch', async () => {
    const ctx = baseContext();
    const store = new FakeIntentStore(ctx);
    const github = new MockGitHubClient({
      closingIssues: { 'acme/payments-api#42': [{ number: 12, title: 'Bug', body: 'desc', state: 'open' }] },
    });
    const { deps } = makeDeps({ store, github });
    const service = new IntentService(deps);

    const intent = await service.derive('ws-1', 'pr-1');
    const issueSource = intent.sources.find((s) => s.kind === 'issue');
    expect(issueSource).toMatchObject({ ref: '#12', status: 'used', via: 'graphql' });
  });

  it('falls back to a regex ref off the default branch, ignoring GraphQL', async () => {
    const ctx = baseContext({
      pull: { ...baseContext().pull, base: 'develop' }, // not the default branch (main)
    });
    const store = new FakeIntentStore(ctx);
    const github = new MockGitHubClient({
      // even if GraphQL WOULD return something, off-default-branch must not call it
      closingIssues: { 'acme/payments-api#42': [{ number: 99, title: 'Should not be used', body: '', state: 'open' }] },
    });
    const { deps } = makeDeps({ store, github });
    const service = new IntentService(deps);

    const intent = await service.derive('ws-1', 'pr-1');
    const issueSource = intent.sources.find((s) => s.kind === 'issue');
    expect(issueSource).toMatchObject({ ref: '#12', via: 'regex' });
    expect(intent.sources.some((s) => s.ref === '#99')).toBe(false);
  });
});

describe('IntentService.derive — unreachable sources, never fetched', () => {
  it('records a cross-host doc link and a ticket key as unreachable without fetching', async () => {
    const ctx = baseContext({
      pull: {
        ...baseContext().pull,
        body: 'See PROJ-42 and [the design doc](https://notion.so/design.md) for context.',
      },
    });
    const store = new FakeIntentStore(ctx);
    const github = new MockGitHubClient(); // no `files` configured — a fetch would 404
    const fetchSpy = vi.spyOn(github, 'getFileContent');
    const { deps } = makeDeps({ store, github });
    const service = new IntentService(deps);

    const intent = await service.derive('ws-1', 'pr-1');
    const ticket = intent.sources.find((s) => s.kind === 'ticket');
    expect(ticket).toMatchObject({ ref: 'PROJ-42', status: 'unreachable' });
    const docs = intent.sources.filter((s) => s.kind === 'doc');
    // One link → exactly one source; the URL's path is never re-tried as a repo path.
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ ref: 'https://notion.so/design.md', status: 'unreachable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(intent.missing_context).toBe(true);
  });

  it('a same-repo blob URL is one used doc source, fetched once at the head SHA', async () => {
    const ctx = baseContext({
      pull: {
        ...baseContext().pull,
        body: 'Plan: https://github.com/acme/payments-api/blob/main/docs/plans/02-x.md',
      },
    });
    const store = new FakeIntentStore(ctx);
    const github = new MockGitHubClient();
    const fetchSpy = vi
      .spyOn(github, 'getFileContent')
      .mockResolvedValue({ path: 'docs/plans/02-x.md', content: '# Plan', size: 6, truncated: false });
    const { deps } = makeDeps({ store, github });

    const intent = await new IntentService(deps).derive('ws-1', 'pr-1');
    const docs = intent.sources.filter((s) => s.kind === 'doc');
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ ref: 'docs/plans/02-x.md', status: 'used' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.anything(), 'docs/plans/02-x.md', 'abc123');
  });

  it('a malformed escape in a blob URL is recorded, not thrown', async () => {
    const ctx = baseContext({
      pull: {
        ...baseContext().pull,
        body: 'https://github.com/acme/payments-api/blob/main/docs/%E0%A4%A.md',
      },
    });
    const { deps } = makeDeps({ store: new FakeIntentStore(ctx) });
    const intent = await new IntentService(deps).derive('ws-1', 'pr-1');
    const doc = intent.sources.find((s) => s.kind === 'doc');
    expect(doc).toMatchObject({ status: 'unreachable' });
  });
});

describe('IntentService.derive — clone-head fallback', () => {
  it('an oversized doc read from the clone is too_large, not used', async () => {
    const ctx = baseContext({
      pull: { ...baseContext().pull, body: 'See docs/plans/big.md' },
    });
    const git = new MockGitClient({ files: { 'docs/plans/big.md': 'x'.repeat(64 * 1024 + 1) } });
    const { deps } = makeDeps({ store: new FakeIntentStore(ctx), git });
    deps.github = async () => {
      throw new Error('GITHUB_TOKEN not configured');
    };

    const intent = await new IntentService(deps).derive('ws-1', 'pr-1');
    const doc = intent.sources.find((s) => s.kind === 'doc');
    expect(doc).toMatchObject({ ref: 'docs/plans/big.md', status: 'too_large', via: 'clone-head' });
    expect(intent.missing_context).toBe(true);
  });
});

describe('IntentService.derive — confidence tier (D3)', () => {
  it('too_large and not_found linked sources lower the tier below a clean baseline', async () => {
    const substantiveBody = 'Closes #12. ' + 'x'.repeat(100);

    // Baseline: the linked issue resolves fine.
    const cleanCtx = baseContext({ pull: { ...baseContext().pull, body: substantiveBody } });
    const cleanStore = new FakeIntentStore(cleanCtx);
    const cleanGithub = new MockGitHubClient({
      closingIssues: { 'acme/payments-api#42': [{ number: 12, title: 'Bug', body: 'd', state: 'open' }] },
    });
    const clean = await new IntentService(makeDeps({ store: cleanStore, github: cleanGithub }).deps).derive(
      'ws-1',
      'pr-1',
    );
    expect(clean.confidence_tier).toBe('high');

    // Degraded: no closing issue found at all (never resolved) → tier drops.
    const degradedCtx = baseContext({
      pull: { ...baseContext().pull, body: substantiveBody },
    });
    const degradedStore = new FakeIntentStore(degradedCtx);
    const degradedGithub = new MockGitHubClient({ closingIssues: {} }); // GraphQL returns []
    const degraded = await new IntentService(
      makeDeps({ store: degradedStore, github: degradedGithub }).deps,
    ).derive('ws-1', 'pr-1');
    // no linked source at all here (no issue found) — basis still documented via body length
    expect(degraded.basis).toBe('documented');

    // Explicit too_large / not_found via a doc link.
    const docCtx = baseContext({
      pull: {
        ...baseContext().pull,
        body: `${substantiveBody} See docs/plans/x.md and docs/plans/y.md`,
      },
    });
    const docStore = new FakeIntentStore(docCtx);
    const docGithub = new MockGitHubClient({
      closingIssues: { 'acme/payments-api#42': [{ number: 12, title: 'Bug', body: 'd', state: 'open' }] },
      files: {
        'acme/payments-api:docs/plans/x.md@abc123': { status: 'too_large' },
        'acme/payments-api:docs/plans/y.md@abc123': { status: 'not_found' },
      },
    });
    const withBadDocs = await new IntentService(
      makeDeps({ store: docStore, github: docGithub }).deps,
    ).derive('ws-1', 'pr-1');
    expect(withBadDocs.sources.filter((s) => s.status === 'too_large' || s.status === 'not_found')).toHaveLength(2);
    expect(withBadDocs.confidence_tier).not.toBe('high'); // dropped by the two non-used linked docs
    expect(withBadDocs.missing_context).toBe(true);
  });
});

describe('IntentService.derive — empty body', () => {
  it('gives inferred/low and never sends a body source to the classifier', async () => {
    const ctx = baseContext({ pull: { ...baseContext().pull, body: null } });
    const store = new FakeIntentStore(ctx);
    const { deps, llm } = makeDeps({ store });
    const service = new IntentService(deps);

    const intent = await service.derive('ws-1', 'pr-1');
    expect(intent.basis).toBe('inferred');
    expect(intent.confidence_tier).toBe('low');
    expect(intent.sources.some((s) => s.kind === 'body')).toBe(false);

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const userMsg = (call!.req as { messages: { role: string; content: string }[] }).messages[1]!.content;
    expect(userMsg).not.toContain('S2: body');
  });
});

describe('IntentService.forRun', () => {
  it('reuses a stored intent (no LLM call) and marks stale when the head moved', async () => {
    const stored: PrIntent = {
      pr_id: 'pr-1',
      summary: 'stored summary',
      in_scope: [],
      out_of_scope: [],
      confidence_tier: 'high',
      basis: 'documented',
      missing_context: false,
      sources: [],
      risk_areas: [],
      head_sha: 'OLD_SHA',
    };
    const ctx = baseContext({ stored });
    const store = new FakeIntentStore(ctx);
    const { deps, llm } = makeDeps({ store });
    const service = new IntentService(deps);

    const result = await service.forRun({ workspaceId: 'ws-1', prId: 'pr-1' });
    expect(result).toEqual({ intent: stored, stale: true });
    expect(llm.calls).toHaveLength(0);
  });

  it('marks not-stale when the stored head matches the current head', async () => {
    const stored: PrIntent = {
      pr_id: 'pr-1',
      summary: 's',
      in_scope: [],
      out_of_scope: [],
      confidence_tier: 'high',
      basis: 'documented',
      missing_context: false,
      sources: [],
      risk_areas: [],
      head_sha: 'abc123', // matches baseContext().pull.headSha
    };
    const ctx = baseContext({ stored });
    const store = new FakeIntentStore(ctx);
    const { deps } = makeDeps({ store });
    const service = new IntentService(deps);

    const result = await service.forRun({ workspaceId: 'ws-1', prId: 'pr-1' });
    expect(result?.stale).toBe(false);
  });

  it('an LLM throw is fail-open: returns null and emits one event, never throws', async () => {
    const ctx = baseContext();
    const store = new FakeIntentStore(ctx);
    const throwingLlm = new MockLLMProvider('openai');
    throwingLlm.completeStructured = vi.fn().mockRejectedValue(new Error('model unavailable'));
    const { deps } = makeDeps({ store, llm: throwingLlm });
    const service = new IntentService(deps);

    const events: { kind: string; msg: string }[] = [];
    const result = await service.forRun({ workspaceId: 'ws-1', prId: 'pr-1' }, (kind, msg) =>
      events.push({ kind, msg }),
    );
    expect(result).toBeNull();
    expect(events.some((e) => e.kind === 'info' && e.msg.includes('intent skipped'))).toBe(true);
  });

  it('no event payload contains source text (title/body/issue content)', async () => {
    const ctx = baseContext({
      pull: {
        ...baseContext().pull,
        body: 'SENSITIVE_MARKER_TEXT that must never be logged. Closes #12.',
      },
    });
    const store = new FakeIntentStore(ctx);
    const github = new MockGitHubClient({
      closingIssues: {
        'acme/payments-api#42': [{ number: 12, title: 'SECRET_ISSUE_TITLE', body: 'SECRET_ISSUE_BODY', state: 'open' }],
      },
    });
    const { deps } = makeDeps({ store, github });
    const service = new IntentService(deps);

    const events: { kind: string; msg: string; data?: unknown }[] = [];
    await service.forRun({ workspaceId: 'ws-1', prId: 'pr-1' }, (kind, msg, data) =>
      events.push({ kind, msg, data }),
    );
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('SENSITIVE_MARKER_TEXT');
    expect(serialized).not.toContain('SECRET_ISSUE_TITLE');
    expect(serialized).not.toContain('SECRET_ISSUE_BODY');
  });
});

describe('IntentService.derive — incidental changes', () => {
  const files = [
    { path: 'server/auth/device_token.dart', patch: '@@ -0,0 +1,3 @@\n+a\n+b\n+c' },
    { path: 'lib/data/lineups_api.dart', patch: '@@ -14,6 +14,10 @@ class LineupsApi\n+x' },
  ];
  const fixture = {
    summary: 'Protect favorites with a device token.',
    in_scope: ['token check'],
    out_of_scope: ['lineups list'],
    incidental_hunks: [{ hunk: 'H2', reason: 'unrelated error handling' }],
  };

  it('stores the cited hunk as a line range when the intent is documented', async () => {
    const ctx = baseContext({ files });
    const store = new FakeIntentStore(ctx);
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const { deps } = makeDeps({ store, llm });
    const intent = await new IntentService(deps).derive('ws-1', 'pr-1');
    expect(intent.incidental_changes).toEqual([
      {
        path: 'lib/data/lineups_api.dart',
        start_line: 14,
        end_line: 23,
        header: '@@ -14,6 +14,10 @@ class LineupsApi',
        reason: 'unrelated error handling',
      },
    ]);
  });

  it('marks nothing incidental when the intent is only inferred (no stated goal)', async () => {
    const ctx = baseContext({ files, pull: { ...baseContext().pull, body: '' } });
    const store = new FakeIntentStore(ctx);
    const github = new MockGitHubClient();
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const { deps } = makeDeps({ store, llm, github });
    deps.github = async () => {
      throw new Error('no token');
    };
    const intent = await new IntentService(deps).derive('ws-1', 'pr-1');
    expect(intent.basis).toBe('inferred');
    expect(intent.incidental_changes).toEqual([]);
  });
});
