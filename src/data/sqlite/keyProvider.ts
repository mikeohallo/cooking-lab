/**
 * The database encryption key: where it comes from, and where it lives.
 *
 * One key, generated once on the device, held in the operating system's own
 * secure store, and used for nothing but opening the local database. It is
 * never derived from anything guessable, never travels, and never appears in a
 * backup, a log, an error, a test snapshot or a Build Control report.
 *
 * WHAT THIS MODULE WILL NOT DO
 * ----------------------------
 * If the database file exists and the key does not, this provider does not
 * quietly make a new one. A new key against an existing encrypted file means
 * the file will not open, and the app would then be entitled to treat a
 * kitchen's entire history as a fresh install and write over it. Recoverable
 * loss would have become silent loss. `openCookingLabDatabase` in
 * `./lifecycle.ts` checks for the file before asking for a key, and refuses.
 *
 * Everything native is behind two ports, so the policy above is exercised by
 * the test suite rather than only on a device. `SecureStorePort` is the
 * operating system's store; `RandomBytesPort` is its cryptographic random
 * source. Neither has an implementation here — see `src/data/native/`.
 */

import type { DatabaseKeyProvider } from '../adapters';
import { DATABASE_KEY_PATTERN } from './connection';

/**
 * The name the key is filed under.
 *
 * One entry, one name, and no variant suffix: the TEST and production builds
 * have different Android application ids and therefore different sandboxes, so
 * neither can see the other's store. A suffix would suggest they shared one.
 */
export const DATABASE_KEY_ALIAS = 'cooking-lab.database-key';

/** 256 bits. The size of the key SQLCipher is given, in bytes. */
export const DATABASE_KEY_BYTES = 32;

/**
 * The device's secure store, as much of it as this app needs.
 *
 * Deliberately not the whole of `expo-secure-store`: this app stores one value
 * and reads it back, and an interface that could do more would invite more.
 */
export type SecureStorePort = {
  /** Whether the store is usable on this device at all. */
  isAvailable(): Promise<boolean>;
  getItem(alias: string): Promise<string | null>;
  setItem(alias: string, value: string): Promise<void>;
  deleteItem(alias: string): Promise<void>;
};

/** The device's cryptographic random source. Not `Math.random`, ever. */
export type RandomBytesPort = {
  bytes(count: number): Promise<Uint8Array>;
};

export type KeyFailureReason =
  /** The device's secure store is not available. */
  | 'secure_store_unavailable'
  /** The stored value is not a key this build can use. */
  | 'stored_key_malformed'
  /** The random source did not return the requested amount of material. */
  | 'insufficient_entropy';

export class DatabaseKeyError extends Error {
  readonly reason: KeyFailureReason;

  constructor(reason: KeyFailureReason, message: string) {
    super(message);
    this.name = 'DatabaseKeyError';
    this.reason = reason;
  }
}

/** Lowercase hex, one byte at a time, with no dependency on a Buffer. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * The key provider the app runs on.
 *
 * `getOrCreateKey` is the only method that can bring a key into existence, and
 * it does so only when the store has none. Whether that is legitimate — whether
 * there is an encrypted database already sitting there without one — is decided
 * before this is called, in `./lifecycle.ts`.
 */
export function createDatabaseKeyProvider(
  store: SecureStorePort,
  random: RandomBytesPort,
  alias: string = DATABASE_KEY_ALIAS,
): DatabaseKeyProvider {
  const requireStore = async (): Promise<void> => {
    if (!(await store.isAvailable())) {
      throw new DatabaseKeyError(
        'secure_store_unavailable',
        'this device has no secure store, so the database cannot be opened safely',
      );
    }
  };

  return {
    /**
     * Whether a key exists.
     *
     * The value is read — there is no existence check that does not read it —
     * but it is compared to `null` and discarded, and never returned.
     */
    async hasKey(): Promise<boolean> {
      await requireStore();
      return (await store.getItem(alias)) !== null;
    },

    async getOrCreateKey(): Promise<string> {
      await requireStore();

      const existing = await store.getItem(alias);
      if (existing !== null) {
        if (!DATABASE_KEY_PATTERN.test(existing)) {
          // Refused rather than replaced. A stored value that is not a key may
          // still be the only thing that opens an existing database, and
          // overwriting it would destroy the one chance of reading it.
          throw new DatabaseKeyError(
            'stored_key_malformed',
            'the stored database key is not in the expected form',
          );
        }
        return existing;
      }

      const material = await random.bytes(DATABASE_KEY_BYTES);
      if (material.length !== DATABASE_KEY_BYTES) {
        throw new DatabaseKeyError(
          'insufficient_entropy',
          `the secure random source returned ${material.length} bytes, not ${DATABASE_KEY_BYTES}`,
        );
      }

      const created = toHex(material);
      await store.setItem(alias, created);
      return created;
    },

    /**
     * Destroy the key.
     *
     * The encrypted database becomes permanently unreadable the moment this
     * returns. Nothing in this milestone calls it and no screen exposes it; it
     * exists so that a deliberate, confirmed erase has somewhere to live when
     * one is built.
     */
    async destroyKey(): Promise<void> {
      await requireStore();
      await store.deleteItem(alias);
    },
  };
}
