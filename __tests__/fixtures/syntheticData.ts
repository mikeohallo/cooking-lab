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
 * WHY EVERY VALUE IS A REAL ONE
 * -----------------------------
 * The vocabularies below are the production vocabularies: a real cook status, a
 * real event kind, a real import status. There is no `synthetic_fixture` enum
 * value hidden in the product model to make this data safe, because a value
 * that exists only for test data still has to be handled, displayed and
 * migrated forever. What marks this data out is its identifiers: every one
 * begins `synthetic-`, and nothing the app generates does.
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

const COOK_IMPORTED = 'synthetic-cook-imported-00';
const COOK_BAKE = 'synthetic-cook-sourdough-01';
const COOK_NEXT = 'synthetic-cook-next-02';

const EVENT_PLAN = 'synthetic-event-plan';
const EVENT_NOTE = 'synthetic-event-note';
const EVENT_OVEN_TEMP = 'synthetic-event-oven-temp';
const EVENT_ASSISTANT = 'synthetic-event-assistant-msg';
const EVENT_CRUMB_PHOTO = 'synthetic-event-crumb-photo';

const FINDING_OBSERVED = 'synthetic-finding-observed';
const FINDING_INFERENCE = 'synthetic-finding-inference';
const FINDING_KNOWLEDGE = 'synthetic-finding-knowledge';
const FINDING_USER = 'synthetic-finding-user';
const FINDING_IMPORTED = 'synthetic-finding-imported';

const LESSON_PROPOSED = 'synthetic-lesson-proposed';
const LESSON_APPROVED = 'synthetic-lesson-approved';
const LESSON_IMPORTED = 'synthetic-lesson-imported';

const TAG_SOURDOUGH = 'synthetic-tag-sourdough';
const TAG_FLOUR = 'synthetic-tag-flour';
const TAG_HIGH_HYDRATION = 'synthetic-tag-high-hydration';
const TAG_DUTCH_OVEN = 'synthetic-tag-dutch-oven';

const BRIEFING_FOR_BAKE = 'synthetic-briefing-for-bake';
const BRIEFING_FOR_NEXT = 'synthetic-briefing-for-next';

const IMPORT_BATCH_DONE = 'synthetic-import-done';
const IMPORT_BATCH_RUNNING = 'synthetic-import-running';

/**
 * A verdict with awkward text in it, on purpose.
 *
 * Leading and trailing spaces, a line break and mixed case: the verdict is
 * stored exactly as typed, and a fixture that only ever contained a tidy
 * sentence would not notice the day something started tidying it.
 */
export const SYNTHETIC_VERDICT =
  '  Good crust, pale base.\nWould give it ten more minutes — not "great" yet.  ';

/** Written out rather than generated, so the path policy is tested against a
 *  literal a human checked, not against its own implementation. */
export const SYNTHETIC_PHOTO_PATH =
  'cooks/synthetic-cook-sourdough-01/events/synthetic-event-crumb-photo/20260814t182000-01.jpg';

const SYNTHETIC_COOKS: readonly Cook[] = [
  // Brought in from an earlier notebook, not cooked in the app.
  {
    id: COOK_IMPORTED,
    title: 'Synthetic imported bake',
    status: 'reviewed',
    provenance: 'imported',
    parentCookId: null,
    startedAt: '2026-07-02T16:00:00.000Z',
    reviewOpenedAt: '2026-07-02T20:00:00.000Z',
    reviewSavedAt: '2026-07-02T20:05:00.000Z',
    verdict: 'Dense. Under-proved.',
    createdAt: '2026-07-02T16:00:00.000Z',
  },
  {
    id: COOK_BAKE,
    title: 'Synthetic sourdough bake',
    status: 'reviewed',
    provenance: 'live',
    parentCookId: COOK_IMPORTED,
    startedAt: '2026-08-14T15:00:00.000Z',
    reviewOpenedAt: '2026-08-14T19:40:00.000Z',
    reviewSavedAt: '2026-08-14T19:45:00.000Z',
    verdict: SYNTHETIC_VERDICT,
    createdAt: '2026-08-14T15:00:00.000Z',
  },
  // A deliberately thin record: a start time and nothing else. The domain must
  // accept this, because it is what a real cook looks like at minute one — not
  // yet named, not yet reviewed, no verdict to give.
  {
    id: COOK_NEXT,
    title: null,
    status: 'open',
    provenance: 'live',
    parentCookId: COOK_BAKE,
    startedAt: '2026-08-20T10:00:00.000Z',
    reviewOpenedAt: null,
    reviewSavedAt: null,
    verdict: null,
    createdAt: '2026-08-20T09:55:00.000Z',
  },
];

const SYNTHETIC_COOK_EVENTS: readonly CookEvent[] = [
  {
    id: EVENT_PLAN,
    cookId: COOK_BAKE,
    ts: '2026-08-14T15:00:00.000Z',
    kind: 'plan',
    body: 'Same loaf as last time, longer bulk.',
    meta: { steps: ['autolyse', 'bulk', 'shape', 'cold proof', 'bake'] },
    photoPath: null,
  },
  {
    id: EVENT_NOTE,
    cookId: COOK_BAKE,
    ts: '2026-08-14T17:25:00.000Z',
    kind: 'user_note',
    body: 'Lid off after twenty minutes; oven spring had already stopped.',
    meta: null,
    photoPath: null,
  },
  // Degrees Celsius, in `meta`. There is no other unit and no unit column.
  {
    id: EVENT_OVEN_TEMP,
    cookId: COOK_BAKE,
    ts: '2026-08-14T17:05:00.000Z',
    kind: 'temp',
    body: 'Oven at load',
    meta: { celsius: 245 },
    photoPath: null,
  },
  {
    id: EVENT_ASSISTANT,
    cookId: COOK_BAKE,
    ts: '2026-08-14T17:30:00.000Z',
    kind: 'assistant_msg',
    body: 'Noted. The lid came off earlier than the last two bakes.',
    meta: null,
    photoPath: null,
  },
  {
    id: EVENT_CRUMB_PHOTO,
    cookId: COOK_BAKE,
    ts: '2026-08-14T18:20:00.000Z',
    kind: 'photo',
    body: 'Crumb',
    meta: null,
    photoPath: SYNTHETIC_PHOTO_PATH,
  },
];

const SYNTHETIC_FINDINGS: readonly Finding[] = [
  // What the record says, proposed by the assistant and not yet decided.
  {
    id: FINDING_OBSERVED,
    cookId: COOK_BAKE,
    class: 'observed',
    text: 'The oven was at 245C when the loaf went in.',
    rationale: null,
    confidence: null,
    status: 'proposed',
    createdBy: 'ai',
    provenance: 'live',
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: null,
  },
  // A reading of the record rather than the record itself, so it carries its
  // reasoning and says how sure it is.
  {
    id: FINDING_INFERENCE,
    cookId: COOK_BAKE,
    class: 'inference',
    text: 'The lid is coming off before the oven spring has finished.',
    rationale: 'The note at 17:25 records the lid off while the loaf was still rising.',
    confidence: 'medium',
    status: 'proposed',
    createdBy: 'ai',
    provenance: 'live',
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: null,
  },
  // General cooking knowledge, rejected by the cook — and kept, so it is not
  // raised again as though it had never been considered.
  {
    id: FINDING_KNOWLEDGE,
    cookId: COOK_BAKE,
    class: 'knowledge',
    text: 'Steam in the first stage of the bake delays crust formation.',
    rationale: 'General bread knowledge, not read out of this cook.',
    confidence: 'low',
    status: 'rejected',
    createdBy: 'ai',
    provenance: 'live',
    createdAt: '2026-08-15T08:00:00.000Z',
    updatedAt: '2026-08-15T08:40:00.000Z',
  },
  // The cook's own, approved because they wrote it.
  {
    id: FINDING_USER,
    cookId: COOK_BAKE,
    class: 'observed',
    text: 'The base was pale in the photograph.',
    rationale: null,
    confidence: 'high',
    status: 'approved',
    createdBy: 'user',
    provenance: 'live',
    createdAt: '2026-08-15T08:30:00.000Z',
    updatedAt: null,
  },
  {
    id: FINDING_IMPORTED,
    cookId: COOK_IMPORTED,
    class: 'observed',
    text: 'The imported notebook recorded a dense crumb.',
    rationale: null,
    confidence: null,
    status: 'approved',
    createdBy: 'user',
    provenance: 'imported',
    createdAt: '2026-07-03T09:00:00.000Z',
    updatedAt: null,
  },
];

// A finding cites timeline entries, and only timeline entries.
const SYNTHETIC_FINDING_SOURCES: readonly FindingSource[] = [
  { findingId: FINDING_OBSERVED, cookEventId: EVENT_OVEN_TEMP },
  { findingId: FINDING_INFERENCE, cookEventId: EVENT_NOTE },
  { findingId: FINDING_INFERENCE, cookEventId: EVENT_OVEN_TEMP },
  { findingId: FINDING_USER, cookEventId: EVENT_CRUMB_PHOTO },
];

const SYNTHETIC_LESSONS: readonly Lesson[] = [
  {
    id: LESSON_PROPOSED,
    cookId: COOK_BAKE,
    text: 'Leave the lid on until the oven spring has clearly finished.',
    status: 'proposed',
    provenance: 'live',
    createdAt: '2026-08-15T09:00:00.000Z',
    updatedAt: null,
  },
  {
    id: LESSON_APPROVED,
    cookId: COOK_BAKE,
    text: 'Give the base ten more minutes on the stone.',
    status: 'approved',
    provenance: 'live',
    createdAt: '2026-08-15T09:10:00.000Z',
    updatedAt: '2026-08-16T07:00:00.000Z',
  },
  {
    id: LESSON_IMPORTED,
    cookId: COOK_IMPORTED,
    text: 'Prove for longer when the kitchen is cold.',
    status: 'approved',
    provenance: 'imported',
    createdAt: '2026-07-03T09:05:00.000Z',
    updatedAt: null,
  },
];

const SYNTHETIC_TAGS: readonly Tag[] = [
  { id: TAG_SOURDOUGH, name: 'sourdough', kind: 'dish' },
  { id: TAG_FLOUR, name: 'strong white flour', kind: 'ingredient' },
  { id: TAG_HIGH_HYDRATION, name: 'high hydration', kind: 'technique' },
  { id: TAG_DUTCH_OVEN, name: 'dutch oven', kind: 'equipment' },
];

const SYNTHETIC_COOK_TAGS: readonly CookTag[] = [
  { cookId: COOK_BAKE, tagId: TAG_SOURDOUGH },
  { cookId: COOK_BAKE, tagId: TAG_FLOUR },
  { cookId: COOK_BAKE, tagId: TAG_HIGH_HYDRATION },
  { cookId: COOK_BAKE, tagId: TAG_DUTCH_OVEN },
  { cookId: COOK_IMPORTED, tagId: TAG_SOURDOUGH },
];

const SYNTHETIC_BRIEFINGS: readonly Briefing[] = [
  // Answered: the cook said it helped.
  {
    id: BRIEFING_FOR_BAKE,
    cookId: COOK_BAKE,
    content: {
      headline: 'Two things from the last bake at this hydration',
      points: ['Prove longer if the kitchen is cold', 'Watch the base colour'],
    },
    useful: true,
    createdAt: '2026-08-14T14:58:00.000Z',
  },
  // Unanswered, which is not the same as unhelpful.
  {
    id: BRIEFING_FOR_NEXT,
    cookId: COOK_NEXT,
    content: {
      headline: 'Before this bake',
      points: ['Lid on for thirty minutes', 'Ten more minutes on the stone'],
    },
    useful: null,
    createdAt: '2026-08-20T09:56:00.000Z',
  },
];

// A briefing is built from earlier cooks, and from nothing else.
const SYNTHETIC_BRIEFING_SOURCES: readonly BriefingSource[] = [
  { briefingId: BRIEFING_FOR_BAKE, cookId: COOK_IMPORTED },
  { briefingId: BRIEFING_FOR_NEXT, cookId: COOK_BAKE },
  { briefingId: BRIEFING_FOR_NEXT, cookId: COOK_IMPORTED },
];

const SYNTHETIC_IMPORT_BATCHES: readonly ImportBatch[] = [
  {
    id: IMPORT_BATCH_DONE,
    filename: 'synthetic-old-notebook.json',
    status: 'done',
    candidatesTotal: 12,
    candidatesResolved: 12,
    createdAt: '2026-07-02T15:00:00.000Z',
  },
  // Everything optional left unset, which is what a batch looks like the
  // moment it starts.
  {
    id: IMPORT_BATCH_RUNNING,
    filename: null,
    status: 'processing',
    candidatesTotal: null,
    candidatesResolved: null,
    createdAt: '2026-08-21T05:59:00.000Z',
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
