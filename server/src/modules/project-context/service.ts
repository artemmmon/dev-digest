import type {
  ContextDocRecord,
  ProjectDocument,
  ProjectDocumentContent,
  ProjectDocumentList,
} from '@devdigest/shared';
import { DOCUMENT_PATTERN, LIST_READ_CONCURRENCY, MAX_DOCUMENT_BYTES } from './constants.js';
import { documentType, isProjectDocument, uniquePaths } from './helpers.js';
import type { ProjectContextDeps } from './ports.js';

/** What a review run receives: the readable documents, in prompt order, and a record per attached path. */
export interface ResolvedProjectContext {
  documents: { path: string; text: string }[];
  records: ContextDocRecord[];
}

/**
 * Project documents of a repository's local checkout: discovery, previews, and the
 * resolution of an agent's attached paths for a run. Reads only the clone on disk; no
 * network, no LLM. Nothing is cached.
 */
export class ProjectContextService {
  constructor(private deps: ProjectContextDeps) {}

  /** Every project document with its token count and how many agents receive it. */
  async list(workspaceId: string, repoId: string): Promise<ProjectDocumentList | undefined> {
    const found = await this.discover(workspaceId, repoId);
    if (!found) return undefined;
    if (!found.cloned) return { pattern: DOCUMENT_PATTERN, cloned: false, documents: [] };

    const usedBy = await this.deps.agents.contextUsedBy(workspaceId, repoId);
    const documents: ProjectDocument[] = [];
    for (let i = 0; i < found.paths.length; i += LIST_READ_CONCURRENCY) {
      const chunk = found.paths.slice(i, i + LIST_READ_CONCURRENCY);
      const rows = await Promise.all(
        chunk.map(async (path): Promise<ProjectDocument> => {
          const read = await this.deps.reader.read(found.root, path, MAX_DOCUMENT_BYTES);
          return {
            path,
            type: documentType(path),
            tokens: read.status === 'read' ? this.deps.tokenizer.count(read.text) : 0,
            used_by: usedBy.get(path) ?? 0,
          };
        }),
      );
      documents.push(...rows);
    }
    return { pattern: DOCUMENT_PATTERN, cloned: true, documents };
  }

  /** The text of one document, only for a path that is in the current list. */
  async content(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<ProjectDocumentContent | undefined> {
    const found = await this.discover(workspaceId, repoId);
    if (!found?.cloned || !found.paths.includes(path)) return undefined;
    const read = await this.deps.reader.read(found.root, path, MAX_DOCUMENT_BYTES);
    return read.status === 'read'
      ? { path, status: 'read', content: read.text }
      : { path, status: read.status, content: null };
  }

  /** Paths of the current list (sorted); `undefined` for a repo outside the workspace, `[]` when not cloned. */
  async listPaths(workspaceId: string, repoId: string): Promise<string[] | undefined> {
    const found = await this.discover(workspaceId, repoId);
    return found?.paths;
  }

  /**
   * The documents of one run: the agent's paths, then each skill's in `skillIds` order, first
   * occurrence kept. Every path is read with the one size cap; a skipped one gets `tokens: 0`.
   * `repo` comes from the pull request being reviewed, so there is no workspace check here.
   */
  async resolveForRun(input: {
    repo: { id: string; owner: string; name: string };
    agentId: string;
    skillIds: string[];
  }): Promise<ResolvedProjectContext> {
    const { repo, agentId, skillIds } = input;
    const own = await this.deps.agents.contextPaths(agentId, repo.id);
    const bySkill = await this.deps.skills.contextPathsFor(skillIds, repo.id);
    const paths = uniquePaths([...own, ...skillIds.flatMap((id) => bySkill.get(id) ?? [])]);

    const root = this.deps.git.clonePathFor(repo);
    const documents: ResolvedProjectContext['documents'] = [];
    const records: ContextDocRecord[] = [];
    for (const path of paths) {
      const read = await this.deps.reader.read(root, path, MAX_DOCUMENT_BYTES);
      if (read.status === 'read') {
        documents.push({ path, text: read.text });
        records.push({ path, status: 'read', tokens: this.deps.tokenizer.count(read.text) });
      } else {
        records.push({ path, status: read.status, tokens: 0 });
      }
    }
    return { documents, records };
  }

  /**
   * The documents some agent of the repo receives, as brief candidates: ordered by how many
   * agents attach each (descending), then by path. Each is read through the root-confined reader;
   * a document that is missing, too large or unreadable is skipped, so this never throws for one.
   * `[]` for a repo outside the workspace or one that is not cloned.
   */
  async candidateDocuments(
    workspaceId: string,
    repoId: string,
  ): Promise<{ path: string; text: string; tokens: number }[]> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo?.clonePath) return [];
    const usedBy = await this.deps.agents.contextUsedBy(workspaceId, repoId);
    const ordered = [...usedBy.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    );
    const root = this.deps.git.clonePathFor(repo);
    const out: { path: string; text: string; tokens: number }[] = [];
    for (const [path] of ordered) {
      const read = await this.deps.reader.read(root, path, MAX_DOCUMENT_BYTES);
      if (read.status !== 'read') continue;
      out.push({ path, text: read.text, tokens: this.deps.tokenizer.count(read.text) });
    }
    return out;
  }

  /** The repo's project-document paths, sorted. `undefined` = repo not in the workspace. */
  private async discover(
    workspaceId: string,
    repoId: string,
  ): Promise<{ cloned: boolean; root: string; paths: string[] } | undefined> {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) return undefined;
    if (!repo.clonePath) return { cloned: false, root: '', paths: [] };
    const files = await this.deps.git.listFiles(repo);
    const paths = files.filter(isProjectDocument).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return { cloned: true, root: this.deps.git.clonePathFor(repo), paths };
  }
}
