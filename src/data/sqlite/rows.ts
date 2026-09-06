/**
 * Translating between SQL rows and domain records.
 *
 * The domain speaks camelCase and structured values; SQLite speaks snake_case
 * and three storage types. This module is the only place that knows both, which
 * is what keeps column names out of the repositories and SQL out of everything
 * above them.
 *
 * IT CHECKS, IT DOES NOT COERCE
 * -----------------------------
 * A row that does not match the schema is a corrupted row, and this module
 * refuses it rather than filling in a plausible value. A `status` that is not a
 * status, a `meta` that is not JSON, a `useful` that is neither 0, 1 nor NULL:
 * each throws with the table, column and row named. Reading it as `'open'`
 * because that is the common case would put an invented record in front of the
 * cook and would look exactly like a real one.
 *
 * Booleans and JSON are the two places SQLite has no type for what the domain
 * needs. `useful` is stored as 0/1/NULL, and `meta` and `content` are stored as
 * JSON text. Both are converted here and nowhere else.
 */

import type {
  Briefing,
  BriefingSource,
  Cook,
  CookEvent,
  CookTag,
  Finding,
  FindingSource,
  ImportBatch,
  JsonValue,
  Lesson,
  Tag,
} from '../../domain/entities';
import {
  isConfidenceLevel,
  isCookEventKind,
  isCookStatus,
  isCreatedBy,
  isFindingClass,
  isImportBatchStatus,
  isProposalStatus,
  isProvenance,
  isTagKind,
} from '../../domain/enums';
import { isJsonValue } from '../../domain/invariants';
import type { SqlRow, SqlValue } from '../adapters';

export class RowMappingError extends Error {
  readonly table: string;
  readonly column: string;

  constructor(table: string, column: string, message: string) {
    super(`${table}.${column}: ${message}`);
    this.name = 'RowMappingError';
    this.table = table;
    this.column = column;
  }
}

function requiredText(table: string, row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw new RowMappingError(table, column, 'expected text');
  }
  return value;
}

function optionalText(table: string, row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RowMappingError(table, column, 'expected text or NULL');
  }
  return value;
}

function requiredEnum<T extends string>(
  table: string,
  row: SqlRow,
  column: string,
  guard: (candidate: unknown) => candidate is T,
): T {
  const value = row[column];
  if (!guard(value)) {
    throw new RowMappingError(table, column, 'is not a value this build recognises');
  }
  return value;
}

function optionalEnum<T extends string>(
  table: string,
  row: SqlRow,
  column: string,
  guard: (candidate: unknown) => candidate is T,
): T | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (!guard(value)) {
    throw new RowMappingError(table, column, 'is not a value this build recognises');
  }
  return value;
}

function optionalCount(table: string, row: SqlRow, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RowMappingError(table, column, 'expected an integer or NULL');
  }
  return value;
}

/** SQLite has no boolean. `useful` is 0, 1 or NULL and means no, yes, not said. */
function optionalBoolean(table: string, row: SqlRow, column: string): boolean | null {
  const value = row[column];
  if (value === null || value === undefined) {
    return null;
  }
  if (value === 0) {
    return false;
  }
  if (value === 1) {
    return true;
  }
  throw new RowMappingError(table, column, 'expected 0, 1 or NULL');
}

function readJson(table: string, row: SqlRow, column: string, nullable: boolean): JsonValue | null {
  const value = row[column];
  if (value === null || value === undefined) {
    if (nullable) {
      return null;
    }
    throw new RowMappingError(table, column, 'expected JSON text');
  }
  if (typeof value !== 'string') {
    throw new RowMappingError(table, column, 'expected JSON text');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RowMappingError(table, column, 'is not valid JSON');
  }
  if (!isJsonValue(parsed)) {
    throw new RowMappingError(table, column, 'is not a JSON value this build can hold');
  }
  return parsed;
}

/** The text form of a structured column. Written back exactly as it is read. */
export function writeJson(value: JsonValue | null): SqlValue {
  return value === null ? null : JSON.stringify(value);
}

export function writeBoolean(value: boolean | null): SqlValue {
  return value === null ? null : value ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Rows to records
// ---------------------------------------------------------------------------

export function toCook(row: SqlRow): Cook {
  const table = 'cooks';
  return {
    id: requiredText(table, row, 'id'),
    title: optionalText(table, row, 'title'),
    status: requiredEnum(table, row, 'status', isCookStatus),
    provenance: requiredEnum(table, row, 'provenance', isProvenance),
    parentCookId: optionalText(table, row, 'parent_cook_id'),
    startedAt: requiredText(table, row, 'started_at'),
    reviewOpenedAt: optionalText(table, row, 'review_opened_at'),
    reviewSavedAt: optionalText(table, row, 'review_saved_at'),
    // Read back exactly as stored: no trim, no case change, no default.
    verdict: optionalText(table, row, 'verdict'),
    createdAt: requiredText(table, row, 'created_at'),
  };
}

export function toCookEvent(row: SqlRow): CookEvent {
  const table = 'cook_events';
  return {
    id: requiredText(table, row, 'id'),
    cookId: requiredText(table, row, 'cook_id'),
    ts: requiredText(table, row, 'ts'),
    kind: requiredEnum(table, row, 'kind', isCookEventKind),
    body: optionalText(table, row, 'body'),
    meta: readJson(table, row, 'meta', true),
    photoPath: optionalText(table, row, 'photo_path'),
  };
}

export function toFinding(row: SqlRow): Finding {
  const table = 'findings';
  return {
    id: requiredText(table, row, 'id'),
    cookId: requiredText(table, row, 'cook_id'),
    class: requiredEnum(table, row, 'class', isFindingClass),
    text: requiredText(table, row, 'text'),
    rationale: optionalText(table, row, 'rationale'),
    confidence: optionalEnum(table, row, 'confidence', isConfidenceLevel),
    status: requiredEnum(table, row, 'status', isProposalStatus),
    createdBy: requiredEnum(table, row, 'created_by', isCreatedBy),
    provenance: requiredEnum(table, row, 'provenance', isProvenance),
    createdAt: requiredText(table, row, 'created_at'),
    updatedAt: optionalText(table, row, 'updated_at'),
  };
}

export function toFindingSource(row: SqlRow): FindingSource {
  const table = 'finding_sources';
  return {
    findingId: requiredText(table, row, 'finding_id'),
    cookEventId: requiredText(table, row, 'cook_event_id'),
  };
}

export function toLesson(row: SqlRow): Lesson {
  const table = 'lessons';
  return {
    id: requiredText(table, row, 'id'),
    cookId: requiredText(table, row, 'cook_id'),
    text: requiredText(table, row, 'text'),
    status: requiredEnum(table, row, 'status', isProposalStatus),
    provenance: requiredEnum(table, row, 'provenance', isProvenance),
    createdAt: requiredText(table, row, 'created_at'),
    updatedAt: optionalText(table, row, 'updated_at'),
  };
}

export function toTag(row: SqlRow): Tag {
  const table = 'tags';
  return {
    id: requiredText(table, row, 'id'),
    name: requiredText(table, row, 'name'),
    kind: requiredEnum(table, row, 'kind', isTagKind),
  };
}

export function toCookTag(row: SqlRow): CookTag {
  const table = 'cook_tags';
  return {
    cookId: requiredText(table, row, 'cook_id'),
    tagId: requiredText(table, row, 'tag_id'),
  };
}

export function toBriefing(row: SqlRow): Briefing {
  const table = 'briefings';
  const content = readJson(table, row, 'content', false);
  if (content === null) {
    throw new RowMappingError(table, 'content', 'expected JSON text');
  }
  return {
    id: requiredText(table, row, 'id'),
    cookId: requiredText(table, row, 'cook_id'),
    content,
    useful: optionalBoolean(table, row, 'useful'),
    createdAt: requiredText(table, row, 'created_at'),
  };
}

export function toBriefingSource(row: SqlRow): BriefingSource {
  const table = 'briefing_sources';
  return {
    briefingId: requiredText(table, row, 'briefing_id'),
    cookId: requiredText(table, row, 'cook_id'),
  };
}

export function toImportBatch(row: SqlRow): ImportBatch {
  const table = 'import_batches';
  return {
    id: requiredText(table, row, 'id'),
    filename: optionalText(table, row, 'filename'),
    status: requiredEnum(table, row, 'status', isImportBatchStatus),
    candidatesTotal: optionalCount(table, row, 'candidates_total'),
    candidatesResolved: optionalCount(table, row, 'candidates_resolved'),
    createdAt: requiredText(table, row, 'created_at'),
  };
}

// ---------------------------------------------------------------------------
// Records to parameters
// ---------------------------------------------------------------------------

/**
 * Every write below is one column list and one matching parameter list.
 *
 * The columns are written out rather than derived from the record, so adding a
 * field to a domain type cannot silently start writing a column that does not
 * exist, and the parameter order cannot drift away from the column order.
 * Nothing is ever interpolated: every value in these arrays arrives at SQLite
 * as a bound parameter.
 */

export const COOK_COLUMNS =
  'id, title, status, provenance, parent_cook_id, started_at, review_opened_at, review_saved_at, verdict, created_at';

export function cookParams(cook: Cook): readonly SqlValue[] {
  return [
    cook.id,
    cook.title,
    cook.status,
    cook.provenance,
    cook.parentCookId,
    cook.startedAt,
    cook.reviewOpenedAt,
    cook.reviewSavedAt,
    cook.verdict,
    cook.createdAt,
  ];
}

export const COOK_EVENT_COLUMNS = 'id, cook_id, ts, kind, body, meta, photo_path';

export function cookEventParams(event: CookEvent): readonly SqlValue[] {
  return [
    event.id,
    event.cookId,
    event.ts,
    event.kind,
    event.body,
    writeJson(event.meta),
    event.photoPath,
  ];
}

export const FINDING_COLUMNS =
  'id, cook_id, class, text, rationale, confidence, status, created_by, provenance, created_at, updated_at';

export function findingParams(finding: Finding): readonly SqlValue[] {
  return [
    finding.id,
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
  ];
}

export const LESSON_COLUMNS = 'id, cook_id, text, status, provenance, created_at, updated_at';

export function lessonParams(lesson: Lesson): readonly SqlValue[] {
  return [
    lesson.id,
    lesson.cookId,
    lesson.text,
    lesson.status,
    lesson.provenance,
    lesson.createdAt,
    lesson.updatedAt,
  ];
}

export const TAG_COLUMNS = 'id, name, kind';

export function tagParams(tag: Tag): readonly SqlValue[] {
  return [tag.id, tag.name, tag.kind];
}

export const BRIEFING_COLUMNS = 'id, cook_id, content, useful, created_at';

export function briefingParams(briefing: Briefing): readonly SqlValue[] {
  return [
    briefing.id,
    briefing.cookId,
    JSON.stringify(briefing.content),
    writeBoolean(briefing.useful),
    briefing.createdAt,
  ];
}

export const IMPORT_BATCH_COLUMNS =
  'id, filename, status, candidates_total, candidates_resolved, created_at';

export function importBatchParams(batch: ImportBatch): readonly SqlValue[] {
  return [
    batch.id,
    batch.filename,
    batch.status,
    batch.candidatesTotal,
    batch.candidatesResolved,
    batch.createdAt,
  ];
}

/** `?, ?, ?` for a column list of the given length. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
