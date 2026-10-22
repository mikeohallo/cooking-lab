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
 *
 * WHAT CHANGED IN FORMAT VERSION 2
 * --------------------------------
 * Nothing about the envelope's shape, and that is worth being clear about,
 * because it is the reason the version had to be bumped at all. Version 2
 * carries three things a version 1 file could not:
 *
 *   * a tag with no kind (`kind: null`), which schema version 2 allows and
 *     which a version 1 reader would refuse as a malformed row;
 *   * a temperature reading that says what it was taken of, as
 *     `meta.readingKind`;
 *   * a populated `photoManifest`, which existed in version 1 and was always
 *     empty because there were no photographs to put in it.
 *
 * The first is the one that forces the version. A build that reads version 1
 * is entitled to assume every tag has one of the four kinds, so handing it a
 * file full of tags without one would be handing it a file it cannot read while
 * telling it that it can. The version is the app saying which assumptions hold.
 *
 * This build writes version 2 and reads both, because every backup a kitchen
 * already has is a version 1 file and a format that cannot read its own history
 * is not a backup format.
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
export const BACKUP_FORMAT_VERSION = 2;

/** Envelope versions this build can read. */
export const SUPPORTED_BACKUP_FORMAT_VERSIONS: readonly number[] = [1, 2];

/**
 * The first version in which a tag may have no kind.
 *
 * Checked on the way in: a file that calls itself version 1 and contains an
 * untyped tag is not a version 1 file, and saying so is the whole point of
 * carrying a version. Validation reports it rather than reading it anyway —
 * a reader that accepted both would make the version decorative.
 */
export const FIRST_UNTYPED_TAG_FORMAT_VERSION = 2;

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
