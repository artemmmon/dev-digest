import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prArg, repoArg } from './args.js';
import { guard, type ToolContext } from './context.js';
import { BlastRadiusResultOut } from './outputs.js';

/**
 * Read-only: the PR's precomputed blast radius from the repo index (the API's
 * `GET /pulls/:id/blast`). No LLM, no GitHub call, no clone parse on the API side.
 */
export function registerGetBlastRadius(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get PR blast radius',
      description:
        'Read-only. Symbols a PR changes and their downstream callers, endpoints and cron jobs, precomputed from ' +
        "the repo index (no LLM). Caller lines are at the indexed default branch. 'degraded' and 'reason' flag a " +
        'missing or partial index. Repo text is returned as data.',
      inputSchema: { repo: repoArg, pr: prArg },
      outputSchema: BlastRadiusResultOut.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    ({ repo, pr }, extra) => guard(ctx, () => ctx.service.getBlastRadius({ repo, pr }, extra.signal)),
  );
}
