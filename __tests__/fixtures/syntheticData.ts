/**
 * SYNTHETIC TEST DATA — NOT PRODUCTION CODE, NOT REAL COOKING.
 *
 * Every record here is invented. None of it describes anything Mike has ever
 * cooked, and none of it may be presented to a user as though it did.
 *
 * WHY IT LIVES IN `__tests__` AND NOT IN `src`
 * -------------------------------------------
 * The app bundle is built from `app/` and `src/`. A fixture module inside
 * either of those is one accidental import away from shipping — and a shipped
 * fixture is worse than a bug, because the data it fabricates is exactly the
 * kind the app asks the cook to trust. Keeping it outside the source tree means
 * the separation is structural rather than a matter of remembering.
 * `__tests__/fixtureSeparation.test.ts` proves nothing under `app/` or `src/`
 * reaches in here.
 *
 * Two further guards travel with the data itself: every identifier begins with
 * `synthetic-`, and the import batch that "loaded" it is recorded with origin
 * `synthetic_fixture`, which is not the origin the shipping app may write.
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
  Lesson,
  Tag,
} from '../../src/domain/entities';
import type { BackupEnvelope, BackupPhotoManifestEntry } from '../../src/data/backup/contract';
import { buildBackupEnvelope } from '../../src/data/backup/validation';
import { LATEST_SCHEMA_VERSION } from '../../src/data/schema/migrations';

/** Every synthetic identifier starts with this, and nothing else does. */
export const SYNTHETIC_ID_PREFIX = 'synthetic-';

const COOK_BAKE = 'synthetic-cook-sourdough-01';
const COOK_THIN = 'synthetic-cook-thin-02';
const EVENT_OVEN_TEMP = 'synthetic-event-oven-temp';
const EVENT_STEAM_NOTE = 'synthetic-event-steam-note';
const EVENT_CRUMB_PHOTO = 'synthetic-event-crumb-photo';
const FINDING_HYDRATION = 'synthetic-finding-hydration';
const FINDING_STEAM = 'synthetic-finding-steam';
const LESSON_STEAM = 'synthetic-lesson-steam';
const LESSON_HYDRATION = 'synthetic-lesson-hydration';
const TAG_SOURDOUGH = 'synthetic-tag-sourdough';
const TAG_HIGH_HYDRATION = 'synthetic-tag-high-hydration';
const BRIEFING_NEXT_BAKE = 'synthetic-briefing-next-bake';
const IMPORT_BATCH = 'synthetic-import-fixture-01';

/** Written out rather than generated, so the path policy is tested against a
 *  literal a human checked, not against its own implementation. */
export const SYNTHETIC_PHOTO_PATH =
  'cooks/synthetic-cook-sourdough-01/events/synthetic-event-crumb-photo/20260814t182000-01.jpg';

const SYNTHETIC_COOKS: readonly Cook[] = [
  {
    id: COOK_BAKE,
    title: 'Synthetic sourdough bake',
    status: 'complete',
    startedAt: '2026-08-14T15:00:00.000Z',
    finishedAt: '2026-08-14T19:30:00.000Z',
    verdict: 'good',
    verdictNote: 'Open crumb, crust paler than intended.',
    notes: 'Fixture cook. Nothing here was eaten by anyone.',
    createdAt: '2026-08-14T15:00:00.000Z',
    updatedAt: '2026-08-14T19:45:00.000Z',
  },
  // A deliberately thin record: a title, a start, and nothing else. The domain
  // must accept this, because it is what a real cook looks like at minute one.
  {
    id: COOK_THIN,
    title: 'Synthetic thin record',
    status: 'planned',
    startedAt: '2026-08-20T10:00:00.000Z',
    finishedAt: null,
    verdict: 'unrated',
    verdictNote: null,
    notes: null,
    createdAt: '2026-08-20T09:55:00.000Z',
    updatedAt: '2026-08-20T09:55:00.000Z',
  },
];

const SYNTHETIC_COOK_EVENTS: readonly CookEvent[] = [
  {
    id: EVENT_OVEN_TEMP,
    cookId: COOK_BAKE,
    kind: 'temperature',
    occurredAt: '2026-08-14T17:05:00.000Z',
    offsetSeconds: 7500,
    label: 'Oven at load',
    text: null,
    numericValue: 245,
    unit: 'c',
    photoPath: null,
    createdAt: '2026-08-14T17:05:00.000Z',
  },
  {
    id: EVENT_STEAM_NOTE,
    cookId: COOK_BAKE,
    kind: 'observation',
    occurredAt: '2026-08-14T17:25:00.000Z',
    offsetSeconds: 8700,
    label: 'Steam',
    text: 'Lid off after twenty minutes; oven spring had already stopped.',
    numericValue: null,
    unit: null,
    photoPath: null,
    createdAt: '2026-08-14T17:25:00.000Z',
  },
  {
    id: EVENT_CRUMB_PHOTO,
    cookId: COOK_BAKE,
    kind: 'photo',
    occurredAt: '2026-08-14T18:20:00.000Z',
    offsetSeconds: 12000,
    label: 'Crumb',
    text: null,
    numericValue: null,
    unit: null,
    photoPath: SYNTHETIC_PHOTO_PATH,
    createdAt: '2026-08-14T18:20:00.000Z',
  },
];

const SYNTHETIC_FINDINGS: readonly Finding[] = [
  // An assistant proposal, undecided: exactly the state the evidence rules say
  // an assistant candidate must stop in.
  {
    id: FINDING_HYDRATION,
    title: 'Higher hydration doughs are spreading before the oven',
    detail: 'Both recorded bakes at this hydration lost shape during the final proof.',
    status: 'proposed',
    createdBy: 'ai',
    userEdited: false,
    evidenceStrength: 'corroborated',
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:00:00.000Z',
    decidedAt: null,
  },
  // The cook's own finding, approved on arrival because they wrote it.
  {
    id: FINDING_STEAM,
    title: 'Removing the lid at twenty minutes is too early',
    detail: null,
    status: 'approved',
    createdBy: 'user',
    userEdited: false,
    evidenceStrength: 'single',
    createdAt: '2026-08-15T08:30:00.000Z',
    updatedAt: '2026-08-15T08:30:00.000Z',
    decidedAt: '2026-08-15T08:30:00.000Z',
  },
];

const SYNTHETIC_FINDING_SOURCES: readonly FindingSource[] = [
  {
    findingId: FINDING_HYDRATION,
    sourceKind: 'cook',
    cookId: COOK_BAKE,
    cookEventId: null,
    relation: 'supports',
    createdAt: '2026-08-15T08:00:00.000Z',
  },
  {
    findingId: FINDING_HYDRATION,
    sourceKind: 'cook_event',
    cookId: null,
    cookEventId: EVENT_OVEN_TEMP,
    relation: 'supports',
    createdAt: '2026-08-15T08:00:00.000Z',
  },
  {
    findingId: FINDING_STEAM,
    sourceKind: 'cook_event',
    cookId: null,
    cookEventId: EVENT_STEAM_NOTE,
    relation: 'supports',
    createdAt: '2026-08-15T08:30:00.000Z',
  },
];

const SYNTHETIC_LESSONS: readonly Lesson[] = [
  {
    id: LESSON_STEAM,
    title: 'Keep the lid on for thirty minutes',
    guidance: 'Leave the lid on until the oven spring has clearly finished.',
    status: 'proposed',
    createdBy: 'ai',
    userEdited: false,
    originFindingId: FINDING_STEAM,
    createdAt: '2026-08-15T09:00:00.000Z',
    updatedAt: '2026-08-15T09:00:00.000Z',
    decidedAt: null,
  },
  {
    id: LESSON_HYDRATION,
    title: 'Shape high-hydration doughs colder',
    guidance: 'Chill the dough for thirty minutes before the final shape.',
    status: 'approved',
    createdBy: 'user',
    userEdited: true,
    originFindingId: null,
    createdAt: '2026-08-15T09:10:00.000Z',
    updatedAt: '2026-08-16T07:00:00.000Z',
    decidedAt: '2026-08-15T09:10:00.000Z',
  },
];

const SYNTHETIC_TAGS: readonly Tag[] = [
  { id: TAG_SOURDOUGH, name: 'sourdough', kind: 'dish', createdAt: '2026-08-14T15:00:00.000Z' },
  {
    id: TAG_HIGH_HYDRATION,
    name: 'high hydration',
    kind: 'technique',
    createdAt: '2026-08-14T15:00:00.000Z',
  },
];

const SYNTHETIC_COOK_TAGS: readonly CookTag[] = [
  { cookId: COOK_BAKE, tagId: TAG_SOURDOUGH, createdAt: '2026-08-14T15:00:00.000Z' },
  { cookId: COOK_BAKE, tagId: TAG_HIGH_HYDRATION, createdAt: '2026-08-14T15:00:00.000Z' },
];

const SYNTHETIC_BRIEFINGS: readonly Briefing[] = [
  {
    id: BRIEFING_NEXT_BAKE,
    cookId: COOK_THIN,
    title: 'Before this bake',
    body: 'Two things carried over from the last bake at this hydration.',
    status: 'draft',
    createdBy: 'ai',
    createdAt: '2026-08-20T09:56:00.000Z',
    issuedAt: null,
  },
];

const SYNTHETIC_BRIEFING_SOURCES: readonly BriefingSource[] = [
  {
    briefingId: BRIEFING_NEXT_BAKE,
    sourceKind: 'finding',
    findingId: FINDING_STEAM,
    lessonId: null,
    cookId: null,
    createdAt: '2026-08-20T09:56:00.000Z',
  },
  {
    briefingId: BRIEFING_NEXT_BAKE,
    sourceKind: 'lesson',
    findingId: null,
    lessonId: LESSON_HYDRATION,
    cookId: null,
    createdAt: '2026-08-20T09:56:00.000Z',
  },
  {
    briefingId: BRIEFING_NEXT_BAKE,
    sourceKind: 'cook',
    findingId: null,
    lessonId: null,
    cookId: COOK_BAKE,
    createdAt: '2026-08-20T09:56:00.000Z',
  },
];

const IMPORTED_ROW_COUNT =
  SYNTHETIC_COOKS.length +
  SYNTHETIC_COOK_EVENTS.length +
  SYNTHETIC_FINDINGS.length +
  SYNTHETIC_FINDING_SOURCES.length +
  SYNTHETIC_LESSONS.length +
  SYNTHETIC_TAGS.length +
  SYNTHETIC_COOK_TAGS.length +
  SYNTHETIC_BRIEFINGS.length +
  SYNTHETIC_BRIEFING_SOURCES.length;

const SYNTHETIC_IMPORT_BATCHES: readonly ImportBatch[] = [
  {
    id: IMPORT_BATCH,
    origin: 'synthetic_fixture',
    status: 'applied',
    label: 'Synthetic fixture load',
    recordCount: IMPORTED_ROW_COUNT,
    startedAt: '2026-08-14T14:59:00.000Z',
    completedAt: '2026-08-14T14:59:01.000Z',
    note: 'Test data only. Never written by the shipping app.',
  },
];

const SYNTHETIC_PHOTO_MANIFEST: readonly BackupPhotoManifestEntry[] = [
  {
    logicalPath: SYNTHETIC_PHOTO_PATH,
    cookId: COOK_BAKE,
    cookEventId: EVENT_CRUMB_PHOTO,
    capturedAt: '2026-08-14T18:20:00.000Z',
    byteLength: 248512,
    // A stand-in digest. No real file exists; nothing in this milestone hashes
    // one, and a fabricated-looking value is the honest way to say so.
    sha256: '3f'.repeat(32),
  },
];

/** The whole synthetic database, consistent and referentially complete. */
export function syntheticSnapshot(): DatabaseSnapshot {
  return {
    cooks: SYNTHETIC_COOKS,
    cookEvents: SYNTHETIC_COOK_EVENTS,
    findings: SYNTHETIC_FINDINGS,
    findingSources: SYNTHETIC_FINDING_SOURCES,
    lessons: SYNTHETIC_LESSONS,
    tags: SYNTHETIC_TAGS,
    cookTags: SYNTHETIC_COOK_TAGS,
    briefings: SYNTHETIC_BRIEFINGS,
    briefingSources: SYNTHETIC_BRIEFING_SOURCES,
    importBatches: SYNTHETIC_IMPORT_BATCHES,
  };
}

export function syntheticPhotoManifest(): readonly BackupPhotoManifestEntry[] {
  return SYNTHETIC_PHOTO_MANIFEST;
}

/** A valid backup of the synthetic database. */
export function syntheticBackupEnvelope(): BackupEnvelope {
  return buildBackupEnvelope(
    syntheticSnapshot(),
    syntheticPhotoManifest(),
    LATEST_SCHEMA_VERSION,
    '2026-08-21T06:00:00.000Z',
  );
}

/** Every identifier the fixture uses, for the separation test. */
export function syntheticIds(): readonly string[] {
  const snapshot = syntheticSnapshot();
  return [
    ...snapshot.cooks.map((cook) => cook.id),
    ...snapshot.cookEvents.map((event) => event.id),
    ...snapshot.findings.map((finding) => finding.id),
    ...snapshot.lessons.map((lesson) => lesson.id),
    ...snapshot.tags.map((tag) => tag.id),
    ...snapshot.briefings.map((briefing) => briefing.id),
    ...snapshot.importBatches.map((batch) => batch.id),
  ];
}
