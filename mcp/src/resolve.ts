import type { DevDigestApi, PullRef } from './api/port.js';
import type { AgentInfo, RepoInfo } from './api/schemas.js';
import { NextStepError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text of a caller-supplied argument as shown back in an error (bounded, one line). */
function shown(value: string): string {
  const flat = value.replace(/[^\x20-\x7e]/g, '?');
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/** `owner/name` → the DevDigest repo (case-insensitive on `full_name`). */
export async function resolveRepo(
  api: DevDigestApi,
  fullName: string,
  signal?: AbortSignal,
): Promise<RepoInfo> {
  const wanted = fullName.toLowerCase();
  const repos = await api.listRepos(signal);
  const repo = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (!repo) {
    throw new NextStepError(`Repo ${shown(fullName)} is not in DevDigest; add it on the Repos page.`);
  }
  return repo;
}

/**
 * The PR of a repo by GitHub number. Read tools pass `syncOnMiss: false` and only
 * look in the DB; the run tool syncs the repo's PR list once when the PR is unknown.
 */
export async function resolvePull(
  api: DevDigestApi,
  repo: RepoInfo,
  number: number,
  opts: { syncOnMiss: boolean; signal?: AbortSignal },
): Promise<PullRef> {
  const found = await api.pullByNumber(repo.id, number, opts.signal);
  if (found) return found;
  if (!opts.syncOnMiss) {
    throw new NextStepError(
      `PR #${number} of ${repo.full_name} is not in DevDigest yet; open the repo's PR list in DevDigest to sync it.`,
    );
  }
  await api.syncPulls(repo.id, opts.signal);
  const synced = await api.pullByNumber(repo.id, number, opts.signal);
  if (!synced) {
    throw new NextStepError(`PR #${number} not found in ${repo.full_name} on GitHub.`);
  }
  return synced;
}

/** An agent by uuid, or by exact case-insensitive name; several name matches are an error. */
export async function resolveAgent(
  api: DevDigestApi,
  idOrName: string,
  signal?: AbortSignal,
): Promise<AgentInfo> {
  const key = idOrName.trim();
  const agents = await api.listAgents(signal);
  if (UUID.test(key)) {
    const byId = agents.find((a) => a.id.toLowerCase() === key.toLowerCase());
    if (byId) return byId;
  }
  const lower = key.toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new NextStepError(
      `'${shown(key)}' matches several agents; pass the id from list_agents.`,
    );
  }
  throw new NextStepError(`Agent '${shown(key)}' not found; call list_agents for valid ids.`);
}
