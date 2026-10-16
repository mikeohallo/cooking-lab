/**
 * Building, checking and serialising a backup envelope.
 *
 * Everything here is pure: it turns records into a string and a string back
 * into records, and reports what is wrong with either. No file is opened; that
 * is `BackupWriter`/`BackupReader`'s job and it is deferred.
 *
 * TWO PROPERTIES THIS MODULE EXISTS TO GUARANTEE
 * ---------------------------------------------
 *   Deterministic output.  The same data always serialises to byte-identical
 *   text — object keys in a fixed order, collections sorted by their natural
 *   key. Two backups taken of an unchanged database are therefore comparable,
 *   which is what makes "did my backup actually capture everything" an
 *   answerable question rather than a hope.
 *
 *   Nothing is repaired on the way in.  Validation reports; it never drops a
 *   dangling row, invents a missing timestamp or rewrites an unsafe path. A
 *   restore that silently fixes things is a restore that silently loses things.
 */

import type {
  Briefing,
  BriefingSource,
  Cook,
  CookEvent,
  CookTag,
  DatabaseSnapshot,
  Finding,
  FindingSource,
  ImportBatch,
  IsoTimestamp,
  Lesson,
  SnapshotEntityKey,
  Tag,
} from '../../domain/entities';
import { SNAPSHOT_ENTITY_KEYS } from '../../domain/entities';
import type { ValidationIssue } from '../../domain/invariants';
import {
  isIsoTimestamp,
  validateBriefing,
  validateBriefingSource,
  validateCook,
  validateCookEvent,
  validateCookTag,
  validateFinding,
  validateFindingSource,
  validateImportBatch,
  validateLesson,
  validateTag,
} from '../../domain/invariants';
import { isSafePhotoLogicalPath } from '../photos/photoPaths';
import type { BackupEnvelope, BackupPhotoManifestEntry } from './contract';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  SHA256_HEX_PATTERN,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
} from './contract';

export type BackupIssueCode =
  | 'not_an_object'
  | 'wrong_format'
  | 'unsupported_format_version'
  | 'invalid_schema_version'
  | 'invalid_timestamp'
  | 'missing_collection'
  | 'invalid_record'
  | 'duplicate_key'
  | 'dangling_reference'
  | 'unsafe_photo_path'
  | 'photo_manifest_mismatch'
  | 'malformed_json';

export type BackupIssue = {
  /** Where the problem is, e.g. `entities.cookEvents[2].cookId`. */
  readonly at: string;
  readonly code: BackupIssueCode;
  readonly message: string;
};

export type BackupValidation = {
  readonly valid: boolean;
  readonly issues: readonly BackupIssue[];
};

function problem(at: string, code: BackupIssueCode, message: string): BackupIssue {
  return { at, code, message };
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Assemble an envelope. Validation is a separate, deliberate step. */
export function buildBackupEnvelope(
  snapshot: DatabaseSnapshot,
  photoManifest: readonly BackupPhotoManifestEntry[],
  schemaVersion: number,
  at: IsoTimestamp,
): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion,
    createdAt: at,
    entities: snapshot,
    photoManifest,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type UntrustedRow = Record<string, unknown>;
type RecordValidator = (row: UntrustedRow) => readonly ValidationIssue[];

/**
 * One validator per collection, so a new table cannot be forgotten here.
 *
 * The domain validators check the type of every field they read, so a row from
 * an untrusted file can be handed to them directly; that is what these casts
 * rely on.
 */
const RECORD_VALIDATORS: Readonly<Record<SnapshotEntityKey, RecordValidator>> = {
  cooks: (row) => validateCook(row as unknown as Cook),
  cookEvents: (row) => validateCookEvent(row as unknown as CookEvent),
  findings: (row) => validateFinding(row as unknown as Finding),
  findingSources: (row) => validateFindingSource(row as unknown as FindingSource),
  lessons: (row) => validateLesson(row as unknown as Lesson),
  tags: (row) => validateTag(row as unknown as Tag),
  cookTags: (row) => validateCookTag(row as unknown as CookTag),
  briefings: (row) => validateBriefing(row as unknown as Briefing),
  briefingSources: (row) => validateBriefingSource(row as unknown as BriefingSource),
  importBatches: (row) => validateImportBatch(row as unknown as ImportBatch),
};

/** The natural key of a row, used for duplicate detection and for sorting. */
function collectionKey(collection: SnapshotEntityKey, row: unknown): string {
  if (!isRecordObject(row)) {
    return '';
  }
  switch (collection) {
    case 'findingSources': {
      const source = row as unknown as FindingSource;
      return [source.findingId, source.cookEventId].join('|');
    }
    case 'briefingSources': {
      const source = row as unknown as BriefingSource;
      return [source.briefingId, source.cookId].join('|');
    }
    case 'cookTags': {
      const link = row as unknown as CookTag;
      return [link.cookId, link.tagId].join('|');
    }
    case 'tags': {
      const tag = row as unknown as Tag;
      // Sorted and de-duplicated by id, but `(name, kind)` uniqueness is what
      // the schema enforces, so it is checked separately below.
      return String(tag.id);
    }
    default:
      return String((row as { id?: unknown }).id ?? '');
  }
}

function collectIds(rows: readonly unknown[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (isRecordObject(row) && typeof row.id === 'string') {
      ids.add(row.id);
    }
  }
  return ids;
}

function checkReference(
  at: string,
  value: string | null,
  known: ReadonlySet<string>,
  what: string,
  issues: BackupIssue[],
): void {
  if (value !== null && !known.has(value)) {
    issues.push(problem(at, 'dangling_reference', `${what} ${value} is not in this backup`));
  }
}

/**
 * Check an envelope, structure first and meaning second.
 *
 * Accepts `unknown` because the interesting case is a file from somewhere else.
 * Structural failures stop the run early — there is no point reporting dangling
 * references in something that is not a backup.
 */
export function validateBackup(candidate: unknown): BackupValidation {
  const issues: BackupIssue[] = [];

  if (!isRecordObject(candidate)) {
    return { valid: false, issues: [problem('$', 'not_an_object', 'a backup must be an object')] };
  }
  if (candidate.format !== BACKUP_FORMAT) {
    issues.push(problem('format', 'wrong_format', `expected format ${BACKUP_FORMAT}`));
  }
  if (
    typeof candidate.formatVersion !== 'number' ||
    !SUPPORTED_BACKUP_FORMAT_VERSIONS.includes(candidate.formatVersion)
  ) {
    issues.push(
      problem(
        'formatVersion',
        'unsupported_format_version',
        `this build reads backup format ${SUPPORTED_BACKUP_FORMAT_VERSIONS.join(', ')}`,
      ),
    );
  }
  if (
    typeof candidate.schemaVersion !== 'number' ||
    !Number.isInteger(candidate.schemaVersion) ||
    candidate.schemaVersion < 1
  ) {
    issues.push(
      problem('schemaVersion', 'invalid_schema_version', 'schemaVersion must be an integer from 1'),
    );
  }
  if (!isIsoTimestamp(candidate.createdAt)) {
    issues.push(problem('createdAt', 'invalid_timestamp', 'createdAt must be an ISO-8601 UTC instant'));
  }
  if (!isRecordObject(candidate.entities)) {
    issues.push(problem('entities', 'missing_collection', 'entities is missing'));
    return { valid: false, issues };
  }
  if (!Array.isArray(candidate.photoManifest)) {
    issues.push(problem('photoManifest', 'missing_collection', 'photoManifest is missing'));
    return { valid: false, issues };
  }

  const entities = candidate.entities;
  const collections = new Map<SnapshotEntityKey, readonly unknown[]>();
  for (const key of SNAPSHOT_ENTITY_KEYS) {
    const rows = entities[key];
    if (!Array.isArray(rows)) {
      issues.push(problem(`entities.${key}`, 'missing_collection', `${key} must be an array`));
      continue;
    }
    collections.set(key, rows);
  }
  if (collections.size !== SNAPSHOT_ENTITY_KEYS.length) {
    return { valid: false, issues };
  }

  // --- every row: shape first, then duplicate natural keys ----------------
  for (const key of SNAPSHOT_ENTITY_KEYS) {
    const rows = collections.get(key) ?? [];
    const validate = RECORD_VALIDATORS[key];
    const seen = new Set<string>();

    rows.forEach((row, index) => {
      const at = `entities.${key}[${index}]`;
      if (!isRecordObject(row)) {
        issues.push(problem(at, 'invalid_record', 'row must be an object'));
        return;
      }
      for (const issue of validate(row)) {
        issues.push(
          problem(`${at}.${issue.field}`, 'invalid_record', `${issue.code}: ${issue.message}`),
        );
      }
      const naturalKey = collectionKey(key, row);
      if (naturalKey !== '' && seen.has(naturalKey)) {
        issues.push(problem(at, 'duplicate_key', `${key} contains ${naturalKey} twice`));
      }
      seen.add(naturalKey);
    });
  }

  const cookIds = collectIds(collections.get('cooks') ?? []);
  const cookEventIds = collectIds(collections.get('cookEvents') ?? []);
  const findingIds = collectIds(collections.get('findings') ?? []);
  const tagIds = collectIds(collections.get('tags') ?? []);
  const briefingIds = collectIds(collections.get('briefings') ?? []);

  // --- tag (name, kind) uniqueness, as the schema enforces it -------------
  const tagKeys = new Set<string>();
  (collections.get('tags') ?? []).forEach((row, index) => {
    const tag = row as Tag;
    const key = `${String(tag.name).toLowerCase()}|${tag.kind}`;
    if (tagKeys.has(key)) {
      issues.push(
        problem(
          `entities.tags[${index}]`,
          'duplicate_key',
          `a tag named ${tag.name} of kind ${tag.kind} already exists`,
        ),
      );
    }
    tagKeys.add(key);
  });

  // --- relationships -------------------------------------------------------
  (collections.get('cooks') ?? []).forEach((row, index) => {
    const cook = row as Cook;
    checkReference(
      `entities.cooks[${index}].parentCookId`,
      typeof cook.parentCookId === 'string' ? cook.parentCookId : null,
      cookIds,
      'cook',
      issues,
    );
  });

  (collections.get('cookEvents') ?? []).forEach((row, index) => {
    const event = row as CookEvent;
    checkReference(
      `entities.cookEvents[${index}].cookId`,
      typeof event.cookId === 'string' ? event.cookId : null,
      cookIds,
      'cook',
      issues,
    );
  });

  (collections.get('findings') ?? []).forEach((row, index) => {
    const finding = row as Finding;
    checkReference(
      `entities.findings[${index}].cookId`,
      typeof finding.cookId === 'string' ? finding.cookId : null,
      cookIds,
      'cook',
      issues,
    );
  });

  (collections.get('findingSources') ?? []).forEach((row, index) => {
    const source = row as FindingSource;
    const at = `entities.findingSources[${index}]`;
    checkReference(`${at}.findingId`, source.findingId ?? null, findingIds, 'finding', issues);
    checkReference(
      `${at}.cookEventId`,
      source.cookEventId ?? null,
      cookEventIds,
      'cook event',
      issues,
    );
  });

  (collections.get('lessons') ?? []).forEach((row, index) => {
    const lesson = row as Lesson;
    checkReference(
      `entities.lessons[${index}].cookId`,
      typeof lesson.cookId === 'string' ? lesson.cookId : null,
      cookIds,
      'cook',
      issues,
    );
  });

  (collections.get('cookTags') ?? []).forEach((row, index) => {
    const link = row as CookTag;
    const at = `entities.cookTags[${index}]`;
    checkReference(`${at}.cookId`, link.cookId ?? null, cookIds, 'cook', issues);
    checkReference(`${at}.tagId`, link.tagId ?? null, tagIds, 'tag', issues);
  });

  (collections.get('briefings') ?? []).forEach((row, index) => {
    const briefing = row as Briefing;
    checkReference(
      `entities.briefings[${index}].cookId`,
      typeof briefing.cookId === 'string' ? briefing.cookId : null,
      cookIds,
      'cook',
      issues,
    );
  });

  // A briefing is built from earlier cooks, and from nothing else.
  (collections.get('briefingSources') ?? []).forEach((row, index) => {
    const source = row as BriefingSource;
    const at = `entities.briefingSources[${index}]`;
    checkReference(`${at}.briefingId`, source.briefingId ?? null, briefingIds, 'briefing', issues);
    checkReference(`${at}.cookId`, source.cookId ?? null, cookIds, 'cook', issues);
  });

  // --- photo manifest ------------------------------------------------------
  const manifest = candidate.photoManifest as readonly unknown[];
  const manifestPaths = new Set<string>();

  manifest.forEach((row, index) => {
    const at = `photoManifest[${index}]`;
    if (!isRecordObject(row)) {
      issues.push(problem(at, 'invalid_record', 'manifest entry must be an object'));
      return;
    }
    const entry = row as unknown as BackupPhotoManifestEntry;

    if (!isSafePhotoLogicalPath(entry.logicalPath)) {
      issues.push(
        problem(
          `${at}.logicalPath`,
          'unsafe_photo_path',
          'a photo must be referenced by an app-private logical path',
        ),
      );
    } else {
      if (manifestPaths.has(entry.logicalPath)) {
        issues.push(problem(at, 'duplicate_key', `${entry.logicalPath} is listed twice`));
      }
      manifestPaths.add(entry.logicalPath);
    }
    if (!isIsoTimestamp(entry.capturedAt)) {
      issues.push(problem(`${at}.capturedAt`, 'invalid_timestamp', 'capturedAt must be ISO-8601 UTC'));
    }
    if (!Number.isInteger(entry.byteLength) || entry.byteLength < 0) {
      issues.push(
        problem(`${at}.byteLength`, 'invalid_record', 'byteLength must be a non-negative integer'),
      );
    }
    if (typeof entry.sha256 !== 'string' || !SHA256_HEX_PATTERN.test(entry.sha256)) {
      issues.push(problem(`${at}.sha256`, 'invalid_record', 'sha256 must be lowercase hex'));
    }
    checkReference(`${at}.cookId`, entry.cookId ?? null, cookIds, 'cook', issues);
    checkReference(`${at}.cookEventId`, entry.cookEventId ?? null, cookEventIds, 'cook event', issues);
  });

  // Every photo the timeline refers to must be in the manifest, or the backup
  // restores a cook whose photographs are gone.
  (collections.get('cookEvents') ?? []).forEach((row, index) => {
    const event = row as CookEvent;
    if (event.kind === 'photo' && typeof event.photoPath === 'string') {
      if (!manifestPaths.has(event.photoPath)) {
        issues.push(
          problem(
            `entities.cookEvents[${index}].photoPath`,
            'photo_manifest_mismatch',
            `${event.photoPath} is referenced by the timeline but is not in the manifest`,
          ),
        );
      }
    }
  });

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Deterministic serialisation
// ---------------------------------------------------------------------------

/**
 * Plain code-unit ordering, deliberately not `localeCompare`.
 *
 * Locale-aware comparison depends on the ICU data the device happens to ship,
 * which would make "deterministic" mean "deterministic on this phone".
 */
function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function byKey(collection: SnapshotEntityKey) {
  return (left: unknown, right: unknown): number =>
    compareStrings(collectionKey(collection, left), collectionKey(collection, right));
}

/**
 * Put an envelope into canonical order.
 *
 * Row order carries no meaning in a relational store, so leaving it to whatever
 * SQLite happened to return would make two identical databases produce two
 * different files.
 */
export function canonicaliseBackup(envelope: BackupEnvelope): BackupEnvelope {
  const source = envelope.entities;
  const entities: DatabaseSnapshot = {
    cooks: [...source.cooks].sort(byKey('cooks')),
    cookEvents: [...source.cookEvents].sort(byKey('cookEvents')),
    findings: [...source.findings].sort(byKey('findings')),
    findingSources: [...source.findingSources].sort(byKey('findingSources')),
    lessons: [...source.lessons].sort(byKey('lessons')),
    tags: [...source.tags].sort(byKey('tags')),
    cookTags: [...source.cookTags].sort(byKey('cookTags')),
    briefings: [...source.briefings].sort(byKey('briefings')),
    briefingSources: [...source.briefingSources].sort(byKey('briefingSources')),
    importBatches: [...source.importBatches].sort(byKey('importBatches')),
  };

  return {
    ...envelope,
    entities,
    photoManifest: [...envelope.photoManifest].sort((left, right) =>
      compareStrings(left.logicalPath, right.logicalPath),
    ),
  };
}

/** One level of indentation in a backup file. */
const INDENT = '  ';

/**
 * JSON with object keys in sorted order at every depth, laid out one value
 * per line.
 *
 * The layout is for the person, not the machine: a backup opened in Drive or
 * a text editor on a phone reads as a document rather than as one unbroken
 * line, and a verdict can be found by eye. The bytes are still deterministic
 * — same data, same text — because the layout is a pure function of the
 * value, and a reader ignores the whitespace.
 */
function stableStringify(value: unknown, depth = 0): string {
  if (value === undefined) {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  const inner = INDENT.repeat(depth + 1);
  const outer = INDENT.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map((item) => `${inner}${stableStringify(item, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${outer}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareStrings(left, right))
    .map(
      ([key, entryValue]) => `${inner}${JSON.stringify(key)}: ${stableStringify(entryValue, depth + 1)}`,
    );
  if (entries.length === 0) {
    return '{}';
  }
  return `{\n${entries.join(',\n')}\n${outer}}`;
}

/**
 * The bytes of a backup, as text.
 *
 * Deterministic by construction: canonical row order, then sorted keys. Two
 * calls with equal data produce identical strings, which is what makes a
 * backup's digest meaningful.
 */
export function serialiseBackup(envelope: BackupEnvelope): string {
  return stableStringify(canonicaliseBackup(envelope));
}

export type BackupParseResult =
  | { readonly ok: true; readonly envelope: BackupEnvelope }
  | { readonly ok: false; readonly issues: readonly BackupIssue[] };

/**
 * Parse and validate backup text.
 *
 * A backup is only handed back when it is completely valid. Half a backup is
 * not a smaller backup; it is a corrupted one, and this app will not restore
 * from it silently.
 */
export function deserialiseBackup(text: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      issues: [problem('$', 'malformed_json', 'the backup file is not valid JSON')],
    };
  }
  const validation = validateBackup(parsed);
  if (!validation.valid) {
    return { ok: false, issues: validation.issues };
  }
  return { ok: true, envelope: parsed as BackupEnvelope };
}
