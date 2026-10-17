import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { repos } from './repos';
import { agentRuns } from './runs';

// ============================================================ Export to CI

/**
 * One export of an agent into a repository's GitHub Actions. A repository has at most one
 * active installation (`ended_at IS NULL`); a new export ends the previous one in the same
 * transaction. `repository_id` is GitHub's numeric id, filled on the first refresh when a
 * token-less zip export did not know it.
 */
export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'set null' }),
    /** `owner/name`. */
    repo: text('repo').notNull(),
    repositoryId: bigint('repository_id', { mode: 'number' }),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    method: text('method', { enum: ['pr', 'manual'] }).notNull(),
    agentVersion: integer('agent_version'),
    runnerVersion: text('runner_version'),
    manifestSha256: text('manifest_sha256'),
    triggers: text('triggers').array().$type<Array<'opened' | 'synchronize' | 'reopened'>>().notNull(),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] }).notNull(),
    prUrl: text('pr_url'),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastIngestedAt: timestamp('last_ingested_at', { withTimezone: true }),
  },
  (t) => ({
    // one active installation per repository
    activeRepoUq: uniqueIndex('ci_installations_active_repo_uq')
      .on(t.workspaceId, t.repo)
      .where(sql`${t.endedAt} IS NULL`),
    agentIdx: index('ci_installations_agent_idx').on(t.agentId),
    repoIdx: index('ci_installations_repo_idx').on(t.repoId),
    methodCk: check('ci_installations_method_ck', sql`${t.method} in ('pr', 'manual')`),
  }),
);

/**
 * One GitHub Actions run of an installation: a verified result (counts, verdict, cost) or a
 * Failed row with a `failure_reason`. At most one row per GitHub run id and workspace.
 * `github_url` holds the job link.
 */
export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentName: text('agent_name'),
    /** `owner/name`, kept on the row so the run outlives its installation. */
    repo: text('repo').notNull(),
    prNumber: integer('pr_number'),
    prTitle: text('pr_title'),
    githubRunId: bigint('github_run_id', { mode: 'number' }).notNull(),
    commitSha: text('commit_sha'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    status: text('status', { enum: ['succeeded', 'no_findings', 'failed'] }).notNull(),
    failureReason: text('failure_reason'),
    findingsCount: integer('findings_count'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    verdict: text('verdict'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
    manifestVersion: integer('manifest_version'),
    agentVersion: integer('agent_version'),
    runnerVersion: text('runner_version'),
    model: text('model'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  },
  (t) => ({
    runUq: uniqueIndex('ci_runs_ws_github_run_uq').on(t.workspaceId, t.githubRunId),
    wsRanAtIdx: index('ci_runs_ws_ran_at_idx').on(t.workspaceId, t.ranAt.desc()),
    installationIdx: index('ci_runs_installation_idx').on(t.ciInstallationId),
    agentIdx: index('ci_runs_agent_idx').on(t.agentId),
    agentRunIdx: index('ci_runs_agent_run_idx').on(t.agentRunId),
    statusCk: check('ci_runs_status_ck', sql`${t.status} in ('succeeded', 'no_findings', 'failed')`),
  }),
);
