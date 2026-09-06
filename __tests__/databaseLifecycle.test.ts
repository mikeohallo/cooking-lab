import { LATEST_SCHEMA_VERSION, SCHEMA_TABLES } from '../src/data/schema/migrations';
import type { DatabaseFilePresence } from '../src/data/sqlite/lifecycle';
import { DATABASE_KEY_ALIAS, createDatabaseKeyProvider } from '../src/data/sqlite/keyProvider';
import { createDatabaseAdapterFactory } from '../src/data/sqlite/connection';
import { openCookingLabDatabase } from '../src/data/sqlite/lifecycle';
import {
  MigrationError,
  readSchemaState,
  runMigrations,
} from '../src/data/sqlite/migrationRunner';
import {
  memorySecureStore,
  nodeRandomBytes,
  shortRandomBytes,
  type MemorySecureStore,
} from './support/memoryPorts';
import { createNodeSqliteHarness } from './support/nodeSqlite';

/**
 * The startup sequence, and the one decision inside it that cannot be got
 * wrong twice.
 *
 * A missing key looks exactly like a first run. If the app treats it as one
 * while an encrypted database is sitting on the device, it makes a key that
 * opens nothing, concludes the database is unusable, and is then entitled to
 * start again over the top of a kitchen's entire history. These tests are the
 * reason that cannot happen.
 */

/** A file that is or is not there, without a device. */
function filePresence(present: boolean): DatabaseFilePresence & { present: boolean } {
  const state = {
    present,
    async exists(): Promise<boolean> {
      return state.present;
    },
  };
  return state;
}

function startupParts(store: MemorySecureStore, present: boolean) {
  const harness = createNodeSqliteHarness();
  const files = filePresence(present);
  return {
    harness,
    files,
    dependencies: {
      databases: createDatabaseAdapterFactory(harness.open),
      keys: createDatabaseKeyProvider(store, nodeRandomBytes),
      files,
    },
  };
}

describe('the key is made once, on a device that has none', () => {
  it('creates a key on a fresh installation and stores it nowhere else', async () => {
    const store = memorySecureStore();
    const { dependencies, harness } = startupParts(store, false);

    const started = await openCookingLabDatabase(dependencies);

    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.keyCreated).toBe(true);
      await started.database.close();
    }
    expect([...store.entries.keys()]).toEqual([DATABASE_KEY_ALIAS]);
    harness.closeAll();
  });

  it('makes a key that is 256 bits of random material, not a constant', async () => {
    const first = memorySecureStore();
    const second = memorySecureStore();
    const keys = [
      createDatabaseKeyProvider(first, nodeRandomBytes),
      createDatabaseKeyProvider(second, nodeRandomBytes),
    ];

    const [a, b] = await Promise.all(keys.map((provider) => provider.getOrCreateKey()));

    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    // Two installations must not share a key, which a constant or a derived
    // value would guarantee they did.
    expect(a).not.toBe(b);
  });

  it('reuses the key it already has, and does not write a second one', async () => {
    const store = memorySecureStore();
    const provider = createDatabaseKeyProvider(store, nodeRandomBytes);

    const created = await provider.getOrCreateKey();
    store.calls.length = 0;
    const reused = await provider.getOrCreateKey();

    expect(reused).toBe(created);
    expect(store.calls.filter((call) => call.startsWith('set:'))).toEqual([]);
  });

  it('refuses a random source that returns less material than it was asked for', async () => {
    const provider = createDatabaseKeyProvider(memorySecureStore(), shortRandomBytes(8));

    await expect(provider.getOrCreateKey()).rejects.toMatchObject({
      reason: 'insufficient_entropy',
    });
  });

  it('refuses to open at all when the device has no secure store', async () => {
    const store = memorySecureStore();
    store.available = false;
    const { dependencies, harness } = startupParts(store, false);

    const started = await openCookingLabDatabase(dependencies);

    expect(started).toMatchObject({ ok: false, reason: 'key_unavailable' });
    harness.closeAll();
  });

  it('refuses a stored value that is not a key, rather than replacing it', async () => {
    const store = memorySecureStore();
    store.entries.set(DATABASE_KEY_ALIAS, 'this is not a key');
    const provider = createDatabaseKeyProvider(store, nodeRandomBytes);

    await expect(provider.getOrCreateKey()).rejects.toMatchObject({
      reason: 'stored_key_malformed',
    });
    // Whatever it is, it is the only thing that might open the database.
    expect(store.entries.get(DATABASE_KEY_ALIAS)).toBe('this is not a key');
  });

  it('answers whether a key exists without handing it back', async () => {
    const store = memorySecureStore();
    const provider = createDatabaseKeyProvider(store, nodeRandomBytes);

    expect(await provider.hasKey()).toBe(false);
    await provider.getOrCreateKey();
    expect(await provider.hasKey()).toBe(true);
    expect(typeof (await provider.hasKey())).toBe('boolean');
  });
});

describe('a database with no key is a recovery, not a fresh start', () => {
  it('refuses to open and makes no replacement key', async () => {
    const store = memorySecureStore();
    const { dependencies, harness } = startupParts(store, true);

    const started = await openCookingLabDatabase(dependencies);

    expect(started).toMatchObject({ ok: false, reason: 'recovery_required' });
    // The important half: nothing was created. A new key here would open
    // nothing, and the app would then be entitled to treat the existing
    // database as unusable.
    expect(store.entries.size).toBe(0);
    harness.closeAll();
  });

  it('says so in words a screen can show, without naming any key material', async () => {
    const store = memorySecureStore();
    const { dependencies, harness } = startupParts(store, true);

    const started = await openCookingLabDatabase(dependencies);

    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.message).toContain('key');
      expect(started.message).not.toMatch(/[0-9a-f]{64}/);
    }
    harness.closeAll();
  });

  it('opens normally when the key is there and the database is too', async () => {
    const store = memorySecureStore();
    const first = startupParts(store, false);

    const created = await openCookingLabDatabase(first.dependencies);
    expect(created.ok).toBe(true);
    if (created.ok) {
      await created.database.close();
    }

    // Second launch: the file is now there, and so is the key.
    first.files.present = true;
    const reopened = await openCookingLabDatabase(first.dependencies);

    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.keyCreated).toBe(false);
      expect(reopened.schema.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
      // Opening twice must not migrate twice.
      expect(reopened.migrations.applied).toEqual([]);
      await reopened.database.close();
    }
    first.harness.closeAll();
  });
});

describe('no key value ever leaves the key provider', () => {
  it('keeps the key out of every startup result a caller could log', async () => {
    const store = memorySecureStore();
    const { dependencies, harness } = startupParts(store, false);

    const started = await openCookingLabDatabase(dependencies);
    expect(started.ok).toBe(true);

    const key = store.entries.get(DATABASE_KEY_ALIAS);
    expect(key).toBeDefined();
    if (started.ok) {
      const asText = JSON.stringify({
        schema: started.schema,
        migrations: started.migrations,
        keyCreated: started.keyCreated,
      });
      expect(asText).not.toContain(String(key));
      await started.database.close();
    }
    harness.closeAll();
  });

  it('keeps the key out of the source of every module that is not the key provider', () => {
    // A literal key would be the one failure no runtime check could catch.
    const { readFileSync, readdirSync, statSync } = jest.requireActual<typeof import('fs')>('fs');
    const { join, resolve } = jest.requireActual<typeof import('path')>('path');
    const root = resolve(__dirname, '..');

    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          files.push(path);
        }
      }
    };
    walk(join(root, 'src'));
    walk(join(root, 'app'));

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      // 64 hex characters in a row is a key, wherever it appears.
      expect(contents).not.toMatch(/['"`][0-9a-fA-F]{64}['"`]/);
    }
    expect(files.length).toBeGreaterThan(5);
  });
});

describe('migrations run in order, once, and stop at a schema they do not know', () => {
  const openBare = async (fileName: string) => {
    const harness = createNodeSqliteHarness();
    const factory = createDatabaseAdapterFactory(harness.open);
    const adapter = await factory.open({ fileName, encryptionKey: null });
    return { adapter, harness };
  };

  it('takes a new database to the latest version and leaves every table behind', async () => {
    const { adapter, harness } = await openBare('ordering.db');

    const result = await runMigrations(adapter);

    expect(result.versionBefore).toBe(0);
    expect(result.versionAfter).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toEqual([1]);
    const tables = (
      await adapter.select({
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      })
    ).map((row) => String(row.name));
    for (const table of SCHEMA_TABLES) {
      expect(tables).toContain(table);
    }
    await adapter.close();
    harness.closeAll();
  });

  it('applies nothing the second time', async () => {
    const { adapter, harness } = await openBare('idempotent.db');

    await runMigrations(adapter);
    const again = await runMigrations(adapter);

    expect(again.applied).toEqual([]);
    expect(again.versionAfter).toBe(LATEST_SCHEMA_VERSION);
    await adapter.close();
    harness.closeAll();
  });

  it('refuses a list that skips, repeats or reorders a version', async () => {
    const { adapter, harness } = await openBare('defective.db');

    await expect(
      runMigrations(adapter, [
        { version: 2, name: 'out of order', statements: ['CREATE TABLE a (id TEXT)'] },
      ]),
    ).rejects.toMatchObject({ reason: 'defective_migration_list' });
    // Nothing ran.
    expect(await readSchemaState(adapter)).toEqual({ schemaVersion: 0, appliedAt: null });
    await adapter.close();
    harness.closeAll();
  });

  it('rolls a failing migration back rather than leaving half a schema', async () => {
    const { adapter, harness } = await openBare('rollback.db');

    const attempt = runMigrations(adapter, [
      {
        version: 1,
        name: 'half a schema',
        statements: ['CREATE TABLE good (id TEXT)', 'CREATE TABLE bad (this is not sql'],
      },
    ]);

    await expect(attempt).rejects.toBeInstanceOf(MigrationError);
    await expect(attempt).rejects.toMatchObject({ reason: 'migration_failed' });
    const tables = (
      await adapter.select({ sql: "SELECT name FROM sqlite_master WHERE type = 'table'" })
    ).map((row) => String(row.name));
    expect(tables).not.toContain('good');
    await adapter.close();
    harness.closeAll();
  });

  it('fails closed on a database written by a later build', async () => {
    const store = memorySecureStore();
    const { dependencies, harness, files } = startupParts(store, false);

    const started = await openCookingLabDatabase(dependencies);
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    // A later version of the app has been here and left a schema this build has
    // never heard of.
    await started.database.execute({
      sql: 'UPDATE schema_meta SET value = ? WHERE key = ?',
      params: [String(LATEST_SCHEMA_VERSION + 1), 'schema_version'],
    });
    await started.database.close();
    files.present = true;

    const reopened = await openCookingLabDatabase(dependencies);

    expect(reopened).toMatchObject({ ok: false, reason: 'schema_from_a_later_build' });
    harness.closeAll();
  });

  it('does not guess at a schema it does not know, rather than reading what it recognises', async () => {
    const { adapter, harness } = await openBare('from-the-future.db');
    await runMigrations(adapter);
    await adapter.execute({
      sql: 'UPDATE schema_meta SET value = ? WHERE key = ?',
      params: ['99', 'schema_version'],
    });

    await expect(runMigrations(adapter)).rejects.toMatchObject({
      reason: 'schema_from_a_later_build',
    });
    await adapter.close();
    harness.closeAll();
  });
});
