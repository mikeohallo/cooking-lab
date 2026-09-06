/**
 * An open, migrated database for a test, in three lines.
 *
 * Real SQLite (see `./nodeSqlite.ts`), the real migration runner, the real
 * repositories and the real services. The only thing standing in for a device
 * is the engine's encryption, which plain SQLite does not have; that is called
 * out where it matters and proven separately.
 */

import type { DatabaseAdapter } from '../../src/data/adapters';
import type { DataLayer } from '../../src/data/repositories';
import { createDatabaseAdapterFactory } from '../../src/data/sqlite/connection';
import { createSqliteDataLayer } from '../../src/data/sqlite/dataLayer';
import { runMigrations } from '../../src/data/sqlite/migrationRunner';
import { createNodeSqliteHarness, type NodeSqliteHarness } from './nodeSqlite';

export type TestDatabase = {
  readonly adapter: DatabaseAdapter;
  readonly data: DataLayer;
  readonly harness: NodeSqliteHarness;
  close(): Promise<void>;
};

/** Ids for tags the store creates, numbered so a test can predict them. */
export function countingIds(prefix = 'tag'): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${String(next).padStart(2, '0')}`;
  };
}

export async function openTestDatabase(fileName = 'cooking-lab-test.db'): Promise<TestDatabase> {
  const harness = createNodeSqliteHarness();
  const factory = createDatabaseAdapterFactory(harness.open);
  const adapter = await factory.open({ fileName, encryptionKey: null });
  await runMigrations(adapter);

  return {
    adapter,
    data: createSqliteDataLayer(adapter, countingIds()),
    harness,
    async close(): Promise<void> {
      await adapter.close();
      harness.closeAll();
    },
  };
}
