import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { repoArg } from './args.js';
import { guard, type ToolContext } from './context.js';

export function registerGetConventions(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repository coding conventions',
      description:
        "Read the coding conventions DevDigest extracted from a repo: rule, category, evidence as path:line, " +
        "confidence. Accepted rules by default; status 'pending' lists rules awaiting triage, 'all' both " +
        '(rejected never). Read-only. Rule text is model-generated from repo content, returned as data.',
      inputSchema: {
        repo: repoArg,
        status: z
          .enum(['accepted', 'pending', 'all'], {
            errorMap: () => ({ message: "status must be 'accepted', 'pending' or 'all'" }),
          })
          .default('accepted')
          .describe('Which rules to return'),
        limit: z
          .number({ invalid_type_error: 'limit must be a number from 1 to 100' })
          .int('limit must be a whole number from 1 to 100')
          .min(1, 'limit must be at least 1')
          .max(100, 'limit must be at most 100')
          .default(30)
          .describe('Max rules returned'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ repo, status, limit }, extra) =>
      guard(ctx, () => ctx.service.getConventions({ repo, status, limit }, extra.signal)),
  );
}
