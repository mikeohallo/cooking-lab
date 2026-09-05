/**
 * The native seam: what Cooking Lab needs from the device, described but not
 * implemented.
 *
 * WHY THERE IS NO IMPLEMENTATION IN THIS FILE
 * ------------------------------------------
 * Each of these interfaces stands in front of something that only a real native
 * module can do honestly — an encrypted SQLite file, a key in hardware-backed
 * storage, a directory the operating system keeps private to this app. A
 * plausible-looking stand-in (an in-memory map called a database, a constant
 * called a key, a temp directory called app-private) would type-check, satisfy
 * a test suite and be indistinguishable in code review from the real thing,
 * while providing none of the protection its name claims. That is a worse
 * position than having nothing, so this milestone deliberately ships nothing.
 *
 * The interfaces are still worth writing now: they fix the shape the deferred
 * work has to fit, and they let the pure layers above be built and tested
 * against a boundary rather than against a guess.
 *
 * Deferred to a later, separately authorised M1 step: the `expo-sqlite`
 * adapter and its encryption, the SecureStore key lifecycle, the app-private
 * FileSystem store, and real backup file I/O.
 */

import type {
  Cook,
  CookEvent,
  DatabaseSnapshot,
  IsoTimestamp,
  PhotoLogicalPath,
} from '../domain/entities';
import type { AiCandidateSet } from '../domain/evidence';
import type { BackupEnvelope, BackupPhotoManifestEntry } from './backup/contract';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** A value SQLite can store in a column. */
export type SqlValue = string | number | null;

export type SqlStatement = {
  readonly sql: string;
  /** Bound parameters. Values are never interpolated into `sql`. */
  readonly params?: readonly SqlValue[];
};

export type SqlRow = Readonly<Record<string, SqlValue>>;

export type SqlExecutionResult = {
  readonly rowsAffected: number;
};

/**
 * The minimum a store must do to be a database for this app.
 *
 * `withTransaction` takes a callback rather than exposing begin/commit because
 * a migration or a proposal-plus-citations write must be all-or-nothing, and a
 * caller that can forget to commit will eventually forget.
 */
export type DatabaseAdapter = {
  execute(statement: SqlStatement): Promise<SqlExecutionResult>;
  select(statement: SqlStatement): Promise<readonly SqlRow[]>;
  withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

/**
 * A handle valid only inside `withTransaction`.
 *
 * It cannot commit or roll back: returning from the callback commits, throwing
 * rolls back. There is no third outcome to get wrong.
 */
export type Transaction = {
  execute(statement: SqlStatement): Promise<SqlExecutionResult>;
  select(statement: SqlStatement): Promise<readonly SqlRow[]>;
};

/** How the database file is opened, including whether it is encrypted. */
export type DatabaseOpenOptions = {
  /** File name inside the app-private directory. Never a path. */
  readonly fileName: string;
  /**
   * The key for an encrypted database, from `DatabaseKeyProvider`. `null` opens
   * an unencrypted file, which is only ever acceptable for a throwaway database
   * in a test.
   */
  readonly encryptionKey: string | null;
};

export type DatabaseAdapterFactory = {
  open(options: DatabaseOpenOptions): Promise<DatabaseAdapter>;
};

// ---------------------------------------------------------------------------
// Key material
// ---------------------------------------------------------------------------

/**
 * Supplies the database encryption key from device-secure storage.
 *
 * The contract that matters is the one this interface cannot express in types:
 * the key is generated on the device, never leaves it, never appears in a
 * backup, never appears in a log, and is not derived from anything guessable.
 * An implementation that returns a constant would satisfy every signature here
 * and none of that, which is precisely why there is no implementation yet.
 */
export type DatabaseKeyProvider = {
  /** True once a key exists, without materialising it. */
  hasKey(): Promise<boolean>;
  /** The existing key, or a newly generated one on first run. */
  getOrCreateKey(): Promise<string>;
  /**
   * Destroy the key. The encrypted database becomes permanently unreadable, so
   * this is a deliberate, user-initiated erase and nothing else.
   */
  destroyKey(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Files and photos
// ---------------------------------------------------------------------------

export type StoredFileInfo = {
  readonly logicalPath: PhotoLogicalPath;
  readonly byteLength: number;
  /** Lowercase hex SHA-256, used to match a manifest entry to a file. */
  readonly sha256: string;
};

/**
 * The app-private store photographs live in.
 *
 * Every method takes a *logical* path (see `src/data/photos/photoPaths.ts`);
 * resolving one to a device location is the implementation's business and
 * nothing above this line ever learns the absolute path. Nothing here accepts a
 * URL: a Cooking Lab photo is a file in this app's own storage, or it is not a
 * Cooking Lab photo.
 */
export type PrivateFileStore = {
  exists(logicalPath: PhotoLogicalPath): Promise<boolean>;
  info(logicalPath: PhotoLogicalPath): Promise<StoredFileInfo | null>;
  /**
   * Move a freshly captured file into app-private storage under its logical
   * path. Import rather than write-bytes because the camera hands over a file
   * in a cache directory the system may reclaim at any moment.
   */
  importFile(sourceUri: string, logicalPath: PhotoLogicalPath): Promise<StoredFileInfo>;
  read(logicalPath: PhotoLogicalPath): Promise<Uint8Array>;
  write(logicalPath: PhotoLogicalPath, bytes: Uint8Array): Promise<StoredFileInfo>;
  delete(logicalPath: PhotoLogicalPath): Promise<void>;
  /** Every file the store holds, for reconciling against a photo manifest. */
  list(): Promise<readonly StoredFileInfo[]>;
};

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export type BackupTarget = {
  /** Where the user chose to put it. Opaque to everything above this line. */
  readonly destinationUri: string;
};

export type BackupWriteResult = {
  readonly envelope: BackupEnvelope;
  readonly byteLength: number;
  readonly photosWritten: number;
};

/**
 * Writes a portable backup out of the device.
 *
 * The envelope handed to `write` is already built and validated by
 * `src/data/backup/` — a writer serialises and copies, it does not decide what
 * a backup contains.
 */
export type BackupWriter = {
  write(
    envelope: BackupEnvelope,
    photos: readonly BackupPhotoManifestEntry[],
    target: BackupTarget,
  ): Promise<BackupWriteResult>;
};

export type BackupReadResult = {
  readonly envelope: BackupEnvelope;
  /** Manifest entries whose file was actually present in the archive. */
  readonly photosPresent: readonly PhotoLogicalPath[];
  /** Manifest entries with no file behind them. A restore reports these. */
  readonly photosMissing: readonly PhotoLogicalPath[];
};

/**
 * Reads a portable backup back in.
 *
 * Reading is separate from applying: a reader produces a validated envelope and
 * says what it found, and a restore — which is a destructive operation on a
 * real kitchen's history — is a separate, explicitly confirmed step.
 */
export type BackupReader = {
  read(sourceUri: string): Promise<BackupReadResult>;
};

/** Assembles the envelope. Pure, but stated here so the seam is complete. */
export type BackupBuilder = {
  build(
    snapshot: DatabaseSnapshot,
    photos: readonly BackupPhotoManifestEntry[],
    schemaVersion: number,
    at: IsoTimestamp,
  ): BackupEnvelope;
};

// ---------------------------------------------------------------------------
// The assistant
// ---------------------------------------------------------------------------

/**
 * What an assistant is shown: one cook and its timeline, as values.
 *
 * A copy of the records, not a query interface. An adapter cannot go looking
 * for anything it was not given, which means what the assistant saw is exactly
 * what the app decided to show it, and that decision is in the app's code.
 */
export type AiReviewContext = {
  readonly cook: Cook;
  readonly events: readonly CookEvent[];
};

/**
 * The assistant seam.
 *
 * This interface has one method and it returns candidates. There is no
 * database handle, no repository, no data layer and no write of any kind
 * anywhere in it — not because an implementation would be trusted not to use
 * one, but because it is never given one. Candidates become rows in
 * `ReviewService`, as proposals, and only there.
 *
 * No implementation exists in this milestone: a stub that fabricated plausible
 * findings would be indistinguishable in review from a real one and would put
 * invented claims in front of the cook.
 */
export type AiAdapter = {
  proposeCandidates(context: AiReviewContext): Promise<AiCandidateSet>;
};

/**
 * Property names an assistant adapter may never carry.
 *
 * Lowercased; matched exactly against the adapter's own property names.
 */
const FORBIDDEN_ADAPTER_MEMBERS: readonly string[] = [
  'execute',
  'select',
  'withtransaction',
  'transaction',
  'close',
  'save',
  'create',
  'insert',
  'update',
  'delete',
  'write',
  'db',
  'database',
  'datalayer',
  'repository',
  'repositories',
  'store',
];

function looksLikeADatabase(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return ['execute', 'withTransaction', 'select', 'save'].some((method) => method in value);
}

/**
 * The names by which an object hands its holder a way to write to storage.
 *
 * Returns the offending property names, empty when there are none. This is a
 * runtime check on top of a type-level guarantee, because the type only binds
 * code that was compiled against it: an adapter assembled from a plain object,
 * a mock or a future plug-in is still checkable here.
 * `__tests__/evidence.test.ts` runs it against both a compliant adapter and a
 * leaky one, so it is known to fire.
 */
export function findDatabaseHandles(adapter: object): readonly string[] {
  return Object.entries(adapter)
    .filter(
      ([name, value]) =>
        FORBIDDEN_ADAPTER_MEMBERS.includes(name.toLowerCase()) || looksLikeADatabase(value),
    )
    .map(([name]) => name);
}
