/**
 * Migrating a real version 4 database to version 5 (0.4.0, part 1).
 *
 * Version 5 does two things. It rebuilds `cook_meal_types` — SQLite cannot
 * change a CHECK in place — so a cook can be a side; and it adds
 * `cook_cuisines`. The rebuild is the part with a risk in it, so this is the
 * test of that: a version 4 notebook with something in every table it writes
 * (meal types with a gap in their rowids among them), migrated, then compared
 * whole, row for row and rowid for rowid, with every foreign key checked.
 *
 * And the other half of the promise: a version 5 that fails — on purpose, or
 * on a row the rebuild will not carry — rolls back in one transaction, leaves
 * the notebook at version 4 with nothing lost, and takes the startup path
 * that says the notebook could not be updated.
 *
 * The people are "You" and "Guest".
 */

import type { DatabaseAdapter } from '../src/data/adapters';
import { createDatabaseAdapterFactory } from '../src/data/sqlite/connection';
import { createDatabaseKeyProvider } from '../src/data/sqlite/keyProvider';
import { openCookingLabDatabase } from '../src/data/sqlite/lifecycle';
import {
  MigrationError,
  listTables,
  readSchemaState,
  runMigrations,
} from '../src/data/sqlite/migrationRunner';
import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  SCHEMA_TABLES,
  type Migration,
} from '../src/data/schema/migrations';
import { memorySecureStore, nodeRandomBytes } from './support/memoryPorts';
import { createNodeSqliteHarness, type NodeSqliteHarness } from './support/nodeSqlite';

const UP_TO_V4: readonly Migration[] = MIGRATIONS.filter((entry) => entry.version <= 4);
const V5 = MIGRATIONS.find((entry) => entry.version === 5);
const V5_TABLES: readonly string[] = ['cook_cuisines'];
// Version 6's timers (0.5.0) are not in a version 4 notebook either.
const V4_TABLES = SCHEMA_TABLES.filter((table) => !V5_TABLES.includes(table) && table !== 'timers');
const AT = '2026-11-02T18:00:00.000Z';
const LATER = '2026-11-02T19:00:00.000Z';
const FILE = 'v4-to-v5.db';

type Opened = {
  readonly adapter: DatabaseAdapter;
  readonly harness: NodeSqliteHarness;
  close(): Promise<void>;
};

async function openAt(migrations: readonly Migration[]): Promise<Opened> {
  const harness = createNodeSqliteHarness();
  const adapter = await createDatabaseAdapterFactory(harness.open).open({
    fileName: FILE,
    encryptionKey: null,
  });
  await runMigrations(adapter, migrations);
  return {
    adapter,
    harness,
    async close() {
      await adapter.close();
      harness.closeAll();
    },
  };
}

/** A version 4 notebook, written with plain SQL the way 0.3.0's first part wrote it. */
async function fillVersionFour(adapter: DatabaseAdapter): Promise<void> {
  const run = (sql: string, params: readonly (string | number | null)[] = []) =>
    adapter.execute({ sql, params });

  const cook = (id: string, title: string, status: 'open' | 'reviewed', parent: string | null) =>
    run(
      `INSERT INTO cooks (id, title, status, provenance, parent_cook_id, started_at,
                          review_opened_at, review_saved_at, verdict, created_at)
       VALUES (?, ?, ?, 'live', ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        status,
        parent,
        AT,
        status === 'reviewed' ? AT : null,
        status === 'reviewed' ? AT : null,
        status === 'reviewed' ? '  Good.\nMore lemon.  ' : null,
        AT,
      ],
    );
  await cook('cook-souvlaki', 'Souvlaki', 'reviewed', null);
  await cook('cook-souvlaki-2', 'Souvlaki', 'open', 'cook-souvlaki');
  await cook('cook-porridge', 'Porridge', 'reviewed', null);
  await cook('cook-tart', 'Lemon tart', 'reviewed', null);
  await cook('cook-gone', 'Burnt toast', 'reviewed', null);

  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES ('event-note', 'cook-souvlaki', ?, 'user_note', 'Charred on the grill.', NULL, NULL)`,
    [AT],
  );
  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES ('event-oven', 'cook-tart', ?, 'temp', NULL, '{"celsius":180,"readingKind":"oven"}', NULL)`,
    [AT],
  );

  const meal = (cookId: string, mealType: string) =>
    run('INSERT INTO cook_meal_types (cook_id, meal_type, set_at) VALUES (?, ?, ?)', [cookId, mealType, AT]);
  await meal('cook-souvlaki', 'lunch_dinner');
  await meal('cook-porridge', 'breakfast');
  await meal('cook-gone', 'snack');
  await meal('cook-tart', 'dessert');
  await meal('cook-souvlaki-2', 'lunch_dinner');
  // A meal type cleared, as decision 1 clears one: a gap in the rowids, which
  // the rebuild must carry across as it is.
  await run("DELETE FROM cook_meal_types WHERE cook_id = 'cook-porridge'");
  await meal('cook-porridge', 'snack');

  await run(
    `INSERT INTO ingredient_versions (id, cook_id, text, saved_at)
     VALUES ('ing-1', 'cook-souvlaki', 'pork shoulder\nlemon\noregano', ?)`,
    [AT],
  );
  await run(
    `INSERT INTO household_members (id, name, position, retired_at, created_at)
     VALUES ('m-you', 'You', 0, NULL, ?)`,
    [AT],
  );
  await run(
    `INSERT INTO ratings (id, cook_id, member_id, guest_name, stars, not_eaten, line, rated_at)
     VALUES ('r-you', 'cook-souvlaki', 'm-you', NULL, 5, 0, 'Lovely.', ?)`,
    [AT],
  );
  await run(
    `INSERT INTO ratings (id, cook_id, member_id, guest_name, stars, not_eaten, line, rated_at)
     VALUES ('r-guest', 'cook-souvlaki', NULL, 'Guest', NULL, 1, NULL, ?)`,
    [AT],
  );
  await run(
    `INSERT INTO lessons (id, cook_id, text, status, provenance, created_at, updated_at)
     VALUES ('lesson-1', 'cook-souvlaki', 'Marinate overnight.', 'approved', 'live', ?, NULL)`,
    [AT],
  );
  await run(
    `INSERT INTO lesson_revisions (id, lesson_id, cook_id, text, revised_at)
     VALUES ('lr-1', 'lesson-1', 'cook-souvlaki', 'Marinate for a whole day.', ?)`,
    [LATER],
  );
  await run("INSERT INTO app_settings (key, value) VALUES ('household_asked', 'yes')");
  await run("INSERT INTO cook_deletions (cook_id, requested_at) VALUES ('cook-gone', ?)", [LATER]);
}

async function census(adapter: DatabaseAdapter): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of V4_TABLES) {
    const rows = await adapter.select({ sql: `SELECT count(*) AS total FROM ${table}` });
    counts[table] = Number(rows[0]?.total ?? -1);
  }
  return counts;
}

/** Every row of every version 4 table but `schema_meta`, with its rowid where it has one. */
async function everything(adapter: DatabaseAdapter): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown> = {};
  for (const table of V4_TABLES.filter((name) => name !== 'schema_meta')) {
    rows[table] = await adapter.select({ sql: `SELECT rowid AS row_id, * FROM ${table} ORDER BY rowid` });
  }
  return rows;
}

/** Every foreign key in the schema, as `from_table.from → to_table.to`. */
async function foreignKeys(adapter: DatabaseAdapter): Promise<readonly string[]> {
  const keys: string[] = [];
  for (const table of await listTables(adapter)) {
    for (const key of await adapter.select({ sql: `PRAGMA foreign_key_list(${table})` })) {
      keys.push(`${table}.${String(key.from)} → ${String(key.table)}.${String(key.to)} on delete ${String(key.on_delete)}`);
    }
  }
  return keys.sort();
}

describe('version 4 to version 5, with a notebook in it', () => {
  let opened: Opened;

  beforeEach(async () => {
    opened = await openAt(UP_TO_V4);
    await fillVersionFour(opened.adapter);
  });

  afterEach(async () => {
    await opened.close();
  });

  it('starts at version 4, with meal types, a gap in their rowids, and a pending deletion', async () => {
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(4);
    const counts = await census(opened.adapter);
    for (const table of ['cooks', 'cook_events', 'cook_meal_types', 'ingredient_versions', 'ratings', 'lesson_revisions', 'cook_deletions']) {
      expect(counts[table]).toBeGreaterThan(0);
    }
    const rowids = await opened.adapter.select({ sql: 'SELECT rowid AS row_id FROM cook_meal_types ORDER BY rowid' });
    expect(rowids.map((row) => Number(row.row_id))).toEqual([1, 3, 4, 5, 6]);
  });

  it('applies version 5 only, and lands at the latest version', async () => {
    const result = await runMigrations(opened.adapter);

    expect(result.applied).toEqual([5, 6]);
    expect(LATEST_SCHEMA_VERSION).toBe(6);
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(6);
  });

  it('keeps the same row counts and the same content, row for row and rowid for rowid', async () => {
    const countsBefore = await census(opened.adapter);
    const rowsBefore = await everything(opened.adapter);

    await runMigrations(opened.adapter);

    expect(await census(opened.adapter)).toEqual(countsBefore);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
    // The meal types especially: the rebuilt table holds the same rows.
    expect(await opened.adapter.select({ sql: 'SELECT rowid AS row_id, * FROM cook_meal_types ORDER BY rowid' })).toEqual(
      rowsBefore.cook_meal_types,
    );
    const pending = await opened.adapter.select({ sql: 'SELECT cook_id FROM cook_deletions' });
    expect(pending).toEqual([{ cook_id: 'cook-gone' }]);
  });

  it('points nothing at cook_meal_types, before or after, so dropping it could cascade nothing', async () => {
    const before = await foreignKeys(opened.adapter);
    expect(before.filter((key) => key.includes('→ cook_meal_types.'))).toEqual([]);

    await runMigrations(opened.adapter);

    const after = await foreignKeys(opened.adapter);
    expect(after.filter((key) => key.includes('→ cook_meal_types'))).toEqual([]);
    // Every foreign key version 4 had is still there, unchanged, and the
    // rebuilt table still hangs off its cook.
    for (const key of before) {
      expect(after).toContain(key);
    }
    expect(after.filter((key) => key.startsWith('cook_meal_types.'))).toEqual([
      'cook_meal_types.cook_id → cooks.id on delete CASCADE',
    ]);
    expect(after.filter((key) => key.startsWith('cook_cuisines.'))).toEqual([
      'cook_cuisines.cook_id → cooks.id on delete CASCADE',
    ]);
    expect(await opened.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
    expect(await opened.adapter.select({ sql: 'PRAGMA integrity_check' })).toEqual([{ integrity_check: 'ok' }]);
  });

  it('adds cook_cuisines, empty, and leaves no working table: no cook is given a cuisine', async () => {
    await runMigrations(opened.adapter);

    expect([...(await listTables(opened.adapter))].sort()).toEqual([...SCHEMA_TABLES].sort());
    const [row] = await opened.adapter.select({ sql: 'SELECT count(*) AS total FROM cook_cuisines' });
    expect(Number(row?.total)).toBe(0);
    const [table] = await opened.adapter.select({
      sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cook_meal_types'",
    });
    expect(String(table?.sql)).toContain("'side'");
  });

  it('lets a cook be a side now, and still refuses none and a cook that is not there', async () => {
    await runMigrations(opened.adapter);
    const meal = (cookId: string, mealType: string) =>
      opened.adapter.execute({
        sql: `INSERT INTO cook_meal_types (cook_id, meal_type, set_at) VALUES (?, ?, ?)
              ON CONFLICT(cook_id) DO UPDATE SET meal_type = excluded.meal_type`,
        params: [cookId, mealType, LATER],
      });

    await meal('cook-tart', 'side');
    const [tart] = await opened.adapter.select({ sql: "SELECT meal_type FROM cook_meal_types WHERE cook_id = 'cook-tart'" });
    expect(tart?.meal_type).toBe('side');
    await expect(meal('cook-tart', 'none')).rejects.toThrow();
    await expect(meal('cook-tart', 'starter')).rejects.toThrow();
    await expect(meal('no-such-cook', 'side')).rejects.toThrow();
  });

  it('holds a cuisine’s rules in SQL: the eleven, Other’s words trimmed and 1 to 40 long, one per cook', async () => {
    await runMigrations(opened.adapter);
    const cuisine = (cookId: string, key: string, words: string | null) =>
      opened.adapter.execute({
        sql: 'INSERT INTO cook_cuisines (cook_id, cuisine, other_words, set_at) VALUES (?, ?, ?, ?)',
        params: [cookId, key, words, LATER],
      });

    await expect(cuisine('cook-tart', 'british', null)).rejects.toThrow();
    await expect(cuisine('cook-tart', 'other', null)).rejects.toThrow();
    await expect(cuisine('cook-tart', 'other', '')).rejects.toThrow();
    await expect(cuisine('cook-tart', 'other', ' Home baking')).rejects.toThrow();
    await expect(cuisine('cook-tart', 'other', 'x'.repeat(41))).rejects.toThrow();
    await expect(cuisine('cook-tart', 'greek', 'Island')).rejects.toThrow();
    await expect(cuisine('no-such-cook', 'greek', null)).rejects.toThrow();

    await cuisine('cook-souvlaki', 'greek', null);
    await cuisine('cook-tart', 'other', 'x'.repeat(40));
    await expect(cuisine('cook-souvlaki', 'thai', null)).rejects.toThrow();
  });

  it('takes a cook’s meal type and cuisine with it when the cook is deleted, and nothing else', async () => {
    await runMigrations(opened.adapter);
    await opened.adapter.execute({
      sql: "INSERT INTO cook_cuisines (cook_id, cuisine, other_words, set_at) VALUES ('cook-gone', 'american', NULL, ?)",
      params: [LATER],
    });
    const others = await opened.adapter.select({
      sql: "SELECT rowid AS row_id, * FROM cook_meal_types WHERE cook_id <> 'cook-gone' ORDER BY rowid",
    });

    await opened.adapter.execute({ sql: "DELETE FROM cooks WHERE id = 'cook-gone'" });

    expect(await opened.adapter.select({ sql: "SELECT * FROM cook_meal_types WHERE cook_id = 'cook-gone'" })).toEqual([]);
    expect(await opened.adapter.select({ sql: "SELECT * FROM cook_cuisines WHERE cook_id = 'cook-gone'" })).toEqual([]);
    expect(await opened.adapter.select({ sql: 'SELECT rowid AS row_id, * FROM cook_meal_types ORDER BY rowid' })).toEqual(others);
    expect(await opened.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
  });

  it('runs in one transaction: a failing version 5 rolls back to version 4 with nothing lost', async () => {
    const countsBefore = await census(opened.adapter);
    const rowsBefore = await everything(opened.adapter);
    const broken: readonly Migration[] = [
      ...UP_TO_V4,
      {
        version: 5,
        name: 'side_and_cuisine',
        // Fails at the very end, after the rebuild and the new table.
        statements: [...(V5?.statements ?? []), 'INSERT INTO cook_cuisines (cook_id) VALUES (NULL)'],
      },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toBeInstanceOf(MigrationError);

    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(4);
    expect(await census(opened.adapter)).toEqual(countsBefore);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
    const tables = await listTables(opened.adapter);
    expect(tables).not.toContain('cook_cuisines');
    expect(tables).not.toContain('cook_meal_types_v5');
    // The old table, with its old CHECK, is back: the drop and the rename
    // were undone with the rest.
    await expect(
      opened.adapter.execute({
        sql: "UPDATE cook_meal_types SET meal_type = 'side' WHERE cook_id = 'cook-tart'",
      }),
    ).rejects.toThrow();
    expect(await opened.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);

    // And the real version 5 still runs afterwards, on the same notebook.
    expect((await runMigrations(opened.adapter)).applied).toEqual([5, 6]);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
  });
});

describe('a version 5 that cannot carry a row', () => {
  it('rolls back, leaves version 4 and the data intact, and takes the could-not-update startup path', async () => {
    // A notebook on a phone, with its key, at version 4.
    const harness = createNodeSqliteHarness();
    const databases = createDatabaseAdapterFactory(harness.open);
    const keys = createDatabaseKeyProvider(memorySecureStore(), nodeRandomBytes);
    const key = await keys.getOrCreateKey();
    const first = await databases.open({ fileName: FILE, encryptionKey: key });
    await runMigrations(first, UP_TO_V4);
    await fillVersionFour(first);
    // A meal type whose cook is not there. Foreign keys are on for every
    // connection, so this cannot happen in the app; it is put there by hand,
    // with them off for one statement, to make the real version 5 fail: the
    // rebuild checks every row it copies, and refuses to carry this one.
    await first.execute({ sql: 'PRAGMA foreign_keys = OFF' });
    await first.execute({
      sql: "INSERT INTO cook_meal_types (cook_id, meal_type, set_at) VALUES ('cook-nowhere', 'snack', ?)",
      params: [AT],
    });
    await first.execute({ sql: 'PRAGMA foreign_keys = ON' });
    const countsBefore = await census(first);
    const rowsBefore = await everything(first);
    await first.close();

    const started = await openCookingLabDatabase({
      databases,
      keys,
      files: { exists: async () => true },
      fileName: FILE,
    });

    expect(started.ok).toBe(false);
    if (!started.ok) {
      // `StartupGate` shows this reason as "The notebook could not be
      // updated … your history is unchanged", never an empty notebook.
      expect(started.reason).toBe('migration_failed');
      expect(started.message).toContain('migration 5 (side_and_cuisine) was rolled back');
    }

    const after = await databases.open({ fileName: FILE, encryptionKey: key });
    expect((await readSchemaState(after)).schemaVersion).toBe(4);
    expect(await census(after)).toEqual(countsBefore);
    expect(await everything(after)).toEqual(rowsBefore);
    const tables = await listTables(after);
    expect(tables).not.toContain('cook_cuisines');
    expect(tables).not.toContain('cook_meal_types_v5');
    await after.close();
    harness.closeAll();
  });
});
