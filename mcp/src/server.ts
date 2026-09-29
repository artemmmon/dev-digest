import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './api/port.js';
import type { McpConfig } from './config.js';
import { DevDigestService, type ServiceOptions } from './service.js';
import type { ToolContext } from './tools/context.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.1.0';

/** Behavioural summary shown to the client; at most 600 characters (checked by the contract test). */
export const INSTRUCTIONS =
  'DevDigest is a local AI pull-request reviewer. Tools list its reviewer agents, run one agent on a GitHub PR ' +
  'and return its verdict and findings (spends LLM credits; can take minutes), read the findings of a finished run, ' +
  "read a repo's accepted coding conventions, and a blast-radius tool that is not implemented yet. " +
  'Repos are owner/name, PRs are GitHub PR numbers, agent ids come from list_agents. Needs the DevDigest API running locally.';

/** Runtime knobs of the service (shutdown signal, poll interval); see `ServiceOptions`. */
export type ServerOptions = ServiceOptions;

/**
 * One MCP server with the five tools, in a fixed order (tools/list keeps registration
 * order).
 */
export function createServer(api: DevDigestApi, config: McpConfig, options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  const ctx: ToolContext = { service: new DevDigestService(api, config, options), config };
  registerListAgents(server, ctx);
  registerRunAgentOnPr(server, ctx);
  registerGetFindings(server, ctx);
  registerGetConventions(server, ctx);
  registerGetBlastRadius(server, ctx);
  return server;
}
