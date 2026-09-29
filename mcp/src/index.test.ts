/**
 * Spawns the real entry point over stdio. A stray stdout write would corrupt the
 * protocol stream and fail the handshake here.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((c) => c()));
});

async function start(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: path.join(root, 'node_modules/.bin/tsx'),
    args: ['src/index.ts'],
    cwd: root,
    env: { ...(process.env.PATH ? { PATH: process.env.PATH } : {}), ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'index-test', version: '1' });
  cleanup.push(() => client.close());
  await client.connect(transport);
  return { client, transport };
}

describe('stdio entry point', () => {
  it('serves the five tools, reports an unreachable API, and exits when the client leaves', async () => {
    // Port 9 (discard) is closed on loopback: connection refused.
    const { client, transport } = await start({ DEVDIGEST_API_URL: 'http://127.0.0.1:9' });
    const pid = transport.pid!;

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);

    const agents = (await client.callTool({ name: 'list_agents', arguments: {} })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(agents.isError).toBe(true);
    expect(agents.content[0]!.text).toContain('not reachable');
    expect(agents.content[0]!.text).toContain('./scripts/dev.sh');

    const blast = (await client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/api', pr: 1 },
    })) as { isError?: boolean };
    expect(blast.isError).toBe(true);

    // Closing stdin must end the process quickly; without the EOF handler the
    // client would wait its full 2 s grace period and then have to SIGTERM it.
    const started = Date.now();
    await client.close();
    expect(Date.now() - started).toBeLessThan(1800);
    expect(alive(pid)).toBe(false);
  }, 30_000);

  it('refuses a non-loopback API URL at startup with a stderr message', async () => {
    const transport = new StdioClientTransport({
      command: path.join(root, 'node_modules/.bin/tsx'),
      args: ['src/index.ts'],
      cwd: root,
      env: { ...(process.env.PATH ? { PATH: process.env.PATH } : {}), DEVDIGEST_API_URL: 'http://example.com' },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    const client = new Client({ name: 'index-test', version: '1' });
    await expect(client.connect(transport)).rejects.toThrow();
    expect(stderr).toContain('DEVDIGEST_API_URL must point at this machine');
  }, 30_000);

  it('stops a long review wait at once when the client goes away', async () => {
    const ID = '00000000-0000-4000-8000-000000000001';
    const routes: Record<string, unknown> = {
      'GET /repos': [{ id: ID, full_name: 'acme/api' }],
      'GET /agents': [
        { id: ID, name: 'Rev', description: 'd', enabled: true, provider: 'p', model: 'm' },
      ],
      [`GET /repos/${ID}/pulls/by-number/7`]: { id: ID, number: 7, title: 't' },
      [`GET /pulls/${ID}`]: {},
      [`GET /pulls/${ID}/runs/active`]: [],
      [`POST /pulls/${ID}/review`]: { runs: [{ run_id: ID, agent_id: ID, agent_name: 'Rev' }] },
      [`GET /pulls/${ID}/runs`]: [
        { run_id: ID, agent_id: ID, agent_name: 'Rev', status: 'running', error: null, score: null, ran_at: null },
      ],
    };
    const api: Server = createServer((req, res) => {
      const body = routes[`${req.method} ${req.url}`];
      res.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body ?? {}));
    });
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise((resolve) => api.close(() => resolve())));

    const { client, transport } = await start({
      DEVDIGEST_API_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}`,
      DEVDIGEST_MCP_MAX_WAIT_S: '600',
    });
    const pid = transport.pid!;
    // Leave the call in flight: the run never finishes, so the server sits in its poll loop.
    const inFlight = client
      .callTool({ name: 'run_agent_on_pr', arguments: { repo: 'acme/api', pr: 7, agent: 'Rev' } })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 700));

    const started = Date.now();
    await client.close();
    expect(Date.now() - started).toBeLessThan(1800);
    expect(alive(pid)).toBe(false);
    await inFlight;
  }, 30_000);
});
