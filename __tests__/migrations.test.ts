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

/** The column names a `CREATE TABLE` declares, in order. */
function columnsOf(table: string): readonly string[] {
  return createStatementFor(table)
    .split('\n')
    .slice(1, -1)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('CHECK') && !line.startsWith('PRIMARY KEY'))
    .map((line) => line.split(/\s+/)[0] ?? '')
    .filter((name) => name !== '' && !name.startsWith('OR') && name === name.toLowerCase());
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

  it('is still a single version, corrected in place rather than patched by a second', () => {
    // No device has ever run version 1, so there is no history to preserve and
    // nothing for a compatibility migration to be compatible with.
    expect(MIGRATIONS).toHaveLength(1);
    expect(LATEST_SCHEMA_VERSION).toBe(1);
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
    const created = ALL_STATEMENTS.filter((sql) => sql.startsWith('CREATE TABLE '));
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
