import { unzipSync } from 'fflate';

/**
 * .zip reader for skill import (implements the skills module's ArchiveReader port).
 *
 * Everything happens in memory. `list` only inspects entry headers (the filter
 * rejects every entry, so nothing is inflated); `readText` inflates the one entry
 * asked for. Nothing is written to disk and nothing is executed.
 */

export interface ZipEntry {
  path: string;
  size: number;
}

export class FflateZipReader {
  list(bytes: Uint8Array): ZipEntry[] {
    const entries: ZipEntry[] = [];
    unzipSync(bytes, {
      filter: (f) => {
        entries.push({ path: f.name, size: f.originalSize });
        return false;
      },
    });
    return entries;
  }

  readText(bytes: Uint8Array, path: string): string {
    const files = unzipSync(bytes, { filter: (f) => f.name === path });
    const data = files[path];
    if (!data) throw new Error(`No such entry: ${path}`);
    return new TextDecoder('utf-8', { fatal: false }).decode(data);
  }
}
