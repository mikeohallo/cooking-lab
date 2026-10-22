import { createHash } from 'crypto';

import {
  CONFIDENCE_LEVELS,
  COOK_EVENT_KINDS,
  COOK_STATUSES,
  CREATED_BY_VALUES,
  FINDING_CLASSES,
  IMPORT_BATCH_STATUSES,
  PROPOSAL_STATUSES,
  PROVENANCES,
  TAG_KINDS,
} from '../src/domain/enums';
import type { Migration } from '../src/data/schema/migrations';
import {
  CONNECTION_PRAGMAS,
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  SCHEMA_TABLES,
  SCHEMA_VERSION_KEY,
  findMigrationDefects,
  pendingMigrations,
} from '../src/data/schema/migrations';

const ALL_STATEMENTS = MIGRATIONS.flatMap((migration) => migration.statements);
const ALL_SQL = ALL_STATEMENTS.join('\n');

function statementsOf(version: number): readonly string[] {
  const migration = MIGRATIONS.find((entry) => entry.version === version);
  if (migration === undefined) {
    throw new Error(`no migration at version ${version}`);
  }
  return migration.statements;
}

const V1_STATEMENTS = statementsOf(1);
const V2_STATEMENTS = statementsOf(2);

/**
 * A `CREATE TABLE` for a table, out of one migration's statements.
 *
 * Takes the version rather than searching the whole list, because from version
 * 2 on there is more than one `CREATE TABLE tags` in the file and "the first
 * one" would quietly stop meaning what the caller intended.
 */
function createStatementIn(statements: readonly string[], table: string): string {
  const statement = statements.find((sql) => sql.startsWith(`CREATE TABLE ${table} (`));
  if (statement === undefined) {
    throw new Error(`no CREATE TABLE for ${table}`);
  }
  return statement;
}

function createStatementFor(table: string): string {
  return createStatementIn(V1_STATEMENTS, table);
}

/** The values a column's `CHECK (... IN (...))` constraint permits. */
function checkListIn(sql: string, column: string): readonly string[] {
  const match = new RegExp(`${column} IN \\(([^)]*)\\)`).exec(sql);
  const body = match?.[1];
  if (body === undefined) {
    throw new Error(`no CHECK list for ${column}`);
  }
  return body.split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
}

function checkListFor(table: string, column: string): readonly string[] {
  return checkListIn(createStatementFor(table), column);
}

/** The column names a `CREATE TABLE` declares, in order. */
function columnsIn(sql: string): readonly string[] {
  return sql
    .split('\n')
    .slice(1, -1)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('CHECK') && !line.startsWith('PRIMARY KEY'))
    .map((line) => line.split(/\s+/)[0] ?? '')
    .filter((name) => name !== '' && !name.startsWith('OR') && name === name.toLowerCase());
}

function columnsOf(table: string): readonly string[] {
  return columnsIn(createStatementFor(table));
}

/**
 * Version 1's text, pinned.
 *
 * Recomputed deliberately when version 1 is *meant* to change, which it never
 * is: it has run on a device and is history. See the test that uses it.
 */
const FROZEN_V1_DIGEST = '32a382a14384e3de56ebe3253ed06b382eca38b9fd0f8548378a0b88df956df8';
const FROZEN_V1_STATEMENT_COUNT = 28;

const migration = (version: number, statements: readonly string[] = ['CREATE TABLE t (a TEXT)']): Migration => ({
  version,
  name: `m${version}`,
  statements,
});

describe('migration list', () => {
  it('is well formed', () => {
    expect(findMigrationDefects()).toEqual([]);
  });

  it('starts at 1 and increases by one', () => {
    MIGRATIONS.forEach((entry, index) => {
      expect(entry.version).toBe(index + 1);
    });
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('is the two versions this build knows, in order and named', () => {
    expect(MIGRATIONS.map((migration) => [migration.version, migration.name])).toEqual([
      [1, 'local_foundation'],
      [2, 'tags_without_a_kind'],
    ]);
    expect(LATEST_SCHEMA_VERSION).toBe(2);
  });

  it('has not edited version 1, which has run on a device', () => {
    // The rule at the top of `migrations.ts`: a migration that has run is
    // history. Version 1 ran on 16 October 2026, so its text is pinned here by
    // digest — not to stop it being changed, which is impossible, but to make
    // changing it impossible to do quietly. A failure here is either a bug or a
    // decision that needs recording somewhere other than a diff.
    const digest = createHash('sha256').update(V1_STATEMENTS.join('\n')).digest('hex');

    expect(digest).toBe(FROZEN_V1_DIGEST);
    expect(V1_STATEMENTS).toHaveLength(FROZEN_V1_STATEMENT_COUNT);
  });

  it('catches a gap, a duplicate and a wrong order', () => {
    expect(findMigrationDefects([migration(1), migration(3)])).not.toEqual([]);
    expect(findMigrationDefects([migration(1), migration(1)])).not.toEqual([]);
    expect(findMigrationDefects([migration(2), migration(1)])).not.toEqual([]);
    expect(findMigrationDefects([migration(0)])).not.toEqual([]);
  });

  it('catches an empty migration and an empty statement', () => {
    expect(findMigrationDefects([migration(1, [])])).not.toEqual([]);
    expect(findMigrationDefects([migration(1, ['   '])])).not.toEqual([]);
  });

  it('refuses a statement ending in a semicolon, which may hide a second one', () => {
    const defects = findMigrationDefects([
      migration(1, ['CREATE TABLE t (a TEXT); DROP TABLE cooks;']),
    ]);

    expect(defects.map((defect) => defect.problem)).toContain(
      'statement must not end with a semicolon',
    );
  });
});

describe('pendingMigrations', () => {
  it('returns everything for a database that has never been migrated', () => {
    expect(pendingMigrations(0)).toHaveLength(MIGRATIONS.length);
  });

  it('returns nothing for a fully migrated database', () => {
    expect(pendingMigrations(LATEST_SCHEMA_VERSION)).toEqual([]);
  });

  it('returns nothing for a database written by a newer app', () => {
    expect(pendingMigrations(LATEST_SCHEMA_VERSION + 5)).toEqual([]);
  });

  it('sorts what it returns, whatever order it was given', () => {
    const versions = pendingMigrations(0, [migration(2), migration(1)]).map(
      (entry) => entry.version,
    );

    expect(versions).toEqual([1, 2]);
  });
});

describe('schema v1 columns', () => {
  it('creates every table the app expects, and no others', () => {
    for (const table of SCHEMA_TABLES) {
      expect(() => createStatementFor(table)).not.toThrow();
    }
    const created = V1_STATEMENTS.filter((sql) => sql.startsWith('CREATE TABLE '));
    expect(created).toHaveLength(SCHEMA_TABLES.length);
  });

  it.each([
    [
      'cooks',
      [
        'id',
        'title',
        'status',
        'provenance',
        'parent_cook_id',
        'started_at',
        'review_opened_at',
        'review_saved_at',
        'verdict',
        'created_at',
      ],
    ],
    ['cook_events', ['id', 'cook_id', 'ts', 'kind', 'body', 'meta', 'photo_path']],
    [
      'findings',
      [
        'id',
        'cook_id',
        'class',
        'text',
        'rationale',
        'confidence',
        'status',
        'created_by',
        'provenance',
        'created_at',
        'updated_at',
      ],
    ],
    ['finding_sources', ['finding_id', 'cook_event_id']],
    ['lessons', ['id', 'cook_id', 'text', 'status', 'provenance', 'created_at', 'updated_at']],
    ['tags', ['id', 'name', 'kind']],
    ['cook_tags', ['cook_id', 'tag_id']],
    ['briefings', ['id', 'cook_id', 'content', 'useful', 'created_at']],
    ['briefing_sources', ['briefing_id', 'cook_id']],
    [
      'import_batches',
      ['id', 'filename', 'status', 'candidates_total', 'candidates_resolved', 'created_at'],
    ],
    ['schema_meta', ['key', 'value']],
  ])('gives %s exactly the controlled columns', (table, expected) => {
    expect(columnsOf(table as string)).toEqual(expected as readonly string[]);
  });

  it('stamps the schema version into schema_meta', () => {
    expect(ALL_SQL).toContain(`'${SCHEMA_VERSION_KEY}'`);
    expect(ALL_SQL).toContain('INSERT INTO schema_meta');
  });

  it('turns foreign keys on, which SQLite does not do by itself', () => {
    expect(CONNECTION_PRAGMAS).toContain('PRAGMA foreign_keys = ON');
  });
});

describe('schema v1 checks', () => {
  // The CHECK lists are written out literally so a shipped migration's text
  // stays frozen. These assertions are what stop that literal text drifting
  // away from the vocabulary the app actually uses.
  it.each([
    ['cooks', 'status', COOK_STATUSES],
    ['cooks', 'provenance', PROVENANCES],
    ['cook_events', 'kind', COOK_EVENT_KINDS],
    ['findings', 'class', FINDING_CLASSES],
    ['findings', 'confidence', CONFIDENCE_LEVELS],
    ['findings', 'status', PROPOSAL_STATUSES],
    ['findings', 'created_by', CREATED_BY_VALUES],
    ['findings', 'provenance', PROVENANCES],
    ['lessons', 'status', PROPOSAL_STATUSES],
    ['lessons', 'provenance', PROVENANCES],
    ['tags', 'kind', TAG_KINDS],
    ['import_batches', 'status', IMPORT_BATCH_STATUSES],
  ])('constrains %s.%s to the domain vocabulary', (table, column, expected) => {
    expect(checkListFor(table as string, column as string)).toEqual([...(expected as readonly string[])]);
  });

  it('leaves the verdict free of any vocabulary at all', () => {
    const cooks = createStatementFor('cooks');

    // Nullable free text: no CHECK list, no default, no NOT NULL.
    expect(/^\s*verdict\s+TEXT,$/m.test(cooks)).toBe(true);
    expect(/verdict[^\n]*NOT NULL/.test(cooks)).toBe(false);
    expect(/verdict[^\n]*CHECK/.test(cooks)).toBe(false);
    expect(/verdict[^\n]*DEFAULT/.test(cooks)).toBe(false);
  });

  it('lets a confidence be absent, and constrains it when it is not', () => {
    expect(
      /confidence\s+TEXT\s+CHECK \(confidence IS NULL OR confidence IN \('low','medium','high'\)\)/.test(
        createStatementFor('findings'),
      ),
    ).toBe(true);
  });

  it('lets useful be true, false or unanswered', () => {
    expect(
      /useful\s+INTEGER\s+CHECK \(useful IS NULL OR useful IN \(0,1\)\)/.test(
        createStatementFor('briefings'),
      ),
    ).toBe(true);
  });

  it('gives a briefing no lifecycle column to be in', () => {
    const briefings = createStatementFor('briefings');

    expect(briefings).not.toContain('status');
    expect(briefings).not.toContain('issued');
  });

  it('gives an import batch a status and no origin', () => {
    const batches = createStatementFor('import_batches');

    expect(/^\s*status\s+TEXT NOT NULL$/m.test(batches)).toBe(true);
    expect(batches).not.toContain('origin');
  });

  it('holds a cook to being open or reviewed, consistently', () => {
    expect(createStatementFor('cooks')).toContain(
      "CHECK ((status = 'reviewed' AND review_saved_at IS NOT NULL)",
    );
  });

  it('refuses a cook that follows on from itself', () => {
    expect(createStatementFor('cooks')).toContain(
      'CHECK (parent_cook_id IS NULL OR parent_cook_id <> id)',
    );
  });

  it('keeps a photo reference on photo events alone', () => {
    expect(createStatementFor('cook_events')).toContain("CHECK ((kind =  'photo'");
  });
});

describe('schema v1 relationships', () => {
  it('points a finding source at a timeline entry and nothing else', () => {
    const sources = createStatementFor('finding_sources');

    expect(sources).toContain('REFERENCES cook_events(id) ON DELETE CASCADE');
    expect(sources).toContain('REFERENCES findings(id) ON DELETE CASCADE');
    expect(sources).toContain('PRIMARY KEY (finding_id, cook_event_id)');
    expect(sources).not.toContain('REFERENCES cooks(id)');
  });

  it('points a briefing source at a cook and nothing else', () => {
    const sources = createStatementFor('briefing_sources');

    expect(sources).toContain('REFERENCES cooks(id) ON DELETE CASCADE');
    expect(sources).toContain('REFERENCES briefings(id) ON DELETE CASCADE');
    expect(sources).toContain('PRIMARY KEY (briefing_id, cook_id)');
    expect(sources).not.toContain('REFERENCES findings(id)');
    expect(sources).not.toContain('REFERENCES lessons(id)');
  });

  it('cascades every child row from the cook it belongs to', () => {
    for (const table of ['cook_events', 'findings', 'lessons', 'cook_tags', 'briefings']) {
      expect(createStatementFor(table)).toContain('REFERENCES cooks(id) ON DELETE CASCADE');
    }
  });

  it('keeps a cook when the cook it followed on from is deleted', () => {
    expect(createStatementFor('cooks')).toContain(
      'REFERENCES cooks(id) ON DELETE SET NULL',
    );
  });

  it('makes a tag unique by name and kind, case-insensitively', () => {
    expect(ALL_SQL).toContain(
      'CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)',
    );
  });

  it('makes each junction row unique', () => {
    expect(createStatementFor('cook_tags')).toContain('PRIMARY KEY (cook_id, tag_id)');
    expect(createStatementFor('finding_sources')).toContain('PRIMARY KEY (finding_id, cook_event_id)');
    expect(createStatementFor('briefing_sources')).toContain('PRIMARY KEY (briefing_id, cook_id)');
  });

  it('indexes the columns the app reads by', () => {
    for (const index of [
      'ix_cooks_started_at',
      'ix_cook_events_cook_ts',
      'ix_findings_cook',
      'ix_findings_status',
      'ix_lessons_status',
      'ix_cook_tags_tag',
      'ix_briefings_cook',
    ]) {
      expect(ALL_SQL).toContain(index);
    }
  });
});

describe('schema v2 — a tag no longer has to have a kind', () => {
  const tags = createStatementIn(V2_STATEMENTS, 'tags');

  it('keeps the three columns and makes the kind nullable', () => {
    expect(columnsIn(tags)).toEqual(['id', 'name', 'kind']);
    // No NOT NULL on `kind`, which is the whole migration.
    expect(/kind\s+TEXT\s+CHECK/.test(tags)).toBe(true);
    expect(/kind[^\n]*NOT NULL/.test(tags)).toBe(false);
  });

  it('still constrains a kind that is present to the domain vocabulary', () => {
    expect(checkListIn(tags, 'kind')).toEqual([...TAG_KINDS]);
    expect(tags).toContain('CHECK (kind IS NULL OR kind IN (');
  });

  it('keeps (name, kind) unique and makes an untyped name unique on its own', () => {
    const sql = V2_STATEMENTS.join('\n');

    expect(sql).toContain(
      'CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)',
    );
    // NULLs compare distinct in a SQLite unique index, so without this partial
    // index "brown butter" could be stored twice over.
    expect(sql).toContain('CREATE UNIQUE INDEX ux_tags_name_untyped ON tags (name COLLATE NOCASE)');
    expect(sql).toContain('WHERE kind IS NULL');
  });

  it('carries the rows across by hand rather than letting a cascade take them', () => {
    const sql = V2_STATEMENTS.join('\n');

    // `cook_tags` references `tags` with ON DELETE CASCADE, so dropping `tags`
    // with foreign keys on would delete every cook's tags. The rows go into a
    // holding table first and come back at the end.
    expect(sql).toContain('CREATE TABLE cook_tags_rebuild');
    expect(sql).toContain('INSERT INTO cook_tags_rebuild');
    expect(sql).toContain('INSERT INTO cook_tags (cook_id, tag_id)');
    expect(sql).toContain('DROP TABLE cook_tags_rebuild');
    expect(sql).toContain('DROP TABLE tags_rebuild');
  });

  it('empties cook_tags deliberately before the drop, not as a side effect', () => {
    const order = V2_STATEMENTS.map((sql) => sql.split('\n')[0] ?? '');
    const emptied = order.findIndex((line) => line.startsWith('DELETE FROM cook_tags'));
    const dropped = order.findIndex((line) => line === 'DROP TABLE tags');
    const saved = order.findIndex((line) => line.startsWith('INSERT INTO cook_tags_rebuild'));

    expect(saved).toBeGreaterThanOrEqual(0);
    expect(emptied).toBeGreaterThan(saved);
    expect(dropped).toBeGreaterThan(emptied);
  });

  it('does not rename a table, which would rewrite another table’s references', () => {
    // With foreign keys on, `ALTER TABLE ... RENAME` rewrites REFERENCES
    // clauses elsewhere in the schema. The new `tags` is created under its
    // final name instead.
    expect(V2_STATEMENTS.join('\n')).not.toContain('ALTER TABLE');
  });

  it('does not reach for a pragma a transaction would ignore', () => {
    // A migration runs inside one transaction and SQLite ignores
    // `PRAGMA foreign_keys` there. A migration that turned foreign keys off
    // would be doing nothing while looking like it had.
    expect(V2_STATEMENTS.join('\n')).not.toContain('PRAGMA');
  });

  it('stamps version 2', () => {
    expect(V2_STATEMENTS.join('\n')).toContain(`VALUES ('${SCHEMA_VERSION_KEY}', '2')`);
  });

  it('leaves no holding table in the finished schema', () => {
    const created = V2_STATEMENTS.filter((sql) => sql.startsWith('CREATE TABLE ')).map(
      (sql) => sql.split(' ')[2] ?? '',
    );
    const dropped = V2_STATEMENTS.filter((sql) => sql.startsWith('DROP TABLE ')).map(
      (sql) => sql.split(' ')[2] ?? '',
    );

    for (const table of created) {
      if (!SCHEMA_TABLES.includes(table)) {
        expect(dropped).toContain(table);
      }
    }
  });
});

describe('the schema contains no rejected concept', () => {
  // Cooking Lab is one kitchen on one device. A column implying an account, a
  // tenant or a server would be a product decision, not a schema detail.
  it.each(['user_id', 'owner_id', 'account', 'auth', 'rls', 'policy', 'tenant', 'sync', 'remote_id'])(
    'contains no %s concept',
    (token) => {
      expect(ALL_SQL.toLowerCase()).not.toContain(token);
    },
  );

  // Concepts tried in the unaccepted foundation and rejected by Build Control.
  it.each([
    'evidence_strength',
    'unsupported',
    'corroborated',
    'contradicts',
    'source_relation',
    'source_kind',
    'user_edited',
    'decided_at',
    'reinstate',
    'finished_at',
    'in_progress',
    'abandoned',
    'unrated',
    'verdict_note',
    'origin_finding_id',
    'synthetic_fixture',
    'backup_restore',
    'hidden',
    'memory',
  ])('contains no %s', (token) => {
    expect(ALL_SQL.toLowerCase()).not.toContain(token);
  });
});
