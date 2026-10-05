import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Reads one repository document for the project-context module (implements `ProjectDocReader`).
 * The only file of that feature that touches `node:fs`. It never throws: every failure is a status.
 *
 * Order of checks: a path that is absolute or leaves the root lexically → `unreadable`;
 * resolve symlinks on the target (`ENOENT` → `missing`) and the root, a target outside the real
 * root → `unreadable`; not a regular file or empty → `unreadable`; larger than `maxBytes` →
 * `too_large`; a NUL byte or invalid UTF-8 → `unreadable`. At most `maxBytes + 1` bytes are read.
 * A swap between the checks and the read is accepted (local single-user tool).
 */
export type ProjectDocReadResult =
  | { status: 'read'; text: string }
  | { status: 'missing' | 'too_large' | 'unreadable' };

export class FsProjectDocReader {
  /** Structurally implements the project-context module's `ProjectDocReader` port. */
  async read(root: string, relPath: string, maxBytes: number): Promise<ProjectDocReadResult> {
    try {
      if (!relPath || isAbsolute(relPath) || escapes(root, resolve(root, relPath))) {
        return { status: 'unreadable' };
      }

      let realTarget: string;
      try {
        realTarget = await realpath(resolve(root, relPath));
      } catch (err) {
        return isNotFound(err) ? { status: 'missing' } : { status: 'unreadable' };
      }
      const realRoot = await realpath(root);
      if (escapes(realRoot, realTarget)) return { status: 'unreadable' };

      const handle = await open(realTarget, 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile()) return { status: 'unreadable' };
        if (info.size > maxBytes) return { status: 'too_large' };
        if (info.size === 0) return { status: 'unreadable' };

        const buf = Buffer.alloc(maxBytes + 1);
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
        if (bytesRead > maxBytes) return { status: 'too_large' };
        if (bytesRead === 0) return { status: 'unreadable' };
        const bytes = buf.subarray(0, bytesRead);
        if (bytes.includes(0)) return { status: 'unreadable' };
        return { status: 'read', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
      } finally {
        await handle.close();
      }
    } catch {
      return { status: 'unreadable' };
    }
  }
}

/** True when `target` is not inside `base` (or is `base` itself). */
function escapes(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}
