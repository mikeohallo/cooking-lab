/**
 * Assembling the running app's storage, once, at startup.
 *
 * This is the composition root: the single place where the native ports in
 * `src/data/native/` are plugged into the policy in `src/data/sqlite/` and
 * `src/data/files/`. Everything else in the data layer takes its dependencies
 * as arguments, which is what makes the whole of it testable without a device.
 *
 * WHAT A CALLER GETS, AND WHAT IT DOES NOT
 * ----------------------------------------
 * A `CookingLabStorage` holds a `DataLayer`, a `PrivateFileStore` and an
 * `AiService`. It does not hold the `DatabaseAdapter`: the connection is closed
 * over by the repositories and is not handed out, so there is no route from a
 * screen — or from the assistant — to raw SQL. The assistant is constructed
 * here alongside the data layer and is given none of it.
 *
 * Startup can fail, and the failures are values rather than exceptions because
 * each of them is a state a screen has to be able to explain. In particular
 * `recovery_required` — an encrypted database with no key — is not an error to
 * be swallowed and retried; it is something the person holding the phone needs
 * to be told.
 */

import type { AiService, DatabaseAdapter, PrivateFileStore } from './adapters';
import type { DataLayer } from './repositories';
import type { AppVariant } from '../config/variants';
import { selectAiService } from './ai/selection';
import { createExportService, type ExportService } from './export/service';
import { createPrivateFileStore } from './files/privateFileStore';
import { createSqliteDataLayer } from './sqlite/dataLayer';
import { createDatabaseAdapterFactory } from './sqlite/connection';
import { createDatabaseKeyProvider } from './sqlite/keyProvider';
import {
  openCookingLabDatabase,
  type DatabaseStartupFailure,
} from './sqlite/lifecycle';
import { expoDigestPort, expoRandomBytesPort } from './native/expoCrypto';
import { expoPrivateFileSystemPort } from './native/expoFileSystem';
import { expoSecureStorePort } from './native/expoSecureStore';
import { expoSharingSink } from './native/expoSharing';
import { expoDatabaseFilePresence, openExpoSqliteConnection } from './native/expoSqlite';

export type CookingLabStorage = {
  readonly data: DataLayer;
  readonly photos: PrivateFileStore;
  readonly assistant: AiService;
  /** Gets history out of the phone: the portable backup, or one cook as text. */
  readonly exporter: ExportService;
  /** The schema version the open database reports. */
  readonly schemaVersion: number;
  /** True when this launch created the database and its key for the first time. */
  readonly freshInstall: boolean;
  /** Release the connection. The app does this on teardown, and tests on cleanup. */
  close(): Promise<void>;
};

export type StorageStartupResult =
  | { readonly ok: true; readonly storage: CookingLabStorage }
  | DatabaseStartupFailure;

export type StorageStartupOptions = {
  readonly variant: AppVariant;
  /** Supplies ids for tags the store creates. Injected so it can be made deterministic. */
  readonly newId: () => string;
  /** The current instant, for export timestamps. Injected so it can be made deterministic. */
  readonly now?: () => string;
};

/**
 * Open the database and build everything that sits on it.
 *
 * The order is fixed by `openCookingLabDatabase`, which checks for the file
 * before it asks for a key so that a missing key against an existing database
 * is reported rather than repaired.
 */
export async function startCookingLabStorage(
  options: StorageStartupOptions,
): Promise<StorageStartupResult> {
  const started = await openCookingLabDatabase({
    databases: createDatabaseAdapterFactory(openExpoSqliteConnection),
    keys: createDatabaseKeyProvider(expoSecureStorePort, expoRandomBytesPort),
    files: expoDatabaseFilePresence,
  });

  if (!started.ok) {
    return started;
  }

  const database: DatabaseAdapter = started.database;
  const data = createSqliteDataLayer(database, options.newId);
  const photos = createPrivateFileStore(expoPrivateFileSystemPort, expoDigestPort);

  return {
    ok: true,
    storage: {
      data,
      photos,
      assistant: selectAiService({ variant: options.variant }),
      exporter: createExportService({
        data,
        photos,
        schemaVersion: started.schema.schemaVersion,
        sink: expoSharingSink,
        variant: options.variant,
        now: options.now ?? (() => new Date().toISOString()),
      }),
      schemaVersion: started.schema.schemaVersion,
      freshInstall: started.keyCreated,
      async close(): Promise<void> {
        await database.close();
      },
    },
  };
}
