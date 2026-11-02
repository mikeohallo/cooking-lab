/**
 * The app's storage in a browser: the web preview's notebook (0.4.0, part 7).
 *
 * Metro picks this file instead of `runtime.ts` when it bundles for the web,
 * and only then; an Android bundle never contains it. On the web the app
 * always runs in preview mode: there is no encrypted database, no key store
 * and no phone file system, only an unencrypted in-memory notebook made by the
 * app's own migrations and filled with synthetic preview data
 * (`src/preview/`). It keeps nothing: a reload starts it again.
 *
 * It exports what `runtime.ts` exports, so `startup.ts` and everything above
 * it are the same code on both.
 */

import * as SQLite from 'expo-sqlite';

import type { SqlRow, SqlValue } from './adapters';
import type { RawConnectionOpener } from './sqlite/connection';
import type { StorageStartupOptions, StorageStartupResult } from './runtime';
import { expoDigestPort } from './native/expoCrypto';
import { currentPreviewOptions } from '../preview/options.web';
import { openPreviewStorage } from '../preview/storage.web';

export type { CookingLabStorage, StorageStartupOptions, StorageStartupResult } from './runtime';

/** expo-sqlite's web build (wa-sqlite), on a database held in memory only. */
const openInMemory: RawConnectionOpener = async (fileName) => {
  const database = await SQLite.openDatabaseAsync(fileName);
  return {
    async executeRaw(sql) {
      await database.execAsync(sql);
    },
    async run(sql, params) {
      const result = await database.runAsync(sql, [...params] as SqlValue[]);
      return { rowsAffected: result.changes };
    },
    async all(sql, params) {
      return database.getAllAsync<SqlRow>(sql, [...params] as SqlValue[]);
    },
    async close() {
      await database.closeAsync();
    },
  };
};

export async function startCookingLabStorage(
  options: StorageStartupOptions,
): Promise<StorageStartupResult> {
  return openPreviewStorage({
    open: openInMemory,
    digest: expoDigestPort,
    newId: options.newId,
    now: () => Date.now(),
    filled: currentPreviewOptions().screen !== 'empty',
  });
}
