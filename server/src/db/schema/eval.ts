import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    /** Set to `owner_id` for agent-owned cases; cascades the cases with the agent. */
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    /** The finding a case was seeded from; unique (NULLs are distinct, so hand-written cases are free). */
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    createdAt: now(),
  },
  (t) => ({
    agentIdx: index('eval_cases_agent_idx').on(t.agentId),
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
  }),
);

/** One eval run of an agent: a snapshot of its version + skills, counters and metrics. */
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    skillVersions: jsonb('skill_versions').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    /** Case ids captured at run start (a case added or deleted later does not change this run). */
    caseIds: jsonb('case_ids').$type<string[]>().notNull(),
    status: text('status', { enum: ['running', 'done', 'partial', 'failed'] }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull().default(0),
    casesCompleted: integer('cases_completed').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    unlabelledFindings: integer('unlabelled_findings').notNull().default(0),
    /** USD, exact (money is never a float); drizzle 0.38 reads numeric as a string. */
    costUsd: numeric('cost_usd', { precision: 14, scale: 8 }),
  },
  (t) => ({
    agentStartedIdx: index('eval_runs_agent_started_idx').on(t.agentId, t.startedAt),
    wsStartedIdx: index('eval_runs_ws_started_idx').on(t.workspaceId, t.startedAt),
    /** The claim: at most one running run per agent (a unique violation means 409). */
    oneRunningUq: uniqueIndex('eval_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

/** The stored per-case outcome of a run. Deleting a case cascades only its results. */
export const evalCaseResults = pgTable(
  'eval_case_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pass', 'fail', 'error'] }).notNull(),
    expectedCount: integer('expected_count').notNull().default(0),
    matchedCount: integer('matched_count').notNull().default(0),
    kept: integer('kept').notNull().default(0),
    dropped: integer('dropped').notNull().default(0),
    findings: jsonb('findings').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    durationMs: integer('duration_ms').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 14, scale: 8 }),
    createdAt: now(),
  },
  (t) => ({
    runCaseUq: uniqueIndex('eval_case_results_run_case_uq').on(t.runId, t.caseId),
    caseIdx: index('eval_case_results_case_idx').on(t.caseId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
