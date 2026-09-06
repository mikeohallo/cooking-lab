/**
 * The `expo-sqlite` binding, and nothing else.
 *
 * One of four files in the app that import a native Expo module. Everything
 * interesting about the database — keying, pragmas, transactions, migrations,
 * repositories — is in `src/data/sqlite/`, written against the small
 * `RawConnection` port this file fills in. That split is what lets the whole of
 * that behaviour be exercised against a real SQLite engine in the test suite,
 * with only the few lines below relying on a device.
 *
 * SQLCipher
 * ---------
 * `expo-sqlite` is built with SQLCipher through the config plugin in
 * `app.config.ts` (`useSQLCipher: true`). There is no key option on
 * `openDatabaseAsync`: a connection is keyed by issuing `PRAGMA key` on it
 * first, which is exactly what `createDatabaseAdapterFactory` does.
 *
 * Transactions are `BEGIN`/`COMMIT` on this same keyed connection, issued by
 * the adapter above. `withExclusiveTransactionAsync` is deliberately not used:
 * it opens a second connection to the same file, and a second connection to a
 * SQLCipher database has not been keyed.
 */

import * as SQLite from 'expo-sqlite';
import { Directory, File } from 'expo-file-system';

import type { SqlExecutionResult, SqlRow, SqlValue } from '../adapters';
import type { RawConnection, RawConnectionOpener } from '../sqlite/connection';
import type { DatabaseFilePresence } from '../sqlite/lifecycle';

/** Bind parameters, copied into the mutable array the binding expects. */
function bindable(params: readonly SqlValue[]): SqlValue[] {
  return [...params];
}

/** Open a raw connection to a database file in the app-private database directory. */
export const openExpoSqliteConnection: RawConnectionOpener = async (
  fileName: string,
): Promise<RawConnection> => {
  const database = await SQLite.openDatabaseAsync(fileName);

  return {
    async executeRaw(sql: string): Promise<void> {
      await database.execAsync(sql);
    },
    async run(sql: string, params: readonly SqlValue[]): Promise<SqlExecutionResult> {
      const result = await database.runAsync(sql, bindable(params));
      return { rowsAffected: result.changes };
    },
    async all(sql: string, params: readonly SqlValue[]): Promise<readonly SqlRow[]> {
      return database.getAllAsync<SqlRow>(sql, bindable(params));
    },
    async close(): Promise<void> {
      await database.closeAsync();
    },
  };
};

/**
 * The directory the binding puts databases in, as a URI.
 *
 * `defaultDatabaseDirectory` is a filesystem path on Android; `File` wants a
 * `file://` URI. Converted here rather than anywhere else, because this is the
 * only place both facts are known.
 */
function databaseDirectoryUri(): string | null {
  const directory: string | null = SQLite.defaultDatabaseDirectory;
  if (typeof directory !== 'string' || directory === '') {
    return null;
  }
  return directory.startsWith('file://') ? directory : `file://${directory}`;
}

/**
 * Whether the database file already exists.
 *
 * Asked before a key is created, and the answer decides whether a missing key
 * is a first run or a recovery situation. See `src/data/sqlite/lifecycle.ts`,
 * which is where that decision is made and explained.
 */
export const expoDatabaseFilePresence: DatabaseFilePresence = {
  async exists(fileName: string): Promise<boolean> {
    const uri = databaseDirectoryUri();
    if (uri === null) {
      // Not knowing where the database would be is not the same as knowing
      // there is not one, and answering `false` here would send a device with
      // an existing database down the first-run path. Refusing to answer is
      // the only safe reply; the caller turns it into a startup failure.
      throw new Error('the database directory is not available on this device');
    }
    const directory = new Directory(uri);
    if (!directory.exists) {
      return false;
    }
    return new File(directory, fileName).exists;
  },
};
