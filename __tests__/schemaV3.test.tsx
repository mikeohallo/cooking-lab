/**
 * Migrating a real version 2 database to version 3 (0.2.2).
 *
 * Version 3 adds `revisions` (every edit of a note or a verdict) and
 * `cook_deletions` (a cook held for its undo window). It is meant to change no
 * existing row at all, so this is the test of that: a version 2 notebook with
 * something in every table a phone holds, migrated, then compared whole.
 *
 * And the other half of the promise: a version 3 that fails rolls back in one
 * transaction, leaves the notebook at version 2 with nothing lost, and the app
 * says so rather than opening an empty notebook.
 */

import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DatabaseAdapter } from '../src/data/adapters';
import type { StorageStartupResult } from '../src/data/runtime';
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
import { StartupGate } from '../src/state/StartupGate';
import { StorageProvider } from '../src/state/StorageProvider';
import { createNodeSqliteHarness } from './support/nodeSqlite';

const UP_TO_V2: readonly Migration[] = MIGRATIONS.filter((entry) => entry.version <= 2);
// Version 4 (0.3.0) follows on in a real start; this file is about 2 → 3, and
// `schemaV4.test.ts` covers 3 → 4.
const UP_TO_V3: readonly Migration[] = MIGRATIONS.filter((entry) => entry.version <= 3);
const V4_TABLES: readonly string[] = [
  'cook_meal_types',
  'ingredient_versions',
  'household_members',
  'ratings',
  'lesson_revisions',
  'app_settings',
];
const V3_TABLES = SCHEMA_TABLES.filter((table) => !V4_TABLES.includes(table));
const V3 = MIGRATIONS.find((entry) => entry.version === 3);
const V2_TABLES = V3_TABLES.filter(
  (table) => table !== 'revisions' && table !== 'cook_deletions',
);
const AT = '2026-10-29T18:00:00.000Z';

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

/** A version 2 notebook, written with plain SQL the way 0.2.1 wrote it. */
async function fillVersionTwo(adapter: DatabaseAdapter): Promise<void> {
  const run = (sql: string, params: readonly (string | number | null)[] = []) =>
    adapter.execute({ sql, params });

  await run(
    `INSERT INTO cooks (id, title, status, provenance, parent_cook_id, started_at,
                        review_opened_at, review_saved_at, verdict, created_at)
     VALUES ('cook-pork', 'Pork chops', 'reviewed', 'live', NULL, ?, ?, ?, ?, ?)`,
    [AT, AT, AT, '  Great crust.\nNeeded acid.  ', AT],
  );
  await run(
    `INSERT INTO cooks (id, title, status, provenance, parent_cook_id, started_at,
                        review_opened_at, review_saved_at, verdict, created_at)
     VALUES ('cook-again', NULL, 'open', 'live', 'cook-pork', ?, NULL, NULL, NULL, ?)`,
    [AT, AT],
  );
  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES ('event-note', 'cook-pork', ?, 'user_note', ?, NULL, NULL)`,
    [AT, 'Dry brined overnight. "Salted" at 8.'],
  );
  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES ('event-oven', 'cook-pork', ?, 'temp', NULL, ?, NULL)`,
    [AT, '{"celsius":220,"readingKind":"oven"}'],
  );
  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES ('event-photo', 'cook-pork', ?, 'photo', NULL, NULL, ?)`,
    [AT, 'cooks/cook-pork/events/event-photo/20261029t180000-00.jpg'],
  );
  await run(
    `INSERT INTO lessons (id, cook_id, text, status, provenance, created_at, updated_at)
     VALUES ('lesson-acid', 'cook-pork', 'More acid.', 'approved', 'live', ?, NULL)`,
    [AT],
  );
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-pork', 'pork chops', NULL)");
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-iron', 'cast iron', 'equipment')");
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-spare', 'brown butter', NULL)");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-pork', 'tag-pork')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-pork', 'tag-iron')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-again', 'tag-pork')");
}

async function census(adapter: DatabaseAdapter): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of V2_TABLES) {
    const rows = await adapter.select({ sql: `SELECT count(*) AS total FROM ${table}` });
    counts[table] = Number(rows[0]?.total ?? -1);
  }
  return counts;
}

/**
 * Every row of every version 2 table, in a fixed order — all but `schema_meta`,
 * whose version stamp is the one row a migration is meant to change.
 */
async function everything(adapter: DatabaseAdapter): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown> = {};
  for (const table of V2_TABLES.filter((name) => name !== 'schema_meta')) {
    rows[table] = await adapter.select({ sql: `SELECT * FROM ${table} ORDER BY rowid` });
  }
  return rows;
}

describe('version 2 to version 3, with a notebook in it', () => {
  let opened: Opened;

  beforeEach(async () => {
    opened = await openAt('v2-to-v3.db', UP_TO_V2);
    await fillVersionTwo(opened.adapter);
  });

  afterEach(async () => {
    await opened.close();
  });

  it('starts at version 2, as 0.2.1 left it', async () => {
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(2);
  });

  it('applies version 3 only, and lands at the latest version', async () => {
    const result = await runMigrations(opened.adapter, UP_TO_V3);

    expect(result.applied).toEqual([3]);
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(3);
    // And a real start carries straight on to the latest.
    expect((await runMigrations(opened.adapter)).applied).toEqual([4]);
    expect(LATEST_SCHEMA_VERSION).toBe(4);
  });

  it('keeps the same row counts and the same content, byte for byte', async () => {
    const countsBefore = await census(opened.adapter);
    const rowsBefore = await everything(opened.adapter);

    await runMigrations(opened.adapter, UP_TO_V3);

    expect(await census(opened.adapter)).toEqual(countsBefore);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
    // The verdict with its spaces and line break, the note with its quotes.
    const [pork] = await opened.adapter.select({
      sql: "SELECT verdict FROM cooks WHERE id = 'cook-pork'",
    });
    expect(pork?.verdict).toBe('  Great crust.\nNeeded acid.  ');
  });

  it('adds its two tables, empty, and nothing else', async () => {
    await runMigrations(opened.adapter, UP_TO_V3);

    expect([...(await listTables(opened.adapter))].sort()).toEqual([...V3_TABLES].sort());
    for (const table of ['revisions', 'cook_deletions']) {
      const [row] = await opened.adapter.select({ sql: `SELECT count(*) AS total FROM ${table}` });
      expect(Number(row?.total)).toBe(0);
    }
  });

  it('leaves every foreign key intact', async () => {
    await runMigrations(opened.adapter, UP_TO_V3);

    expect(await opened.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
    // And the new tables are tied in: an edit of a note that is not there is refused.
    await expect(
      opened.adapter.execute({
        sql: `INSERT INTO revisions (id, cook_id, cook_event_id, field, text, revised_at)
              VALUES ('r1', 'cook-pork', 'no-such-event', 'note', 'x', ?)`,
        params: [AT],
      }),
    ).rejects.toThrow();
  });

  it('runs in one transaction: a failing version 3 rolls back to version 2 with nothing lost', async () => {
    const countsBefore = await census(opened.adapter);
    const rowsBefore = await everything(opened.adapter);
    const broken: readonly Migration[] = [
      ...UP_TO_V2,
      {
        version: 3,
        name: 'revisions_and_cook_deletions',
        statements: [...(V3?.statements ?? []), 'INSERT INTO revisions (id) VALUES (NULL)'],
      },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toBeInstanceOf(MigrationError);

    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(2);
    expect(await census(opened.adapter)).toEqual(countsBefore);
    expect(await everything(opened.adapter)).toEqual(rowsBefore);
    const tables = await listTables(opened.adapter);
    expect(tables).not.toContain('revisions');
    expect(tables).not.toContain('cook_deletions');
  });

  it('reports a failed version 3 as a migration failure', async () => {
    const broken: readonly Migration[] = [
      ...UP_TO_V2,
      { version: 3, name: 'revisions_and_cook_deletions', statements: ['DROP TABLE nothing_here'] },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toMatchObject({
      reason: 'migration_failed',
    });
  });
});

describe('when the update fails on the phone', () => {
  it('shows that the notebook could not be updated, never an empty app', async () => {
    const failed: StorageStartupResult = {
      ok: false,
      reason: 'migration_failed',
      message: 'version 3 could not be applied.',
    } as StorageStartupResult;

    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 800 },
          insets: { top: 24, left: 0, right: 0, bottom: 48 },
        }}
      >
        <StorageProvider start={async () => failed} newId={() => 'id-1'}>
          <StartupGate>
            <></>
          </StartupGate>
        </StorageProvider>
      </SafeAreaProvider>,
    );

    expect(await screen.findByTestId('startup-failure-notice')).toBeOnTheScreen();
    expect(screen.getByText('The notebook could not be updated')).toBeOnTheScreen();
    expect(screen.getByText(/your history is unchanged/)).toBeOnTheScreen();
    expect(screen.queryByTestId('home-screen')).toBeNull();
  });
});
