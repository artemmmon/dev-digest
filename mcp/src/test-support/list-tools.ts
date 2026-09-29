/** Connects an in-process client to a fresh server and returns what a client sees at startup. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpConfig } from '../config.js';
import { createServer } from '../server.js';
import { FakeApi } from './fake-api.js';

export const DEFAULT_TEST_CONFIG: McpConfig = { apiUrl: 'http://localhost:3001', maxWaitS: 90 };

export async function listTools(config: McpConfig = DEFAULT_TEST_CONFIG) {
  const server = createServer(new FakeApi(), config);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'contract', version: '1' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  try {
    const { tools } = await client.listTools();
    return { tools, instructions: client.getInstructions() ?? '' };
  } finally {
    await client.close();
  }
}
