/**
 * devdigest-mcp entry point: a stdio MCP server. stdout carries the protocol only;
 * every log line goes to stderr (see log.ts). Launch it with `bash scripts/mcp.sh`,
 * never through `pnpm run`, which prints a banner to stdout.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpDevDigestApi } from './api/http.js';
import { ConfigError, loadConfig, type McpConfig } from './config.js';
import { log } from './log.js';
import { createServer } from './server.js';

/** How long shutdown may take before the process exits anyway. */
const EXIT_GRACE_MS = 1000;

function readConfig(): McpConfig {
  try {
    return loadConfig();
  } catch (err) {
    log.error(err instanceof ConfigError ? err.message : 'Invalid configuration.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const shutdown = new AbortController();
  // No API probe here: startup must stay fast (MCP_TIMEOUT); the first tool call reports an unreachable API.
  const server = createServer(new HttpDevDigestApi(config), config, { shutdown: shutdown.signal });

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
    setTimeout(() => process.exit(0), EXIT_GRACE_MS).unref();
    server.close().then(
      () => process.exit(0),
      () => process.exit(0),
    );
  };

  // The transport closing (SDK-initiated) and every way the client can go away.
  server.server.onclose = stop;
  // StdioServerTransport never calls onclose on stdin EOF. Without these, a client that exits during a
  // long review wait would leave this process polling until the wait ends.
  process.stdin.on('end', stop);
  process.stdin.on('close', stop);
  process.stdout.on('error', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  process.on('unhandledRejection', (reason) => {
    log.error(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    log.error(`uncaught exception: ${err.message}`);
    process.exit(1);
  });

  await server.connect(new StdioServerTransport());
  log.info(`ready, API ${config.apiUrl}`);
}

main().catch((err: unknown) => {
  log.error(`failed to start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
