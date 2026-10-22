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
 * Version 1 ran on a device on 16 October 2026 and holds a real kitchen's
 * history. Its text is frozen from here on; version 2 below is a new entry, as
 * the rule requires, and the first one.
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

// A cook is open until it has been reviewed, and `parent_cook_id` is how a
// second attempt at the same dish points back at the first. `verdict` is free
// text with no CHECK constraint on purpose: it is whatever the cook typed.
const V1_CREATE_COOKS = `
CREATE TABLE cooks (
  id               TEXT PRIMARY KEY NOT NULL,
  title            TEXT,
  status           TEXT NOT NULL CHECK (status IN ('open','reviewed')),
  provenance       TEXT NOT NULL CHECK (provenance IN ('live','imported')),
  parent_cook_id   TEXT REFERENCES cooks(id) ON DELETE SET NULL ON UPDATE CASCADE,
  started_at       TEXT NOT NULL,
  review_opened_at TEXT,
  review_saved_at  TEXT,
  verdict          TEXT,
  created_at       TEXT NOT NULL,
  CHECK (parent_cook_id IS NULL OR parent_cook_id <> id),
  CHECK ((status = 'reviewed' AND review_saved_at IS NOT NULL)
      OR (status = 'open'     AND review_saved_at IS NULL))
)`.trim();

// `meta` holds JSON. A temperature lives in it as `{"celsius": 96}`; there is
// no unit column because there is only one unit.
const V1_CREATE_COOK_EVENTS = `
CREATE TABLE cook_events (
  id         TEXT PRIMARY KEY NOT NULL,
  cook_id    TEXT NOT NULL
             REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ts         TEXT NOT NULL,
  kind       TEXT NOT NULL
             CHECK (kind IN ('user_note','assistant_msg','temp','photo','plan')),
  body       TEXT,
  meta       TEXT,
  photo_path TEXT,
  CHECK ((kind =  'photo' AND photo_path IS NOT NULL)
      OR (kind <> 'photo' AND photo_path IS NULL))
)`.trim();

const V1_CREATE_FINDINGS = `
CREATE TABLE findings (
  id         TEXT PRIMARY KEY NOT NULL,
  cook_id    TEXT NOT NULL
             REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  class      TEXT NOT NULL CHECK (class IN ('observed','inference','knowledge')),
  text       TEXT NOT NULL,
  rationale  TEXT,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('low','medium','high')),
  status     TEXT NOT NULL CHECK (status IN ('proposed','approved','rejected')),
  created_by TEXT NOT NULL CHECK (created_by IN ('ai','user')),
  provenance TEXT NOT NULL CHECK (provenance IN ('live','imported')),
  created_at TEXT NOT NULL,
  updated_at TEXT
)`.trim();

// A finding cites timeline entries and nothing else. Both columns are NOT NULL,
// so the composite primary key is genuinely unique — in SQLite the columns of a
// non-INTEGER primary key may otherwise be NULL, and NULLs compare distinct.
const V1_CREATE_FINDING_SOURCES = `
CREATE TABLE finding_sources (
  finding_id    TEXT NOT NULL
                REFERENCES findings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  cook_event_id TEXT NOT NULL
                REFERENCES cook_events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (finding_id, cook_event_id)
)`.trim();

const V1_CREATE_LESSONS = `
CREATE TABLE lessons (
  id         TEXT PRIMARY KEY NOT NULL,
  cook_id    TEXT NOT NULL
             REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  text       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('proposed','approved','rejected')),
  provenance TEXT NOT NULL CHECK (provenance IN ('live','imported')),
  created_at TEXT NOT NULL,
  updated_at TEXT
)`.trim();

const V1_CREATE_TAGS = `
CREATE TABLE tags (
  id   TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('dish','ingredient','technique','equipment'))
)`.trim();

// Names are stored normalised by the domain layer; NOCASE is the second line of
// defence so "Brown Butter" can never become a second "brown butter".
const V1_INDEX_TAGS_UNIQUE = `
CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)`.trim();

const V1_CREATE_COOK_TAGS = `
CREATE TABLE cook_tags (
  cook_id TEXT NOT NULL REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (cook_id, tag_id)
)`.trim();

// `useful` is nullable, and the three states are yes, no and not yet said.
// `content` holds JSON. There is no lifecycle column: a briefing is prepared
// for one cook and either helped or did not.
const V1_CREATE_BRIEFINGS = `
CREATE TABLE briefings (
  id         TEXT PRIMARY KEY NOT NULL,
  cook_id    TEXT NOT NULL
             REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  content    TEXT NOT NULL,
  useful     INTEGER CHECK (useful IS NULL OR useful IN (0,1)),
  created_at TEXT NOT NULL
)`.trim();

const V1_CREATE_BRIEFING_SOURCES = `
CREATE TABLE briefing_sources (
  briefing_id TEXT NOT NULL
              REFERENCES briefings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  cook_id     TEXT NOT NULL
              REFERENCES cooks(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (briefing_id, cook_id)
)`.trim();

const V1_CREATE_IMPORT_BATCHES = `
CREATE TABLE import_batches (
  id                  TEXT PRIMARY KEY NOT NULL,
  filename            TEXT,
  status              TEXT NOT NULL
                      CHECK (status IN ('processing','ready','done','failed')),
  candidates_total    INTEGER CHECK (candidates_total IS NULL OR candidates_total >= 0),
  candidates_resolved INTEGER
                      CHECK (candidates_resolved IS NULL OR candidates_resolved >= 0),
  created_at          TEXT NOT NULL
)`.trim();

const V1_CREATE_SCHEMA_META = `
CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
)`.trim();

const V1_INDEXES: readonly string[] = [
  'CREATE INDEX ix_cooks_started_at ON cooks (started_at DESC)',
  'CREATE INDEX ix_cooks_status ON cooks (status)',
  'CREATE INDEX ix_cooks_parent ON cooks (parent_cook_id)',
  'CREATE INDEX ix_cook_events_cook_ts ON cook_events (cook_id, ts)',
  'CREATE INDEX ix_cook_events_kind ON cook_events (kind)',
  'CREATE INDEX ix_findings_cook ON findings (cook_id)',
  'CREATE INDEX ix_findings_status ON findings (status)',
  'CREATE INDEX ix_finding_sources_event ON finding_sources (cook_event_id)',
  'CREATE INDEX ix_lessons_cook ON lessons (cook_id)',
  'CREATE INDEX ix_lessons_status ON lessons (status)',
  'CREATE INDEX ix_cook_tags_tag ON cook_tags (tag_id)',
  'CREATE INDEX ix_briefings_cook ON briefings (cook_id)',
  'CREATE INDEX ix_briefing_sources_cook ON briefing_sources (cook_id)',
  'CREATE INDEX ix_import_batches_status ON import_batches (status)',
];

// ---------------------------------------------------------------------------
// Version 2 — a tag no longer has to have a kind
// ---------------------------------------------------------------------------
//
// `tags.kind` was `NOT NULL`, and SQLite cannot drop a NOT NULL: the table has
// to be rebuilt. Rebuilding it is the whole of this migration, and the order of
// the statements below is the safety property, so it is worth reading once.
//
// The obstacle is `cook_tags`, which references `tags(id)` with ON DELETE
// CASCADE. With foreign keys on — and they are on, every connection, see
// CONNECTION_PRAGMAS — `DROP TABLE tags` performs an implicit `DELETE FROM
// tags` first, and that cascade would take every cook's tags with it. The usual
// answer is `PRAGMA foreign_keys = OFF` around the rebuild, and it is not
// available here: a migration runs inside one transaction (see
// `src/data/sqlite/migrationRunner.ts`) and SQLite ignores that pragma inside a
// transaction. A migration that quietly did nothing is worse than one that
// cannot run.
//
// So the rows are carried across by hand, in a holding table with no foreign
// keys of its own, and `cook_tags` is emptied deliberately rather than by a
// cascade nobody asked for. Note also what is *not* used: no `ALTER TABLE
// ... RENAME`, which rewrites other tables' REFERENCES clauses when foreign
// keys are on and would point `cook_tags` at a table that is about to not
// exist. The new `tags` is created under its final name instead.
//
// All of it is one transaction. If any statement fails, the whole rebuild rolls
// back — holding tables, dropped table and all — the database is still at
// version 1, and the app says the notebook could not be updated rather than
// opening an empty one.

const V2_HOLD_COOK_TAGS = `
CREATE TABLE cook_tags_rebuild (
  cook_id TEXT NOT NULL,
  tag_id  TEXT NOT NULL
)`.trim();

const V2_COPY_COOK_TAGS_OUT = `
INSERT INTO cook_tags_rebuild (cook_id, tag_id)
SELECT cook_id, tag_id FROM cook_tags`.trim();

const V2_HOLD_TAGS = `
CREATE TABLE tags_rebuild (
  id   TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT
)`.trim();

const V2_COPY_TAGS_OUT = `
INSERT INTO tags_rebuild (id, name, kind)
SELECT id, name, kind FROM tags`.trim();

// Emptied on purpose, with the rows already safe next door, so that the drop
// below has no cascade to perform. Every row comes back at the end.
const V2_EMPTY_COOK_TAGS = 'DELETE FROM cook_tags';

const V2_DROP_OLD_TAGS = 'DROP TABLE tags';

// The same three columns, and `kind` is now nullable. The four kinds stay in
// the CHECK list so that every tag written by version 1 is still valid.
const V2_CREATE_TAGS = `
CREATE TABLE tags (
  id   TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT CHECK (kind IS NULL OR kind IN ('dish','ingredient','technique','equipment'))
)`.trim();

// A tag with a kind keeps version 1's rule, so "butter" the ingredient and
// "butter" the technique are still two tags.
const V2_INDEX_TAGS_NAME_KIND = `
CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)`.trim();

// A tag with no kind needs its own index, because NULLs compare distinct in a
// SQLite unique index: without this, "brown butter" could be stored twice over.
const V2_INDEX_TAGS_NAME_UNTYPED = `
CREATE UNIQUE INDEX ux_tags_name_untyped ON tags (name COLLATE NOCASE)
WHERE kind IS NULL`.trim();

const V2_COPY_TAGS_BACK = `
INSERT INTO tags (id, name, kind)
SELECT id, name, kind FROM tags_rebuild`.trim();

// After the tags, so every `tag_id` has a row to point at by the time the
// foreign key is checked.
const V2_COPY_COOK_TAGS_BACK = `
INSERT INTO cook_tags (cook_id, tag_id)
SELECT cook_id, tag_id FROM cook_tags_rebuild`.trim();

const V2_DROP_HOLD_TAGS = 'DROP TABLE tags_rebuild';
const V2_DROP_HOLD_COOK_TAGS = 'DROP TABLE cook_tags_rebuild';

const V2_STAMP_SCHEMA_VERSION = `
INSERT INTO schema_meta (key, value)
VALUES ('${SCHEMA_VERSION_KEY}', '2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value`.trim();

const V2_STAMP_APPLIED_AT = `
INSERT INTO schema_meta (key, value)
VALUES ('${SCHEMA_APPLIED_AT_KEY}', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value`.trim();

/**
 * The stamp written at the end of every migration.
 *
 * `strftime` rather than a bound parameter so a migration is a self-contained
 * piece of SQL text with no runtime inputs to get wrong.
 */
const V1_STAMP_SCHEMA_VERSION = `
INSERT INTO schema_meta (key, value)
VALUES ('${SCHEMA_VERSION_KEY}', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value`.trim();

const V1_STAMP_APPLIED_AT = `
INSERT INTO schema_meta (key, value)
VALUES ('${SCHEMA_APPLIED_AT_KEY}', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value`.trim();

/**
 * Every migration, in order.
 *
 * Version 1 is the whole M1 local schema: raw evidence (`cooks`,
 * `cook_events`), proposals (`findings`, `lessons`) with the finding-to-event
 * junction, tagging, briefings with their cook junction, import bookkeeping and
 * the schema metadata table.
 *
 * Version 2 makes `tags.kind` nullable, keeping every existing kind valid, and
 * gives a tag with no kind a uniqueness rule of its own.
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
      V1_INDEX_TAGS_UNIQUE,
      ...V1_INDEXES,
      V1_STAMP_SCHEMA_VERSION,
      V1_STAMP_APPLIED_AT,
    ],
  },
  {
    version: 2,
    name: 'tags_without_a_kind',
    statements: [
      V2_HOLD_COOK_TAGS,
      V2_COPY_COOK_TAGS_OUT,
      V2_HOLD_TAGS,
      V2_COPY_TAGS_OUT,
      V2_EMPTY_COOK_TAGS,
      V2_DROP_OLD_TAGS,
      V2_CREATE_TAGS,
      V2_INDEX_TAGS_NAME_KIND,
      V2_INDEX_TAGS_NAME_UNTYPED,
      V2_COPY_TAGS_BACK,
      V2_COPY_COOK_TAGS_BACK,
      V2_DROP_HOLD_TAGS,
      V2_DROP_HOLD_COOK_TAGS,
      V2_STAMP_SCHEMA_VERSION,
      V2_STAMP_APPLIED_AT,
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
