import { CONNECTION_PRAGMAS } from '../src/data/schema/migrations';
import {
  DATABASE_FILE_NAME,
  DatabaseOpenError,
  createDatabaseAdapterFactory,
} from '../src/data/sqlite/connection';
import { createNodeSqliteHarness, recordingConnection } from './support/nodeSqlite';

/**
 * The connection: keying, ordering, transactions, and what an error is allowed
 * to say.
 *
 * The first half watches what a connection is actually sent, because on plain
 * SQLite an unknown pragma is a silent no-op and "it worked" therefore proves
 * nothing about whether the key was applied at all, let alone first. The second
 * half runs real SQL, so the transaction behaviour is SQLite's own.
 */

const KEY = 'a'.repeat(64);

/** The error a promise was rejected with, failing the test if it was not. */
async function refusal<T>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise;
  } catch (cause) {
    return cause as T;
  }
  throw new Error('expected the operation to be refused, but it succeeded');
}

describe('the key goes on first, or the connection does not open', () => {
  it('sends PRAGMA key before it sends anything else', async () => {
    const recorder = recordingConnection();
    const factory = createDatabaseAdapterFactory(async () => recorder.connection);

    await factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: KEY });

    expect(recorder.statements[0]?.startsWith('PRAGMA key')).toBe(true);
  });

  it('proves the key by reading, before it configures anything', async () => {
    const recorder = recordingConnection();
    const factory = createDatabaseAdapterFactory(async () => recorder.connection);

    await factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: KEY });

    // key, then the readability probe, then the connection pragmas.
    expect(recorder.statements[1]).toContain('sqlite_master');
    expect(recorder.statements.slice(2)).toEqual([...CONNECTION_PRAGMAS]);
  });

  it('turns foreign keys on, because every cascade in the schema is inert without it', async () => {
    const recorder = recordingConnection();
    const factory = createDatabaseAdapterFactory(async () => recorder.connection);

    await factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: KEY });

    expect(recorder.statements).toContain('PRAGMA foreign_keys = ON');
  });

  it('sends no key when there is none, rather than sending an empty one', async () => {
    const recorder = recordingConnection();
    const factory = createDatabaseAdapterFactory(async () => recorder.connection);

    await factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: null });

    expect(recorder.statements.some((sql) => sql.startsWith('PRAGMA key'))).toBe(false);
  });

  it('refuses a key that is not 256 bits of hex, before opening anything', async () => {
    let opened = false;
    const factory = createDatabaseAdapterFactory(async () => {
      opened = true;
      return recordingConnection().connection;
    });

    await expect(
      factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: 'not-a-key' }),
    ).rejects.toMatchObject({ reason: 'malformed_key' });
    expect(opened).toBe(false);
  });

  it('closes the connection and says nothing about the key when keying fails', async () => {
    const recorder = recordingConnection({ failOnKey: true });
    const factory = createDatabaseAdapterFactory(async () => recorder.connection);

    const attempt = factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: KEY });

    await expect(attempt).rejects.toBeInstanceOf(DatabaseOpenError);
    const error = await refusal<DatabaseOpenError>(attempt);
    expect(error.reason).toBe('key_rejected');
    // The binding put the failing statement in its message; the adapter did not
    // pass it on, so the key is not in the error a caller sees or logs.
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain('PRAGMA key');
    expect(recorder.closed()).toBe(true);
  });

  it('refuses to open a database it cannot read after keying', async () => {
    const recorder = recordingConnection({ failProbe: true });
    const factory = createDatabaseAdapterFactory(async () => recorder.connection);

    const attempt = factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: KEY });

    await expect(attempt).rejects.toMatchObject({ reason: 'key_rejected' });
    const error = await refusal<DatabaseOpenError>(attempt);
    expect(error.message).not.toContain(KEY);
    expect(recorder.closed()).toBe(true);
  });

  it('reports a connection that could not be established at all', async () => {
    const factory = createDatabaseAdapterFactory(async () => {
      throw new Error('no such directory');
    });

    await expect(
      factory.open({ fileName: DATABASE_FILE_NAME, encryptionKey: KEY }),
    ).rejects.toMatchObject({ reason: 'connection_failed' });
  });
});

describe('a transaction is all of the work or none of it', () => {
  const openReal = async () => {
    const harness = createNodeSqliteHarness();
    const factory = createDatabaseAdapterFactory(harness.open);
    const adapter = await factory.open({ fileName: 'transactions.db', encryptionKey: null });
    await adapter.execute({ sql: 'CREATE TABLE t (id TEXT PRIMARY KEY NOT NULL)' });
    return { adapter, harness };
  };

  it('commits when the callback returns', async () => {
    const { adapter, harness } = await openReal();

    const returned = await adapter.withTransaction(async (tx) => {
      await tx.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] });
      await tx.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['b'] });
      return 'done';
    });

    expect(returned).toBe('done');
    expect(await adapter.select({ sql: 'SELECT id FROM t ORDER BY id' })).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
    await adapter.close();
    harness.closeAll();
  });

  it('rolls the whole thing back when the callback throws', async () => {
    const { adapter, harness } = await openReal();

    await expect(
      adapter.withTransaction(async (tx) => {
        await tx.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] });
        throw new Error('changed my mind');
      }),
    ).rejects.toThrow('changed my mind');

    expect(await adapter.select({ sql: 'SELECT id FROM t' })).toEqual([]);
    await adapter.close();
    harness.closeAll();
  });

  it('rolls back when a statement inside it is refused by the schema', async () => {
    const { adapter, harness } = await openReal();
    await adapter.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] });

    await expect(
      adapter.withTransaction(async (tx) => {
        await tx.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['b'] });
        // Duplicate primary key: SQLite refuses it, and 'b' must go with it.
        await tx.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] });
      }),
    ).rejects.toBeDefined();

    expect(await adapter.select({ sql: 'SELECT id FROM t' })).toEqual([{ id: 'a' }]);
    await adapter.close();
    harness.closeAll();
  });

  it('never lets an unrelated statement slip inside a transaction', async () => {
    const { adapter, harness } = await openReal();

    // Started together, on purpose: without the queue the insert would land
    // between BEGIN and ROLLBACK and be undone by a transaction it never
    // belonged to.
    const doomed = adapter.withTransaction(async (tx) => {
      await tx.execute({ sql: 'INSERT INTO t (id) VALUES (?)', params: ['inside'] });
      throw new Error('rolled back');
    });
    const bystander = adapter.execute({
      sql: 'INSERT INTO t (id) VALUES (?)',
      params: ['outside'],
    });

    await expect(doomed).rejects.toThrow('rolled back');
    await bystander;

    expect(await adapter.select({ sql: 'SELECT id FROM t' })).toEqual([{ id: 'outside' }]);
    await adapter.close();
    harness.closeAll();
  });

  it('refuses to run anything once it is closed', async () => {
    const { adapter, harness } = await openReal();
    await adapter.close();

    await expect(adapter.select({ sql: 'SELECT id FROM t' })).rejects.toThrow('closed');
    await expect(adapter.execute({ sql: 'DELETE FROM t' })).rejects.toThrow('closed');
    harness.closeAll();
  });
});
