/** Flat input fields shared by the tools. Custom messages say what to send instead. */
import { z } from 'zod';

export const repoArg = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, 'repo must be owner/name, e.g. acme/api')
  .describe('owner/name');

export const prArg = z
  .number({ invalid_type_error: 'pr must be a number, e.g. 42' })
  .int('pr must be a whole number, e.g. 42')
  .min(1, 'pr must be at least 1 (a GitHub PR number)')
  .max(2147483647, 'pr is too large to be a GitHub PR number')
  .describe('PR number');

export const agentArg = z
  .string()
  .trim()
  .min(1, 'agent must be an agent id or name; call list_agents')
  .max(100, 'agent must be at most 100 characters; pass the id from list_agents')
  .describe('Agent id or exact name');

export const detailArg = z
  .enum(['concise', 'detailed'], { errorMap: () => ({ message: "detail must be 'concise' or 'detailed'" }) })
  .default('concise')
  .describe('detailed adds rationale, suggestion');
