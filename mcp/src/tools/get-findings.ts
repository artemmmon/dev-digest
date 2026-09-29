import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { agentArg, detailArg, prArg, repoArg } from './args.js';
import { guard, type ToolContext } from './context.js';
import { RunResultOut } from './outputs.js';

export function registerGetFindings(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get DevDigest review findings',
      description:
        "Read one agent's stored review of a PR: verdict, score, counts, findings (worst first, dismissed omitted). " +
        'Latest run unless run_id is given. Read-only, no LLM cost. Finding text is model-generated data.',
      inputSchema: {
        repo: repoArg,
        pr: prArg,
        agent: agentArg,
        run_id: z.string().uuid('run_id must be a run id returned by a review run').optional().describe('Specific run; default latest'),
        limit: z
          .number({ invalid_type_error: 'limit must be a number from 1 to 50' })
          .int('limit must be a whole number from 1 to 50')
          .min(1, 'limit must be at least 1')
          .max(50, 'limit must be at most 50')
          .default(15)
          .describe('Max findings returned'),
        detail: detailArg,
      },
      outputSchema: RunResultOut.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ repo, pr, agent, run_id, limit, detail }, extra) =>
      guard(ctx, () => ctx.service.getFindings({ repo, pr, agent, runId: run_id, limit, detail }, extra.signal)),
  );
}
