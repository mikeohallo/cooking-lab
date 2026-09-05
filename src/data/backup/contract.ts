/**
 * The portable backup format.
 *
 * A Cooking Lab backup is one JSON envelope plus the photo files its manifest
 * names. It is portable in the sense that matters to a cook: it can be read by
 * a future version of the app, by a different device, and — because it is plain
 * JSON with stable key order — by a person with a text editor, if it ever comes
 * to that. Nothing in it is encrypted, obfuscated or specific to this install,
 * and nothing in it points at a server.
 *
 * INDEPENDENT OF THE DATABASE KEY
 * -------------------------------
 * The local database is encrypted and its key never leaves the device. A backup
 * is deliberately not: it carries no key, no key identifier and nothing derived
 * from one, and it is built from domain records rather than from database
 * bytes. A backup that needed the key would be unreadable on the day it was
 * most needed — a phone that is gone — which is the one thing a backup exists
 * to survive.
 *
 * VERSIONING
 * ----------
 * Two versions travel together and they are not the same thing:
 *
 *   `formatVersion`  the shape of this envelope. Changes when the backup file
 *                    itself is restructured.
 *   `schemaVersion`  the database schema the entities came from, matching
 *                    `MIGRATIONS`. Changes far more often.
 *
 * A reader checks both. Refusing a backup from a newer app is correct
 * behaviour: reading a schema you do not understand and writing back what you
 * managed to parse is how a restore quietly destroys the records it did not
 * recognise.
 */

import type {
  CookEventId,
  CookId,
  DatabaseSnapshot,
  IsoTimestamp,
  PhotoLogicalPath,
} from '../../domain/entities';

/** Identifies the file. Present so a wrong file fails loudly, not confusingly. */
export const BACKUP_FORMAT = 'cooking-lab.backup';

/** The envelope version this build writes. */
export const BACKUP_FORMAT_VERSION = 1;

/** Envelope versions this build can read. */
export const SUPPORTED_BACKUP_FORMAT_VERSIONS: readonly number[] = [1];

/**
 * One photograph, described well enough to be put back.
 *
 * The digest is what makes a restore verifiable rather than hopeful: a file
 * that does not hash to its manifest entry is a corrupted file, and a manifest
 * entry with no file is a missing photo. Both are reported; neither is guessed
 * at.
 */
export type BackupPhotoManifestEntry = {
  readonly logicalPath: PhotoLogicalPath;
  readonly cookId: CookId;
  readonly cookEventId: CookEventId | null;
  readonly capturedAt: IsoTimestamp;
  readonly byteLength: number;
  /** Lowercase hex SHA-256 of the file's bytes. */
  readonly sha256: string;
};

export type BackupEnvelope = {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  /** The `MIGRATIONS` version the entities were read from. */
  readonly schemaVersion: number;
  readonly createdAt: IsoTimestamp;
  /** Every structured entity and every relationship row. */
  readonly entities: DatabaseSnapshot;
  readonly photoManifest: readonly BackupPhotoManifestEntry[];
};

/** The digest shape the manifest requires. */
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
