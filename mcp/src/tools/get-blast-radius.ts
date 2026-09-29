import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prArg, repoArg } from './args.js';
import { toolError, type ToolContext } from './context.js';

export const BLAST_RADIUS_NOT_IMPLEMENTED =
  'get_blast_radius is not implemented in this DevDigest version yet. For the review findings of this PR, call get_findings.';

/**
 * Registered with its final input contract, but it does no I/O and always answers with
 * the not-implemented error (homework: fill it in from the repo-intel module). It does not
 * advertise an `outputSchema` (token budget: it can never return structured content yet);
 * the result shape is pinned by `BlastRadiusOut` and its drift check in `outputs.ts`. When
 * implementing it, add `outputSchema: BlastRadiusOut.shape` here.
 */
export function registerGetBlastRadius(server: McpServer, _ctx: ToolContext): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get PR blast radius (not implemented yet)',
      description:
        'Not implemented yet: currently always returns an error. Intended to list the symbols a PR changes and the ' +
        'callers, endpoints and cron jobs downstream of them.',
      inputSchema: { repo: repoArg, pr: prArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => toolError(BLAST_RADIUS_NOT_IMPLEMENTED),
  );
}
