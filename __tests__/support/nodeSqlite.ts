/**
 * A real SQLite engine for the test suite.
 *
 * Node ships one (`node:sqlite`), so the repositories, the migration runner and
 * the transaction semantics can be tested against real SQL rather than against
 * a hand-written imitation of it. That matters more than it might sound: the
 * things worth proving here — that a CHECK constraint refuses a bad status,
 * that a unique index refuses a second tag, that a failed transaction leaves no
 * rows behind, that a cascade reaches the junction tables — are all properties
 * of SQLite. A fake would have to reimplement them, and a test against a
 * reimplementation proves only that the reimplementation agrees with itself.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not SQLCipher, and it is not pretending to be. `PRAGMA key` is not a
 * statement plain SQLite understands, and unknown pragmas are silently ignored,
 * so a connection opened here with a key would be an unencrypted database that
 * looked encrypted — exactly the kind of comfortable lie the whole project is
 * built to avoid. So databases opened through this opener are opened with
 * `encryptionKey: null`, which the accepted `DatabaseOpenOptions` contract
 * already reserves for "a throwaway database in a test", and the keying
 * sequence is proven separately by `recordingConnection` below.
 *
 * Encryption itself is proven on the device: see the native build evidence in
 * the Build Control report.
 */

import { DatabaseSync } from 'node:sqlite';

import type { SqlExecutionResult, SqlRow, SqlValue } from '../../src/data/adapters';
import type { RawConnection, RawConnectionOpener } from '../../src/data/sqlite/connection';

type Bindable = string | number | null;

function bindable(params: readonly SqlValue[]): Bindable[] {
  return params.map((value) => value);
}

/** Rows come back as plain objects; the adapter's row type is the same shape. */
function asRows(rows: unknown[]): readonly SqlRow[] {
  return rows as readonly SqlRow[];
}

/** Every connection this opener made, so a test can close them all. */
export type NodeSqliteHarness = {
  readonly open: RawConnectionOpener;
  closeAll(): void;
};

/**
 * An opener backed by real, in-memory SQLite.
 *
 * Each file name gets its own database, and asking for the same name twice
 * returns a connection to the same one — which is what makes "close the app and
 * open it again" testable.
 */
export function createNodeSqliteHarness(): NodeSqliteHarness {
  const databases = new Map<string, DatabaseSync>();

  const open: RawConnectionOpener = async (fileName: string): Promise<RawConnection> => {
    let database = databases.get(fileName);
    if (database === undefined) {
      database = new DatabaseSync(':memory:');
      databases.set(fileName, database);
    }
    const handle = database;

    return {
      async executeRaw(sql: string): Promise<void> {
        handle.exec(sql);
      },
      async run(sql: string, params: readonly SqlValue[]): Promise<SqlExecutionResult> {
        const statement = handle.prepare(sql);
        const result = statement.run(...bindable(params));
        return { rowsAffected: Number(result.changes) };
      },
      async all(sql: string, params: readonly SqlValue[]): Promise<readonly SqlRow[]> {
        const statement = handle.prepare(sql);
        return asRows(statement.all(...bindable(params)));
      },
      async close(): Promise<void> {
        // The database itself is kept open so a later connection to the same
        // file name still finds the data, exactly as a real device would.
      },
    };
  };

  return {
    open,
    closeAll(): void {
      for (const database of databases.values()) {
        database.close();
      }
      databases.clear();
    },
  };
}

/**
 * A connection that records what it was asked to do.
 *
 * Used to prove the one thing a real engine cannot show: that `PRAGMA key` is
 * the first statement on a keyed connection, ahead of the readability probe and
 * ahead of the foreign-key and journal pragmas. On plain SQLite an unknown
 * pragma is a silent no-op, so ordering has to be observed rather than
 * inferred from the fact that everything still worked.
 */
export type RecordingConnection = {
  readonly connection: RawConnection;
  /** Every statement, in the order it was issued. */
  readonly statements: readonly string[];
  readonly closed: () => boolean;
};

export function recordingConnection(
  options: { readonly failOnKey?: boolean; readonly failProbe?: boolean } = {},
): RecordingConnection {
  const statements: string[] = [];
  let isClosed = false;

  const connection: RawConnection = {
    async executeRaw(sql: string): Promise<void> {
      statements.push(sql);
      if (options.failOnKey === true && sql.startsWith('PRAGMA key')) {
        // A real binding may put the failing statement in its message, which is
        // precisely why the adapter must not pass the cause through.
        throw new Error(`could not run: ${sql}`);
      }
    },
    async run(sql: string): Promise<SqlExecutionResult> {
      statements.push(sql);
      return { rowsAffected: 0 };
    },
    async all(sql: string): Promise<readonly SqlRow[]> {
      statements.push(sql);
      if (options.failProbe === true && sql.includes('sqlite_master')) {
        throw new Error('file is not a database');
      }
      return [{ objects: 0 }];
    },
    async close(): Promise<void> {
      isClosed = true;
    },
  };

  return { connection, statements, closed: () => isClosed };
}
