/**
 * Local version-over-version trend. A tiny vitest reporter that appends each eval test's
 * pass/fail (with the current git sha) to results/history.jsonl. `eval:compare` reads this file,
 * so removing the reporter disables it. (`eval:repeat` reads results/records.jsonl instead.)
 * Nothing here calls a model.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY = join(HERE, "..", "results", "history.jsonl");

function gitSha(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

export interface TaskLike {
  type?: string;
  name?: string;
  result?: { state?: string };
  tasks?: TaskLike[];
}

/**
 * One row per test that ran. A describe suite carries a pass/fail state of its own, so the walk
 * records a task only when its `type` is "test" (it still descends into suites): otherwise every
 * suite would add a row, inflate `eval:compare`'s counts, and list one regression twice.
 */
export function trendRows(files: TaskLike[], runId: string, sha: string): string[] {
  const rows: string[] = [];
  const walk = (task: TaskLike, file: string) => {
    const state = task.result?.state;
    // Only record tests that actually ran (pass/fail) — skips add noise to the trend.
    if (task.type === "test" && (state === "pass" || state === "fail")) {
      rows.push(
        JSON.stringify({ run_id: runId, git_sha: sha, nodeid: `${file} > ${task.name ?? "?"}`, outcome: state }),
      );
    }
    task.tasks?.forEach((t) => walk(t, file));
  };
  for (const f of files) (f.tasks ?? []).forEach((t) => walk(t, f.name ?? "?"));
  return rows;
}

export default class TrendReporter {
  private runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  private sha = gitSha();

  onFinished(files: TaskLike[] = []) {
    const rows = trendRows(files, this.runId, this.sha);
    if (!rows.length) return;
    mkdirSync(dirname(HISTORY), { recursive: true });
    appendFileSync(HISTORY, rows.join("\n") + "\n");
  }
}
