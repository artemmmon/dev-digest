import { and, eq } from 'drizzle-orm';
import { PrBrief } from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BriefContext, BriefStore } from './ports.js';

/**
 * Brief data-access (Drizzle implementation of `BriefStore`). `context()` reads the
 * pull request workspace-scoped, then its repo, files and the `pr_brief` row. The jsonb
 * is read through `PrBrief.safeParse` — a mismatch means "no stored brief" — and the
 * legacy `intent` / `blast` / `history` members are dropped in both directions, so a
 * stored or returned brief never holds them (spec NFR-13).
 */

function withoutLegacy(brief: PrBrief): PrBrief {
  const { intent: _intent, blast: _blast, history: _history, ...rest } = brief;
  return rest;
}

function toBrief(json: unknown): PrBrief | undefined {
  const parsed = PrBrief.safeParse(json);
  return parsed.success ? withoutLegacy(parsed.data) : undefined;
}

export class BriefRepository implements BriefStore {
  constructor(private db: DbOrTx) {}

  async context(workspaceId: string, prId: string): Promise<BriefContext | undefined> {
    const [pull] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, pull.repoId));
    if (!repo) return undefined;

    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

    return {
      pull: {
        id: pull.id,
        repoId: pull.repoId,
        number: pull.number,
        title: pull.title,
        body: pull.body,
        branch: pull.branch,
        headSha: pull.headSha,
      },
      repo: { owner: repo.owner, name: repo.name },
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
      stored: row ? toBrief(row.json) : undefined,
    };
  }

  async save(prId: string, brief: PrBrief): Promise<void> {
    const json = withoutLegacy(brief);
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
