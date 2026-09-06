/**
 * Opening the Cooking Lab database, once, safely.
 *
 * This is where the key, the file and the schema meet. Each of the three parts
 * is simple on its own; the order they are consulted in is the whole safety
 * property, so it is written once, here, rather than at each call site.
 *
 * THE ORDER, AND WHY IT IS THAT ORDER
 * -----------------------------------
 *   1. Does the database file exist?
 *   2. Does a key exist?
 *   3. If the file exists and the key does not — stop. Report that recovery is
 *      required. Do not create a key.
 *   4. If neither exists, this is a fresh installation: create a key.
 *   5. Open with the key; the adapter applies it and proves it before anything
 *      else happens.
 *   6. Migrate, refusing a schema written by a later build.
 *
 * Step 3 is the reason this module exists. Taken separately, "there is no key"
 * looks exactly like a first run, and a first run creates one. Against an
 * existing encrypted file that new key opens nothing, and the app would be
 * entitled to conclude the database is unusable and start again — turning a
 * recoverable problem, where the file is still sitting there intact, into the
 * permanent loss of a kitchen's history. So the file is checked first, and a
 * missing key against a present file is a refusal with a reason, not a repair.
 *
 * The failure a caller gets is a value, not an exception: every one of them is
 * a state a screen has to be able to explain to the person holding the phone.
 */

import type {
  DatabaseAdapter,
  DatabaseAdapterFactory,
  DatabaseKeyProvider,
} from '../adapters';
import type { SchemaState } from '../../domain/entities';
import { DATABASE_FILE_NAME, DatabaseOpenError } from './connection';
import {
  MigrationError,
  listTables,
  readSchemaState,
  runMigrations,
  type MigrationRunResult,
} from './migrationRunner';
import { SCHEMA_TABLES } from '../schema/migrations';

/** Whether the database file is already on the device. */
export type DatabaseFilePresence = {
  exists(fileName: string): Promise<boolean>;
};

export type DatabaseStartupFailureReason =
  /**
   * There is an encrypted database but no key for it.
   *
   * The data is still there and is still encrypted; what is missing is the only
   * thing that reads it. Nothing is created, nothing is deleted, and the person
   * is told, because restoring from a portable backup is a decision that is
   * theirs to make.
   */
  | 'recovery_required'
  /** The device's secure store could not be reached. */
  | 'key_unavailable'
  /** The file would not open with the key it was given. */
  | 'database_unreadable'
  /** The file was written by a later build of the app. */
  | 'schema_from_a_later_build'
  /** A migration failed and was rolled back. */
  | 'migration_failed'
  /** The migration ran but the schema is not what it should be. */
  | 'schema_incomplete';

export type DatabaseStartupFailure = {
  readonly ok: false;
  readonly reason: DatabaseStartupFailureReason;
  readonly message: string;
};

export type DatabaseStartupSuccess = {
  readonly ok: true;
  readonly database: DatabaseAdapter;
  readonly schema: SchemaState;
  readonly migrations: MigrationRunResult;
  /** True when this run created the key, i.e. a genuinely fresh installation. */
  readonly keyCreated: boolean;
};

export type DatabaseStartupResult = DatabaseStartupSuccess | DatabaseStartupFailure;

export type DatabaseStartupDependencies = {
  readonly databases: DatabaseAdapterFactory;
  readonly keys: DatabaseKeyProvider;
  readonly files: DatabaseFilePresence;
  readonly fileName?: string;
};

function failure(
  reason: DatabaseStartupFailureReason,
  message: string,
): DatabaseStartupFailure {
  return { ok: false, reason, message };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function closeQuietly(database: DatabaseAdapter): Promise<void> {
  try {
    await database.close();
  } catch {
    // Startup has already failed; a failure to close must not replace the
    // reason the caller was given.
  }
}

/**
 * Open the database, or say why not.
 *
 * The only entry point. Everything above the data layer calls this and nothing
 * else; there is no way to obtain a connection that skips the checks.
 */
export async function openCookingLabDatabase(
  dependencies: DatabaseStartupDependencies,
): Promise<DatabaseStartupResult> {
  const fileName = dependencies.fileName ?? DATABASE_FILE_NAME;
  const { databases, keys, files } = dependencies;

  let fileExists: boolean;
  let keyExists: boolean;
  try {
    fileExists = await files.exists(fileName);
  } catch (cause) {
    return failure(
      'database_unreadable',
      `could not tell whether the database exists: ${describe(cause)}`,
    );
  }
  try {
    keyExists = await keys.hasKey();
  } catch (cause) {
    return failure('key_unavailable', `the database key could not be read: ${describe(cause)}`);
  }

  // The rule this whole module exists for.
  if (fileExists && !keyExists) {
    return failure(
      'recovery_required',
      'there is a Cooking Lab database on this device but the key that reads it is gone; ' +
        'the file has not been touched and no new key has been made',
    );
  }

  let key: string;
  try {
    key = await keys.getOrCreateKey();
  } catch (cause) {
    return failure('key_unavailable', `the database key is not available: ${describe(cause)}`);
  }

  let database: DatabaseAdapter;
  try {
    database = await databases.open({ fileName, encryptionKey: key });
  } catch (cause) {
    if (cause instanceof DatabaseOpenError) {
      return failure('database_unreadable', cause.message);
    }
    return failure('database_unreadable', `the database could not be opened: ${describe(cause)}`);
  }

  let migrations: MigrationRunResult;
  try {
    migrations = await runMigrations(database);
  } catch (cause) {
    await closeQuietly(database);
    if (cause instanceof MigrationError) {
      const reason =
        cause.reason === 'schema_from_a_later_build'
          ? 'schema_from_a_later_build'
          : 'migration_failed';
      return failure(reason, cause.message);
    }
    return failure('migration_failed', `the migrations did not complete: ${describe(cause)}`);
  }

  // A migration that reported success but did not leave the tables behind is a
  // worse state than one that failed, because everything after it would look
  // like an empty kitchen rather than a broken one.
  const tables = new Set(await listTables(database));
  const missing = SCHEMA_TABLES.filter((table) => !tables.has(table));
  if (missing.length > 0) {
    await closeQuietly(database);
    return failure(
      'schema_incomplete',
      `the database is missing ${missing.join(', ')} after migrating`,
    );
  }

  return {
    ok: true,
    database,
    schema: await readSchemaState(database),
    migrations,
    keyCreated: !keyExists,
  };
}
