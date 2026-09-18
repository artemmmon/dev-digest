import type { GitClient } from '@devdigest/shared';
import { AstGrepSourceParser } from '../../src/adapters/astgrep/source-parser.js';
import { FsRepoFiles } from '../../src/adapters/repo-files/fs.js';
import type { IndexDeps, RepoIntelDeps } from '../../src/modules/repo-intel/ports.js';

/**
 * Deps for the repo-intel indexer/service in tests: the real ast-grep parser and
 * fs walker (they are pure/local), a stub git, an empty import graph (rank
 * degrades to flat) and a char/4 tokenizer.
 */
export function indexDeps(git: Partial<GitClient>, over: Partial<IndexDeps> = {}): IndexDeps {
  return {
    git: git as GitClient,
    parser: new AstGrepSourceParser(),
    files: new FsRepoFiles(),
    depgraph: { buildEdges: async () => [] },
    tokenizer: { count: (text: string) => Math.ceil(text.length / 4) },
    parseConcurrency: 2,
    ...over,
  };
}

export function repoIntelDeps(
  git: Partial<GitClient>,
  over: Partial<RepoIntelDeps> = {},
): RepoIntelDeps {
  return {
    ...indexDeps(git),
    jobs: { enqueue: async () => ({ id: 'job' }), register: () => undefined },
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
    enabled: true,
    ...over,
  };
}
