/**
 * The database adapter, built on top of a raw connection.
 *
 * `DatabaseAdapter` (see `src/data/adapters.ts`) is what the repositories talk
 * to. This module turns a `RawConnection` — the small set of things a native
 * SQLite binding actually does — into one, and in doing so owns the three
 * things that are easy to get wrong and impossible to notice afterwards:
 *
 *   The key goes on first.  A SQLCipher connection is unusable until it has
 *   been keyed, and a statement issued before the key is a statement against an
 *   unreadable file. `PRAGMA key` is therefore the first thing sent on every
 *   connection, before the foreign-key and journal pragmas and before the first
 *   read. `__tests__/sqliteConnection.test.ts` records the order and asserts it.
 *
 *   The key is proved, not assumed.  Applying a key never fails; reading with
 *   the wrong one does. The factory reads from `sqlite_master` immediately
 *   after keying, so a wrong or corrupted key is a refusal to open rather than
 *   a confusing failure several screens later.
 *
 *   One statement at a time.  The app holds a single connection, and a
 *   transaction on it is `BEGIN … COMMIT` on that same connection. If an
 *   unrelated write slipped between the two it would silently join the
 *   transaction. Every call is therefore queued, so a transaction is never
 *   interleaved with anything else.
 *
 * Nothing in this file logs, formats or returns the key. `PRAGMA key` is built
 * here and the statement text never leaves the function that builds it: the
 * error raised if it fails names the operation, not the SQL.
 */

import type {
  DatabaseAdapter,
  DatabaseAdapterFactory,
  DatabaseOpenOptions,
  SqlExecutionResult,
  SqlRow,
  SqlStatement,
  SqlValue,
  Transaction,
} from '../adapters';
import { CONNECTION_PRAGMAS } from '../schema/migrations';

/**
 * The database file this app owns.
 *
 * A file name, never a path: the native binding places it in the app-private
 * database directory, and nothing above this line learns where that is.
 */
export const DATABASE_FILE_NAME = 'cooking-lab.db';

/** A 256-bit key, lowercase hex. The only shape `PRAGMA key` is given here. */
export const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/;

/**
 * What a native SQLite binding has to provide.
 *
 * Deliberately tiny. Everything above — keying, pragmas, transactions,
 * serialisation of calls — is written once here and is the same whichever
 * binding is underneath, which is what makes it testable against a real SQLite
 * engine rather than only on a device.
 */
export type RawConnection = {
  /** A statement with no parameters: a pragma, or a transaction boundary. */
  executeRaw(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlValue[]): Promise<SqlExecutionResult>;
  all(sql: string, params: readonly SqlValue[]): Promise<readonly SqlRow[]>;
  close(): Promise<void>;
};

/** Opens a raw connection to a database file in the app-private directory. */
export type RawConnectionOpener = (fileName: string) => Promise<RawConnection>;

export type DatabaseOpenFailureReason =
  /** The key is not 64 lowercase hex characters. */
  | 'malformed_key'
  /** The file would not open with the key it was given. */
  | 'key_rejected'
  /** The connection itself could not be established. */
  | 'connection_failed';

export class DatabaseOpenError extends Error {
  readonly reason: DatabaseOpenFailureReason;

  constructor(reason: DatabaseOpenFailureReason, message: string) {
    super(message);
    this.name = 'DatabaseOpenError';
    this.reason = reason;
  }
}

/**
 * The `PRAGMA key` statement for a raw 256-bit key.
 *
 * The `x'…'` blob form is deliberate: it hands SQLCipher the 32 bytes as they
 * are, with no key derivation in between. The key is already 256 bits from the
 * device's secure random source, and running a passphrase KDF over it would add
 * a step without adding entropy.
 *
 * Not exported. The one caller is a few lines below, and the value never
 * reaches a log, an error or a return.
 */
function keyStatement(hexKey: string): string {
  return `PRAGMA key = "x'${hexKey}'"`;
}

/**
 * Runs work one piece at a time, in the order it arrived.
 *
 * A transaction is `BEGIN`, some statements and `COMMIT` on one connection. If
 * an unrelated statement ran between them it would be committed or rolled back
 * with the transaction, silently. Queueing makes that impossible without
 * needing every caller to remember it.
 */
function createQueue(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work, work);
    // The queue must survive a failed piece of work, so the chain it waits on
    // swallows the rejection while the caller still receives it.
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

function paramsOf(statement: SqlStatement): readonly SqlValue[] {
  return statement.params ?? [];
}

/**
 * Turn a raw connection into the adapter the repositories use.
 *
 * `open` is the only native thing this module knows about, which is why the
 * whole of the behaviour above can be exercised against a real SQLite engine in
 * the test suite and against SQLCipher on the device without two code paths.
 */
export function createDatabaseAdapterFactory(
  open: RawConnectionOpener,
): DatabaseAdapterFactory {
  return {
    async open(options: DatabaseOpenOptions): Promise<DatabaseAdapter> {
      const { fileName, encryptionKey } = options;

      if (encryptionKey !== null && !DATABASE_KEY_PATTERN.test(encryptionKey)) {
        // The key itself is not named, quoted or measured in the message.
        throw new DatabaseOpenError(
          'malformed_key',
          'the database key is not in the expected form',
        );
      }

      let connection: RawConnection;
      try {
        connection = await open(fileName);
      } catch (cause) {
        throw new DatabaseOpenError(
          'connection_failed',
          `could not open the database file ${fileName}: ${describe(cause)}`,
        );
      }

      if (encryptionKey !== null) {
        try {
          await connection.executeRaw(keyStatement(encryptionKey));
        } catch {
          // Deliberately discards the cause: a binding that echoes the failing
          // statement back in its message would put the key in the error.
          await closeQuietly(connection);
          throw new DatabaseOpenError('key_rejected', 'the database key could not be applied');
        }
      }

      try {
        // Applying a key always succeeds; reading with the wrong one does not.
        await connection.all('SELECT count(*) AS objects FROM sqlite_master', []);
      } catch (cause) {
        await closeQuietly(connection);
        throw new DatabaseOpenError(
          'key_rejected',
          `the database could not be read after opening: ${describe(cause)}`,
        );
      }

      for (const pragma of CONNECTION_PRAGMAS) {
        await connection.executeRaw(pragma);
      }

      return createAdapter(connection);
    },
  };
}

/** A cause rendered for a message, without assuming it is an `Error`. */
function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function closeQuietly(connection: RawConnection): Promise<void> {
  try {
    await connection.close();
  } catch {
    // The open has already failed; a failure to close adds nothing the caller
    // can act on and must not replace the reason they were given.
  }
}

function createAdapter(connection: RawConnection): DatabaseAdapter {
  const enqueue = createQueue();
  let closed = false;

  const refuseIfClosed = (): void => {
    if (closed) {
      throw new Error('the database connection is closed');
    }
  };

  /** The handle inside a transaction: statements only, no boundaries. */
  const transaction: Transaction = {
    async execute(statement: SqlStatement): Promise<SqlExecutionResult> {
      return connection.run(statement.sql, paramsOf(statement));
    },
    async select(statement: SqlStatement): Promise<readonly SqlRow[]> {
      return connection.all(statement.sql, paramsOf(statement));
    },
  };

  return {
    async execute(statement: SqlStatement): Promise<SqlExecutionResult> {
      refuseIfClosed();
      return enqueue(() => connection.run(statement.sql, paramsOf(statement)));
    },

    async select(statement: SqlStatement): Promise<readonly SqlRow[]> {
      refuseIfClosed();
      return enqueue(() => connection.all(statement.sql, paramsOf(statement)));
    },

    /**
     * All of the work, or none of it.
     *
     * `BEGIN IMMEDIATE` rather than `BEGIN`: the write lock is taken at the
     * start rather than at the first write, so a transaction that is going to
     * fail for want of the lock fails before it has done half its work.
     * Returning commits, throwing rolls back, and there is no third outcome.
     */
    async withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
      refuseIfClosed();
      return enqueue(async () => {
        await connection.executeRaw('BEGIN IMMEDIATE');
        let result: T;
        try {
          result = await work(transaction);
        } catch (cause) {
          await rollback(connection);
          throw cause;
        }
        try {
          await connection.executeRaw('COMMIT');
        } catch (cause) {
          await rollback(connection);
          throw cause;
        }
        return result;
      });
    },

    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      await enqueue(() => connection.close());
    },
  };
}

/**
 * Undo the transaction, keeping the caller's original failure.
 *
 * A rollback that itself fails leaves the connection in a state this code
 * cannot reason about, but the caller's error is the one that explains what
 * went wrong, so it is the one that propagates.
 */
async function rollback(connection: RawConnection): Promise<void> {
  try {
    await connection.executeRaw('ROLLBACK');
  } catch {
    // Intentionally swallowed; see above.
  }
}
