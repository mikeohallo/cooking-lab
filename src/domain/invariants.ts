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
 *   Thin records are valid.  A cook with nothing but a title and a start time
 *   is a real cook. Validation rejects malformed data, never sparse data.
 *
 *   Validation never mutates.  Every function returns issues; nothing here
 *   repairs, defaults or truncates on the caller's behalf.
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
  Lesson,
  SchemaMeta,
  Tag,
} from './entities';
import { briefingSourceRef, findingSourceRef } from './entities';
import {
  isBriefingSourceKind,
  isBriefingStatus,
  isCookEventKind,
  isCookStatus,
  isCookVerdict,
  isEvidenceStrength,
  isFindingSourceKind,
  isImportBatchOrigin,
  isImportBatchStatus,
  isProvenance,
  isReviewStatus,
  isSourceRelation,
  isTagKind,
  isTemperatureUnit,
} from './enums';

/** Longest permitted title-like field. */
export const MAX_TITLE_LENGTH = 200;
/** Longest permitted free-text field. */
export const MAX_TEXT_LENGTH = 8000;
/** Longest permitted tag name. */
export const MAX_TAG_NAME_LENGTH = 60;

export type ValidationCode =
  | 'invalid_id'
  | 'required'
  | 'too_long'
  | 'invalid_enum'
  | 'invalid_timestamp'
  | 'out_of_order'
  | 'invalid_number'
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
 * Tag names are stored normalised so `(name, kind)` uniqueness means what a
 * cook would expect: " Brown  Butter " and "brown butter" are one tag.
 */
export function normaliseTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
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
  checkRequiredText('title', cook.title, MAX_TITLE_LENGTH, issues);
  checkEnum('status', cook.status, isCookStatus, issues);
  checkEnum('verdict', cook.verdict, isCookVerdict, issues);
  checkTimestamp('startedAt', cook.startedAt, issues);
  checkOptionalTimestamp('finishedAt', cook.finishedAt, issues);
  checkTimestamp('createdAt', cook.createdAt, issues);
  checkTimestamp('updatedAt', cook.updatedAt, issues);
  checkOptionalText('verdictNote', cook.verdictNote, MAX_TEXT_LENGTH, issues);
  checkOptionalText('notes', cook.notes, MAX_TEXT_LENGTH, issues);
  checkOrder('startedAt', cook.startedAt, 'finishedAt', cook.finishedAt, issues);
  checkOrder('createdAt', cook.createdAt, 'updatedAt', cook.updatedAt, issues);

  // A finished cook has a finish time; an unfinished one does not pretend to.
  if (cook.status === 'complete' && cook.finishedAt === null) {
    issues.push(
      issue('finishedAt', 'inconsistent_state', 'a complete cook must record when it ended'),
    );
  }
  if (cook.status === 'planned' && cook.finishedAt !== null) {
    issues.push(
      issue('finishedAt', 'inconsistent_state', 'a planned cook cannot have already ended'),
    );
  }
  // A verdict note without a verdict is a judgement with no judgement attached.
  if (cook.verdict === 'unrated' && cook.verdictNote !== null) {
    issues.push(
      issue('verdictNote', 'inconsistent_state', 'a verdict note requires a verdict'),
    );
  }

  return issues;
}

export function validateCookEvent(event: CookEvent): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', event.id, issues);
  checkId('cookId', event.cookId, issues);
  checkEnum('kind', event.kind, isCookEventKind, issues);
  checkTimestamp('occurredAt', event.occurredAt, issues);
  checkTimestamp('createdAt', event.createdAt, issues);
  checkOptionalText('label', event.label, MAX_TITLE_LENGTH, issues);
  checkOptionalText('text', event.text, MAX_TEXT_LENGTH, issues);

  if (event.offsetSeconds !== null && !Number.isFinite(event.offsetSeconds)) {
    issues.push(issue('offsetSeconds', 'invalid_number', 'offsetSeconds must be a number'));
  }
  if (event.numericValue !== null && !Number.isFinite(event.numericValue)) {
    issues.push(issue('numericValue', 'invalid_number', 'numericValue must be a number'));
  }

  if (event.kind === 'temperature') {
    if (event.numericValue === null) {
      issues.push(
        issue('numericValue', 'required', 'a temperature event must record a temperature'),
      );
    }
    if (!isTemperatureUnit(event.unit)) {
      issues.push(issue('unit', 'invalid_enum', 'a temperature event must record c or f'));
    }
  }
  if (event.kind === 'timing' && event.numericValue === null) {
    issues.push(issue('numericValue', 'required', 'a timing event must record a duration'));
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
// Reviewable claims
// ---------------------------------------------------------------------------

function checkReviewableFacts(
  record: Finding | Lesson,
  issues: ValidationIssue[],
): void {
  checkEnum('status', record.status, isReviewStatus, issues);
  checkEnum('createdBy', record.createdBy, isProvenance, issues);
  checkTimestamp('createdAt', record.createdAt, issues);
  checkTimestamp('updatedAt', record.updatedAt, issues);
  checkOptionalTimestamp('decidedAt', record.decidedAt, issues);
  checkOrder('createdAt', record.createdAt, 'updatedAt', record.updatedAt, issues);
  checkOrder('createdAt', record.createdAt, 'decidedAt', record.decidedAt, issues);

  if (typeof record.userEdited !== 'boolean') {
    issues.push(issue('userEdited', 'required', 'userEdited must be true or false'));
  }
  // A decision leaves a timestamp behind, and an undecided record carries none.
  if (record.status === 'proposed' && record.decidedAt !== null) {
    issues.push(
      issue('decidedAt', 'inconsistent_state', 'a proposed record has not been decided'),
    );
  }
  if (record.status !== 'proposed' && record.decidedAt === null) {
    issues.push(
      issue('decidedAt', 'inconsistent_state', 'a decided record must record when'),
    );
  }
}

export function validateFinding(finding: Finding): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', finding.id, issues);
  checkRequiredText('title', finding.title, MAX_TITLE_LENGTH, issues);
  checkOptionalText('detail', finding.detail, MAX_TEXT_LENGTH, issues);
  checkEnum('evidenceStrength', finding.evidenceStrength, isEvidenceStrength, issues);
  checkReviewableFacts(finding, issues);

  return issues;
}

export function validateFindingSource(source: FindingSource): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('findingId', source.findingId, issues);
  checkEnum('sourceKind', source.sourceKind, isFindingSourceKind, issues);
  checkEnum('relation', source.relation, isSourceRelation, issues);
  checkTimestamp('createdAt', source.createdAt, issues);
  checkOptionalId('cookId', source.cookId, issues);
  checkOptionalId('cookEventId', source.cookEventId, issues);

  // Exactly one reference column, matching the declared kind. This mirrors the
  // table's CHECK constraint, which is what lets SQLite cascade the delete.
  const expectedCook = source.sourceKind === 'cook';
  if (expectedCook && (source.cookId === null || source.cookEventId !== null)) {
    issues.push(
      issue('cookId', 'invalid_relation', 'a cook source must set cookId and only cookId'),
    );
  }
  if (!expectedCook && (source.cookEventId === null || source.cookId !== null)) {
    issues.push(
      issue(
        'cookEventId',
        'invalid_relation',
        'a cook_event source must set cookEventId and only cookEventId',
      ),
    );
  }
  if (findingSourceRef(source) === null) {
    issues.push(issue('sourceKind', 'invalid_relation', 'a source must cite something'));
  }

  return issues;
}

export function validateLesson(lesson: Lesson): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', lesson.id, issues);
  checkRequiredText('title', lesson.title, MAX_TITLE_LENGTH, issues);
  checkRequiredText('guidance', lesson.guidance, MAX_TEXT_LENGTH, issues);
  checkOptionalId('originFindingId', lesson.originFindingId, issues);
  checkReviewableFacts(lesson, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// Tagging
// ---------------------------------------------------------------------------

export function validateTag(tag: Tag): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', tag.id, issues);
  checkRequiredText('name', tag.name, MAX_TAG_NAME_LENGTH, issues);
  checkEnum('kind', tag.kind, isTagKind, issues);
  checkTimestamp('createdAt', tag.createdAt, issues);

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
  checkTimestamp('createdAt', link.createdAt, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export function validateBriefing(briefing: Briefing): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', briefing.id, issues);
  checkOptionalId('cookId', briefing.cookId, issues);
  checkRequiredText('title', briefing.title, MAX_TITLE_LENGTH, issues);
  checkRequiredText('body', briefing.body, MAX_TEXT_LENGTH, issues);
  checkEnum('status', briefing.status, isBriefingStatus, issues);
  checkEnum('createdBy', briefing.createdBy, isProvenance, issues);
  checkTimestamp('createdAt', briefing.createdAt, issues);
  checkOptionalTimestamp('issuedAt', briefing.issuedAt, issues);
  checkOrder('createdAt', briefing.createdAt, 'issuedAt', briefing.issuedAt, issues);

  if (briefing.status === 'issued' && briefing.issuedAt === null) {
    issues.push(
      issue('issuedAt', 'inconsistent_state', 'an issued briefing must record when'),
    );
  }
  if (briefing.status === 'draft' && briefing.issuedAt !== null) {
    issues.push(
      issue('issuedAt', 'inconsistent_state', 'a draft briefing has not been issued'),
    );
  }

  return issues;
}

export function validateBriefingSource(source: BriefingSource): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('briefingId', source.briefingId, issues);
  checkEnum('sourceKind', source.sourceKind, isBriefingSourceKind, issues);
  checkTimestamp('createdAt', source.createdAt, issues);
  checkOptionalId('findingId', source.findingId, issues);
  checkOptionalId('lessonId', source.lessonId, issues);
  checkOptionalId('cookId', source.cookId, issues);

  const set = [source.findingId, source.lessonId, source.cookId].filter(
    (value) => value !== null,
  );
  if (set.length !== 1 || briefingSourceRef(source) === null) {
    issues.push(
      issue(
        'sourceKind',
        'invalid_relation',
        'a briefing source sets exactly the id column matching its kind',
      ),
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

export function validateImportBatch(batch: ImportBatch): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkId('id', batch.id, issues);
  checkEnum('origin', batch.origin, isImportBatchOrigin, issues);
  checkEnum('status', batch.status, isImportBatchStatus, issues);
  checkRequiredText('label', batch.label, MAX_TITLE_LENGTH, issues);
  checkOptionalText('note', batch.note, MAX_TEXT_LENGTH, issues);
  checkTimestamp('startedAt', batch.startedAt, issues);
  checkOptionalTimestamp('completedAt', batch.completedAt, issues);
  checkOrder('startedAt', batch.startedAt, 'completedAt', batch.completedAt, issues);

  if (!Number.isInteger(batch.recordCount) || batch.recordCount < 0) {
    issues.push(
      issue('recordCount', 'invalid_number', 'recordCount must be a non-negative integer'),
    );
  }
  if (batch.status === 'pending' && batch.completedAt !== null) {
    issues.push(
      issue('completedAt', 'inconsistent_state', 'a pending batch has not completed'),
    );
  }
  if (batch.status !== 'pending' && batch.completedAt === null) {
    issues.push(
      issue('completedAt', 'inconsistent_state', 'a settled batch must record when'),
    );
  }

  return issues;
}

export function validateSchemaMeta(meta: SchemaMeta): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkRequiredText('key', meta.key, MAX_TITLE_LENGTH, issues);
  checkRequiredText('value', meta.value, MAX_TEXT_LENGTH, issues);
  checkTimestamp('updatedAt', meta.updatedAt, issues);

  return issues;
}
