/**
 * The repositories, implemented against SQLite.
 *
 * These are the objects the interfaces in `src/data/repositories.ts` describe.
 * Four rules hold throughout, and each one is here rather than in the callers
 * because a caller that has to remember it will eventually not:
 *
 *   Records in, records out.  Column names and row shapes stop at this file.
 *   Mapping is `./rows.ts`; nothing above this line sees a `SqlRow`.
 *
 *   Every value is bound.  There is no string interpolation of data anywhere
 *   below. The only text ever concatenated into SQL is a column name or a
 *   sort direction this module itself chose from a fixed set.
 *
 *   Rows that belong together are written together.  A finding and its
 *   citations, a briefing and its sources: one transaction, all or nothing. A
 *   finding that lost its evidence is the exact failure this product exists to
 *   prevent, and a partial write is how it would happen.
 *
 *   A repository stores; it does not decide.  Whether a write is permitted is
 *   settled before the call by the pure rules in `src/domain/evidence.ts`, and
 *   composed with the write in `./services.ts`. Nothing here consults an actor,
 *   and nothing here can be talked into skipping a rule, because it never knew
 *   about one.
 */

import type {
  Briefing,
  BriefingId,
  BriefingSource,
  Cook,
  CookEvent,
  CookEventId,
  CookId,
  CookTag,
  Finding,
  FindingId,
  FindingSource,
  ImportBatch,
  ImportBatchId,
  IsoTimestamp,
  Lesson,
  LessonId,
  SchemaState,
  Tag,
  TagId,
} from '../../domain/entities';
import type { ImportBatchStatus, TagKind } from '../../domain/enums';
import { normaliseTagName } from '../../domain/invariants';
import type { AppliedFinding } from '../../domain/evidence';
import type { DatabaseAdapter, SqlRow, SqlValue, Transaction } from '../adapters';
import type {
  BriefingQuery,
  BriefingRepository,
  CookEventQuery,
  CookEventRepository,
  CookQuery,
  CookRepository,
  CookTagRepository,
  CookTagging,
  FindingQuery,
  FindingRepository,
  ImportBatchRepository,
  LessonQuery,
  LessonRepository,
  PageRequest,
  SchemaStateRepository,
  SortDirection,
  TagRepository,
} from '../repositories';
import {
  BRIEFING_COLUMNS,
  COOK_COLUMNS,
  COOK_EVENT_COLUMNS,
  FINDING_COLUMNS,
  IMPORT_BATCH_COLUMNS,
  LESSON_COLUMNS,
  TAG_COLUMNS,
  briefingParams,
  cookEventParams,
  cookParams,
  findingParams,
  importBatchParams,
  lessonParams,
  placeholders,
  tagParams,
  toBriefing,
  toBriefingSource,
  toCook,
  toCookEvent,
  toCookTag,
  toFinding,
  toFindingSource,
  toImportBatch,
  toLesson,
  toTag,
  writeBoolean,
  writeJson,
} from './rows';
import { listTables, readSchemaState } from './migrationRunner';
import { SCHEMA_APPLIED_AT_KEY, SCHEMA_VERSION_KEY } from '../schema/migrations';

/** A repository was asked for a row that is not there. */
export class RecordNotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`no ${what} with id ${id}`);
    this.name = 'RecordNotFoundError';
  }
}

/** Anything a statement can run on: the connection, or a transaction on it. */
type Runner = Pick<DatabaseAdapter, 'execute' | 'select'> | Transaction;

function columnCount(columns: string): number {
  return columns.split(',').length;
}

function insertInto(table: string, columns: string): string {
  return `INSERT INTO ${table} (${columns}) VALUES (${placeholders(columnCount(columns))})`;
}

/**
 * `ORDER BY` for a sort direction.
 *
 * The column is chosen by this module and the direction comes from a two-value
 * union, so neither can carry anything a caller supplied.
 */
function orderBy(column: string, sort: SortDirection | undefined, fallback: SortDirection): string {
  const direction = (sort ?? fallback) === 'newest_first' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${direction}`;
}

/** `LIMIT ? OFFSET ?`, with the values bound. */
function pageClause(page: PageRequest | undefined, params: SqlValue[]): string {
  if (page === undefined) {
    return '';
  }
  params.push(page.limit, page.offset ?? 0);
  return ' LIMIT ? OFFSET ?';
}

async function selectRows(runner: Runner, sql: string, params: readonly SqlValue[]): Promise<readonly SqlRow[]> {
  return runner.select({ sql, params });
}

async function selectOne<T>(
  runner: Runner,
  sql: string,
  params: readonly SqlValue[],
  map: (row: SqlRow) => T,
): Promise<T | null> {
  const rows = await selectRows(runner, sql, params);
  const first = rows[0];
  return first === undefined ? null : map(first);
}

// ---------------------------------------------------------------------------
// Cooks
// ---------------------------------------------------------------------------

/**
 * The `WHERE` clause for a cook query.
 *
 * `tagIds` narrows rather than widens: a cook must carry every tag asked for,
 * because "braise" and "beef" together means the braised beef, not everything
 * braised plus everything beef.
 */
function cookWhere(query: CookQuery | undefined, params: SqlValue[]): string {
  const clauses: string[] = [];
  if (query === undefined) {
    return '';
  }
  if (query.status !== undefined) {
    clauses.push('status = ?');
    params.push(query.status);
  }
  if (query.provenance !== undefined) {
    clauses.push('provenance = ?');
    params.push(query.provenance);
  }
  if (query.parentCookId !== undefined) {
    clauses.push('parent_cook_id = ?');
    params.push(query.parentCookId);
  }
  if (query.startedOnOrAfter !== undefined) {
    clauses.push('started_at >= ?');
    params.push(query.startedOnOrAfter);
  }
  if (query.startedBefore !== undefined) {
    clauses.push('started_at < ?');
    params.push(query.startedBefore);
  }
  const tagIds = query.tagIds ?? [];
  if (tagIds.length > 0) {
    clauses.push(
      `(SELECT count(DISTINCT tag_id) FROM cook_tags
          WHERE cook_tags.cook_id = cooks.id AND tag_id IN (${placeholders(tagIds.length)})) = ?`,
    );
    params.push(...tagIds, tagIds.length);
  }
  return clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
}

export function createCookRepository(adapter: DatabaseAdapter): CookRepository {
  return {
    async create(cook: Cook): Promise<Cook> {
      await adapter.execute({ sql: insertInto('cooks', COOK_COLUMNS), params: cookParams(cook) });
      return cook;
    },

    async findById(id: CookId): Promise<Cook | null> {
      return selectOne(adapter, `SELECT ${COOK_COLUMNS} FROM cooks WHERE id = ?`, [id], toCook);
    },

    async list(query?: CookQuery): Promise<readonly Cook[]> {
      const params: SqlValue[] = [];
      const where = cookWhere(query, params);
      const sql =
        `SELECT ${COOK_COLUMNS} FROM cooks${where} ` +
        orderBy('started_at', query?.sort, 'newest_first') +
        pageClause(query?.page, params);
      return (await selectRows(adapter, sql, params)).map(toCook);
    },

    async count(query?: CookQuery): Promise<number> {
      const params: SqlValue[] = [];
      const where = cookWhere(query, params);
      const rows = await selectRows(adapter, `SELECT count(*) AS total FROM cooks${where}`, params);
      const total = rows[0]?.total;
      return typeof total === 'number' ? total : 0;
    },

    /**
     * Persist a revision that has already been authorised.
     *
     * The id is never in the `SET` list: a save replaces a cook's contents, and
     * a save that could change which cook it was would be a different operation
     * wearing this one's name.
     */
    async save(cook: Cook): Promise<Cook> {
      const result = await adapter.execute({
        sql: `UPDATE cooks SET
                title = ?, status = ?, provenance = ?, parent_cook_id = ?, started_at = ?,
                review_opened_at = ?, review_saved_at = ?, verdict = ?, created_at = ?
              WHERE id = ?`,
        params: [
          cook.title,
          cook.status,
          cook.provenance,
          cook.parentCookId,
          cook.startedAt,
          cook.reviewOpenedAt,
          cook.reviewSavedAt,
          cook.verdict,
          cook.createdAt,
          cook.id,
        ],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('cook', cook.id);
      }
      return cook;
    },

    async listChildren(id: CookId): Promise<readonly Cook[]> {
      const rows = await selectRows(
        adapter,
        `SELECT ${COOK_COLUMNS} FROM cooks WHERE parent_cook_id = ? ORDER BY started_at ASC`,
        [id],
      );
      return rows.map(toCook);
    },

    /**
     * Delete a cook and everything that hung off it.
     *
     * The cascades are the schema's, not this method's: `cook_events`,
     * `findings`, `lessons`, `cook_tags`, `briefings` and both junctions follow
     * automatically, and a cook that followed on from this one keeps its own
     * history with `parent_cook_id` set to NULL. The transaction is here so
     * that a failure part way through leaves the cook whole.
     */
    async delete(id: CookId): Promise<void> {
      await adapter.withTransaction(async (tx) => {
        await tx.execute({ sql: 'DELETE FROM cooks WHERE id = ?', params: [id] });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Cook events
// ---------------------------------------------------------------------------

export function createCookEventRepository(adapter: DatabaseAdapter): CookEventRepository {
  return {
    async append(event: CookEvent): Promise<CookEvent> {
      await adapter.execute({
        sql: insertInto('cook_events', COOK_EVENT_COLUMNS),
        params: cookEventParams(event),
      });
      return event;
    },

    async findById(id: CookEventId): Promise<CookEvent | null> {
      return selectOne(
        adapter,
        `SELECT ${COOK_EVENT_COLUMNS} FROM cook_events WHERE id = ?`,
        [id],
        toCookEvent,
      );
    },

    /** The timeline. Oldest first unless asked otherwise: that is the order it happened in. */
    async listForCook(query: CookEventQuery): Promise<readonly CookEvent[]> {
      const params: SqlValue[] = [query.cookId];
      let sql = `SELECT ${COOK_EVENT_COLUMNS} FROM cook_events WHERE cook_id = ?`;
      if (query.kind !== undefined) {
        sql += ' AND kind = ?';
        params.push(query.kind);
      }
      sql += ` ${orderBy('ts', query.sort, 'oldest_first')}${pageClause(query.page, params)}`;
      return (await selectRows(adapter, sql, params)).map(toCookEvent);
    },

    async save(event: CookEvent): Promise<CookEvent> {
      const result = await adapter.execute({
        sql: `UPDATE cook_events SET cook_id = ?, ts = ?, kind = ?, body = ?, meta = ?, photo_path = ?
              WHERE id = ?`,
        params: [
          event.cookId,
          event.ts,
          event.kind,
          event.body,
          writeJson(event.meta),
          event.photoPath,
          event.id,
        ],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('cook event', event.id);
      }
      return event;
    },

    async delete(id: CookEventId): Promise<void> {
      await adapter.execute({ sql: 'DELETE FROM cook_events WHERE id = ?', params: [id] });
    },
  };
}

// ---------------------------------------------------------------------------
// Findings and their citations
// ---------------------------------------------------------------------------

/** The same columns, qualified, for the joins below. */
const FINDING_COLUMNS_F =
  'f.id, f.cook_id, f.class, f.text, f.rationale, f.confidence, f.status, f.created_by, f.provenance, f.created_at, f.updated_at';
const COOK_EVENT_COLUMNS_E = 'e.id, e.cook_id, e.ts, e.kind, e.body, e.meta, e.photo_path';
const COOK_COLUMNS_C =
  'c.id, c.title, c.status, c.provenance, c.parent_cook_id, c.started_at, c.review_opened_at, c.review_saved_at, c.verdict, c.created_at';

function findingWhere(query: FindingQuery | undefined, params: SqlValue[]): string {
  if (query === undefined) {
    return '';
  }
  const clauses: string[] = [];
  if (query.cookId !== undefined) {
    clauses.push('cook_id = ?');
    params.push(query.cookId);
  }
  if (query.status !== undefined) {
    clauses.push('status = ?');
    params.push(query.status);
  }
  if (query.class !== undefined) {
    clauses.push('class = ?');
    params.push(query.class);
  }
  if (query.citesCookEventId !== undefined) {
    clauses.push(
      'EXISTS (SELECT 1 FROM finding_sources WHERE finding_sources.finding_id = findings.id AND finding_sources.cook_event_id = ?)',
    );
    params.push(query.citesCookEventId);
  }
  return clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
}

export function createFindingRepository(adapter: DatabaseAdapter): FindingRepository {
  return {
    /**
     * A finding and its citations, in one transaction.
     *
     * There is no method that writes a finding on its own. A finding whose
     * citations failed to land would look, from every screen in the app, like a
     * claim the cook made about nothing.
     */
    async createWithSources(applied: AppliedFinding): Promise<AppliedFinding> {
      await adapter.withTransaction(async (tx) => {
        await tx.execute({
          sql: insertInto('findings', FINDING_COLUMNS),
          params: findingParams(applied.finding),
        });
        for (const source of applied.sources) {
          await tx.execute({
            sql: 'INSERT INTO finding_sources (finding_id, cook_event_id) VALUES (?, ?)',
            params: [source.findingId, source.cookEventId],
          });
        }
      });
      return applied;
    },

    async findById(id: FindingId): Promise<Finding | null> {
      return selectOne(adapter, `SELECT ${FINDING_COLUMNS} FROM findings WHERE id = ?`, [id], toFinding);
    },

    async list(query?: FindingQuery): Promise<readonly Finding[]> {
      const params: SqlValue[] = [];
      const where = findingWhere(query, params);
      const sql =
        `SELECT ${FINDING_COLUMNS} FROM findings${where} ` +
        orderBy('created_at', query?.sort, 'newest_first') +
        pageClause(query?.page, params);
      return (await selectRows(adapter, sql, params)).map(toFinding);
    },

    async save(finding: Finding): Promise<Finding> {
      const result = await adapter.execute({
        sql: `UPDATE findings SET
                cook_id = ?, class = ?, text = ?, rationale = ?, confidence = ?, status = ?,
                created_by = ?, provenance = ?, created_at = ?, updated_at = ?
              WHERE id = ?`,
        params: [
          finding.cookId,
          finding.class,
          finding.text,
          finding.rationale,
          finding.confidence,
          finding.status,
          finding.createdBy,
          finding.provenance,
          finding.createdAt,
          finding.updatedAt,
          finding.id,
        ],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('finding', finding.id);
      }
      return finding;
    },

    /**
     * Remove a finding entirely.
     *
     * Not what rejection does. Rejecting sets `status` and keeps every other
     * field, so the record of the judgement survives; this method exists for a
     * deliberate deletion and nothing in the review workflow calls it.
     */
    async delete(id: FindingId): Promise<void> {
      await adapter.execute({ sql: 'DELETE FROM findings WHERE id = ?', params: [id] });
    },

    async listSources(findingId: FindingId): Promise<readonly FindingSource[]> {
      const rows = await selectRows(
        adapter,
        'SELECT finding_id, cook_event_id FROM finding_sources WHERE finding_id = ? ORDER BY cook_event_id ASC',
        [findingId],
      );
      return rows.map(toFindingSource);
    },

    async listSourceEvents(findingId: FindingId): Promise<readonly CookEvent[]> {
      const rows = await selectRows(
        adapter,
        `SELECT ${COOK_EVENT_COLUMNS_E} FROM cook_events e
         JOIN finding_sources s ON s.cook_event_id = e.id
         WHERE s.finding_id = ? ORDER BY e.ts ASC`,
        [findingId],
      );
      return rows.map(toCookEvent);
    },

    async addSource(source: FindingSource): Promise<FindingSource> {
      await adapter.execute({
        sql: 'INSERT INTO finding_sources (finding_id, cook_event_id) VALUES (?, ?)',
        params: [source.findingId, source.cookEventId],
      });
      return source;
    },

    async removeSource(source: FindingSource): Promise<void> {
      await adapter.execute({
        sql: 'DELETE FROM finding_sources WHERE finding_id = ? AND cook_event_id = ?',
        params: [source.findingId, source.cookEventId],
      });
    },

    async listCitingEvent(cookEventId: CookEventId): Promise<readonly Finding[]> {
      const rows = await selectRows(
        adapter,
        `SELECT ${FINDING_COLUMNS_F} FROM findings f
         JOIN finding_sources s ON s.finding_id = f.id
         WHERE s.cook_event_id = ? ORDER BY f.created_at DESC`,
        [cookEventId],
      );
      return rows.map(toFinding);
    },
  };
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export function createLessonRepository(adapter: DatabaseAdapter): LessonRepository {
  return {
    async create(lesson: Lesson): Promise<Lesson> {
      await adapter.execute({
        sql: insertInto('lessons', LESSON_COLUMNS),
        params: lessonParams(lesson),
      });
      return lesson;
    },

    async findById(id: LessonId): Promise<Lesson | null> {
      return selectOne(adapter, `SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = ?`, [id], toLesson);
    },

    async list(query?: LessonQuery): Promise<readonly Lesson[]> {
      const params: SqlValue[] = [];
      const clauses: string[] = [];
      if (query?.cookId !== undefined) {
        clauses.push('cook_id = ?');
        params.push(query.cookId);
      }
      if (query?.status !== undefined) {
        clauses.push('status = ?');
        params.push(query.status);
      }
      const where = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
      const sql =
        `SELECT ${LESSON_COLUMNS} FROM lessons${where} ` +
        orderBy('created_at', query?.sort, 'newest_first') +
        pageClause(query?.page, params);
      return (await selectRows(adapter, sql, params)).map(toLesson);
    },

    async save(lesson: Lesson): Promise<Lesson> {
      const result = await adapter.execute({
        sql: `UPDATE lessons SET cook_id = ?, text = ?, status = ?, provenance = ?, created_at = ?, updated_at = ?
              WHERE id = ?`,
        params: [
          lesson.cookId,
          lesson.text,
          lesson.status,
          lesson.provenance,
          lesson.createdAt,
          lesson.updatedAt,
          lesson.id,
        ],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('lesson', lesson.id);
      }
      return lesson;
    },

    async delete(id: LessonId): Promise<void> {
      await adapter.execute({ sql: 'DELETE FROM lessons WHERE id = ?', params: [id] });
    },
  };
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Ids for rows the store creates itself, rather than being handed. */
export type IdSource = () => string;

export function createTagRepository(adapter: DatabaseAdapter, newId: IdSource): TagRepository {
  /**
   * `kind IS ?` rather than `kind = ?`.
   *
   * SQLite's `=` never matches NULL, so with `= ?` a tag with no kind could
   * never be found — and `findOrCreate` would attempt a second insert of it
   * every time, failing against the unique index. `IS` compares NULLs equal,
   * which is what "the tag with no kind called brown butter" means.
   */
  const findByNameAndKind = async (name: string, kind: TagKind | null): Promise<Tag | null> =>
    selectOne(
      adapter,
      `SELECT ${TAG_COLUMNS} FROM tags WHERE name = ? COLLATE NOCASE AND kind IS ?`,
      [normaliseTagName(name), kind],
      toTag,
    );

  return {
    /**
     * The tag with this name and kind, creating it if there is not one.
     *
     * One method rather than find-then-create because the name is unique in
     * the database: the two-step version is a race, and the way it surfaces
     * is a cook's save failing for no reason they can see. The insert is
     * attempted and a collision is resolved by reading the row that won, so
     * whichever call arrives second still gets the tag it asked for.
     */
    async findOrCreate(name: string, kind: TagKind | null): Promise<Tag> {
      const normalised = normaliseTagName(name);
      const existing = await findByNameAndKind(normalised, kind);
      if (existing !== null) {
        return existing;
      }
      const tag: Tag = { id: newId(), name: normalised, kind };
      try {
        await adapter.execute({ sql: insertInto('tags', TAG_COLUMNS), params: tagParams(tag) });
        return tag;
      } catch (cause) {
        const winner = await findByNameAndKind(normalised, kind);
        if (winner !== null) {
          return winner;
        }
        throw cause;
      }
    },

    async findById(id: TagId): Promise<Tag | null> {
      return selectOne(adapter, `SELECT ${TAG_COLUMNS} FROM tags WHERE id = ?`, [id], toTag);
    },

    findByNameAndKind,

    async list(kind?: TagKind): Promise<readonly Tag[]> {
      const params: SqlValue[] = [];
      let sql = `SELECT ${TAG_COLUMNS} FROM tags`;
      if (kind !== undefined) {
        sql += ' WHERE kind = ?';
        params.push(kind);
      }
      sql += ' ORDER BY kind ASC, name ASC';
      return (await selectRows(adapter, sql, params)).map(toTag);
    },

    /** One alphabet, whatever kinds are in it. */
    async listByName(): Promise<readonly Tag[]> {
      return (
        await selectRows(
          adapter,
          `SELECT ${TAG_COLUMNS} FROM tags ORDER BY name COLLATE NOCASE ASC`,
          [],
        )
      ).map(toTag);
    },

    /**
     * Tags matching what has been typed, the ones that begin with it first.
     *
     * Two decisions are in this one statement.
     *
     * `instr` rather than `LIKE`, so what the cook typed is matched as the
     * literal text it is: a `%` or an `_` in a half-typed word is a character
     * and not a wildcard.
     *
     * And the match has to start a word, which is why both sides are prefixed
     * with a space. Typing "b" should offer "brown butter", not "aubergine";
     * matching anywhere inside a word turns one letter into a list of
     * everything. It is the same rule History's search uses (see
     * `wordStartMatches`), so the same letters mean the same thing in both
     * places. A match inside a multi-word tag still counts — "butter" finds
     * "brown butter" — because the space before it is a word boundary too.
     *
     * The needle is already trimmed and lower-cased by `normaliseTagName`, and
     * stored names are too, but `lower(name)` is applied anyway so a name
     * written by an earlier build still matches.
     */
    async suggest(fragment: string, limit: number): Promise<readonly Tag[]> {
      const needle = normaliseTagName(fragment);
      if (needle === '') {
        return [];
      }
      return (
        await selectRows(
          adapter,
          `SELECT ${TAG_COLUMNS} FROM tags
           WHERE instr(' ' || lower(name), ' ' || ?) > 0
           ORDER BY instr(' ' || lower(name), ' ' || ?) ASC,
                    length(name) ASC,
                    name COLLATE NOCASE ASC
           LIMIT ?`,
          [needle, needle, limit],
        )
      ).map(toTag);
    },

    /** Renaming normalises, so a rename can never create a second "brown butter". */
    async rename(id: TagId, name: string): Promise<Tag> {
      const normalised = normaliseTagName(name);
      const result = await adapter.execute({
        sql: 'UPDATE tags SET name = ? WHERE id = ?',
        params: [normalised, id],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('tag', id);
      }
      const renamed = await selectOne(
        adapter,
        `SELECT ${TAG_COLUMNS} FROM tags WHERE id = ?`,
        [id],
        toTag,
      );
      if (renamed === null) {
        throw new RecordNotFoundError('tag', id);
      }
      return renamed;
    },

    async delete(id: TagId): Promise<void> {
      await adapter.execute({ sql: 'DELETE FROM tags WHERE id = ?', params: [id] });
    },
  };
}

// ---------------------------------------------------------------------------
// Cook tags
// ---------------------------------------------------------------------------

export function createCookTagRepository(adapter: DatabaseAdapter): CookTagRepository {
  return {
    async link(link: CookTag): Promise<CookTag> {
      await adapter.execute({
        sql: 'INSERT OR IGNORE INTO cook_tags (cook_id, tag_id) VALUES (?, ?)',
        params: [link.cookId, link.tagId],
      });
      return link;
    },

    async unlink(cookId: CookId, tagId: TagId): Promise<void> {
      await adapter.execute({
        sql: 'DELETE FROM cook_tags WHERE cook_id = ? AND tag_id = ?',
        params: [cookId, tagId],
      });
    },

    async listForCook(cookId: CookId): Promise<readonly Tag[]> {
      const rows = await selectRows(
        adapter,
        `SELECT t.id, t.name, t.kind FROM tags t
         JOIN cook_tags ct ON ct.tag_id = t.id
         WHERE ct.cook_id = ? ORDER BY t.kind ASC, t.name ASC`,
        [cookId],
      );
      return rows.map(toTag);
    },

    /**
     * Several cooks' tags in one read.
     *
     * One statement rather than one per cook: History's search needs the tags
     * of every cook it is about to list, and a query per row is how a list of
     * thirty cooks becomes thirty-one round trips to SQLite.
     */
    async listForCooks(cookIds: readonly CookId[]): Promise<readonly CookTagging[]> {
      if (cookIds.length === 0) {
        return [];
      }
      const rows = await selectRows(
        adapter,
        `SELECT ct.cook_id AS cook_id, t.id AS id, t.name AS name, t.kind AS kind
         FROM cook_tags ct
         JOIN tags t ON t.id = ct.tag_id
         WHERE ct.cook_id IN (${placeholders(cookIds.length)})
         ORDER BY ct.cook_id ASC, t.name COLLATE NOCASE ASC`,
        [...cookIds],
      );

      const byCook = new Map<CookId, Tag[]>();
      for (const row of rows) {
        const cookId = toCookTag({ ...row, tag_id: String(row.id) }).cookId;
        const tags = byCook.get(cookId);
        if (tags === undefined) {
          byCook.set(cookId, [toTag(row)]);
        } else {
          tags.push(toTag(row));
        }
      }
      return [...byCook.entries()].map(([cookId, tags]) => ({ cookId, tags }));
    },

    async listCookIdsForTag(tagId: TagId): Promise<readonly CookId[]> {
      const rows = await selectRows(
        adapter,
        'SELECT cook_id FROM cook_tags WHERE tag_id = ? ORDER BY cook_id ASC',
        [tagId],
      );
      return rows.map((row) => toCookTag({ ...row, tag_id: tagId }).cookId);
    },

    /** Only the tags that are actually on a cook, and each of them once. */
    async listUsedTags(): Promise<readonly Tag[]> {
      const rows = await selectRows(
        adapter,
        `SELECT DISTINCT t.id AS id, t.name AS name, t.kind AS kind
         FROM tags t JOIN cook_tags ct ON ct.tag_id = t.id
         ORDER BY t.name COLLATE NOCASE ASC`,
        [],
      );
      return rows.map(toTag);
    },

    /**
     * The tags the kitchen reaches for most.
     *
     * Counted over cooks, so a tag on six cooks comes before one on two. The
     * tie-break is alphabetical rather than most recent: an order that moved
     * every time a cook was saved would put the pick he wanted somewhere else
     * each time he looked.
     */
    async listMostUsedTags(limit: number): Promise<readonly Tag[]> {
      const rows = await selectRows(
        adapter,
        `SELECT t.id AS id, t.name AS name, t.kind AS kind, count(ct.cook_id) AS uses
         FROM tags t JOIN cook_tags ct ON ct.tag_id = t.id
         GROUP BY t.id, t.name, t.kind
         ORDER BY uses DESC, t.name COLLATE NOCASE ASC
         LIMIT ?`,
        [limit],
      );
      return rows.map(toTag);
    },
  };
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export function createBriefingRepository(adapter: DatabaseAdapter): BriefingRepository {
  return {
    /**
     * A briefing and the cooks it was built from, in one transaction.
     *
     * A briefing whose sources failed to land would be advice with no visible
     * reason for existing, which is the one thing a briefing must never be.
     */
    async createWithSources(
      briefing: Briefing,
      sources: readonly BriefingSource[],
    ): Promise<Briefing> {
      await adapter.withTransaction(async (tx) => {
        await tx.execute({
          sql: insertInto('briefings', BRIEFING_COLUMNS),
          params: briefingParams(briefing),
        });
        for (const source of sources) {
          await tx.execute({
            sql: 'INSERT INTO briefing_sources (briefing_id, cook_id) VALUES (?, ?)',
            params: [source.briefingId, source.cookId],
          });
        }
      });
      return briefing;
    },

    async findById(id: BriefingId): Promise<Briefing | null> {
      return selectOne(
        adapter,
        `SELECT ${BRIEFING_COLUMNS} FROM briefings WHERE id = ?`,
        [id],
        toBriefing,
      );
    },

    async list(query?: BriefingQuery): Promise<readonly Briefing[]> {
      const params: SqlValue[] = [];
      const clauses: string[] = [];
      if (query?.cookId !== undefined) {
        clauses.push('cook_id = ?');
        params.push(query.cookId);
      }
      if (query?.useful !== undefined) {
        // Asking for the useful ones is not asking for the unanswered ones.
        clauses.push('useful = ?');
        params.push(writeBoolean(query.useful));
      }
      const where = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
      const sql =
        `SELECT ${BRIEFING_COLUMNS} FROM briefings${where} ` +
        orderBy('created_at', query?.sort, 'newest_first') +
        pageClause(query?.page, params);
      return (await selectRows(adapter, sql, params)).map(toBriefing);
    },

    async save(briefing: Briefing): Promise<Briefing> {
      const result = await adapter.execute({
        sql: 'UPDATE briefings SET cook_id = ?, content = ?, useful = ?, created_at = ? WHERE id = ?',
        params: [
          briefing.cookId,
          JSON.stringify(briefing.content),
          writeBoolean(briefing.useful),
          briefing.createdAt,
          briefing.id,
        ],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('briefing', briefing.id);
      }
      return briefing;
    },

    async delete(id: BriefingId): Promise<void> {
      await adapter.execute({ sql: 'DELETE FROM briefings WHERE id = ?', params: [id] });
    },

    async listSources(briefingId: BriefingId): Promise<readonly BriefingSource[]> {
      const rows = await selectRows(
        adapter,
        'SELECT briefing_id, cook_id FROM briefing_sources WHERE briefing_id = ? ORDER BY cook_id ASC',
        [briefingId],
      );
      return rows.map(toBriefingSource);
    },

    async listSourceCooks(briefingId: BriefingId): Promise<readonly Cook[]> {
      const rows = await selectRows(
        adapter,
        `SELECT ${COOK_COLUMNS_C} FROM cooks c
         JOIN briefing_sources bs ON bs.cook_id = c.id
         WHERE bs.briefing_id = ? ORDER BY c.started_at ASC`,
        [briefingId],
      );
      return rows.map(toCook);
    },

    async addSource(source: BriefingSource): Promise<BriefingSource> {
      await adapter.execute({
        sql: 'INSERT INTO briefing_sources (briefing_id, cook_id) VALUES (?, ?)',
        params: [source.briefingId, source.cookId],
      });
      return source;
    },

    async removeSource(source: BriefingSource): Promise<void> {
      await adapter.execute({
        sql: 'DELETE FROM briefing_sources WHERE briefing_id = ? AND cook_id = ?',
        params: [source.briefingId, source.cookId],
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Import batches
// ---------------------------------------------------------------------------

export function createImportBatchRepository(adapter: DatabaseAdapter): ImportBatchRepository {
  return {
    async create(batch: ImportBatch): Promise<ImportBatch> {
      await adapter.execute({
        sql: insertInto('import_batches', IMPORT_BATCH_COLUMNS),
        params: importBatchParams(batch),
      });
      return batch;
    },

    async findById(id: ImportBatchId): Promise<ImportBatch | null> {
      return selectOne(
        adapter,
        `SELECT ${IMPORT_BATCH_COLUMNS} FROM import_batches WHERE id = ?`,
        [id],
        toImportBatch,
      );
    },

    /** `failed` batches are listed like any other: a failure is a record, not a gap. */
    async list(status?: ImportBatchStatus): Promise<readonly ImportBatch[]> {
      const params: SqlValue[] = [];
      let sql = `SELECT ${IMPORT_BATCH_COLUMNS} FROM import_batches`;
      if (status !== undefined) {
        sql += ' WHERE status = ?';
        params.push(status);
      }
      sql += ' ORDER BY created_at DESC';
      return (await selectRows(adapter, sql, params)).map(toImportBatch);
    },

    async save(batch: ImportBatch): Promise<ImportBatch> {
      const result = await adapter.execute({
        sql: `UPDATE import_batches SET
                filename = ?, status = ?, candidates_total = ?, candidates_resolved = ?, created_at = ?
              WHERE id = ?`,
        params: [
          batch.filename,
          batch.status,
          batch.candidatesTotal,
          batch.candidatesResolved,
          batch.createdAt,
          batch.id,
        ],
      });
      if (result.rowsAffected === 0) {
        throw new RecordNotFoundError('import batch', batch.id);
      }
      return batch;
    },
  };
}

// ---------------------------------------------------------------------------
// Schema state
// ---------------------------------------------------------------------------

export function createSchemaStateRepository(adapter: DatabaseAdapter): SchemaStateRepository {
  return {
    async read(): Promise<SchemaState> {
      return readSchemaState(adapter);
    },

    /**
     * Stamp the applied version.
     *
     * The migration runner writes this inside the migration's own transaction,
     * so a rolled-back migration takes its version stamp with it. This method
     * exists for the interface and for a caller that has its own transaction;
     * it is not how `runMigrations` records a version.
     */
    async recordVersion(version: number, at: IsoTimestamp): Promise<void> {
      await adapter.withTransaction(async (tx) => {
        for (const [key, value] of [
          [SCHEMA_VERSION_KEY, String(version)],
          [SCHEMA_APPLIED_AT_KEY, at],
        ] as const) {
          await tx.execute({
            sql: 'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            params: [key, value],
          });
        }
      });
    },

    async listTables(): Promise<readonly string[]> {
      return listTables(adapter);
    },
  };
}
