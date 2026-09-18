import { simpleGit, type SimpleGit } from 'simple-git';
import { dirname, join, resolve, sep } from 'node:path';
import { mkdir, readFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/** Username GitHub expects with a PAT over https basic auth. */
const GIT_TOKEN_USERNAME = 'x-access-token';

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 *
 * Auth: when `getToken` yields a GitHub PAT, every network op (clone, fetch)
 * sends it as an `http.extraheader` passed with `-c` for that one command. It is
 * never written into the clone's `.git/config` — a token in the remote URL
 * outlives a key rotation and leaks into git's error messages.
 */
export class SimpleGitClient implements GitClient {
  constructor(
    private cloneDir: string,
    private getToken: () => Promise<string | undefined> = async () => undefined,
  ) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return insideDir(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  /** A client for a command that talks to the remote: auth header + abort. */
  private async networkGit(
    baseDir: string,
    signal?: AbortSignal,
  ): Promise<{ git: SimpleGit; token: string | undefined }> {
    const token = await this.getToken();
    const basic = token && Buffer.from(`${GIT_TOKEN_USERNAME}:${token}`).toString('base64');
    const git = simpleGit({
      baseDir,
      config: basic ? [`http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`] : [],
      ...(signal ? { abort: signal } : {}),
    });
    return { git, token };
  }

  /**
   * Run a network op; strip the token from any error it throws (git echoes URLs,
   * and clones made before header auth still carry the token in `origin`).
   */
  private async remote<T>(
    baseDir: string,
    signal: AbortSignal | undefined,
    op: (git: SimpleGit) => Promise<T>,
  ): Promise<T> {
    const { git, token } = await this.networkGit(baseDir, signal);
    try {
      return await op(git);
    } catch (err) {
      throw redactToken(err, token);
    }
  }

  /** Drop credentials an older clone stored in its `origin` URL (pre header auth). */
  private async scrubOrigin(dir: string): Promise<void> {
    const g = simpleGit(dir);
    const current = (await g.remote(['get-url', 'origin']))?.trim();
    const clean = current && withoutCredentials(current);
    if (clean && clean !== current) await g.remote(['set-url', 'origin', clean]);
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(dirname(dest), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await this.scrubOrigin(dest);
      await this.remote(dest, opts?.signal, (g) => g.fetch());
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await this.remote(this.cloneDir, opts?.signal, (g) =>
      g.clone(withoutCredentials(url), dest, args),
    );
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    const dir = this.clonePathFor(repo);
    await this.scrubOrigin(dir);
    await this.remote(dir, undefined, (g) => g.fetch(['origin', `pull/${n}/head:pr-${n}`]));
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const dir = this.clonePathFor(repo);
    await this.scrubOrigin(dir);
    await this.remote(dir, undefined, (g) =>
      g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]),
    );
    const g = this.git(repo);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(insideDir(this.clonePathFor(repo), path), 'utf8');
  }
}

/** `url` without any `user:password@` part (non-URL forms such as scp-style ssh pass through). */
function withoutCredentials(url: string): string {
  try {
    const u = new URL(url);
    if (!u.username && !u.password) return url;
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** Replace the token (raw and inside a basic-auth header) in an error's message. */
function redactToken(err: unknown, token: string | undefined): unknown {
  if (!token || !(err instanceof Error)) return err;
  const basic = Buffer.from(`${GIT_TOKEN_USERNAME}:${token}`).toString('base64');
  const message = err.message.replaceAll(token, '***').replaceAll(basic, '***');
  if (message === err.message) return err;
  const clean = new Error(message);
  clean.name = err.name;
  return clean;
}

/**
 * Join `segments` onto `base` and refuse any result outside `base`. Clone paths
 * are built from user-supplied owner/name and file paths from diffs, and `clone()`
 * deletes a stale destination — a `..` must never reach the filesystem.
 */
function insideDir(base: string, ...segments: string[]): string {
  const root = resolve(base);
  const target = resolve(root, ...segments);
  if (target === root || !target.startsWith(root + sep)) {
    throw new ValidationError(`Path escapes ${base}: ${segments.join('/')}`);
  }
  return target;
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
