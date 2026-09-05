/**
 * The Cooking Lab domain records.
 *
 * These are the eleven tables of the local database expressed as TypeScript.
 * Every record is deeply `readonly`: a record is a value, and the only way to
 * change one is to produce a new one through a function that is allowed to do
 * so (see `src/domain/evidence.ts`). That is what makes the evidence
 * protections enforceable rather than merely documented.
 *
 * Two shapes recur and are worth naming up front:
 *
 *   Raw evidence   `Cook`, `CookEvent` — what happened and what the cook
 *                  thought of it. Written only by the person cooking.
 *   Reviewable     `Finding`, `Lesson` — claims derived from that evidence.
 *                  May be proposed by the assistant, but only the cook decides
 *                  whether a claim is accepted.
 *
 * Field names are camelCase here and snake_case in SQL; translating between the
 * two belongs to the SQLite adapter, which is deferred (`src/data/adapters.ts`).
 *
 * There is no `userId`, no ownership, no tenancy and no sync state anywhere in
 * this file, and there is not meant to be.
 */

import type {
  BriefingSourceKind,
  BriefingStatus,
  CookEventKind,
  CookStatus,
  CookVerdict,
  EvidenceStrength,
  ImportBatchOrigin,
  ImportBatchStatus,
  Provenance,
  ReviewStatus,
  SourceRelation,
  TagKind,
} from './enums';

/**
 * Identifiers are opaque strings generated on-device. They are aliases rather
 * than branded types so that fixtures, JSON backups and SQL rows stay ordinary
 * data; `isEntityId` in `src/domain/invariants.ts` is what actually enforces
 * the shape.
 */
export type EntityId = string;
export type CookId = EntityId;
export type CookEventId = EntityId;
export type FindingId = EntityId;
export type LessonId = EntityId;
export type TagId = EntityId;
export type BriefingId = EntityId;
export type ImportBatchId = EntityId;

/** An ISO-8601 instant in UTC, e.g. `2026-09-05T18:31:00.000Z`. */
export type IsoTimestamp = string;

/**
 * A logical, app-private photo location such as
 * `cooks/<cookId>/events/<eventId>/20260905T183100-01.jpg`. Never an absolute
 * device path and never a URL; see `src/data/photos/photoPaths.ts`.
 */
export type PhotoLogicalPath = string;

// ---------------------------------------------------------------------------
// Raw evidence
// ---------------------------------------------------------------------------

export type Cook = {
  readonly id: CookId;
  readonly title: string;
  readonly status: CookStatus;
  readonly startedAt: IsoTimestamp;
  readonly finishedAt: IsoTimestamp | null;
  /** The cook's own judgement. Raw evidence; assistant-writable: never. */
  readonly verdict: CookVerdict;
  readonly verdictNote: string | null;
  readonly notes: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
};

export type CookEvent = {
  readonly id: CookEventId;
  readonly cookId: CookId;
  readonly kind: CookEventKind;
  readonly occurredAt: IsoTimestamp;
  /** Seconds from `cook.startedAt`, when the capture knew it. */
  readonly offsetSeconds: number | null;
  readonly label: string | null;
  readonly text: string | null;
  /** Required for `temperature` and `timing` events. */
  readonly numericValue: number | null;
  /** A `TemperatureUnit` for temperature events, `s` for timings. */
  readonly unit: string | null;
  /** Required for `photo` events, forbidden otherwise. */
  readonly photoPath: PhotoLogicalPath | null;
  readonly createdAt: IsoTimestamp;
};

// ---------------------------------------------------------------------------
// Reviewable claims
// ---------------------------------------------------------------------------

/**
 * The review bookkeeping shared by findings and lessons.
 *
 * `createdBy` records who first raised the claim and never changes.
 * `userEdited` records whether the cook has since put their own words into it,
 * which is what keeps an assistant-proposed record the cook has revised
 * distinguishable from one they have merely accepted.
 */
export type ReviewableFacts = {
  readonly status: ReviewStatus;
  readonly createdBy: Provenance;
  readonly userEdited: boolean;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  /** Set when the cook approved or rejected; cleared on reinstatement. */
  readonly decidedAt: IsoTimestamp | null;
};

export type Finding = ReviewableFacts & {
  readonly id: FindingId;
  readonly title: string;
  readonly detail: string | null;
  /** Derived from the finding's supporting sources, never asserted. */
  readonly evidenceStrength: EvidenceStrength;
};

/**
 * A finding's citation of raw evidence.
 *
 * Modelled with one nullable foreign key per source kind rather than a single
 * polymorphic column, so SQLite can enforce the reference and cascade the
 * delete. Exactly one of `cookId` / `cookEventId` is set, matching `sourceKind`.
 */
export type FindingSource = {
  readonly findingId: FindingId;
  readonly sourceKind: 'cook' | 'cook_event';
  readonly cookId: CookId | null;
  readonly cookEventId: CookEventId | null;
  readonly relation: SourceRelation;
  readonly createdAt: IsoTimestamp;
};

export type Lesson = ReviewableFacts & {
  readonly id: LessonId;
  readonly title: string;
  readonly guidance: string;
  /** The finding this lesson generalises, if it came from one. */
  readonly originFindingId: FindingId | null;
};

// ---------------------------------------------------------------------------
// Tagging
// ---------------------------------------------------------------------------

export type Tag = {
  readonly id: TagId;
  /** Stored normalised (see `normaliseTagName`); `(name, kind)` is unique. */
  readonly name: string;
  readonly kind: TagKind;
  readonly createdAt: IsoTimestamp;
};

export type CookTag = {
  readonly cookId: CookId;
  readonly tagId: TagId;
  readonly createdAt: IsoTimestamp;
};

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export type Briefing = {
  readonly id: BriefingId;
  /** The cook this briefing was prepared for, if it was prepared for one. */
  readonly cookId: CookId | null;
  readonly title: string;
  readonly body: string;
  readonly status: BriefingStatus;
  readonly createdBy: Provenance;
  readonly createdAt: IsoTimestamp;
  readonly issuedAt: IsoTimestamp | null;
};

/** Exactly one of the three id columns is set, matching `sourceKind`. */
export type BriefingSource = {
  readonly briefingId: BriefingId;
  readonly sourceKind: BriefingSourceKind;
  readonly findingId: FindingId | null;
  readonly lessonId: LessonId | null;
  readonly cookId: CookId | null;
  readonly createdAt: IsoTimestamp;
};

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

export type ImportBatch = {
  readonly id: ImportBatchId;
  readonly origin: ImportBatchOrigin;
  readonly status: ImportBatchStatus;
  readonly label: string;
  readonly recordCount: number;
  readonly startedAt: IsoTimestamp;
  readonly completedAt: IsoTimestamp | null;
  readonly note: string | null;
};

export type SchemaMeta = {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: IsoTimestamp;
};

/** The `schema_meta` rows the migration runner cares about, read as a record. */
export type SchemaState = {
  readonly schemaVersion: number;
  readonly appliedAt: IsoTimestamp | null;
};

/**
 * Every structured entity, in one place, so the backup contract and the
 * repository surface cannot drift apart from the schema.
 */
export type DatabaseSnapshot = {
  readonly cooks: readonly Cook[];
  readonly cookEvents: readonly CookEvent[];
  readonly findings: readonly Finding[];
  readonly findingSources: readonly FindingSource[];
  readonly lessons: readonly Lesson[];
  readonly tags: readonly Tag[];
  readonly cookTags: readonly CookTag[];
  readonly briefings: readonly Briefing[];
  readonly briefingSources: readonly BriefingSource[];
  readonly importBatches: readonly ImportBatch[];
};

/** The keys of `DatabaseSnapshot`, in a fixed order, for deterministic output. */
export const SNAPSHOT_ENTITY_KEYS = [
  'cooks',
  'cookEvents',
  'findings',
  'findingSources',
  'lessons',
  'tags',
  'cookTags',
  'briefings',
  'briefingSources',
  'importBatches',
] as const;
export type SnapshotEntityKey = (typeof SNAPSHOT_ENTITY_KEYS)[number];

/** An empty snapshot; the base every builder and test starts from. */
export function emptySnapshot(): DatabaseSnapshot {
  return {
    cooks: [],
    cookEvents: [],
    findings: [],
    findingSources: [],
    lessons: [],
    tags: [],
    cookTags: [],
    briefings: [],
    briefingSources: [],
    importBatches: [],
  };
}

/** Which id column of a finding source is populated. */
export function findingSourceRef(source: FindingSource): EntityId | null {
  return source.sourceKind === 'cook' ? source.cookId : source.cookEventId;
}

/** Which id column of a briefing source is populated. */
export function briefingSourceRef(source: BriefingSource): EntityId | null {
  switch (source.sourceKind) {
    case 'finding':
      return source.findingId;
    case 'lesson':
      return source.lessonId;
    case 'cook':
      return source.cookId;
  }
}
