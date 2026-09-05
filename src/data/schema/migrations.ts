/**
 * The Cooking Lab SQLite schema, as versioned migrations.
 *
 * This module is pure text. It imports nothing from `expo-sqlite` and executes
 * nothing; it is the description of a database, not a connection to one. The
 * adapter that runs these statements is deferred (`src/data/adapters.ts`), so
 * the schema can be reviewed, diffed and tested long before any native module
 * is installed.
 *
 * RULES FOR CHANGING THIS FILE
 * ---------------------------
 * A migration that has run on a device is history and cannot be edited. Once
 * version 1 ships, a change to the schema is a *new* entry in `MIGRATIONS` with
 * the next version number. That is why the SQL below is written out literally
 * instead of being generated from the enums in `src/domain/enums.ts`: generated
 * SQL would silently rewrite history the moment a vocabulary changed.
 * `__tests__/migrations.test.ts` cross-checks the literal `CHECK` lists against
 * those enums, so drift is caught rather than assumed away.
 *
 * WHAT THE SCHEMA DOES NOT CONTAIN
 * --------------------------------
 * No user, owner or account column; no row-level security; no sync, replication
 * or conflict columns; no remote identifiers. One kitchen, one device, one file.
 */

/** Statements a connection must run before touching data. */
export const CONNECTION_PRAGMAS: readonly string[] = [
  // SQLite defaults foreign keys OFF, per connection. Every cascade below is
  // inert without this, so the adapter runs it on open, every time.
  'PRAGMA foreign_keys = ON',
  // Journal mode is durable across connections but set here so a fresh database
  // is created with it rather than inheriting the rollback journal default.
  'PRAGMA journal_mode = WAL',
];

export type Migration = {
  /** Strictly increasing from 1, with no gaps. */
  readonly version: number;
  /** Short, stable description; part of the migration's identity in review. */
  readonly name: string;
  /** Executed in order, inside one transaction, by the migration runner. */
  readonly statements: readonly string[];
};

/** The `schema_meta` key holding the applied schema version. */
export const SCHEMA_VERSION_KEY = 'schema_version';
/** The `schema_meta` key holding when that version was applied. */
export const SCHEMA_APPLIED_AT_KEY = 'schema_applied_at';

const V1_CREATE_COOKS = `
CREATE TABLE cooks (
  id            TEXT PRIMARY KEY NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL
                CHECK (status IN ('planned','in_progress','complete','abandoned')),
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  verdict       TEXT NOT NULL DEFAULT 'unrated'
                CHECK (verdict IN ('unrated','failed','poor','acceptable','good','excellent')),
  verdict_note  TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
)`.trim();

const V1_CREATE_COOK_EVENTS = `
CREATE TABLE cook_events (
  id             TEXT PRIMARY KEY NOT NULL,
  cook_id        TEXT NOT NULL
                 REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind           TEXT NOT NULL
                 CHECK (kind IN ('note','observation','temperature','timing','step','adjustment','taste','photo')),
  occurred_at    TEXT NOT NULL,
  offset_seconds INTEGER,
  label          TEXT,
  text           TEXT,
  numeric_value  REAL,
  unit           TEXT,
  photo_path     TEXT,
  created_at     TEXT NOT NULL,
  CHECK ((kind =  'photo' AND photo_path IS NOT NULL)
      OR (kind <> 'photo' AND photo_path IS NULL))
)`.trim();

const V1_CREATE_FINDINGS = `
CREATE TABLE findings (
  id                TEXT PRIMARY KEY NOT NULL,
  title             TEXT NOT NULL,
  detail            TEXT,
  status            TEXT NOT NULL
                    CHECK (status IN ('proposed','approved','rejected')),
  created_by        TEXT NOT NULL CHECK (created_by IN ('user','ai')),
  user_edited       INTEGER NOT NULL DEFAULT 0 CHECK (user_edited IN (0,1)),
  evidence_strength TEXT NOT NULL
                    CHECK (evidence_strength IN ('unsupported','single','corroborated','strong')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  decided_at        TEXT,
  CHECK ((status =  'proposed' AND decided_at IS NULL)
      OR (status <> 'proposed' AND decided_at IS NOT NULL))
)`.trim();

// One nullable foreign key per source kind rather than a single polymorphic
// column: this is what lets SQLite prove the citation points at a row that
// exists and delete the citation when that row goes.
const V1_CREATE_FINDING_SOURCES = `
CREATE TABLE finding_sources (
  finding_id    TEXT NOT NULL
                REFERENCES findings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  source_kind   TEXT NOT NULL CHECK (source_kind IN ('cook','cook_event')),
  cook_id       TEXT REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  cook_event_id TEXT REFERENCES cook_events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  relation      TEXT NOT NULL CHECK (relation IN ('supports','contradicts')),
  created_at    TEXT NOT NULL,
  CHECK ((source_kind = 'cook'       AND cook_id IS NOT NULL AND cook_event_id IS NULL)
      OR (source_kind = 'cook_event' AND cook_event_id IS NOT NULL AND cook_id IS NULL))
)`.trim();

// A composite PRIMARY KEY cannot be used here: in SQLite the columns of a
// non-INTEGER primary key may be NULL and NULLs compare distinct, so the pair
// would not actually be unique. COALESCE in a unique index does the job.
const V1_INDEX_FINDING_SOURCES_UNIQUE = `
CREATE UNIQUE INDEX ux_finding_sources_link
  ON finding_sources (finding_id, source_kind, COALESCE(cook_id,''), COALESCE(cook_event_id,''))`.trim();

const V1_CREATE_LESSONS = `
CREATE TABLE lessons (
  id                TEXT PRIMARY KEY NOT NULL,
  title             TEXT NOT NULL,
  guidance          TEXT NOT NULL,
  status            TEXT NOT NULL
                    CHECK (status IN ('proposed','approved','rejected')),
  created_by        TEXT NOT NULL CHECK (created_by IN ('user','ai')),
  user_edited       INTEGER NOT NULL DEFAULT 0 CHECK (user_edited IN (0,1)),
  origin_finding_id TEXT
                    REFERENCES findings(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  decided_at        TEXT,
  CHECK ((status =  'proposed' AND decided_at IS NULL)
      OR (status <> 'proposed' AND decided_at IS NOT NULL))
)`.trim();

const V1_CREATE_TAGS = `
CREATE TABLE tags (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL
             CHECK (kind IN ('ingredient','technique','equipment','dish','outcome','free')),
  created_at TEXT NOT NULL
)`.trim();

// Names are stored normalised by the domain layer; NOCASE is the second line of
// defence so "Brown Butter" can never become a second "brown butter".
const V1_INDEX_TAGS_UNIQUE = `
CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)`.trim();

const V1_CREATE_COOK_TAGS = `
CREATE TABLE cook_tags (
  cook_id    TEXT NOT NULL REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cook_id, tag_id)
)`.trim();

const V1_CREATE_BRIEFINGS = `
CREATE TABLE briefings (
  id         TEXT PRIMARY KEY NOT NULL,
  cook_id    TEXT REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('draft','issued','dismissed')),
  created_by TEXT NOT NULL CHECK (created_by IN ('user','ai')),
  created_at TEXT NOT NULL,
  issued_at  TEXT,
  CHECK (status <> 'issued' OR issued_at IS NOT NULL)
)`.trim();

const V1_CREATE_BRIEFING_SOURCES = `
CREATE TABLE briefing_sources (
  briefing_id TEXT NOT NULL
              REFERENCES briefings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('finding','lesson','cook')),
  finding_id  TEXT REFERENCES findings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  lesson_id   TEXT REFERENCES lessons(id)  ON DELETE CASCADE ON UPDATE CASCADE,
  cook_id     TEXT REFERENCES cooks(id)    ON DELETE CASCADE ON UPDATE CASCADE,
  created_at  TEXT NOT NULL,
  CHECK ((source_kind = 'finding' AND finding_id IS NOT NULL AND lesson_id IS NULL AND cook_id IS NULL)
      OR (source_kind = 'lesson'  AND lesson_id  IS NOT NULL AND finding_id IS NULL AND cook_id IS NULL)
      OR (source_kind = 'cook'    AND cook_id    IS NOT NULL AND finding_id IS NULL AND lesson_id IS NULL))
)`.trim();

const V1_INDEX_BRIEFING_SOURCES_UNIQUE = `
CREATE UNIQUE INDEX ux_briefing_sources_link
  ON briefing_sources (briefing_id, source_kind, COALESCE(finding_id,''), COALESCE(lesson_id,''), COALESCE(cook_id,''))`.trim();

const V1_CREATE_IMPORT_BATCHES = `
CREATE TABLE import_batches (
  id           TEXT PRIMARY KEY NOT NULL,
  origin       TEXT NOT NULL CHECK (origin IN ('backup_restore','synthetic_fixture')),
  status       TEXT NOT NULL CHECK (status IN ('pending','applied','rejected','failed')),
  label        TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  note         TEXT,
  CHECK ((status =  'pending' AND completed_at IS NULL)
      OR (status <> 'pending' AND completed_at IS NOT NULL))
)`.trim();

const V1_CREATE_SCHEMA_META = `
CREATE TABLE schema_meta (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`.trim();

const V1_INDEXES: readonly string[] = [
  'CREATE INDEX ix_cooks_started_at ON cooks (started_at DESC)',
  'CREATE INDEX ix_cooks_status ON cooks (status)',
  'CREATE INDEX ix_cook_events_cook_time ON cook_events (cook_id, occurred_at)',
  'CREATE INDEX ix_cook_events_kind ON cook_events (kind)',
  'CREATE INDEX ix_findings_status ON findings (status)',
  'CREATE INDEX ix_finding_sources_cook ON finding_sources (cook_id)',
  'CREATE INDEX ix_finding_sources_cook_event ON finding_sources (cook_event_id)',
  'CREATE INDEX ix_lessons_status ON lessons (status)',
  'CREATE INDEX ix_lessons_origin_finding ON lessons (origin_finding_id)',
  'CREATE INDEX ix_cook_tags_tag ON cook_tags (tag_id)',
  'CREATE INDEX ix_briefings_cook ON briefings (cook_id)',
  'CREATE INDEX ix_briefing_sources_finding ON briefing_sources (finding_id)',
  'CREATE INDEX ix_briefing_sources_lesson ON briefing_sources (lesson_id)',
  'CREATE INDEX ix_briefing_sources_cook ON briefing_sources (cook_id)',
  'CREATE INDEX ix_import_batches_status ON import_batches (status)',
];

/**
 * The stamp written at the end of every migration.
 *
 * `strftime` rather than a bound parameter so a migration is a self-contained
 * piece of SQL text with no runtime inputs to get wrong.
 */
const V1_STAMP_SCHEMA_VERSION = `
INSERT INTO schema_meta (key, value, updated_at)
VALUES ('${SCHEMA_VERSION_KEY}', '1', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`.trim();

const V1_STAMP_APPLIED_AT = `
INSERT INTO schema_meta (key, value, updated_at)
VALUES ('${SCHEMA_APPLIED_AT_KEY}', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`.trim();

/**
 * Every migration, in order.
 *
 * Version 1 is the whole M1 local schema: raw evidence (`cooks`,
 * `cook_events`), reviewed claims (`findings`, `lessons`) with their evidence
 * junctions, tagging, briefings with their source junction, import bookkeeping
 * and the schema metadata table.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'local_foundation',
    statements: [
      V1_CREATE_SCHEMA_META,
      V1_CREATE_COOKS,
      V1_CREATE_COOK_EVENTS,
      V1_CREATE_FINDINGS,
      V1_CREATE_FINDING_SOURCES,
      V1_CREATE_LESSONS,
      V1_CREATE_TAGS,
      V1_CREATE_COOK_TAGS,
      V1_CREATE_BRIEFINGS,
      V1_CREATE_BRIEFING_SOURCES,
      V1_CREATE_IMPORT_BATCHES,
      V1_INDEX_FINDING_SOURCES_UNIQUE,
      V1_INDEX_TAGS_UNIQUE,
      V1_INDEX_BRIEFING_SOURCES_UNIQUE,
      ...V1_INDEXES,
      V1_STAMP_SCHEMA_VERSION,
      V1_STAMP_APPLIED_AT,
    ],
  },
];

/** The version a fully migrated database reports. */
export const LATEST_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);

/** Tables the schema is expected to contain, for verification after migrating. */
export const SCHEMA_TABLES: readonly string[] = [
  'schema_meta',
  'cooks',
  'cook_events',
  'findings',
  'finding_sources',
  'lessons',
  'tags',
  'cook_tags',
  'briefings',
  'briefing_sources',
  'import_batches',
];

export type MigrationDefect = {
  readonly version: number | null;
  readonly problem: string;
};

/**
 * Check a migration list is safe to run.
 *
 * Called by the migration runner before it opens a transaction, and by the test
 * suite against `MIGRATIONS`. A list that starts anywhere but 1, skips a number,
 * repeats one or arrives out of order is a bug that would leave databases in
 * different states on different devices, so it is refused rather than repaired.
 */
export function findMigrationDefects(
  migrations: readonly Migration[] = MIGRATIONS,
): readonly MigrationDefect[] {
  const defects: MigrationDefect[] = [];
  const seen = new Set<number>();

  migrations.forEach((migration, index) => {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      defects.push({ version: migration.version, problem: 'version must be an integer from 1' });
    }
    if (seen.has(migration.version)) {
      defects.push({ version: migration.version, problem: 'duplicate version' });
    }
    seen.add(migration.version);
    if (migration.version !== index + 1) {
      defects.push({
        version: migration.version,
        problem: `expected version ${index + 1} at position ${index}`,
      });
    }
    if (migration.name.trim() === '') {
      defects.push({ version: migration.version, problem: 'migration must be named' });
    }
    if (migration.statements.length === 0) {
      defects.push({ version: migration.version, problem: 'migration has no statements' });
    }
    for (const statement of migration.statements) {
      if (statement.trim() === '') {
        defects.push({ version: migration.version, problem: 'empty statement' });
      }
      if (statement.trim().endsWith(';')) {
        // Statements are executed one at a time; a trailing semicolon is the
        // shape of a file that was pasted in and may hide a second statement.
        defects.push({
          version: migration.version,
          problem: 'statement must not end with a semicolon',
        });
      }
    }
  });

  return defects;
}

/**
 * The migrations still to run against a database at `currentVersion`.
 *
 * `currentVersion` is 0 for a database that has never been migrated. A version
 * from the future returns nothing: a newer app has been here, and this build
 * must not attempt to reason about a schema it does not know.
 */
export function pendingMigrations(
  currentVersion: number,
  migrations: readonly Migration[] = MIGRATIONS,
): readonly Migration[] {
  return migrations
    .filter((migration) => migration.version > currentVersion)
    .slice()
    .sort((left, right) => left.version - right.version);
}
