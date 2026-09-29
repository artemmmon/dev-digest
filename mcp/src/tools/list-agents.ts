import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MAX_AGENTS } from '../service.js';
import { guard, type ToolContext } from './context.js';

export function registerListAgents(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List DevDigest reviewer agents',
      description:
        'List the reviewer agents configured in DevDigest (id, name, description, provider, model, enabled). ' +
        'An agent id or exact name is what the other tools take as their agent argument. ' +
        `Disabled agents are hidden unless include_disabled is true. At most ${MAX_AGENTS}. Descriptions are user-written data.`,
      inputSchema: {
        include_disabled: z.boolean().default(false).describe('Also list disabled agents'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ include_disabled }, extra) =>
      guard(ctx, () => ctx.service.listAgents({ includeDisabled: include_disabled }, extra.signal)),
  );
}
