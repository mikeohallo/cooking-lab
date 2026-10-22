/**
 * Domain constraints for Cooking Lab records.
 *
 * These functions are the TypeScript half of the same rules SQLite enforces in
 * `src/data/schema/migrations.ts`. Both halves exist on purpose: SQLite catches
 * anything that reaches the file, and these catch it before it gets there, with
 * a message a screen can show.
 *
 * Two principles run through all of it:
 *
 *   Thin records are valid.  A cook with nothing but a start time is a real
 *   cook — it has no title yet and no verdict, and neither is a defect.
 *   Validation rejects malformed data, never sparse data.
 *
 *   Validation never mutates.  Every function returns issues; nothing here
 *   repairs, defaults or truncates on the caller's behalf. In particular the
 *   verdict is never trimmed, cased or rewritten: it is the cook's own words.
 */

import type {
  Briefing,
  BriefingSource,
  Cook,
  CookEvent,
  CookTag,
  EntityId,
  Finding,
  FindingSource,
  ImportBatch,
  IsoTimestamp,
  JsonValue,
  Lesson,
  SchemaMeta,
  Tag,
} from './entities';
import type { ReadingKind } from './enums';
import {
  READING_KIND_META_KEY,
  TEMPERATURE_META_KEY,
  isConfidenceLevel,
  isCookEventKind,
  isCookStatus,
  isCreatedBy,
  isFindingClass,
  isImportBatchStatus,
  isProposalStatus,
  isProvenance,
  isStoredReadingKind,
  isTagKind,
} from './enums';

/** Longest permitted title-like field. */
export const MAX_TITLE_LENGTH = 200;
/** Longest permitted free-text field. */
export const MAX_TEXT_LENGTH = 8000;
/**
 * Longest permitted tag name on a stored record.
 *
 * Deliberately longer than `MAX_TAG_ENTRY_LENGTH`. This is what the store will
 * accept, including a name written by an earlier build or restored from a
 * backup; the shorter limit is what this build lets the cook type. Lowering
 * this one instead would make a name that is already in the notebook invalid,
 * which is not a validation rule, it is data loss.
 */
export const MAX_TAG_NAME_LENGTH = 60;
/** Longest tag name this build lets the cook type. */
export const MAX_TAG_ENTRY_LENGTH = 40;
/** Longest permitted file name on an import batch. */
export const MAX_FILENAME_LENGTH = 255;

export type ValidationCode =
  | 'invalid_id'
  | 'required'
  | 'too_long'
  | 'invalid_enum'
  | 'invalid_timestamp'
  | 'out_of_order'
  | 'invalid_number'
  | 'invalid_json'
  | 'invalid_relation'
  | 'inconsistent_state';

export type ValidationIssue = {
  readonly field: string;
  readonly code: ValidationCode;
  readonly message: string;
};

/** Identifiers are lowercase, hyphen-separated and device-generated. */
const ENTITY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** ISO-8601, UTC, second or millisecond precision. Local offsets are refused
 *  so that ordering is total and backups from different devices compare. */
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function isEntityId(value: unknown): value is EntityId {
  return typeof value === 'string' && ENTITY_ID_PATTERN.test(value);
}

export function isIsoTimestamp(value: unknown): value is IsoTimestamp {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

/**
 * Whether a value survives a round trip through JSON unchanged.
 *
 * `undefined`, functions, `NaN` and cycles all serialise to something other
 * than themselves, so a column typed as structured data refuses them rather
 * than storing a value that will come back different.
 */
export function isJsonValue(value: unknown, seen: ReadonlySet<object> = new Set()): value is JsonValue {
  if (value === null) {
    return true;
  }
  const type = typeof value;
  if (type === 'string' || type === 'boolean') {
    return true;
  }
  if (type === 'number') {
    return Number.isFinite(value as number);
  }
  if (type !== 'object') {
    return false;
  }
  const object = value as object;
  if (seen.has(object)) {
    return false;
  }
  const nested = new Set(seen).add(object);
  if (Array.isArray(object)) {
    return object.every((entry) => isJsonValue(entry, nested));
  }
  if (Object.getPrototypeOf(object) !== Object.prototype) {
    // A Date, Map or class instance is not JSON, however it stringifies.
    return false;
  }
  return Object.values(object as Record<string, unknown>).every((entry) =>
    isJsonValue(entry, nested),
  );
}

/**
 * Tag names are stored normalised so uniqueness means what a cook would
 * expect: " Brown  Butter " and "brown butter" are one tag.
 *
 * Trimmed, inner runs of whitespace collapsed to one space, lower-cased. Inner
 * spaces are kept rather than removed or replaced: "brown butter" is two words
 * in the kitchen and stays two words here.
 */
export function normaliseTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type TagNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly message: string };

/**
 * What the cook typed, as a tag name — or why it is not one.
 *
 * The one place the entry rule lives, so the field, the suggestions and the
 * writes cannot disagree about what "brown butter" normalises to. The length
 * is measured *after* normalising, because a name with trailing spaces is not
 * a longer name.
 */
export function parseTagName(raw: string): TagNameResult {
  const name = normaliseTagName(raw);
  if (name === '') {
    return { ok: false, message: 'Type a word or two first.' };
  }
  if (name.length > MAX_TAG_ENTRY_LENGTH) {
    return {
      ok: false,
      message: `Keep a tag under ${MAX_TAG_ENTRY_LENGTH} characters.`,
    };
  }
  return { ok: true, name };
}

/**
 * The Celsius reading a `temp` event carries, or `null` if it carries none.
 *
 * There is one unit and one key. A reading in any other unit is not a reading
 * this app understands, and converting one on the cook's behalf would silently
 * change what they wrote down.
 */
export function celsiusFromEvent(event: CookEvent): number | null {
  const meta = event.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const reading = (meta as Record<string, unknown>)[TEMPERATURE_META_KEY];
  return typeof reading === 'number' && Number.isFinite(reading) ? reading : null;
}

/**
 * What a `temp` event says the reading was taken of.
 *
 * `none` when `meta.readingKind` is absent, and `none` when it holds anything
 * this build does not recognise. Both are the same fact from the kitchen's
 * point of view — the reading does not say — and neither is a reason to hide
 * the number or to guess on the cook's behalf. Every reading taken before the
 * kinds existed therefore reads as `none` without anything being rewritten.
 */
export function readingKindFromEvent(event: CookEvent): ReadingKind {
  const meta = event.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return 'none';
  }
  const kind = (meta as Record<string, unknown>)[READING_KIND_META_KEY];
  return isStoredReadingKind(kind) ? kind : 'none';
}

// ---------------------------------------------------------------------------
// Issue helpers
// ---------------------------------------------------------------------------

function issue(field: string, code: ValidationCode, message: string): ValidationIssue {
  return { field, code, message };
}

function checkId(field: string, value: unknown, issues: ValidationIssue[]): void {
  if (!isEntityId(value)) {
    issues.push(issue(field, 'invalid_id', `${field} must be a device-generated id`));
  }
}

function checkOptionalId(field: string, value: unknown, issues: ValidationIssue[]): void {
  if (value !== null && !isEntityId(value)) {
    issues.push(issue(field, 'invalid_id', `${field} must be a device-generated id or null`));
  }
}

function checkTimestamp(field: string, value: unknown, issues: ValidationIssue[]): void {
  if (!isIsoTimestamp(value)) {
    issues.push(issue(field, 'invalid_timestamp', `${field} must be an ISO-8601 UTC instant`));
  }
}

function checkOptionalTimestamp(
  field: string,
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (value !== null && !isIsoTimestamp(value)) {
    issues.push(
      issue(field, 'invalid_timestamp', `${field} must be an ISO-8601 UTC instant or null`),
    );
  }
}

function checkRequiredText(
  field: string,
  value: unknown,
  maxLength: number,
  issues: ValidationIssue[],
): void {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(issue(field, 'required', `${field} must not be blank`));
    return;
  }
  if (value.length > maxLength) {
    issues.push(issue(field, 'too_long', `${field} must be at most ${maxLength} characters`));
  }
}

function checkOptionalText(
  field: string,
  value: unknown,
  maxLength: number,
  issues: ValidationIssue[],
): void {
  if (value === null) {
    return;
  }
  if (typeof value !== 'string') {
    issues.push(issue(field, 'required', `${field} must be text or null`));
    return;
  }
  if (value.length > maxLength) {
    issues.push(issue(field, 'too_long', `${field} must be at most ${maxLength} characters`));
  }
}

function checkEnum(
  field: string,
  value: unknown,
  guard: (candidate: unknown) => boolean,
  issues: ValidationIssue[],
): void {
  if (!guard(value)) {
    issues.push(issue(field, 'invalid_enum', `${field} is not a recognised value`));
  }
}

function checkOptionalEnum(
  field: string,
  value: unknown,
  guard: (candidate: unknown) => boolean,
  issues: ValidationIssue[],
): void {
  if (value !== null && !guard(value)) {
    issues.push(issue(field, 'invalid_enum', `${field} is not a recognised value`));
  }
}

function checkOrder(
  earlierField: string,
  earlier: unknown,
  laterField: string,
  later: unknown,
  issues: ValidationIssue[],
): void {
  if (!isIsoTimestamp(earlier) || later === null || !isIsoTimestamp(later)) {
    return;
  }
  if (Date.parse(later) < Date.parse(earlier)) {
    issues.push(
      issue(laterField, 'out_of_order', `${laterField} must not precede ${earlierField}`),
    );
  }
}

function checkOptionalCount(field: string, value: unknown, issues: ValidationIssue[]): void {
  if (value === null) {
    return;
  }
  if (!Number.isInteger(value) || (value as number) < 0) {
    issues.push(issue(field, 'invalid_number', `${field} must be a non-negative integer or null`));
  }
}

/** True when a validation run produced no issues. */
export function isValid(issues: readonly ValidationIssue[]): boolean {
  return issues.length === 0;
}

// ---------------------------------------------------------------------------
// Raw evidence
// ---------------------------------------------------------------------------

export function validateCook(cook: Cook): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', cook.id, issues);
  checkOptionalText('title', cook.title, MAX_TITLE_LENGTH, issues);
  checkEnum('status', cook.status, isCookStatus, issues);
  checkEnum('provenance', cook.provenance, isProvenance, issues);
  checkOptionalId('parentCookId', cook.parentCookId, issues);
  checkTimestamp('startedAt', cook.startedAt, issues);
  checkOptionalTimestamp('reviewOpenedAt', cook.reviewOpenedAt, issues);
  checkOptionalTimestamp('reviewSavedAt', cook.reviewSavedAt, issues);
  checkTimestamp('createdAt', cook.createdAt, issues);
  checkOrder('startedAt', cook.startedAt, 'reviewOpenedAt', cook.reviewOpenedAt, issues);
  checkOrder('startedAt', cook.startedAt, 'reviewSavedAt', cook.reviewSavedAt, issues);
  checkOrder('reviewOpenedAt', cook.reviewOpenedAt, 'reviewSavedAt', cook.reviewSavedAt, issues);

  // The verdict is free text and is checked for nothing but being text of a
  // sane length. No vocabulary, no default, no trimming.
  if (cook.verdict !== null) {
    if (typeof cook.verdict !== 'string') {
      issues.push(issue('verdict', 'required', 'verdict must be text or null'));
    } else if (cook.verdict.length > MAX_TEXT_LENGTH) {
      issues.push(
        issue('verdict', 'too_long', `verdict must be at most ${MAX_TEXT_LENGTH} characters`),
      );
    }
  }

  if (cook.status === 'reviewed' && cook.reviewSavedAt === null) {
    issues.push(
      issue('reviewSavedAt', 'inconsistent_state', 'a reviewed cook must record when it was reviewed'),
    );
  }
  if (cook.status === 'open' && cook.reviewSavedAt !== null) {
    issues.push(
      issue('reviewSavedAt', 'inconsistent_state', 'an open cook has not had its review saved'),
    );
  }
  if (cook.parentCookId !== null && cook.parentCookId === cook.id) {
    issues.push(issue('parentCookId', 'invalid_relation', 'a cook cannot follow on from itself'));
  }

  return issues;
}

export function validateCookEvent(event: CookEvent): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', event.id, issues);
  checkId('cookId', event.cookId, issues);
  checkTimestamp('ts', event.ts, issues);
  checkEnum('kind', event.kind, isCookEventKind, issues);
  checkOptionalText('body', event.body, MAX_TEXT_LENGTH, issues);

  if (event.meta !== null && !isJsonValue(event.meta)) {
    issues.push(issue('meta', 'invalid_json', 'meta must be JSON-compatible or null'));
  }

  // A temperature event exists to record a number of degrees Celsius. One
  // without one is an event whose whole purpose is missing.
  if (event.kind === 'temp' && celsiusFromEvent(event) === null) {
    issues.push(
      issue('meta', 'required', `a temp event must record meta.${TEMPERATURE_META_KEY}`),
    );
  }

  // A reading either says what it was taken of, in one of the words this build
  // knows, or says nothing. A third thing in that key is a corrupted row, and
  // it is reported rather than quietly read as "it doesn't say".
  if (event.kind === 'temp') {
    const meta = event.meta;
    if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
      const kind = (meta as Record<string, unknown>)[READING_KIND_META_KEY];
      if (kind !== undefined && !isStoredReadingKind(kind)) {
        issues.push(
          issue(
            'meta',
            'invalid_enum',
            `meta.${READING_KIND_META_KEY} must be oven or internal, or be absent`,
          ),
        );
      }
    }
  }

  // Photo references live on photo events and nowhere else, so a photo can
  // never be orphaned from the moment it was taken.
  if (event.kind === 'photo' && event.photoPath === null) {
    issues.push(issue('photoPath', 'required', 'a photo event must reference a photo'));
  }
  if (event.kind !== 'photo' && event.photoPath !== null) {
    issues.push(
      issue('photoPath', 'inconsistent_state', 'only a photo event may reference a photo'),
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export function validateFinding(finding: Finding): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', finding.id, issues);
  checkId('cookId', finding.cookId, issues);
  checkEnum('class', finding.class, isFindingClass, issues);
  checkRequiredText('text', finding.text, MAX_TEXT_LENGTH, issues);
  checkOptionalText('rationale', finding.rationale, MAX_TEXT_LENGTH, issues);
  checkOptionalEnum('confidence', finding.confidence, isConfidenceLevel, issues);
  checkEnum('status', finding.status, isProposalStatus, issues);
  checkEnum('createdBy', finding.createdBy, isCreatedBy, issues);
  checkEnum('provenance', finding.provenance, isProvenance, issues);
  checkTimestamp('createdAt', finding.createdAt, issues);
  checkOptionalTimestamp('updatedAt', finding.updatedAt, issues);
  checkOrder('createdAt', finding.createdAt, 'updatedAt', finding.updatedAt, issues);

  return issues;
}

export function validateFindingSource(source: FindingSource): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('findingId', source.findingId, issues);
  checkId('cookEventId', source.cookEventId, issues);

  return issues;
}

export function validateLesson(lesson: Lesson): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', lesson.id, issues);
  checkId('cookId', lesson.cookId, issues);
  checkRequiredText('text', lesson.text, MAX_TEXT_LENGTH, issues);
  checkEnum('status', lesson.status, isProposalStatus, issues);
  checkEnum('provenance', lesson.provenance, isProvenance, issues);
  checkTimestamp('createdAt', lesson.createdAt, issues);
  checkOptionalTimestamp('updatedAt', lesson.updatedAt, issues);
  checkOrder('createdAt', lesson.createdAt, 'updatedAt', lesson.updatedAt, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// Tagging
// ---------------------------------------------------------------------------

export function validateTag(tag: Tag): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', tag.id, issues);
  checkRequiredText('name', tag.name, MAX_TAG_NAME_LENGTH, issues);
  // A tag may have no kind at all. One that has a kind must have one of the
  // four, so a tag written by an earlier build is still valid here.
  checkOptionalEnum('kind', tag.kind, isTagKind, issues);

  if (typeof tag.name === 'string' && tag.name !== normaliseTagName(tag.name)) {
    issues.push(
      issue('name', 'inconsistent_state', 'tag names are stored normalised and lowercase'),
    );
  }

  return issues;
}

export function validateCookTag(link: CookTag): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('cookId', link.cookId, issues);
  checkId('tagId', link.tagId, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export function validateBriefing(briefing: Briefing): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', briefing.id, issues);
  checkId('cookId', briefing.cookId, issues);
  checkTimestamp('createdAt', briefing.createdAt, issues);

  if (!isJsonValue(briefing.content)) {
    issues.push(issue('content', 'invalid_json', 'content must be JSON-compatible'));
  }
  // Three states, and the third is "the cook has not said". A briefing that
  // defaulted to `false` would be manufacturing feedback nobody gave.
  if (briefing.useful !== null && typeof briefing.useful !== 'boolean') {
    issues.push(issue('useful', 'inconsistent_state', 'useful must be true, false or null'));
  }

  return issues;
}

export function validateBriefingSource(source: BriefingSource): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('briefingId', source.briefingId, issues);
  checkId('cookId', source.cookId, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

export function validateImportBatch(batch: ImportBatch): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', batch.id, issues);
  checkOptionalText('filename', batch.filename, MAX_FILENAME_LENGTH, issues);
  checkEnum('status', batch.status, isImportBatchStatus, issues);
  checkOptionalCount('candidatesTotal', batch.candidatesTotal, issues);
  checkOptionalCount('candidatesResolved', batch.candidatesResolved, issues);
  checkTimestamp('createdAt', batch.createdAt, issues);

  if (
    typeof batch.candidatesTotal === 'number' &&
    typeof batch.candidatesResolved === 'number' &&
    batch.candidatesResolved > batch.candidatesTotal
  ) {
    issues.push(
      issue(
        'candidatesResolved',
        'inconsistent_state',
        'more candidates cannot be resolved than there were',
      ),
    );
  }

  return issues;
}

export function validateSchemaMeta(meta: SchemaMeta): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkRequiredText('key', meta.key, MAX_TITLE_LENGTH, issues);
  checkRequiredText('value', meta.value, MAX_TEXT_LENGTH, issues);

  return issues;
}
