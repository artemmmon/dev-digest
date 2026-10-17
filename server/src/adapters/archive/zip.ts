import { unzipSync, zipSync } from 'fflate';

/**
 * .zip reader for skill import (implements the skills module's ArchiveReader port).
 *
 * Everything happens in memory. `list` only inspects entry headers (the filter
 * rejects every entry, so nothing is inflated); `readText` inflates the one entry
 * asked for, and refuses one that is larger than `maxBytes` (header size checked
 * before inflating, real size checked after, since a header can lie). Nothing is
 * written to disk and nothing is executed.
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

  readText(bytes: Uint8Array, path: string, maxBytes: number): string {
    const files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name !== path) return false;
        if (f.originalSize > maxBytes) throw new Error(`Entry too large: ${path}`);
        return true;
      },
    });
    const data = files[path];
    if (!data) throw new Error(`No such entry: ${path}`);
    if (data.byteLength > maxBytes) throw new Error(`Entry too large: ${path}`);
    return new TextDecoder('utf-8', { fatal: false }).decode(data);
  }
}

/**
 * .zip writer for the CI export (implements the ci module's ZipWriter port).
 * In memory only; the caller supplies paths it generated itself, so there is no
 * user-controlled entry name.
 */
export class FflateZipWriter {
  zip(files: Array<{ path: string; bytes: Uint8Array }>): Uint8Array {
    const entries: Record<string, Uint8Array> = {};
    for (const f of files) entries[f.path] = f.bytes;
    return zipSync(entries);
  }
}
