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
  CookId,
  DatabaseSnapshot,
  ImportBatchId,
  IsoTimestamp,
  JsonValue,
  PhotoLogicalPath,
} from '../domain/entities';
import type { CookEventKind, CreatedBy } from '../domain/enums';
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
  /**
   * A URI an `<Image>` can be pointed at, or `null` if nothing is stored there.
   *
   * The one place a device path crosses this line, and it crosses it to be
   * drawn and nothing else. A photograph has to be shown eventually, and the
   * only way to show one is to hand the view layer something it can load.
   *
   * It is never stored. Not by convention: `photoPath` is the only column a
   * photograph is referenced from, and `isSafePhotoLogicalPath` — which
   * `validateCookEvent` and the backup validator both apply — refuses any
   * string carrying a scheme, an absolute path or a backslash. So a URI from
   * here cannot be written into a record even by a caller that tries.
   *
   * It is also not durable: the app's sandbox moves, and a URI that was true
   * last week may not be this week. Resolve one when a photograph is about to
   * be drawn, and throw it away afterwards.
   */
  displayUri(logicalPath: PhotoLogicalPath): Promise<string | null>;
};

/**
 * Where a photograph comes from.
 *
 * `camera` needs the camera, which Android asks the person about the first
 * time. `library` goes through Android's own photo picker, which hands this app
 * the one picture the person chose and needs no storage permission at all — the
 * app never gets to see the roll, so there is nothing to ask for.
 */
export type PhotoOrigin = 'camera' | 'library';

/** A picture the device has handed over, in a place of the device's choosing. */
export type CapturedImage = {
  /** Wherever the device put it. Usually a cache directory; never kept. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
};

export type PhotoSourceOutcome =
  | { readonly status: 'captured'; readonly image: CapturedImage }
  /** The person backed out. Not a failure, and nothing to say about it. */
  | { readonly status: 'cancelled' }
  /**
   * Android said no to the camera.
   *
   * `canAskAgain` is false once the person has refused in a way Android treats
   * as final; a screen then points at Settings instead of asking again, which
   * is the only thing left that can change the answer.
   */
  | { readonly status: 'denied'; readonly canAskAgain: boolean }
  | { readonly status: 'failed'; readonly message: string };

/**
 * The camera and the photo picker.
 *
 * Two methods, no options, and no permission calls for the caller to remember:
 * asking for the camera is part of taking a photograph and belongs behind this
 * line with it. Nothing here touches storage, a database or a cook — a source
 * produces one picture, or a reason there isn't one.
 */
export type PhotoSource = {
  takePhoto(): Promise<PhotoSourceOutcome>;
  choosePhoto(): Promise<PhotoSourceOutcome>;
};

/** A JPEG as bytes, with the size it came out at. */
export type EncodedPhoto = {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
};

/**
 * Re-encodes a picture as a JPEG of a sensible size.
 *
 * Returns the bytes rather than a file, which is the whole point of the shape:
 * the app checks and cleans those bytes itself (`./photos/jpeg.ts`) before
 * anything is stored, so nothing is ever written to the photo store that has
 * not been through the metadata check. An encoder that handed back a path would
 * leave the only copy somewhere the app would have to trust.
 *
 * The implementation also tidies up after itself: whatever temporary file the
 * platform made on the way is gone by the time this resolves.
 */
export type PhotoEncoder = {
  /** Long edge at most `maxLongEdge`; a smaller picture is left its own size. */
  encodeJpeg(image: CapturedImage, maxLongEdge: number): Promise<EncodedPhoto>;
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
 * A copy of the records, not a query interface. A service cannot go looking for
 * anything it was not given, which means what the assistant saw is exactly what
 * the app decided to show it, and that decision is in the app's code.
 */
export type AiReviewContext = {
  readonly cook: Cook;
  readonly events: readonly CookEvent[];
};

/** Why an assistant operation produced nothing. */
export type AiUnavailableReason =
  /** No assistant is wired into this build. The M1 state, and the only one. */
  | 'ai_not_connected'
  /** An assistant exists but could not answer this time. */
  | 'ai_request_failed';

/**
 * The result of an assistant operation.
 *
 * Every operation returns one of these rather than throwing or returning an
 * empty answer, because "the assistant is not connected" and "the assistant
 * looked and found nothing" are different facts and a screen must be able to
 * tell them apart. An implementation that cannot answer says so; it never
 * returns a plausible-looking empty result.
 */
export type AiOutcome<T> =
  | { readonly available: true; readonly result: T }
  | {
      readonly available: false;
      readonly reason: AiUnavailableReason;
      readonly message: string;
    };

/** Everything a briefing is built from: the new cook, and earlier cooks as values. */
export type AiBriefingRequest = {
  readonly cookId: CookId;
  readonly sourceCooks: readonly AiReviewContext[];
};

/**
 * A briefing the assistant proposes.
 *
 * `content` is JSON shaped by the screen that renders it; `sourceCookIds` are
 * the earlier cooks it was read out of, which become `briefing_sources` rows.
 * There is no status here: a briefing is prepared, shown, and either helped or
 * did not.
 */
export type AiBriefingDraft = {
  readonly content: JsonValue;
  readonly sourceCookIds: readonly CookId[];
};

/** One turn of a conversation about a cook. */
export type AiChatTurn = {
  readonly speaker: CreatedBy;
  readonly text: string;
};

export type AiChatRequest = {
  readonly context: AiReviewContext;
  readonly history: readonly AiChatTurn[];
  readonly message: string;
};

/**
 * What the assistant said.
 *
 * Text and nothing else. A reply is not a finding: if the assistant wants to
 * make a claim about the cook it goes through `extractCook` and arrives as a
 * candidate, like every other claim.
 */
export type AiChatReply = {
  readonly text: string;
};

/** A timeline entry read out of an imported document. */
export type AiImportEventDraft = {
  readonly kind: CookEventKind;
  readonly ts: IsoTimestamp | null;
  readonly body: string | null;
};

/**
 * A cook the assistant thinks it found in an imported document.
 *
 * A draft, not a cook. Nothing here becomes a row until the person importing
 * has looked at it and said so, and turning a confirmed draft into records is
 * the M2 import workflow. Note what a draft cannot carry: no verdict, no
 * status, no findings. A verdict is the cook's own words about their own
 * cooking, and an assistant reading a document is not the cook.
 */
export type AiImportCandidate = {
  readonly title: string | null;
  readonly startedAt: IsoTimestamp | null;
  readonly events: readonly AiImportEventDraft[];
};

export type AiImportRequest = {
  readonly batchId: ImportBatchId;
  /** The text of the document being brought in, as the app read it. */
  readonly documentText: string;
};

export type AiImportResult = {
  readonly batchId: ImportBatchId;
  readonly candidates: readonly AiImportCandidate[];
};

/**
 * The assistant seam.
 *
 * Four operations, and every one of them returns a value the app then decides
 * what to do with. There is no database handle, no repository, no data layer
 * and no write of any kind anywhere in this interface — not because an
 * implementation would be trusted not to use one, but because it is never given
 * one. Candidates become rows in `ReviewService`, as proposals, and only there.
 *
 *   `extractCook`       reads a finished cook and its timeline, and proposes
 *                       findings and lessons as candidates.
 *   `createBriefing`    reads earlier cooks and proposes advice for a new one.
 *   `chat`              answers a question about a cook, in words.
 *   `importCandidates`  reads a document brought in from outside and proposes
 *                       the cooks it thinks are in it.
 *
 * The production implementation for this milestone is
 * `createUnavailableAiService`, which answers every one of them with
 * `ai_not_connected`.
 */
export type AiService = {
  extractCook(context: AiReviewContext): Promise<AiOutcome<AiCandidateSet>>;
  createBriefing(request: AiBriefingRequest): Promise<AiOutcome<AiBriefingDraft>>;
  chat(request: AiChatRequest): Promise<AiOutcome<AiChatReply>>;
  importCandidates(request: AiImportRequest): Promise<AiOutcome<AiImportResult>>;
};

/** The operations every assistant implementation must provide, by name. */
export const AI_SERVICE_OPERATIONS: readonly string[] = [
  'extractCook',
  'createBriefing',
  'chat',
  'importCandidates',
];

/**
 * Property names an assistant service may never carry.
 *
 * Lowercased; matched against every property name the object exposes, its
 * prototype chain included.
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
  'filestore',
  'keyprovider',
  'adapter',
  'connection',
  'data',
  'files',
  'photos',
  'snapshots',
];

/**
 * The shapes that are a way to write, whatever the property holding one is called.
 *
 * Names are the weaker half of this check: a leaky service is unlikely to call
 * its database `database`. So each group below is a set of members that only an
 * object which can reach storage would have, and an object carrying all of any
 * one group is a handle regardless of what it was named.
 */
const STORAGE_SHAPES: readonly (readonly string[])[] = [
  // A database connection.
  ['execute', 'select'],
  ['withTransaction'],
  // A whole data layer.
  ['cooks', 'cookEvents', 'findings'],
  ['review', 'capture'],
  // A single repository.
  ['findById', 'save'],
  ['findById', 'create'],
  ['createWithSources'],
  // The photo store.
  ['importFile', 'write', 'delete'],
  ['readSnapshot'],
];

function looksLikeADatabase(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return STORAGE_SHAPES.some((shape) => shape.every((member) => member in value));
}

/**
 * Every property name an object exposes, its prototype chain included.
 *
 * `Object.entries` sees own enumerable properties only, so a service written as
 * a class would hide all of its methods — and therefore any handle among them —
 * from the check below. The walk stops at `Object.prototype`, whose members
 * belong to every object and mean nothing here.
 */
function reachableMembers(subject: object): readonly string[] {
  const names = new Set<string>();
  let current: object | null = subject;
  while (current !== null && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== 'constructor') {
        names.add(name);
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return [...names];
}

/**
 * The names by which an object hands its holder a way to write to storage.
 *
 * Returns the offending property names, empty when there are none. This is a
 * runtime check on top of a type-level guarantee, because the type only binds
 * code that was compiled against it: a service assembled from a plain object, a
 * class, a mock or a future plug-in is still checkable here.
 * `__tests__/evidence.test.ts` runs it against both a compliant service and a
 * leaky one, so it is known to fire.
 */
export function findDatabaseHandles(adapter: object): readonly string[] {
  return reachableMembers(adapter).filter((name) => {
    if (FORBIDDEN_ADAPTER_MEMBERS.includes(name.toLowerCase())) {
      return true;
    }
    const value = (adapter as Record<string, unknown>)[name];
    return looksLikeADatabase(value);
  });
}
