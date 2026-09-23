import { pgTable, uuid, text, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces, users } from './core';

export const repos = pgTable(
  'repos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch').notNull().default('main'),
    clonePath: text('clone_path'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
    // Auto-detected framework/languages/packages (`RepoStack`); null until the first
    // clone/refresh completes detection. Parsed with `RepoStack.safeParse` on read, so
    // a shape change here can never break `GET /repos` for an already-stored row.
    stack: jsonb('stack'),
  },
  (t) => ({
    // also serves workspace_id-only lookups (leading column), so no separate index
    uq: uniqueIndex('repos_ws_fullname_uq').on(t.workspaceId, t.fullName),
  }),
);
