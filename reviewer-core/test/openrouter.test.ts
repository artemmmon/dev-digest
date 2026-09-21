import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

/** OpenRouter over an injected fetch: no network, and the OpenRouter-specific fields are parsed, not trusted. */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const Out = z.object({ ok: z.boolean() });

function chat(body: object) {
  return json({ id: 'x', object: 'chat.completion', created: 0, model: 'm', ...body });
}

describe('OpenRouterProvider.listModels', () => {
  it('converts per-token prices to USD per 1M tokens and sorts cheapest output first', async () => {
    const provider = new OpenRouterProvider('key', {
      fetch: async () =>
        json({
          data: [
            { id: 'pricey', name: 'Pricey', context_length: 8000, pricing: { prompt: '0.000003', completion: '0.000015' } },
            { id: 'cheap', pricing: { prompt: '0.0000001', completion: '0.0000004' } },
          ],
        }),
    });
    const models = await provider.listModels();
    expect(models.map((m) => m.id)).toEqual(['cheap', 'pricey']);
    expect(models[1]).toMatchObject({
      label: 'Pricey',
      contextLength: 8000,
      pricing: { promptPerM: 3, completionPerM: 15 },
    });
  });

  it('treats the -1 sentinel of router pseudo-models as unknown price, sorted last', async () => {
    const provider = new OpenRouterProvider('key', {
      fetch: async () =>
        json({
          data: [
            { id: 'openrouter/auto', pricing: { prompt: '-1', completion: '-1' } },
            { id: 'real', pricing: { prompt: '0.000001', completion: '0.000002' } },
          ],
        }),
    });
    const models = await provider.listModels();
    expect(models.map((m) => m.id)).toEqual(['real', 'openrouter/auto']);
    expect(models[1]!.pricing).toBeNull();
  });

  it('sends the API key as a bearer token', async () => {
    let seen: string | null = null;
    const provider = new OpenRouterProvider('sk-secret', {
      fetch: async (_url, init) => {
        seen = new Headers(init?.headers).get('authorization');
        return json({ data: [] });
      },
    });
    await provider.listModels();
    expect(seen).toBe('Bearer sk-secret');
  });

  it('fails clearly on an HTTP error and on an unexpected payload', async () => {
    const httpError = new OpenRouterProvider('k', { fetch: async () => json({}, 401) });
    await expect(httpError.listModels()).rejects.toThrow('returned 401');

    const wrongShape = new OpenRouterProvider('k', { fetch: async () => json({ data: 'nope' }) });
    await expect(wrongShape.listModels()).rejects.toThrow('unexpected payload');
  });
});

describe('OpenRouterProvider.completeStructured', () => {
  const request = { model: 'm', messages: [{ role: 'user' as const, content: 'hi' }], schema: Out, schemaName: 'out' };

  it('prefers the cost OpenRouter reports over the injected estimate', async () => {
    const provider = new OpenRouterProvider('k', {
      maxRetries: 0,
      estimateCost: () => 999,
      fetch: async () =>
        chat({
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0042 },
        }),
    });
    const res = await provider.completeStructured(request);
    expect(res).toMatchObject({ data: { ok: true }, tokensIn: 10, tokensOut: 5, costUsd: 0.0042, attempts: 1 });
  });

  it('falls back to the injected estimate when the response has no cost', async () => {
    const provider = new OpenRouterProvider('k', {
      maxRetries: 0,
      estimateCost: (_m, tin, tout) => tin + tout,
      fetch: async () =>
        chat({
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        }),
    });
    expect((await provider.completeStructured(request)).costUsd).toBe(7);
  });

  it('surfaces the upstream error when a 200 response has no choices', async () => {
    const provider = new OpenRouterProvider('k', {
      maxRetries: 0,
      fetch: async () => chat({ choices: [], error: { message: 'free tier exhausted' } }),
    });
    await expect(provider.completeStructured(request)).rejects.toThrow('free tier exhausted');
  });

  it('re-prompts once with the schema issues, then returns the repaired answer', async () => {
    let calls = 0;
    const provider = new OpenRouterProvider('k', {
      maxRetries: 0,
      fetch: async () => {
        calls += 1;
        const content = calls === 1 ? '{"ok":"yes"}' : '{"ok":true}';
        return chat({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] });
      },
    });
    const res = await provider.completeStructured(request);
    expect(res).toMatchObject({ data: { ok: true }, attempts: 2 });
  });
});
