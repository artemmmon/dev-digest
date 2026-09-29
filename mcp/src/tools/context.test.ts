import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors.js';
import { NextStepError } from '../errors.js';
import { guard, ok, toToolError, type ToolContext } from './context.js';

const url = 'http://localhost:3001';

describe('toToolError', () => {
  it('NextStepError keeps its message', () => {
    expect(toToolError(new NextStepError('do x'), url)).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'do x' }],
    });
  });

  it('ApiError becomes the fixed text for its kind', () => {
    const res = toToolError(new ApiError('unreachable'), url);
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('not reachable at http://localhost:3001');
  });

  it('an unknown error never leaks its message', () => {
    const res = toToolError(new Error('secret internal detail /etc/passwd'), url);
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).not.toContain('secret');
  });
});

describe('guard', () => {
  const ctx = { config: { apiUrl: url, maxWaitS: 90 } } as ToolContext;

  it('wraps a result as structuredContent plus the same JSON text', async () => {
    const res = await guard(ctx, async () => ({ a: 1 }));
    expect(res).toEqual(ok({ a: 1 }));
    expect(JSON.parse((res as { content: { text: string }[] }).content[0]!.text)).toEqual({ a: 1 });
  });

  it('turns a throw into isError and never rethrows', async () => {
    const res = await guard(ctx, async () => {
      throw new NextStepError('next');
    });
    expect(res).toMatchObject({ isError: true });
  });
});
