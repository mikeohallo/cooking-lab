/**
 * Migrating a real version 1 database to version 2.
 *
 * `migrations.test.ts` reads the SQL. This runs it — against a database built
 * at version 1 and filled the way the Fold's is: cooks, notes, readings, tags
 * and lessons, with the junction rows that tie them together. The question it
 * answers is the only one that matters about a migration on a phone that holds
 * a kitchen's history: is everything still there afterwards, and still joined
 * up?
 *
 * The rebuild in version 2 drops and recreates `tags`, and `cook_tags`
 * references it with ON DELETE CASCADE. So the tag links are exactly what a
 * careless migration would destroy, and they are what this file watches.
 */

import { createDatabaseAdapterFactory } from '../src/data/sqlite/connection';
import { createSqliteDataLayer } from '../src/data/sqlite/dataLayer';
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
import type { DatabaseAdapter } from '../src/data/adapters';
import { countingIds } from './support/database';
import { createNodeSqliteHarness, type NodeSqliteHarness } from './support/nodeSqlite';

const V1_ONLY: readonly Migration[] = MIGRATIONS.filter((entry) => entry.version === 1);

/**
 * The tables version 2 knows. Version 3 (0.2.2) added two more, which do not
 * exist yet in a version 1 notebook; they are counted in `schemaV3.test.ts`.
 */
const V2_TABLES: readonly string[] = SCHEMA_TABLES.filter(
  (table) => table !== 'revisions' && table !== 'cook_deletions',
);

const AT = '2026-10-18T17:00:00.000Z';

type Opened = {
  readonly adapter: DatabaseAdapter;
  readonly harness: NodeSqliteHarness;
  close(): Promise<void>;
};

async function openAt(fileName: string, migrations: readonly Migration[]): Promise<Opened> {
  const harness = createNodeSqliteHarness();
  const adapter = await createDatabaseAdapterFactory(harness.open).open({
    fileName,
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

/**
 * A version 1 notebook with something in every table the migration touches.
 *
 * Written with plain SQL rather than through the repositories on purpose: the
 * repositories are this build's, and this build knows about version 2. The rows
 * have to go in the way the shipped version 1 build put them in, which means
 * every tag has a kind, because at version 1 it had to.
 */
async function fillVersionOne(adapter: DatabaseAdapter): Promise<void> {
  const run = (sql: string, params: readonly (string | number | null)[] = []) =>
    adapter.execute({ sql, params });

  await run(
    `INSERT INTO cooks (id, title, status, provenance, parent_cook_id, started_at,
                        review_opened_at, review_saved_at, verdict, created_at)
     VALUES (?, ?, 'reviewed', 'live', NULL, ?, ?, ?, ?, ?)`,
    ['cook-pork', 'Pork chops', AT, AT, AT, '  Great crust.\nNeeded acid.  ', AT],
  );
  await run(
    `INSERT INTO cooks (id, title, status, provenance, parent_cook_id, started_at,
                        review_opened_at, review_saved_at, verdict, created_at)
     VALUES (?, NULL, 'open', 'live', NULL, ?, NULL, NULL, NULL, ?)`,
    ['cook-open', AT, AT],
  );

  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES (?, ?, ?, 'user_note', ?, NULL, NULL)`,
    ['event-note', 'cook-pork', AT, 'Dry brined overnight.'],
  );
  // A version 1 reading: a number and perhaps a `where`, and nothing that says
  // what it was taken of, because version 1 had no such idea.
  await run(
    `INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path)
     VALUES (?, ?, ?, 'temp', NULL, ?, NULL)`,
    ['event-temp', 'cook-pork', AT, '{"celsius":62.5,"where":"thickest part"}'],
  );

  await run(
    `INSERT INTO lessons (id, cook_id, text, status, provenance, created_at, updated_at)
     VALUES (?, ?, ?, 'approved', 'live', ?, NULL)`,
    ['lesson-acid', 'cook-pork', 'More acid in the cabbage.', AT],
  );

  // Every one of the four kinds, so the migration is proved against all of them.
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-dish', 'pork chops', 'dish')");
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-ing', 'butter', 'ingredient')");
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-tech', 'butter', 'technique')");
  await run("INSERT INTO tags (id, name, kind) VALUES ('tag-kit', 'cast iron', 'equipment')");

  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-pork', 'tag-dish')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-pork', 'tag-tech')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-pork', 'tag-kit')");
  await run("INSERT INTO cook_tags (cook_id, tag_id) VALUES ('cook-open', 'tag-ing')");
}

/** Row counts for every table, as one object that can be compared whole. */
async function census(adapter: DatabaseAdapter): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of V2_TABLES) {
    const rows = await adapter.select({ sql: `SELECT count(*) AS total FROM ${table}` });
    counts[table] = Number(rows[0]?.total ?? -1);
  }
  return counts;
}

async function allRows(
  adapter: DatabaseAdapter,
  sql: string,
): Promise<readonly Record<string, unknown>[]> {
  return (await adapter.select({ sql })) as readonly Record<string, unknown>[];
}

describe('version 1 to version 2, with a notebook in it', () => {
  let opened: Opened;

  beforeEach(async () => {
    opened = await openAt('v1-to-v2.db', V1_ONLY);
    await fillVersionOne(opened.adapter);
  });

  afterEach(async () => {
    await opened.close();
  });

  it('starts at version 1, as the shipped build left it', async () => {
    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(1);
  });

  it('loses no row and changes no content', async () => {
    const before = await census(opened.adapter);
    const cooksBefore = await allRows(opened.adapter, 'SELECT * FROM cooks ORDER BY id');
    const eventsBefore = await allRows(opened.adapter, 'SELECT * FROM cook_events ORDER BY id');
    const tagsBefore = await allRows(opened.adapter, 'SELECT * FROM tags ORDER BY id');
    const linksBefore = await allRows(
      opened.adapter,
      'SELECT * FROM cook_tags ORDER BY cook_id, tag_id',
    );
    const lessonsBefore = await allRows(opened.adapter, 'SELECT * FROM lessons ORDER BY id');

    const result = await runMigrations(opened.adapter);

    // Version 3 (0.2.2) follows straight on; it adds two tables and touches
    // none of these rows, which is what the rest of this test checks.
    expect(result.applied).toEqual([2, 3]);
    expect(result.versionAfter).toBe(LATEST_SCHEMA_VERSION);

    expect(await census(opened.adapter)).toEqual(before);
    expect(await allRows(opened.adapter, 'SELECT * FROM cooks ORDER BY id')).toEqual(cooksBefore);
    expect(await allRows(opened.adapter, 'SELECT * FROM cook_events ORDER BY id')).toEqual(
      eventsBefore,
    );
    expect(await allRows(opened.adapter, 'SELECT * FROM tags ORDER BY id')).toEqual(tagsBefore);
    expect(
      await allRows(opened.adapter, 'SELECT * FROM cook_tags ORDER BY cook_id, tag_id'),
    ).toEqual(linksBefore);
    expect(await allRows(opened.adapter, 'SELECT * FROM lessons ORDER BY id')).toEqual(
      lessonsBefore,
    );
  });

  it('keeps every tag link, which is what a cascade would have taken', async () => {
    await runMigrations(opened.adapter);

    const links = await allRows(
      opened.adapter,
      'SELECT cook_id, tag_id FROM cook_tags ORDER BY cook_id, tag_id',
    );

    expect(links).toEqual([
      { cook_id: 'cook-open', tag_id: 'tag-ing' },
      { cook_id: 'cook-pork', tag_id: 'tag-dish' },
      { cook_id: 'cook-pork', tag_id: 'tag-kit' },
      { cook_id: 'cook-pork', tag_id: 'tag-tech' },
    ]);
  });

  it('leaves the foreign keys intact', async () => {
    await runMigrations(opened.adapter);

    // SQLite's own answer to "does every reference still point at a row".
    const violations = await allRows(opened.adapter, 'PRAGMA foreign_key_check');
    expect(violations).toEqual([]);
  });

  it('leaves exactly the controlled tables, and no holding table', async () => {
    await runMigrations(opened.adapter);

    expect([...(await listTables(opened.adapter))].sort()).toEqual([...SCHEMA_TABLES].sort());
  });

  it('keeps a reading exactly as version 1 wrote it', async () => {
    await runMigrations(opened.adapter);

    const rows = await allRows(
      opened.adapter,
      "SELECT meta FROM cook_events WHERE id = 'event-temp'",
    );

    // Byte for byte: no `readingKind` added, nothing reordered, nothing
    // rewritten. A reading already in the notebook reads as "it doesn't say".
    expect(rows[0]?.meta).toBe('{"celsius":62.5,"where":"thickest part"}');
  });

  it('keeps the verdict exactly as it was typed, whitespace and all', async () => {
    await runMigrations(opened.adapter);

    const rows = await allRows(
      opened.adapter,
      "SELECT verdict FROM cooks WHERE id = 'cook-pork'",
    );

    expect(rows[0]?.verdict).toBe('  Great crust.\nNeeded acid.  ');
  });
});

describe('what version 2 makes possible', () => {
  let opened: Opened;

  beforeEach(async () => {
    opened = await openAt('v2-rules.db', V1_ONLY);
    await fillVersionOne(opened.adapter);
    await runMigrations(opened.adapter);
  });

  afterEach(async () => {
    await opened.close();
  });

  it('accepts a tag with no kind', async () => {
    await opened.adapter.execute({
      sql: 'INSERT INTO tags (id, name, kind) VALUES (?, ?, NULL)',
      params: ['tag-free', 'brown butter'],
    });

    const rows = await allRows(opened.adapter, "SELECT kind FROM tags WHERE id = 'tag-free'");
    expect(rows[0]?.kind).toBeNull();
  });

  it('refuses a second untyped tag of the same name, whatever the case', async () => {
    await opened.adapter.execute({
      sql: 'INSERT INTO tags (id, name, kind) VALUES (?, ?, NULL)',
      params: ['tag-free', 'brown butter'],
    });

    // The partial index earns its keep here: NULLs compare distinct in an
    // ordinary unique index, so without it both of these would be stored.
    await expect(
      opened.adapter.execute({
        sql: 'INSERT INTO tags (id, name, kind) VALUES (?, ?, NULL)',
        params: ['tag-dup', 'brown butter'],
      }),
    ).rejects.toThrow();
    await expect(
      opened.adapter.execute({
        sql: 'INSERT INTO tags (id, name, kind) VALUES (?, ?, NULL)',
        params: ['tag-dup', 'Brown Butter'],
      }),
    ).rejects.toThrow();
  });

  it('still keeps a word in two namespaces as two tags', async () => {
    const rows = await allRows(
      opened.adapter,
      "SELECT kind FROM tags WHERE name = 'butter' ORDER BY kind",
    );

    expect(rows.map((row) => row.kind)).toEqual(['ingredient', 'technique']);
  });

  it('still refuses a second tag with the same name and kind', async () => {
    await expect(
      opened.adapter.execute({
        sql: "INSERT INTO tags (id, name, kind) VALUES ('tag-again', 'butter', 'ingredient')",
      }),
    ).rejects.toThrow();
  });

  it('still refuses a kind that is not one of the four', async () => {
    await expect(
      opened.adapter.execute({
        sql: "INSERT INTO tags (id, name, kind) VALUES ('tag-bad', 'wrong', 'outcome')",
      }),
    ).rejects.toThrow();
  });

  it('lets an untyped tag and a typed one share a name', async () => {
    await opened.adapter.execute({
      sql: "INSERT INTO tags (id, name, kind) VALUES ('tag-untyped-chops', 'pork chops', NULL)",
    });

    const rows = await allRows(
      opened.adapter,
      "SELECT id FROM tags WHERE name = 'pork chops' ORDER BY id",
    );
    expect(rows.map((row) => row.id)).toEqual(['tag-dish', 'tag-untyped-chops']);
  });

  it('reads an untyped tag back through the real repositories', async () => {
    const data = createSqliteDataLayer(opened.adapter, countingIds('new-tag'));

    const created = await data.tags.findOrCreate('  Brown   Butter ', null);
    expect(created).toEqual({ id: 'new-tag-01', name: 'brown butter', kind: null });

    // The second call finds the first rather than failing against the index,
    // which is only true because the lookup uses `kind IS ?`.
    const again = await data.tags.findOrCreate('brown butter', null);
    expect(again).toEqual(created);
    expect(await data.tags.findByNameAndKind('BROWN BUTTER', null)).toEqual(created);
  });
});

describe('a migration that fails changes nothing', () => {
  it('rolls the whole rebuild back and leaves the notebook at version 1', async () => {
    const opened = await openAt('v2-rollback.db', V1_ONLY);
    await fillVersionOne(opened.adapter);
    const before = await census(opened.adapter);
    const tagsBefore = await allRows(opened.adapter, 'SELECT * FROM tags ORDER BY id');
    const linksBefore = await allRows(
      opened.adapter,
      'SELECT * FROM cook_tags ORDER BY cook_id, tag_id',
    );

    // Version 2 with one statement broken at the end, after the drop and the
    // recreate. Anything less than a full rollback loses the tags.
    const broken: readonly Migration[] = [
      ...V1_ONLY,
      {
        version: 2,
        name: 'tags_without_a_kind',
        statements: [
          ...(MIGRATIONS.find((entry) => entry.version === 2)?.statements ?? []),
          'INSERT INTO tags (id, name, kind) VALUES (NULL, NULL, NULL)',
        ],
      },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toBeInstanceOf(MigrationError);

    expect((await readSchemaState(opened.adapter)).schemaVersion).toBe(1);
    expect(await census(opened.adapter)).toEqual(before);
    expect(await allRows(opened.adapter, 'SELECT * FROM tags ORDER BY id')).toEqual(tagsBefore);
    expect(
      await allRows(opened.adapter, 'SELECT * FROM cook_tags ORDER BY cook_id, tag_id'),
    ).toEqual(linksBefore);
    // The old table is back with its NOT NULL, because the drop rolled back too.
    await expect(
      opened.adapter.execute({
        sql: "INSERT INTO tags (id, name, kind) VALUES ('tag-free', 'brown butter', NULL)",
      }),
    ).rejects.toThrow();

    await opened.close();
  });

  it('reports the failure as a migration failure, so the app can explain it', async () => {
    const opened = await openAt('v2-reason.db', V1_ONLY);

    const broken: readonly Migration[] = [
      ...V1_ONLY,
      { version: 2, name: 'tags_without_a_kind', statements: ['DROP TABLE nothing_here'] },
    ];

    await expect(runMigrations(opened.adapter, broken)).rejects.toMatchObject({
      reason: 'migration_failed',
    });

    await opened.close();
  });
});

describe('a database already at version 2', () => {
  it('applies nothing the second time', async () => {
    const opened = await openAt('v2-idempotent.db', MIGRATIONS);

    const again = await runMigrations(opened.adapter);

    expect(again.applied).toEqual([]);
    expect(again.versionAfter).toBe(LATEST_SCHEMA_VERSION);

    await opened.close();
  });
});
