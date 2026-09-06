/**
 * Running the migrations against a real database.
 *
 * `src/data/schema/migrations.ts` is the SQL. This is the part that executes
 * it, and it is separate for a reason: the schema text must be reviewable and
 * diffable without a database anywhere near it, and the execution rules —
 * ordering, transactions, what to do about a version from the future — must be
 * testable without SQLCipher.
 *
 * THREE RULES
 * -----------
 *   Each migration is one transaction.  A migration that half-applied would
 *   leave a database no version number describes. Returning from the callback
 *   commits; throwing rolls the whole migration back, version stamp included.
 *
 *   Order is checked before anything runs.  `findMigrationDefects` is called
 *   first, so a list that skips or repeats a version is refused rather than
 *   partially applied.
 *
 *   A newer schema stops the run.  If the file was written by a later build,
 *   this one does not know what it is looking at. It refuses to read or write,
 *   rather than reasoning about columns it has never heard of.
 */

import type { DatabaseAdapter, Transaction } from '../adapters';
import type { SchemaState } from '../../domain/entities';
import {
  MIGRATIONS,
  SCHEMA_APPLIED_AT_KEY,
  SCHEMA_VERSION_KEY,
  findMigrationDefects,
  pendingMigrations,
  type Migration,
} from '../schema/migrations';

export type MigrationFailureReason =
  /** The migration list is not a safe sequence. */
  | 'defective_migration_list'
  /** The database was written by a later build of the app. */
  | 'schema_from_a_later_build'
  /** A migration failed and was rolled back. */
  | 'migration_failed';

export class MigrationError extends Error {
  readonly reason: MigrationFailureReason;

  constructor(reason: MigrationFailureReason, message: string) {
    super(message);
    this.name = 'MigrationError';
    this.reason = reason;
  }
}

export type MigrationRunResult = {
  readonly versionBefore: number;
  readonly versionAfter: number;
  /** The versions actually applied by this run, in order. */
  readonly applied: readonly number[];
};

/** Whether `schema_meta` exists yet. A database that has never migrated has none. */
async function hasSchemaMeta(adapter: DatabaseAdapter): Promise<boolean> {
  const rows = await adapter.select({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    params: ['schema_meta'],
  });
  return rows.length > 0;
}

/**
 * The version the database reports, and when it got there.
 *
 * `0` for a database that has never been migrated — including one whose
 * `schema_meta` table does not exist yet, which is what a brand new file looks
 * like.
 */
export async function readSchemaState(adapter: DatabaseAdapter): Promise<SchemaState> {
  if (!(await hasSchemaMeta(adapter))) {
    return { schemaVersion: 0, appliedAt: null };
  }

  const rows = await adapter.select({
    sql: 'SELECT key, value FROM schema_meta WHERE key IN (?, ?)',
    params: [SCHEMA_VERSION_KEY, SCHEMA_APPLIED_AT_KEY],
  });

  let version = 0;
  let appliedAt: string | null = null;
  for (const row of rows) {
    if (row.key === SCHEMA_VERSION_KEY && typeof row.value === 'string') {
      const parsed = Number.parseInt(row.value, 10);
      version = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    }
    if (row.key === SCHEMA_APPLIED_AT_KEY && typeof row.value === 'string') {
      appliedAt = row.value;
    }
  }

  return { schemaVersion: version, appliedAt };
}

/** The tables the database actually has, for verifying a migration landed. */
export async function listTables(adapter: DatabaseAdapter): Promise<readonly string[]> {
  const rows = await adapter.select({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    params: [],
  });
  return rows.map((row) => String(row.name));
}

async function applyMigration(adapter: DatabaseAdapter, migration: Migration): Promise<void> {
  try {
    await adapter.withTransaction(async (tx: Transaction) => {
      for (const sql of migration.statements) {
        await tx.execute({ sql });
      }
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new MigrationError(
      'migration_failed',
      `migration ${migration.version} (${migration.name}) was rolled back: ${detail}`,
    );
  }
}

/**
 * Bring the database up to the version this build understands.
 *
 * Idempotent: a database already at the latest version applies nothing and
 * reports so. A database ahead of this build is refused — see the rules above.
 */
export async function runMigrations(
  adapter: DatabaseAdapter,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationRunResult> {
  const defects = findMigrationDefects(migrations);
  if (defects.length > 0) {
    const summary = defects
      .map((defect) => `v${String(defect.version)}: ${defect.problem}`)
      .join('; ');
    throw new MigrationError('defective_migration_list', `the migrations are not runnable — ${summary}`);
  }

  const highest = migrations.reduce(
    (best, migration) => Math.max(best, migration.version),
    0,
  );
  const before = (await readSchemaState(adapter)).schemaVersion;

  if (before > highest) {
    throw new MigrationError(
      'schema_from_a_later_build',
      `the database is at schema version ${before} and this build knows version ${highest}`,
    );
  }

  const pending = pendingMigrations(before, migrations);
  const applied: number[] = [];
  for (const migration of pending) {
    await applyMigration(adapter, migration);
    applied.push(migration.version);
  }

  const after = (await readSchemaState(adapter)).schemaVersion;
  return { versionBefore: before, versionAfter: after, applied };
}
