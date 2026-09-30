/**
 * The tools/list contract: what a client sees at startup. The snapshot pins names, order,
 * annotations and schemas; the budgets keep the always-loaded definitions small; the
 * description rules keep prompts free of cross-tool wiring (that lives in next_step).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createServer } from './server.js';
import { FakeApi, finding, review } from './test-support/fake-api.js';
import { listTools } from './test-support/list-tools.js';

/**
 * Budgets in serialized characters (tokens are about chars / 4).
 * `perTool` covers a tool without an output schema; a tool that advertises one carries the
 * ~1.5k-char output schema on top (`RunResultOut`, `BlastRadiusResultOut`), so it gets
 * `perToolWithOutput` (measured: 2391 for run_agent_on_pr, 2666 for get_findings, 2367 for
 * get_blast_radius, see docs/devdigest-mcp.md).
 */
const BUDGET = {
  allTools: 10_000,
  perTool: 2_400,
  perToolWithOutput: 2_800,
  instructions: 600,
  description: 900,
  runResponse: 8_000,
} as const;

const NAMES = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];

describe('tools/list contract', () => {
  it('matches the snapshot of names, order, titles, annotations and schemas', async () => {
    const { tools } = await listTools();
    expect(
      tools.map((t) => ({
        name: t.name,
        title: t.title,
        annotations: t.annotations,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema ?? null,
      })),
    ).toMatchSnapshot();
  });

  it('has exactly the five tools in the fixed order', async () => {
    const { tools } = await listTools();
    expect(tools.map((t) => t.name)).toEqual(NAMES);
  });

  it('only run_agent_on_pr, get_findings and get_blast_radius advertise an output schema', async () => {
    const { tools } = await listTools();
    expect(tools.filter((t) => t.outputSchema).map((t) => t.name)).toEqual(['run_agent_on_pr', 'get_findings', 'get_blast_radius']);
  });

  it('every tool has a title, four boolean hints, a valid name and a 1-900 char description', async () => {
    const { tools } = await listTools();
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.name).toMatch(/^[a-z_]{1,64}$/);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect(typeof t.annotations?.[hint], `${t.name}.${hint}`).toBe('boolean');
      }
      const len = (t.description ?? '').length;
      expect(len, `${t.name} description length`).toBeGreaterThanOrEqual(1);
      expect(len, `${t.name} description length`).toBeLessThanOrEqual(BUDGET.description);
    }
  });

  it('no description contains another tool name (cross-tool pointers live in next_step and errors)', async () => {
    const { tools } = await listTools();
    for (const t of tools) {
      for (const other of NAMES.filter((n) => n !== t.name)) {
        expect(t.description ?? '', `${t.name} mentions ${other}`).not.toContain(other);
      }
    }
  });

  it('stays inside the definition token budget', async () => {
    const { tools, instructions } = await listTools();
    const sizes = tools.map((t) => ({ name: t.name, chars: JSON.stringify(t).length }));
    for (const t of tools) {
      const chars = JSON.stringify(t).length;
      const cap = t.outputSchema ? BUDGET.perToolWithOutput : BUDGET.perTool;
      expect(chars, `${t.name} definition chars`).toBeLessThanOrEqual(cap);
    }
    expect(sizes.reduce((n, s) => n + s.chars, 0)).toBeLessThanOrEqual(BUDGET.allTools);
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThanOrEqual(BUDGET.instructions);
  });

  it('the largest allowed wait (600 s) still fits the per-tool budget', async () => {
    const { tools } = await listTools({ apiUrl: 'http://localhost:3001', maxWaitS: 600 });
    const run = tools.find((t) => t.name === 'run_agent_on_pr')!;
    expect(run.description).toContain('(600 s)');
    expect(JSON.stringify(run).length).toBeLessThanOrEqual(BUDGET.perToolWithOutput);
  });
});

describe('default run_agent_on_pr response size', () => {
  it('15 findings stay within the response budget', async () => {
    const api = new FakeApi();
    api.reviewsList = [
      review({
        summary: 's'.repeat(400),
        findings: Array.from({ length: 15 }, (_, i) =>
          finding({
            id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
            severity: i < 3 ? 'CRITICAL' : i < 8 ? 'WARNING' : 'SUGGESTION',
            file: `src/modules/feature-${i}/service.ts`,
            start_line: 10 + i,
            end_line: 12 + i,
            title: 'A realistic finding title that describes the problem in one sentence '.repeat(2).slice(0, 120),
            category: 'correctness',
          }),
        ),
      }),
    ];
    const server = createServer(api, { apiUrl: 'http://localhost:3001', maxWaitS: 90 }, { pollMs: 1 });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'contract', version: '1' });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const res = (await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/api', pr: 7, agent: 'Security Reviewer' },
    })) as unknown as { content: { text: string }[]; structuredContent: { findings: unknown[] } };
    await client.close();
    expect(res.structuredContent.findings).toHaveLength(15);
    expect(res.content[0]!.text.length).toBeLessThanOrEqual(BUDGET.runResponse);
  });
});
