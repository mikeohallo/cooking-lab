/**
 * Migrating a real version 3 database to version 4 (0.3.0, update 2).
 *
 * Version 4 adds six tables — meal types, ingredient versions, the household,
 * ratings, next-time edits and the app's settings — and is meant to change no
 * existing row at all. So this is the test of that: a version 3 notebook with
 * something in every table 0.2.2 writes (cooks, notes, readings, photos, tags,
 * lessons, edits and a cook whose deletion is pending), migrated, then
 * compared whole, row for row.
 *
 * And the other half of the promise: a version 4 that fails rolls back in one
 * transaction and leaves the notebook at version 3 with nothing lost.
 */

import type { DatabaseAdapter } from '../src/data/adapters';
import { createDatabaseAdapterFactory } from '../src/data/sqlite/connection';
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
import { createNodeSqliteHarness } from './support/nodeSqlite';

const UP_TO_V3: readonly Migration[] = MIGRATIONS.filter((entry) => entry.version <= 3);
const V4 = MIGRATIONS.find((entry) => entry.version === 4);
const V4_TABLES: readonly string[] = [
  'cook_meal_types',
  'ingredient_versions',
  'household_members',
  'ratings',
  'lesson_revisions',
  'app_settings',
];
const V3_TABLES = SCHEMA_TABLES.filter((table) => !V4_TABLES.includes(table));
const AT = '2026-10-30T18:00:00.000Z';
const LATER = '2026-10-30T19:00:00.000Z';

type Opened = { readonly adapter: DatabaseAdapter; close(): Promise<void> };

async function openAt(fileName: string, migrations: readonly Migration[]): Promise<Opened> {
  const harness = createNodeSqliteHarness();
  const adapter = await createDatabaseAdapterFactory(harness.open).open({
    fileName,
    encryptionKey: null,
  });
  await runMigrations(adapter, migrations);
  return {
    adapter,
    async close() {
      await adapter.close();
      harness.closeAll();
    },
  };
}

/** A version 3 notebook, written with plain SQL the way 0.2.2 wrote it. */
async function fillVersionThree(adapter: DatabaseAdapter): Promise<void> {
  const run = (sql: string, params: readonly (string | number | null)[] = []) =>
    adapter.execute({ sql, params });

  const cook = (
    id: string,
    title: string | null,
    status: 'open' | 'reviewed',
    parent: string | null,
    verdict: string | null,
  ) =>
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
        verdict,
        AT,
      ],
    );

  await cook('cook-stew', 'Beef stew', 'reviewed', null, '  Rich.\nNeeded salt.  ');
  await cook('cook-again', 'Beef stew', 'open', 'cook-stew', null);
  await cook('cook-pending', 'Burnt toast', 'reviewed', null, 'No.');

  const event = (id: string, cookId: string, kind: string, body: string | null, meta: string | null, path: string | null) =>
    run(
      `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, cookId, AT, kind, body, meta, path],
    );
  await event('event-note', 'cook-stew', 'user_note', 'Browned in two batches. "Dark" crust.', null, null);
  await event('event-oven', 'cook-stew', 'temp', null, '{"celsius":160,"readingKind":"oven"}', null);
  await event('event-internal', 'cook-stew', 'temp', null, '{"celsius":92,"readingKind":"internal"}', null);
  await event(
    'event-photo',
    'cook-stew',
    'photo',
    null,
    '{"photoTime":{"placed":"taken"}}',
    'cooks/cook-stew/events/event-photo/20261030t180000-00.jpg',
  );
  await event('event-toast', 'cook-pending', 'user_note', 'Smoke.', null, null);

  await run(
    `INSERT INTO lessons (id, cook_id, text, status, provenance, created_at, updated_at)
     VALUES ('lesson-salt', 'cook-stew', 'Salt earlier.', 'approved', 'live', ?, NULL)`,
    [AT],
  );
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-stew', 'stew', NULL)");
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-pot', 'dutch oven', 'equipment')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-stew', 'tag-stew')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-stew', 'tag-pot')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-again', 'tag-stew')");
  await run(
    `INSERT INTO revisions (id, cook_id, cook_event_id, field, text, revised_at)
     VALUES ('rev-note', 'cook-stew', 'event-note', 'note', 'Browned in three batches.', ?)`,
    [LATER],
  );
  await run(
    `INSERT INTO revisions (id, cook_id, cook_event_id, field, text, revised_at)
     VALUES ('rev-verdict', 'cook-stew', NULL, 'verdict', 'Rich. Salt it earlier.', ?)`,
    [LATER],
  );
  await run("INSERT INTO cook_deletions (cook_id, requested_at) VALUES ('cook-pending', ?)", [LATER]);
}

async function census(adapter: DatabaseAdapter): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of V3_TABLES) {
    const rows = await adapter.select({ sql: `SELECT count(*) AS total FROM ${table}` });
    counts[table] = Number(rows[0]?.total ?? -1);
  }
  return counts;
}

/** Every row of every version 3 table but `schema_meta`, in a fixed order. */
async function everything(adapter: DatabaseAdapter): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown> = {};
  for (const table of V3_TABLES.filter((name) => name !== 'schema_meta')) {
    rows[table] = await adapter.select({ sql: `SELECT * FROM ${table} ORDER BY rowid` });
  }
  return rows;
}

describe('version 3 to version 4, with a notebook in it', () => {
  let opened: Opened;

  beforeEach(async () => {
    opened = await openAt('v3-to-v4.db', UP_TO_V3);
    await fillVersionThree(opened.adapter);
  });

  afterEach(async () => {
    await opened.close();
  });

  it('starts at version 3, as 0.2.2 left it, with something in every table it writes', async () => {
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(3);
    const counts = await census(opened.adapter);
    for (const table of ['cooks', 'cook_events', 'lessons', 'tags', 'cook_tags', 'revisions', 'cook_deletions']) {
      expect(counts[table]).toBeGreaterThan(0);
    }
  });

  it('applies version 4 only, and lands at the latest version', async () => {
    const result = await runMigrations(opened.adapter);

    expect(result.applied).toEqual([4]);
    expect(LATEST_SCHEMA_VERSION).toBe(4);
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(4);
  });

  it('keeps the same row counts and the same content, row for row', async () => {
    const countsBefore = await census(opened.adapter);
    const rowsBefore = await everything(opened.adapter);

    await runMigrations(opened.adapter);

    expect(await census(opened.adapter)).toEqual(countsBefore);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
    const [stew] = await opened.adapter.select({ sql: "SELECT verdict FROM cooks WHERE id = 'cook-stew'" });
    expect(stew?.verdict).toBe('  Rich.\nNeeded salt.  ');
    // The pending deletion is still pending: the cook stays hidden, and whole.
    const pending = await opened.adapter.select({ sql: 'SELECT cook_id FROM cook_deletions' });
    expect(pending).toEqual([{ cook_id: 'cook-pending' }]);
  });

  it('adds its six tables, empty, and nothing else: no cook is given a meal type, ingredients or a rating', async () => {
    await runMigrations(opened.adapter);

    expect([...(await listTables(opened.adapter))].sort()).toEqual([...SCHEMA_TABLES].sort());
    for (const table of V4_TABLES) {
      const [row] = await opened.adapter.select({ sql: `SELECT count(*) AS total FROM ${table}` });
      expect(Number(row?.total)).toBe(0);
    }
  });

  it('leaves every foreign key intact, and ties the new tables in', async () => {
    await runMigrations(opened.adapter);

    expect(await opened.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
    await expect(
      opened.adapter.execute({
        sql: "INSERT INTO cook_meal_types (cook_id, meal_type, set_at) VALUES ('no-such-cook', 'snack', ?)",
        params: [AT],
      }),
    ).rejects.toThrow();
    await expect(
      opened.adapter.execute({
        sql: `INSERT INTO ratings (id, cook_id, member_id, guest_name, stars, not_eaten, line, rated_at)
              VALUES ('r1', 'cook-stew', 'no-such-member', NULL, 4, 0, NULL, ?)`,
        params: [AT],
      }),
    ).rejects.toThrow();
  });

  it('holds the new rules in SQL too: whole stars, N/A without stars, one person', async () => {
    await runMigrations(opened.adapter);
    const rate = (stars: number | null, notEaten: number, member: string | null, guest: string | null) =>
      opened.adapter.execute({
        sql: `INSERT INTO ratings (id, cook_id, member_id, guest_name, stars, not_eaten, line, rated_at)
              VALUES (?, 'cook-stew', ?, ?, ?, ?, NULL, ?)`,
        params: [`r-${Math.random().toString(36).slice(2, 8)}`, member, guest, stars, notEaten, AT],
      });
    await opened.adapter.execute({
      sql: `INSERT INTO household_members (id, name, position, retired_at, created_at)
            VALUES ('m-alex', 'Alex', 0, NULL, ?)`,
      params: [AT],
    });

    await expect(rate(6, 0, 'm-alex', null)).rejects.toThrow();
    await expect(rate(0, 0, 'm-alex', null)).rejects.toThrow();
    await expect(rate(3, 1, 'm-alex', null)).rejects.toThrow();
    await expect(rate(3, 0, 'm-alex', 'Sam')).rejects.toThrow();
    await expect(rate(3, 0, null, null)).rejects.toThrow();
    await expect(rate(null, 0, null, 'Sam')).rejects.toThrow();
    await expect(
      opened.adapter.execute({
        sql: "INSERT INTO cook_meal_types (cook_id, meal_type, set_at) VALUES ('cook-stew', 'none', ?)",
        params: [AT],
      }),
    ).rejects.toThrow();
    await rate(null, 1, 'm-alex', null);
    await rate(5, 0, null, 'Sam');
  });

  it('runs in one transaction: a failing version 4 rolls back to version 3 with nothing lost', async () => {
    const countsBefore = await census(opened.adapter);
    const rowsBefore = await everything(opened.adapter);
    const broken: readonly Migration[] = [
      ...UP_TO_V3,
      {
        version: 4,
        name: 'meal_type_ingredients_household_ratings',
        statements: [...(V4?.statements ?? []), 'INSERT INTO ratings (id) VALUES (NULL)'],
      },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toBeInstanceOf(MigrationError);

    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(3);
    expect(await census(opened.adapter)).toEqual(countsBefore);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
    const tables = await listTables(opened.adapter);
    for (const table of V4_TABLES) {
      expect(tables).not.toContain(table);
    }
  });

  it('reports a failed version 4 as a migration failure, which the app shows rather than opening empty', async () => {
    const broken: readonly Migration[] = [
      ...UP_TO_V3,
      { version: 4, name: 'meal_type_ingredients_household_ratings', statements: ['DROP TABLE nothing_here'] },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toMatchObject({
      reason: 'migration_failed',
    });
  });
});
