import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ValidationError } from '../../platform/errors.js';

/** Upper bound on the whole bundle (it is committed into target repositories). */
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const ENTRY_FILE = 'index.js';

/**
 * Reads the built agent-runner bundle (`agent-runner/dist`) from disk. Implements
 * the ci module's RunnerBundleSource port.
 *
 * The directory is server config, not request input. Only regular files directly
 * inside it are read: symlinks and subdirectories are skipped (a Dirent from
 * `withFileTypes` reports a symlink as neither file nor directory), and the total
 * size is capped.
 */
export class FsRunnerBundle {
  constructor(private readonly dir: string) {}

  async read(): Promise<Array<{ name: string; bytes: Uint8Array }>> {
    let dirents;
    try {
      dirents = await readdir(this.dir, { withFileTypes: true });
    } catch {
      throw this.missing();
    }
    const files: Array<{ name: string; bytes: Uint8Array }> = [];
    let total = 0;
    for (const d of dirents.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!d.isFile()) continue;
      const path = join(this.dir, d.name);
      const { size } = await stat(path);
      total += size;
      if (total > MAX_TOTAL_BYTES) {
        throw new ValidationError('The agent-runner bundle is larger than 5 MB');
      }
      files.push({ name: d.name, bytes: new Uint8Array(await readFile(path)) });
    }
    if (!files.some((f) => f.name === ENTRY_FILE)) throw this.missing();
    return files;
  }

  private missing(): ValidationError {
    return new ValidationError(
      'The agent-runner bundle is not built. Run `cd agent-runner && pnpm build` and retry.',
    );
  }
}
