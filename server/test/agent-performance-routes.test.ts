/**
 * SPEC-16 — AC-91 at the HTTP edge, no database: query validation runs before any handler, so a
 * rejected request never reaches the store (postgres-js connects lazily).
 */
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT_ID = '00000000-0000-4000-8000-000000000001';

const BAD_QUERIES: Array<[string, string]> = [
  ['an unknown period', 'period=7d'],
  ['custom without dates', 'period=custom'],
  ['custom without a start', 'period=custom&to=2026-10-02T00:00:00.000Z'],
  ['custom without an end', 'period=custom&from=2026-10-01T00:00:00.000Z'],
  ['a malformed date', 'period=custom&from=yesterday&to=2026-10-02T00:00:00.000Z'],
  ['a date without a time', 'period=custom&from=2026-10-01&to=2026-10-02'],
  ['a start after the end', 'period=custom&from=2026-10-05T00:00:00.000Z&to=2026-10-02T00:00:00.000Z'],
];

describe('stats routes reject a bad period with a validation error (no DB)', () => {
  for (const [label, query] of BAD_QUERIES) {
    it(`AC-91: ${label} → 422 on /agent-performance`, async () => {
      const app = await buildApp({ config });
      const res = await app.inject({ method: 'GET', url: `/agent-performance?${query}` });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it(`AC-91: ${label} → 422 on /agents/:id/stats`, async () => {
      const app = await buildApp({ config });
      const res = await app.inject({ method: 'GET', url: `/agents/${AGENT_ID}/stats?${query}` });
      expect(res.statusCode).toBe(422);
      await app.close();
    });
  }

  it('AC-91: a non-uuid agent id → 422', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/agents/not-a-uuid/stats?period=30d' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
