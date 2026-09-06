/**
 * The device's durable file storage, and nothing else.
 *
 * `expo-file-system`'s modern API: `Paths.document` is the directory the
 * operating system does not empty behind the app's back, `Directory` and `File`
 * are handles to places in it. Cooking Lab's own files live under one named
 * subdirectory of it (`PRIVATE_MEDIA_ROOT`), so the store lists what this app
 * put there and not whatever else happens to be in the documents directory.
 *
 * `Paths.cache` appears nowhere in this file, and that is the point. The camera
 * hands over a file in a cache directory and the system may reclaim it at any
 * moment; a photograph that stayed there would vanish without anything to
 * explain where it went.
 *
 * The absolute location never leaves this module. Everything above it works in
 * paths relative to the root, which is what keeps device paths out of domain
 * records — see `src/data/files/privateFileStore.ts`.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { FoundFile, PrivateFileSystemPort } from '../files/privateFileStore';
import { PRIVATE_MEDIA_ROOT } from '../files/privateFileStore';

function root(): Directory {
  return new Directory(Paths.document, PRIVATE_MEDIA_ROOT);
}

function fileAt(relativePath: string): File {
  return new File(root(), relativePath);
}

/** Create a file's containing directories. `File.create` will not do it alone. */
function ensureParent(file: File): void {
  file.parentDirectory.create({ intermediates: true, idempotent: true });
}

/** Every file under a directory, at any depth, as paths relative to the root. */
function walk(directory: Directory, prefix: string, found: FoundFile[]): void {
  for (const entry of directory.list()) {
    const name = entry.name;
    const relativePath = prefix === '' ? name : `${prefix}/${name}`;
    if (entry instanceof Directory) {
      walk(entry, relativePath, found);
      continue;
    }
    found.push({ relativePath, byteLength: entry.size });
  }
}

export const expoPrivateFileSystemPort: PrivateFileSystemPort = {
  async ensureRoot(): Promise<void> {
    root().create({ intermediates: true, idempotent: true });
  },

  async exists(relativePath: string): Promise<boolean> {
    return fileAt(relativePath).exists;
  },

  async byteLength(relativePath: string): Promise<number | null> {
    const file = fileAt(relativePath);
    return file.exists ? file.size : null;
  },

  async read(relativePath: string): Promise<Uint8Array> {
    return fileAt(relativePath).bytes();
  },

  /**
   * Create the file and write to it, refusing to replace one that is there.
   *
   * `overwrite: false` is the second line of defence. `PrivateFileStore` has
   * already proved the path is free before calling this, so in normal operation
   * the flag never comes into play — which is exactly why it is set this way: if
   * that check is ever bypassed or broken, this throws instead of quietly
   * writing over a photograph.
   */
  async write(relativePath: string, bytes: Uint8Array): Promise<void> {
    const file = fileAt(relativePath);
    file.create({ intermediates: true, overwrite: false });
    file.write(bytes);
  },

  /**
   * Bring a file that is already on the device into the store.
   *
   * A move rather than a copy: the source is a freshly captured file in a
   * directory the system may reclaim, and leaving a second copy of every
   * photograph there would fill the device with duplicates waiting to be
   * deleted. A source that cannot be moved — some system-provided locations are
   * read-only — is copied instead, so the photograph is kept either way.
   */
  async importFrom(sourceUri: string, relativePath: string): Promise<void> {
    const destination = fileAt(relativePath);
    ensureParent(destination);
    const source = new File(sourceUri);
    // Neither call is given `overwrite`, so both refuse an occupied
    // destination. `PrivateFileStore` has already proved the path is free; this
    // is the second line of defence, and it is a refusal rather than a
    // replacement for the same reason the first one is.
    try {
      await source.move(destination);
    } catch {
      await source.copy(destination);
    }
  },

  async delete(relativePath: string): Promise<void> {
    const file = fileAt(relativePath);
    if (file.exists) {
      file.delete();
    }
  },

  async list(): Promise<readonly FoundFile[]> {
    const directory = root();
    if (!directory.exists) {
      return [];
    }
    const found: FoundFile[] = [];
    walk(directory, '', found);
    return found;
  },
};
