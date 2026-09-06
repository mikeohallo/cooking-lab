/**
 * The app-private store photographs live in.
 *
 * Everything above this line addresses a photo by its *logical* path — the
 * short, relative, cook-and-event-derived location computed by
 * `src/data/photos/photoPaths.ts`. This module is the only thing that knows
 * where such a path actually is on the device, and it is the only thing that
 * ever needs to: an absolute device path recorded in a row would stop being
 * true the next time the operating system moved the app's sandbox, which on
 * Android it does.
 *
 * FOUR RULES
 * ----------
 *   Durable storage only.  Files go under the document directory, never the
 *   cache. The camera hands over a file in a cache directory and the system may
 *   reclaim it at any moment; leaving a photo there is how a cook's photographs
 *   quietly disappear between one week and the next.
 *
 *   Every path is checked, twice.  `isSafePhotoLogicalPath` first — which
 *   refuses `..`, absolute paths, URLs, backslashes, whitespace and cache roots
 *   — and then the resolved location is checked to be inside the root. The
 *   second check would be redundant if the first were perfect, and that is
 *   precisely why it is there.
 *
 *   A digest is computed, never guessed.  `info` reads the bytes and hashes
 *   them. The contents are hashed and discarded; nothing here logs, returns or
 *   retains them.
 *
 *   A stored photograph is never replaced.  `importFile` and `write` refuse a
 *   path that already holds a file, rather than overwriting it. Nothing in this
 *   product has any reason to write over a photograph — a logical path is
 *   derived from the cook, the event, the instant and a sequence number, so a
 *   second photograph gets a second path — and an operation that *could*
 *   overwrite one is an operation that can destroy evidence by being called
 *   with the wrong argument. The check is here, above the device, so a
 *   pre-existing file is never handed to a native call that would overwrite it.
 *
 *   A failed import destroys nothing.  Cleanup after a failure removes only a
 *   destination this operation itself created, which is knowable because the
 *   path was proved empty before the write began. A photograph that was already
 *   there is never deleted as part of recovering from an error. This store also
 *   has no database handle and cannot delete a cook or an event, so a photo that
 *   failed to save can never take the evidence of the cook with it either.
 *
 * The device itself is behind two ports so that all of the above is exercised
 * by the test suite rather than only on a phone. Their implementations live in
 * `src/data/native/`.
 */

import type { PhotoLogicalPath } from '../../domain/entities';
import type { PrivateFileStore, StoredFileInfo } from '../adapters';
import { isSafePhotoLogicalPath } from '../photos/photoPaths';

/**
 * The directory Cooking Lab's own durable files live under.
 *
 * A named subdirectory rather than the document root: the app's documents
 * directory also holds the database and whatever a future Expo module decides
 * to put there, and a store that listed all of it would report files it does
 * not own.
 */
export const PRIVATE_MEDIA_ROOT = 'cooking-lab/media';

export type FileFailureReason =
  /** The logical path is not one this app will touch. */
  | 'unsafe_path'
  /** The resolved location came out outside the store's root. */
  | 'outside_root'
  /** There is no file there. */
  | 'not_found'
  /**
   * There is already a photograph at that path.
   *
   * A refusal, not a problem to work around. See the rule in the module comment
   * above: a photograph that is already stored is evidence, and this store will
   * not replace it on the way to doing something else.
   */
  | 'already_exists'
  /** The device refused the operation. */
  | 'device_refused';

export class PrivateFileError extends Error {
  readonly reason: FileFailureReason;
  /** The logical path, which is safe to report. Never a device path. */
  readonly logicalPath: string;

  constructor(reason: FileFailureReason, logicalPath: string, message: string) {
    super(message);
    this.name = 'PrivateFileError';
    this.reason = reason;
    this.logicalPath = logicalPath;
  }
}

/** One entry found while walking the store. */
export type FoundFile = {
  /** Path relative to the store root, with `/` separators. */
  readonly relativePath: string;
  readonly byteLength: number;
};

/**
 * The device's durable file storage, as much of it as this app needs.
 *
 * Paths in and out of this port are relative to the store's root; the port
 * itself owns the absolute location and the joining. Nothing above it ever
 * holds a device path, which is what makes "no absolute path leaks into a
 * domain record" a property of the code rather than a habit.
 */
export type PrivateFileSystemPort = {
  /** Create the root if it is not there. Called before the first write. */
  ensureRoot(): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  byteLength(relativePath: string): Promise<number | null>;
  read(relativePath: string): Promise<Uint8Array>;
  write(relativePath: string, bytes: Uint8Array): Promise<void>;
  /** Move a file already on the device into the store. */
  importFrom(sourceUri: string, relativePath: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  /** Every file under the root, at any depth. */
  list(): Promise<readonly FoundFile[]>;
};

/** SHA-256, from the device's own implementation. */
export type DigestPort = {
  sha256Hex(bytes: Uint8Array): Promise<string>;
};

/** A Windows separator has no business in a logical path; it is refused, never converted. */
const BACKSLASH = String.fromCharCode(92);

/**
 * Whether a resolved relative path is still inside the store.
 *
 * The belt to `isSafePhotoLogicalPath`'s braces. It checks the *result* of
 * resolving the path rather than the request, so a future change to the path
 * grammar cannot quietly re-admit something that escapes the root.
 */
export function staysInsideRoot(relativePath: string): boolean {
  if (relativePath === '' || relativePath.startsWith('/') || relativePath.includes(BACKSLASH)) {
    return false;
  }
  const segments = relativePath.split('/');
  let depth = 0;
  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      return false;
    }
    if (segment === '..') {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
      continue;
    }
    depth += 1;
  }
  return depth > 0;
}

/** The one gate every method below passes through before touching the device. */
function checked(logicalPath: PhotoLogicalPath): string {
  if (!isSafePhotoLogicalPath(logicalPath)) {
    throw new PrivateFileError(
      'unsafe_path',
      String(logicalPath),
      'that is not an app-private Cooking Lab photo path',
    );
  }
  if (!staysInsideRoot(logicalPath)) {
    throw new PrivateFileError(
      'outside_root',
      String(logicalPath),
      'that path resolves outside the app-private store',
    );
  }
  return logicalPath;
}

function deviceRefused(logicalPath: string, what: string, cause: unknown): PrivateFileError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new PrivateFileError('device_refused', logicalPath, `could not ${what}: ${detail}`);
}

/**
 * The photo store the app runs on.
 *
 * Both dependencies are ports, so the path policy, the digest and the
 * behaviour on failure above are the same code on a device and in a test.
 */
export function createPrivateFileStore(
  files: PrivateFileSystemPort,
  digest: DigestPort,
): PrivateFileStore {
  const describe = async (
    logicalPath: PhotoLogicalPath,
    bytes: Uint8Array,
  ): Promise<StoredFileInfo> => ({
    logicalPath,
    byteLength: bytes.length,
    sha256: await digest.sha256Hex(bytes),
  });

  return {
    async exists(logicalPath: PhotoLogicalPath): Promise<boolean> {
      return files.exists(checked(logicalPath));
    },

    /**
     * What is stored there, or `null` if nothing is.
     *
     * The digest means reading the file. There is no way to hash bytes without
     * having them, and a size-and-date "digest" would match two different
     * photographs, which is exactly the case a manifest exists to catch.
     */
    async info(logicalPath: PhotoLogicalPath): Promise<StoredFileInfo | null> {
      const relative = checked(logicalPath);
      if (!(await files.exists(relative))) {
        return null;
      }
      try {
        return await describe(logicalPath, await files.read(relative));
      } catch (cause) {
        throw deviceRefused(logicalPath, 'read the photo', cause);
      }
    },

    /**
     * Bring a freshly captured file into the store.
     *
     * Refuses outright if something is already stored at that path. A stored
     * photograph is evidence, and an import that quietly replaced one would
     * destroy it in the course of doing something else entirely.
     *
     * Because the path is proved empty first, anything found there afterwards
     * was put there by this call, which is what makes cleanup on failure safe:
     * it can only remove what this operation created. What it never does is
     * touch a cook or an event — this store has no database handle — so a photo
     * that failed to save cannot take the record of the cook with it. The caller
     * learns the import failed and the cook keeps its timeline.
     */
    async importFile(
      sourceUri: string,
      logicalPath: PhotoLogicalPath,
    ): Promise<StoredFileInfo> {
      const relative = await claim(files, logicalPath);
      await files.ensureRoot();
      try {
        await files.importFrom(sourceUri, relative);
      } catch (cause) {
        await discard(files, relative);
        throw deviceRefused(logicalPath, 'bring the photo into app-private storage', cause);
      }
      try {
        return await describe(logicalPath, await files.read(relative));
      } catch (cause) {
        await discard(files, relative);
        throw deviceRefused(logicalPath, 'read back the photo that was just stored', cause);
      }
    },

    async read(logicalPath: PhotoLogicalPath): Promise<Uint8Array> {
      const relative = checked(logicalPath);
      if (!(await files.exists(relative))) {
        throw new PrivateFileError('not_found', logicalPath, 'there is no photo at that path');
      }
      try {
        return await files.read(relative);
      } catch (cause) {
        throw deviceRefused(logicalPath, 'read the photo', cause);
      }
    },

    /**
     * Store bytes at a path that is not yet in use.
     *
     * Refuses a path that already holds a file, for the same reason
     * `importFile` does. There is no accepted requirement anywhere in the
     * product for replacing a stored photograph: a logical path is derived from
     * the cook, the event, the instant and a sequence number, so a different
     * photograph always has a different path. Should a replacement ever be
     * genuinely needed, deleting first is an explicit, separate act — which is
     * exactly the visibility a silent overwrite would remove.
     */
    async write(logicalPath: PhotoLogicalPath, bytes: Uint8Array): Promise<StoredFileInfo> {
      const relative = await claim(files, logicalPath);
      await files.ensureRoot();
      try {
        await files.write(relative, bytes);
      } catch (cause) {
        await discard(files, relative);
        throw deviceRefused(logicalPath, 'write the photo', cause);
      }
      return describe(logicalPath, bytes);
    },

    /** Deleting something that is not there is not an error; the outcome is the same. */
    async delete(logicalPath: PhotoLogicalPath): Promise<void> {
      const relative = checked(logicalPath);
      if (!(await files.exists(relative))) {
        return;
      }
      try {
        await files.delete(relative);
      } catch (cause) {
        throw deviceRefused(logicalPath, 'delete the photo', cause);
      }
    },

    /**
     * Everything the store holds, for reconciling against a photo manifest.
     *
     * A file whose path is not a valid logical path is still listed. It cannot
     * be read, written or deleted through this store — every other method
     * refuses it — but hiding it would mean a reconciliation reported a tidy
     * store while an unexplained file sat in it, and the whole point of
     * reconciling is to find exactly that.
     */
    async list(): Promise<readonly StoredFileInfo[]> {
      const found = [...(await files.list())].sort((left, right) =>
        left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0,
      );
      const described: StoredFileInfo[] = [];
      for (const entry of found) {
        const bytes = await files.read(entry.relativePath);
        described.push({
          logicalPath: entry.relativePath,
          byteLength: bytes.length,
          sha256: await digest.sha256Hex(bytes),
        });
      }
      return described;
    },
  };
}

/**
 * Check the path and prove it is free, returning it for use.
 *
 * The single gate in front of every write. Two things happen here and they
 * belong together: the path is checked for safety, and it is checked for being
 * empty. Callers get the relative path back only once both hold, which means a
 * write path in this module is always one that was unoccupied a moment ago —
 * and that is precisely the fact that makes cleanup on failure safe.
 */
async function claim(
  files: PrivateFileSystemPort,
  logicalPath: PhotoLogicalPath,
): Promise<string> {
  const relative = checked(logicalPath);
  if (await files.exists(relative)) {
    throw new PrivateFileError(
      'already_exists',
      logicalPath,
      'there is already a photograph stored at that path, and it will not be replaced',
    );
  }
  return relative;
}

/**
 * Remove a file this operation created, without replacing the failure that
 * caused it.
 *
 * Only ever called on a path `claim` proved empty moments earlier, so what it
 * removes is what the failing operation was in the middle of writing. It is not
 * a general delete and must never be pointed at a path that was already
 * occupied: cleaning up after an error is not a licence to destroy a
 * photograph that was already stored.
 */
async function discard(files: PrivateFileSystemPort, relativePath: string): Promise<void> {
  try {
    if (await files.exists(relativePath)) {
      await files.delete(relativePath);
    }
  } catch {
    // The caller is about to be told why the operation failed; a failure to
    // clean up must not take the place of that reason.
  }
}
