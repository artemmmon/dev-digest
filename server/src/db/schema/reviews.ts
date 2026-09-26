import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { agentRuns } from './runs';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** The agent_run that produced this review (links the timeline run ↔ review);
     *  deleting the run deletes its review and, through it, the findings. */
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({
    // "reviews of a PR, newest first" — the PR page and the PR-list rollup
    prCreatedIdx: index('reviews_pr_created_idx').on(t.prId, t.createdAt.desc()),
  }),
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => ({
    reviewIdx: index('findings_review_idx').on(t.reviewId),
    severityCk: check(
      'findings_severity_ck',
      sql`${t.severity} in ('CRITICAL', 'WARNING', 'SUGGESTION')`,
    ),
  }),
);

export const prIntent = pgTable(
  'pr_intent',
  {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    intent: text('intent').notNull(),
    inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    confidenceTier: text('confidence_tier').notNull().default('low'),
    basis: text('basis').notNull().default('inferred'),
    missingContext: boolean('missing_context').notNull().default(false),
    /** IntentSource[] — metadata only (id/kind/ref/status/via/chars/truncated), never source text. */
    sources: jsonb('sources').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    /** RiskArea[] — rule chips first, model chips merged in, ≤ 6 total (D13). */
    riskAreas: jsonb('risk_areas').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    /** IncidentalChange[] — hunks unrelated to the stated intent (scope policy input). */
    incidentalChanges: jsonb('incidental_changes').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    headSha: text('head_sha'),
    provider: text('provider'),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    derivedAt: timestamp('derived_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tierCk: check(
      'pr_intent_tier_ck',
      sql`${t.confidenceTier} in ('high', 'medium', 'low')`,
    ),
    basisCk: check('pr_intent_basis_ck', sql`${t.basis} in ('documented', 'inferred')`),
  }),
);

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
