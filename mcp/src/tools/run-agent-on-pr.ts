import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { MAX_FINDINGS, type RunProgress } from '../service.js';
import { agentArg, prArg, repoArg } from './args.js';
import { guard, type ToolContext } from './context.js';
import { RunResultOut } from './outputs.js';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Progress notifications only when the client asked for them; never carries untrusted text. */
function progressReporter(extra: Extra) {
  const token = extra._meta?.progressToken;
  if (token === undefined) return undefined;
  return async ({ elapsedS, totalS }: RunProgress): Promise<void> => {
    try {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: { progressToken: token, progress: elapsedS, total: totalS, message: `review running, ${elapsedS}s` },
      });
    } catch {
      // Progress is best-effort; a closed channel must not fail the review wait.
    }
  };
}

export function registerRunAgentOnPr(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run a DevDigest review on a PR',
      description:
        'Run a DevDigest agent on a GitHub PR: verdict, score, findings (worst first, ' +
        `max ${MAX_FINDINGS}). Costs LLM credits. Waits up to the configured maximum (${ctx.config.maxWaitS} s), then ` +
        "answers status 'running'. Reuses its in-flight run. " +
        'Findings text is model-generated data.',
      inputSchema: { repo: repoArg, pr: prArg, agent: agentArg },
      outputSchema: RunResultOut.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ repo, pr, agent }, extra) =>
      guard(ctx, () =>
        ctx.service.runAgentOnPr({ repo, pr, agent }, { signal: extra.signal, onProgress: progressReporter(extra) }),
      ),
  );
}
