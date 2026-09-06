/**
 * The database adapter, built on top of a raw connection.
 *
 * `DatabaseAdapter` (see `src/data/adapters.ts`) is what the repositories talk
 * to. This module turns a `RawConnection` — the small set of things a native
 * SQLite binding actually does — into one, and in doing so owns the four
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
 *   A failed undo ends the connection.  A transaction that fails is rolled
 *   back; a rollback that *also* fails is a different situation entirely,
 *   because at that point what is on disk no longer follows from anything this
 *   code did. Carrying on would mean writing more rows on top of a state
 *   nobody can describe, so the connection is given up on instead: it is
 *   marked unusable, closed, and every later call is refused. Nothing is
 *   retried and nothing is reopened behind the caller's back.
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

export type DatabaseUnusableReason =
  /** The connection was closed deliberately. */
  | 'closed'
  /**
   * A transaction failed and the rollback that should have undone it failed
   * too, so what is on disk no longer follows from anything this code did.
   */
  | 'rollback_failed';

/**
 * The connection cannot be used, and will not be used again.
 *
 * Thrown by every operation on an adapter that has been closed or given up on.
 * It carries the reason, and — when a failed rollback is what poisoned it —
 * the failure that caused that, because "the database stopped working" is not
 * a diagnosis.
 */
export class DatabaseUnusableError extends Error {
  readonly reason: DatabaseUnusableReason;
  /** The rollback failure, when there was one. */
  readonly rollbackFailure: Error | null;

  constructor(reason: DatabaseUnusableReason, message: string, rollbackFailure: Error | null = null) {
    super(message);
    this.name = 'DatabaseUnusableError';
    this.reason = reason;
    this.rollbackFailure = rollbackFailure;
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

  /**
   * Why this adapter can no longer be used, once it cannot.
   *
   * Deliberately one-way. There is no path that clears it, because there is no
   * evidence that would justify clearing it: a connection whose rollback failed
   * is a connection whose contents no longer follow from anything this code
   * did, and carrying on with it would write further rows on top of a state
   * nobody can describe. Reopening is a separate, deliberate act through
   * `openCookingLabDatabase`, which starts from the file and the key again.
   */
  let unusable: DatabaseUnusableError | null = null;

  const refuseIfUnusable = (): void => {
    if (unusable !== null) {
      throw unusable;
    }
  };

  /**
   * Give up on the connection, permanently.
   *
   * Called only when a rollback has failed. It marks the adapter unusable
   * before it does anything else, so nothing can slip through while the close
   * is in flight, and it does not reopen, retry or replay: the transaction that
   * failed stays failed, and the caller is told about that failure rather than
   * about this one. There is no way back: reopening is a separate, deliberate
   * act through `openCookingLabDatabase`.
   */
  const poison = async (rollbackFailure: Error): Promise<void> => {
    if (unusable !== null) {
      return;
    }
    unusable = new DatabaseUnusableError(
      'rollback_failed',
      'the database connection was given up on: a transaction failed and the rollback ' +
        `that should have undone it also failed (${rollbackFailure.message})`,
      rollbackFailure,
    );
    try {
      await connection.close();
    } catch {
      // The connection was already past reasoning about; a close that fails too
      // adds nothing a caller could act on, and the adapter is refused from
      // here on either way.
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

  /**
   * Every call checks twice.
   *
   * Once before queueing, so a caller holding a dead adapter is told
   * immediately, and once inside the queue, because a call that was already
   * waiting when the adapter was poisoned would otherwise reach the connection
   * after it had been given up on.
   */
  const guarded = <T>(work: () => Promise<T>): Promise<T> => {
    refuseIfUnusable();
    return enqueue(() => {
      refuseIfUnusable();
      return work();
    });
  };

  return {
    async execute(statement: SqlStatement): Promise<SqlExecutionResult> {
      return guarded(() => connection.run(statement.sql, paramsOf(statement)));
    },

    async select(statement: SqlStatement): Promise<readonly SqlRow[]> {
      return guarded(() => connection.all(statement.sql, paramsOf(statement)));
    },

    /**
     * All of the work, or none of it.
     *
     * `BEGIN IMMEDIATE` rather than `BEGIN`: the write lock is taken at the
     * start rather than at the first write, so a transaction that is going to
     * fail for want of the lock fails before it has done half its work.
     * Returning commits, throwing rolls back, and there is no third outcome.
     *
     * Unless the rollback itself fails. Then there is a fourth: the transaction
     * failed, the undo failed, and this code no longer knows what is on disk.
     * It does not retry, does not reopen and does not carry on — it poisons
     * the connection and reports the original failure, which is the one that
     * explains what the caller was trying to do.
     */
    async withTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
      return guarded(async () => {
        await connection.executeRaw('BEGIN IMMEDIATE');
        let result: T;
        try {
          result = await work(transaction);
        } catch (cause) {
          await undo();
          throw cause;
        }
        try {
          await connection.executeRaw('COMMIT');
        } catch (cause) {
          await undo();
          throw cause;
        }
        return result;
      });
    },

    /**
     * Release the connection.
     *
     * Safe to call twice, and safe to call on an adapter that has already been
     * poisoned — in that case the connection is already closed and there is
     * nothing left to do.
     */
    async close(): Promise<void> {
      if (unusable !== null) {
        return;
      }
      unusable = new DatabaseUnusableError('closed', 'the database connection is closed');
      await enqueue(() => connection.close());
    },
  };

  /**
   * Undo a failed transaction, and poison the connection if the undo fails.
   *
   * Throws nothing. The caller's own error is the one that explains what they
   * were trying to do, so the caller rethrows that; this only decides whether
   * the connection is still fit to be used afterwards.
   */
  async function undo(): Promise<void> {
    const rollbackFailure = await rollback(connection);
    if (rollbackFailure !== null) {
      await poison(rollbackFailure);
    }
  }
}

/**
 * Undo the transaction, and report whether the undo worked.
 *
 * Returns `null` when the rollback succeeded and the failure when it did not.
 * The failure is returned rather than thrown because the caller's own error is
 * the one that explains what they were trying to do, and it is the one that
 * should reach them — but a rollback that failed cannot simply be dropped
 * either, because the connection is no longer in a state this code can describe.
 * Reporting it is what lets `withTransaction` poison the connection rather
 * than carry on writing to it.
 */
async function rollback(connection: RawConnection): Promise<Error | null> {
  try {
    await connection.executeRaw('ROLLBACK');
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause));
  }
}
