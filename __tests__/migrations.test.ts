import {
  BRIEFING_SOURCE_KINDS,
  BRIEFING_STATUSES,
  COOK_EVENT_KINDS,
  COOK_STATUSES,
  COOK_VERDICTS,
  EVIDENCE_STRENGTHS,
  IMPORT_BATCH_ORIGINS,
  IMPORT_BATCH_STATUSES,
  PROVENANCES,
  REVIEW_STATUSES,
  SOURCE_RELATIONS,
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

function createStatementFor(table: string): string {
  const statement = ALL_STATEMENTS.find((sql) => sql.startsWith(`CREATE TABLE ${table} (`));
  if (statement === undefined) {
    throw new Error(`no CREATE TABLE for ${table}`);
  }
  return statement;
}

/** The values a column's `CHECK (... IN (...))` constraint permits. */
function checkListFor(table: string, column: string): readonly string[] {
  const sql = createStatementFor(table);
  const match = new RegExp(`${column} IN \\(([^)]*)\\)`).exec(sql);
  const body = match?.[1];
  if (body === undefined) {
    throw new Error(`no CHECK list for ${table}.${column}`);
  }
  return body.split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
}

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

describe('schema content', () => {
  it('creates every table the app expects', () => {
    for (const table of SCHEMA_TABLES) {
      expect(() => createStatementFor(table)).not.toThrow();
    }
  });

  it('stamps the schema version into schema_meta', () => {
    expect(ALL_SQL).toContain(`'${SCHEMA_VERSION_KEY}'`);
    expect(ALL_SQL).toContain('INSERT INTO schema_meta');
  });

  it('turns foreign keys on, which SQLite does not do by itself', () => {
    expect(CONNECTION_PRAGMAS).toContain('PRAGMA foreign_keys = ON');
  });

  // The CHECK lists are written out literally so a shipped migration's text
  // stays frozen. These assertions are what stop that literal text drifting
  // away from the vocabulary the app actually uses.
  it.each([
    ['cooks', 'status', COOK_STATUSES],
    ['cooks', 'verdict', COOK_VERDICTS],
    ['cook_events', 'kind', COOK_EVENT_KINDS],
    ['findings', 'status', REVIEW_STATUSES],
    ['findings', 'created_by', PROVENANCES],
    ['findings', 'evidence_strength', EVIDENCE_STRENGTHS],
    ['finding_sources', 'relation', SOURCE_RELATIONS],
    ['lessons', 'status', REVIEW_STATUSES],
    ['tags', 'kind', TAG_KINDS],
    ['briefings', 'status', BRIEFING_STATUSES],
    ['briefing_sources', 'source_kind', BRIEFING_SOURCE_KINDS],
    ['import_batches', 'status', IMPORT_BATCH_STATUSES],
    ['import_batches', 'origin', IMPORT_BATCH_ORIGINS],
  ])('constrains %s.%s to the domain vocabulary', (table, column, expected) => {
    expect(checkListFor(table as string, column as string)).toEqual([...(expected as readonly string[])]);
  });

  it('cascades every child row from the cook it belongs to', () => {
    expect(createStatementFor('cook_events')).toContain(
      'REFERENCES cooks(id) ON DELETE CASCADE',
    );
    expect(createStatementFor('cook_tags')).toContain('REFERENCES cooks(id) ON DELETE CASCADE');
    expect(createStatementFor('finding_sources')).toContain(
      'REFERENCES cooks(id) ON DELETE CASCADE',
    );
    expect(createStatementFor('finding_sources')).toContain(
      'REFERENCES cook_events(id) ON DELETE CASCADE',
    );
  });

  it('cascades citations from the finding and the briefing they belong to', () => {
    expect(createStatementFor('finding_sources')).toContain(
      'REFERENCES findings(id) ON DELETE CASCADE',
    );
    expect(createStatementFor('briefing_sources')).toContain(
      'REFERENCES briefings(id) ON DELETE CASCADE',
    );
  });

  it('keeps a lesson when the finding it came from is deleted', () => {
    // A lesson the cook approved is theirs. Losing the finding it generalised
    // must not take the lesson with it.
    expect(createStatementFor('lessons')).toContain(
      'REFERENCES findings(id) ON DELETE SET NULL',
    );
  });

  it('makes a tag unique by name and kind, case-insensitively', () => {
    expect(ALL_SQL).toContain(
      'CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)',
    );
  });

  it('makes each junction row unique', () => {
    expect(ALL_SQL).toContain('CREATE UNIQUE INDEX ux_finding_sources_link');
    expect(ALL_SQL).toContain('CREATE UNIQUE INDEX ux_briefing_sources_link');
    expect(createStatementFor('cook_tags')).toContain('PRIMARY KEY (cook_id, tag_id)');
  });

  it('indexes the columns the app reads by', () => {
    for (const index of [
      'ix_cooks_started_at',
      'ix_cook_events_cook_time',
      'ix_findings_status',
      'ix_lessons_status',
      'ix_cook_tags_tag',
      'ix_briefings_cook',
    ]) {
      expect(ALL_SQL).toContain(index);
    }
  });

  it('lets SQLite enforce the source-kind exclusivity the domain also checks', () => {
    expect(createStatementFor('finding_sources')).toContain('CHECK ((source_kind =');
    expect(createStatementFor('briefing_sources')).toContain('CHECK ((source_kind =');
  });

  // Cooking Lab is one kitchen on one device. A column implying an account, a
  // tenant or a server would be a product decision, not a schema detail.
  it.each(['user_id', 'owner_id', 'account', 'auth', 'rls', 'policy', 'tenant', 'sync', 'remote_id'])(
    'contains no %s concept',
    (token) => {
      expect(ALL_SQL.toLowerCase()).not.toContain(token);
    },
  );
});
