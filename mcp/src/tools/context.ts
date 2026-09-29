/**
 * The MCP edge shared by the tool handlers: what a handler is given, and how results
 * and failures become MCP results. This is the only place `NextStepError` and
 * `ApiError` turn into `isError`.
 */
import { ApiError } from '../api/errors.js';
import type { McpConfig } from '../config.js';
import { NextStepError, apiErrorMessage } from '../errors.js';
import { log } from '../log.js';
import type { DevDigestService } from '../service.js';

export interface ToolContext {
  service: DevDigestService;
  config: McpConfig;
}

export interface ToolOk<T> {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: T;
}

export interface ToolErrorResult {
  [key: string]: unknown;
  isError: true;
  content: { type: 'text'; text: string }[];
}

/** A successful result: the structured object, plus the same JSON as one text block. */
export function ok<T extends Record<string, unknown>>(structured: T): ToolOk<T> {
  return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
}

export function toolError(text: string): ToolErrorResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Turns anything a handler can throw into an `isError` result; never rethrows. */
export function toToolError(err: unknown, apiUrl: string): ToolErrorResult {
  if (err instanceof NextStepError) return toolError(err.message);
  if (err instanceof ApiError) return toolError(apiErrorMessage(err, apiUrl));
  // Unknown: keep details on stderr (local), give the model a fixed line.
  log.error(`unexpected tool failure: ${err instanceof Error ? err.name : typeof err}`);
  return toolError('devdigest-mcp hit an unexpected error. Retry once; if it persists, check the MCP server stderr log.');
}

/** Runs a handler body; anything it throws becomes an `isError` result, never a raw error. */
export async function guard<T extends Record<string, unknown>>(
  ctx: ToolContext,
  body: () => Promise<T>,
): Promise<ToolOk<T> | ToolErrorResult> {
  try {
    return ok(await body());
  } catch (err) {
    return toToolError(err, ctx.config.apiUrl);
  }
}
