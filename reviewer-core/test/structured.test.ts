import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRepair, toJsonSchema } from '../src/llm/structured.js';

const Item = z.object({ name: z.string(), count: z.number().int() });

describe('extractJson', () => {
  it('unwraps a ```json fence', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nbye')).toBe('{"a":1}');
  });

  it('finds the first balanced object in prose', () => {
    expect(extractJson('Sure! {"a":{"b":2}} hope that helps')).toBe('{"a":{"b":2}}');
  });

  it('finds an array when it comes first', () => {
    expect(extractJson('result: [1,2,3] and {"x":1}')).toBe('[1,2,3]');
  });

  it('returns trimmed text when there is no JSON, and the tail when it is unbalanced', () => {
    expect(extractJson('  no json here  ')).toBe('no json here');
    expect(extractJson('start {"a": 1')).toBe('{"a": 1');
  });
});

describe('parseWithRepair', () => {
  it('parses pure JSON directly', () => {
    expect(parseWithRepair(Item, '{"name":"x","count":2}')).toEqual({
      ok: true,
      data: { name: 'x', count: 2 },
    });
  });

  it('falls back to extraction when the model wraps the JSON in prose', () => {
    const r = parseWithRepair(Item, 'Here: {"name":"x","count":2} done');
    expect(r).toMatchObject({ ok: true, data: { name: 'x', count: 2 } });
  });

  it('does not let braces inside a string value fool the parser', () => {
    // pure-JSON path runs first, so a "{" inside the value never reaches extractJson
    const r = parseWithRepair(z.object({ body: z.string() }), '{"body":"code: ```{ x }``` end"}');
    expect(r).toMatchObject({ ok: true, data: { body: 'code: ```{ x }``` end' } });
  });

  it('reports invalid JSON with a reprompt', () => {
    const r = parseWithRepair(Item, 'definitely not json');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/not valid JSON/);
      expect(r.repromptMessage).toMatch(/single valid JSON object/);
    }
  });

  it('lists every schema issue with its path in the reprompt', () => {
    const r = parseWithRepair(Item, '{"name":5,"count":"two"}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('- name:');
      expect(r.error).toContain('- count:');
      expect(r.repromptMessage).toContain('did not match the required schema');
    }
  });
});

describe('toJsonSchema', () => {
  it('produces a strict object schema and keeps the name', () => {
    const { schema, name } = toJsonSchema(Item, 'item');
    expect(name).toBe('item');
    expect(schema).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' }, count: { type: 'integer' } },
      additionalProperties: false,
    });
    expect((schema as { required: string[] }).required.sort()).toEqual(['count', 'name']);
  });
});
