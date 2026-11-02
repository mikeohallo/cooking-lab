/**
 * The web preview's notebook, opened (0.4.0, part 7). Web only.
 *
 * Unencrypted and in memory: a fresh SQLite database, made by the app's own
 * migrations, built into the same `CookingLabStorage` the phone gets, then
 * filled from the synthetic preview data set (or left empty, for the empty
 * Home screen). Nothing is kept: reload the page and the notebook starts again.
 *
 * The connection opener and the digest are passed in so that the Jest suite
 * can open the very same notebook on its Node SQLite harness.
 */

import type { DigestPort } from '../data/files/privateFileStore';
import type { RawConnectionOpener } from '../data/sqlite/connection';
import type { CookingLabStorage, StorageStartupResult } from '../data/runtime';
import { createUnavailableAiService } from '../data/ai/unavailable';
import { createCookDeletionWorkflow } from '../data/deletion/workflow';
import { createNoteDeletionWorkflow } from '../data/deletion/notes';
import { createExportService } from '../data/export/service';
import { createPrivateFileStore } from '../data/files/privateFileStore';
import { createPhotoService } from '../data/photos/capture';
import { createDatabaseAdapterFactory } from '../data/sqlite/connection';
import { createSqliteDataLayer } from '../data/sqlite/dataLayer';
import { runMigrations } from '../data/sqlite/migrationRunner';
import { previewExportSink, previewFileSystem, previewPhotoEncoder, previewPhotoSource } from './ports.web';
import { seedPreviewNotebook } from './seed.web';

/** SQLite's own name for a database that lives in memory and nowhere else. */
export const IN_MEMORY = ':memory:';

export type PreviewStorageOptions = {
  readonly open: RawConnectionOpener;
  readonly digest: DigestPort;
  readonly newId: () => string;
  /** The moment the preview treats as now. */
  readonly now: () => number;
  /** False for the empty notebook. */
  readonly filled: boolean;
};

export async function openPreviewStorage(options: PreviewStorageOptions): Promise<StorageStartupResult> {
  const database = await createDatabaseAdapterFactory(options.open).open({
    fileName: IN_MEMORY,
    encryptionKey: null,
  });
  const migrated = await runMigrations(database);
  const data = createSqliteDataLayer(database, options.newId);
  const photos = createPrivateFileStore(previewFileSystem(), options.digest);
  const now = () => new Date(options.now()).toISOString();
  const deletions = createCookDeletionWorkflow({ data, photos, now });
  const noteDeletions = createNoteDeletionWorkflow({ data });

  if (options.filled) {
    await seedPreviewNotebook({ data, photos }, options.now());
  }

  const storage: CookingLabStorage = {
    data,
    photos,
    photoWorkflow: createPhotoService({
      data,
      photos,
      source: previewPhotoSource,
      encoder: previewPhotoEncoder,
      newId: options.newId,
      now,
    }),
    assistant: createUnavailableAiService(),
    deletions,
    noteDeletions,
    exporter: createExportService({
      data,
      photos,
      schemaVersion: migrated.versionAfter,
      sink: previewExportSink,
      variant: 'test',
      now,
      heldNotes: () => noteDeletions.pending(),
    }),
    schemaVersion: migrated.versionAfter,
    freshInstall: true,
    async close(): Promise<void> {
      await database.close();
    },
  };
  return { ok: true, storage };
}
