/**
 * stderr-only logger. stdout carries the MCP protocol, so nothing in this package
 * may write to it (ESLint `no-console` enforces that). Log lines never include
 * tokens, response bodies or PR text.
 */
export const log = {
  info(message: string): void {
    console.error(`[devdigest-mcp] ${message}`);
  },
  warn(message: string): void {
    console.warn(`[devdigest-mcp] ${message}`);
  },
  error(message: string): void {
    console.error(`[devdigest-mcp] ${message}`);
  },
};
