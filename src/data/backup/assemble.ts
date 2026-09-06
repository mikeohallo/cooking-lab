/**
 * Turning a live database into a portable backup envelope.
 *
 * `./validation.ts` builds, checks and serialises an envelope out of records.
 * This module is the step before it: reading those records out of the database
 * and matching every photograph the timeline mentions to the file that is
 * actually on the device.
 *
 * WHAT THIS DOES AND DOES NOT DO IN THIS MILESTONE
 * ------------------------------------------------
 * It produces a validated `BackupEnvelope` and says which photographs are
 * missing. It does not write a file, does not ask the person where to put one,
 * and does not restore anything: user-triggered export, save-and-share and the
 * restore workflow are M2, and this milestone deliberately stops at the format.
 *
 * INDEPENDENT OF THE DATABASE KEY
 * -------------------------------
 * The envelope is assembled from domain records read through the data layer,
 * never from database bytes. No key, no key identifier and nothing derived from
 * one is available to this module or reachable from anything it touches, which
 * is what makes a backup readable on a device that is not this one — the only
 * device that will ever matter, because the case a backup exists for is a phone
 * that is gone.
 */

import type {
  DatabaseSnapshot,
  IsoTimestamp,
  PhotoLogicalPath,
} from '../../domain/entities';
import type { PrivateFileStore } from '../adapters';
import type { SnapshotService } from '../repositories';
import type { BackupEnvelope, BackupPhotoManifestEntry } from './contract';
import { buildBackupEnvelope, validateBackup, type BackupIssue } from './validation';
import { cookEventIdFromPhotoPath } from '../photos/photoPaths';

export type BackupAssembly = {
  readonly envelope: BackupEnvelope;
  /** Whatever validation had to say. Empty when the envelope is sound. */
  readonly issues: readonly BackupIssue[];
  readonly valid: boolean;
  /**
   * Photographs the timeline refers to that are not on the device.
   *
   * Reported, never quietly dropped. A manifest that silently omitted a missing
   * photo would produce a backup that validates and restores a cook whose
   * pictures are gone, with nothing anywhere to say so.
   */
  readonly missingPhotos: readonly PhotoLogicalPath[];
};

/**
 * The manifest for every photograph the timeline names.
 *
 * Driven by the `photo` events rather than by what happens to be in the file
 * store: the database is the record of what the cook took, and a file with no
 * event behind it is not part of this cook's history. Files in the store that
 * nothing refers to are a reconciliation question, which `PrivateFileStore.list`
 * answers separately.
 */
export async function buildPhotoManifest(
  snapshot: DatabaseSnapshot,
  files: PrivateFileStore,
): Promise<{
  readonly entries: readonly BackupPhotoManifestEntry[];
  readonly missing: readonly PhotoLogicalPath[];
}> {
  const entries: BackupPhotoManifestEntry[] = [];
  const missing: PhotoLogicalPath[] = [];

  for (const event of snapshot.cookEvents) {
    if (event.kind !== 'photo' || event.photoPath === null) {
      continue;
    }
    const info = await files.info(event.photoPath);
    if (info === null) {
      missing.push(event.photoPath);
      continue;
    }
    entries.push({
      logicalPath: event.photoPath,
      cookId: event.cookId,
      // The path carries the event it belongs to, when it belongs to one.
      cookEventId: cookEventIdFromPhotoPath(event.photoPath) ?? event.id,
      capturedAt: event.ts,
      byteLength: info.byteLength,
      sha256: info.sha256,
    });
  }

  return { entries, missing };
}

/**
 * Read the database and produce a validated envelope.
 *
 * Validation is run here rather than left to the caller because an envelope
 * that has not been checked is indistinguishable from one that has, and the
 * moment it is written to a file it starts looking like a backup.
 */
export async function assembleBackup(
  snapshots: SnapshotService,
  files: PrivateFileStore,
  schemaVersion: number,
  at: IsoTimestamp,
): Promise<BackupAssembly> {
  const snapshot = await snapshots.readSnapshot();
  const photos = await buildPhotoManifest(snapshot, files);
  const envelope = buildBackupEnvelope(snapshot, photos.entries, schemaVersion, at);
  const validation = validateBackup(envelope);

  return {
    envelope,
    issues: validation.issues,
    valid: validation.valid,
    missingPhotos: photos.missing,
  };
}
