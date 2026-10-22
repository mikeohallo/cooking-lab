/**
 * In-memory stand-ins for the four device ports.
 *
 * Each one is a straightforward implementation of a small interface, not an
 * imitation of a platform: a `Map` really is a key-value store, `node:crypto`
 * really does compute SHA-256, and a `Map` of byte arrays really does hold
 * files. Nothing here claims to be secure storage or encrypted anything — the
 * ports exist so the *policy* above them can be tested, and the policy is what
 * these suites are about.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { DigestPort, FoundFile, PrivateFileSystemPort } from '../../src/data/files/privateFileStore';
import type { RandomBytesPort, SecureStorePort } from '../../src/data/sqlite/keyProvider';

export type MemorySecureStore = SecureStorePort & {
  /** What the store holds, for a test that needs to plant or remove a value. */
  readonly entries: Map<string, string>;
  available: boolean;
  /** Every call made, so a test can prove a value was not re-read or rewritten. */
  readonly calls: string[];
};

export function memorySecureStore(): MemorySecureStore {
  const entries = new Map<string, string>();
  const calls: string[] = [];
  const store: MemorySecureStore = {
    entries,
    available: true,
    calls,
    async isAvailable(): Promise<boolean> {
      return store.available;
    },
    async getItem(alias: string): Promise<string | null> {
      calls.push(`get:${alias}`);
      return entries.get(alias) ?? null;
    },
    async setItem(alias: string, value: string): Promise<void> {
      calls.push(`set:${alias}`);
      entries.set(alias, value);
    },
    async deleteItem(alias: string): Promise<void> {
      calls.push(`delete:${alias}`);
      entries.delete(alias);
    },
  };
  return store;
}

/** The platform's random source, as far as these tests are concerned. */
export const nodeRandomBytes: RandomBytesPort = {
  async bytes(count: number): Promise<Uint8Array> {
    return new Uint8Array(randomBytes(count));
  },
};

/** A random source that returns too little, to prove the provider notices. */
export function shortRandomBytes(actual: number): RandomBytesPort {
  return {
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array(actual);
    },
  };
}

export const nodeDigest: DigestPort = {
  async sha256Hex(bytes: Uint8Array): Promise<string> {
    return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  },
};

/**
 * A file system that is a map from relative path to bytes.
 *
 * Enough of one to exercise the store: files exist or do not, directories are
 * implied by the paths, and a listing walks everything. The two behaviours a
 * test needs to force — a device that refuses a write, and a source file that
 * is not there — are options rather than mocks.
 */
export type MemoryFileSystem = PrivateFileSystemPort & {
  readonly files: Map<string, Uint8Array>;
  /** Files outside the store, addressed by URI, that `importFrom` can move in. */
  readonly elsewhere: Map<string, Uint8Array>;
  rootCreated: boolean;
  /** When set, every write and import fails, as a full or read-only device would. */
  refuseWrites: boolean;
  /**
   * Hold every `exists` call until the returned function is called.
   *
   * The point of the concurrency tests is to force the interleaving rather than
   * hope for it. Pausing here suspends an operation at exactly the moment the
   * old code was unsafe — after it had asked whether the path was free and
   * before it had been told — so a second operation can be started while the
   * first is provably in flight.
   */
  pauseExists(): () => void;
  /** Hold every `write` and `importFrom` until the returned function is called. */
  pauseWrites(): () => void;
};

/** A gate a test can hold shut and then open. */
function createGate(): { readonly wait: () => Promise<void>; readonly pause: () => () => void } {
  let held: Promise<void> | null = null;
  let open: (() => void) | null = null;

  return {
    async wait(): Promise<void> {
      if (held !== null) {
        await held;
      }
    },
    pause(): () => void {
      held = new Promise<void>((resolve) => {
        open = resolve;
      });
      return () => {
        open?.();
        held = null;
        open = null;
      };
    },
  };
}

export function memoryFileSystem(): MemoryFileSystem {
  const files = new Map<string, Uint8Array>();
  const elsewhere = new Map<string, Uint8Array>();
  const existsGate = createGate();
  const writeGate = createGate();

  const system: MemoryFileSystem = {
    files,
    elsewhere,
    rootCreated: false,
    refuseWrites: false,
    pauseExists: existsGate.pause,
    pauseWrites: writeGate.pause,

    async ensureRoot(): Promise<void> {
      system.rootCreated = true;
    },

    async exists(relativePath: string): Promise<boolean> {
      await existsGate.wait();
      return files.has(relativePath);
    },

    async byteLength(relativePath: string): Promise<number | null> {
      return files.get(relativePath)?.length ?? null;
    },

    async read(relativePath: string): Promise<Uint8Array> {
      const bytes = files.get(relativePath);
      if (bytes === undefined) {
        throw new Error(`no file at ${relativePath}`);
      }
      return bytes;
    },

    async write(relativePath: string, bytes: Uint8Array): Promise<void> {
      await writeGate.wait();
      if (system.refuseWrites) {
        throw new Error('the device refused the write');
      }
      // The native layer refuses an occupied destination; so does this one, so
      // a test cannot accidentally prove safety that the device would not give.
      if (files.has(relativePath)) {
        throw new Error(`there is already a file at ${relativePath}`);
      }
      files.set(relativePath, bytes);
    },

    async importFrom(sourceUri: string, relativePath: string): Promise<void> {
      await writeGate.wait();
      if (system.refuseWrites) {
        throw new Error('the device refused the write');
      }
      if (files.has(relativePath)) {
        throw new Error(`there is already a file at ${relativePath}`);
      }
      const bytes = elsewhere.get(sourceUri);
      if (bytes === undefined) {
        throw new Error(`no file at ${sourceUri}`);
      }
      files.set(relativePath, bytes);
      elsewhere.delete(sourceUri);
    },

    async delete(relativePath: string): Promise<void> {
      files.delete(relativePath);
    },

    async list(): Promise<readonly FoundFile[]> {
      return [...files.entries()].map(([relativePath, bytes]) => ({
        relativePath,
        byteLength: bytes.length,
      }));
    },

    // Shaped like the real one: an absolute-looking location that is this
    // port's business and nothing else's.
    uri(relativePath: string): string {
      return `file:///memory/${relativePath}`;
    },
  };

  return system;
}

/** A file system that always claims the root could not be made. */
export function unwritableFileSystem(): MemoryFileSystem {
  const system = memoryFileSystem();
  system.refuseWrites = true;
  return system;
}
