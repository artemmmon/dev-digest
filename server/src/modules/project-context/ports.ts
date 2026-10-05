import type { GitClient } from '@devdigest/shared';

/** Ports of the project-context module (onion-architecture: core declares, outer ring implements). */

/** Result of reading one document; never throws. */
export type ProjectDocReadResult =
  | { status: 'read'; text: string }
  | { status: 'missing' | 'too_large' | 'unreadable' };

/** Bounded, root-confined reader for repository documents. */
export interface ProjectDocReader {
  read(root: string, relPath: string, maxBytes: number): Promise<ProjectDocReadResult>;
}

/** The agents module's attachment data this module needs (implemented by the agents repository). */
export interface AgentAttachmentReader {
  contextPaths(agentId: string, repoId: string): Promise<string[]>;
  contextUsedBy(workspaceId: string, repoId: string): Promise<Map<string, number>>;
}

/** The skills module's attachment data this module needs (implemented by the skills repository). */
export interface SkillAttachmentReader {
  contextPathsFor(skillIds: string[], repoId: string): Promise<Map<string, string[]>>;
}

/** The slice of a repository record this module needs (structurally satisfied by the repos store). */
export interface ProjectRepo {
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<ProjectRepo | undefined>;
}

export interface ProjectContextDeps {
  repos: RepoLookup;
  git: Pick<GitClient, 'listFiles' | 'clonePathFor'>;
  reader: ProjectDocReader;
  tokenizer: { count(text: string): number };
  agents: AgentAttachmentReader;
  skills: SkillAttachmentReader;
}
