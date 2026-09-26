import { and, eq } from 'drizzle-orm';
import type { PrIntent } from '@devdigest/shared';
import { IncidentalChange, IntentSource, PrIntent as PrIntentSchema, RiskArea } from '@devdigest/shared';
import { z } from 'zod';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { IntentContext, IntentStore } from './ports.js';

/**
 * Intent data-access (Drizzle implementation of `IntentStore`). `context()`
 * joins `pull_requests` (workspace-scoped) → `repos` → `pr_files`, and reads
 * the current `pr_intent` row if any. `sources`/`risk_areas` are jsonb parsed
 * with `safeParse`, falling back to `[]` on a shape mismatch (`server/INSIGHTS.md:229`).
 */

type PrIntentRow = typeof t.prIntent.$inferSelect;

const SourcesJson = z.array(IntentSource);
const RiskAreasJson = z.array(RiskArea);
const IncidentalJson = z.array(IncidentalChange);

/** One jsonb column → its array, or `[]` when the stored shape no longer matches. */
function jsonArray<T>(schema: z.ZodType<T[]>, value: unknown): T[] {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function toPrIntent(prId: string, row: PrIntentRow): PrIntent | undefined {
  const parsed = PrIntentSchema.safeParse({
    pr_id: prId,
    summary: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence_tier: row.confidenceTier,
    basis: row.basis,
    missing_context: row.missingContext,
    sources: jsonArray(SourcesJson, row.sources),
    risk_areas: jsonArray(RiskAreasJson, row.riskAreas),
    incidental_changes: jsonArray(IncidentalJson, row.incidentalChanges),
    provider: row.provider,
    model: row.model,
    head_sha: row.headSha,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd == null ? null : Number(row.costUsd),
    derived_at: row.derivedAt?.toISOString(),
  });
  return parsed.success ? parsed.data : undefined;
}

export class IntentRepository implements IntentStore {
  constructor(private db: DbOrTx) {}

  async context(workspaceId: string, prId: string): Promise<IntentContext | undefined> {
    const [pull] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, pull.repoId));
    if (!repo) return undefined;

    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const [storedRow] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));

    return {
      pull: {
        id: pull.id,
        number: pull.number,
        title: pull.title,
        body: pull.body,
        branch: pull.branch,
        base: pull.base,
        headSha: pull.headSha,
      },
      repo: { owner: repo.owner, name: repo.name, defaultBranch: repo.defaultBranch },
      files: files.map((f) => ({ path: f.path, patch: f.patch })),
      stored: storedRow ? toPrIntent(prId, storedRow) : undefined,
    };
  }

  async upsert(prId: string, intent: PrIntent): Promise<void> {
    const values = {
      prId,
      intent: intent.summary,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
      confidenceTier: intent.confidence_tier,
      basis: intent.basis,
      missingContext: intent.missing_context,
      sources: intent.sources,
      riskAreas: intent.risk_areas,
      incidentalChanges: intent.incidental_changes ?? [],
      provider: intent.provider ?? null,
      model: intent.model ?? null,
      headSha: intent.head_sha ?? null,
      tokensIn: intent.tokens_in ?? null,
      tokensOut: intent.tokens_out ?? null,
      costUsd: intent.cost_usd == null ? null : String(intent.cost_usd),
      derivedAt: intent.derived_at ? new Date(intent.derived_at) : new Date(),
    };
    await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: values.intent,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          confidenceTier: values.confidenceTier,
          basis: values.basis,
          missingContext: values.missingContext,
          sources: values.sources,
          riskAreas: values.riskAreas,
          incidentalChanges: values.incidentalChanges,
          provider: values.provider,
          model: values.model,
          headSha: values.headSha,
          tokensIn: values.tokensIn,
          tokensOut: values.tokensOut,
          costUsd: values.costUsd,
          derivedAt: values.derivedAt,
        },
      });
  }
}
