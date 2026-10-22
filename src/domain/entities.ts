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
 *   Proposals      `Finding`, `Lesson` — claims derived from that evidence.
 *                  May be raised by the assistant, but only the cook decides
 *                  whether a claim is accepted.
 *
 * Field names are camelCase here and snake_case in SQL; translating between the
 * two belongs to the SQLite adapter, which is deferred (`src/data/adapters.ts`).
 *
 * There is no `userId`, no ownership, no tenancy and no sync state anywhere in
 * this file, and there is not meant to be.
 */

import type {
  ConfidenceLevel,
  CookEventKind,
  CookStatus,
  CreatedBy,
  FindingClass,
  ImportBatchStatus,
  ProposalStatus,
  Provenance,
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
 * `cooks/<cookId>/events/<eventId>/20260905t183100-01.jpg`. Never an absolute
 * device path and never a URL; see `src/data/photos/photoPaths.ts`.
 */
export type PhotoLogicalPath = string;

/**
 * Anything that survives a round trip through JSON, and nothing that does not.
 *
 * Two columns hold structure rather than text — a cook event's `meta` and a
 * briefing's `content` — and both are stored as JSON. Typing them as `unknown`
 * would let a `Date`, a `Map` or an `undefined` in, each of which serialises to
 * something other than itself and comes back as something else again.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Raw evidence
// ---------------------------------------------------------------------------

export type Cook = {
  readonly id: CookId;
  /** Optional: a cook is real before it has been named. */
  readonly title: string | null;
  readonly status: CookStatus;
  readonly provenance: Provenance;
  /** The cook this one is a repeat or variation of, when it is one. */
  readonly parentCookId: CookId | null;
  readonly startedAt: IsoTimestamp;
  readonly reviewOpenedAt: IsoTimestamp | null;
  readonly reviewSavedAt: IsoTimestamp | null;
  /**
   * The cook's own words about how it went, stored exactly as typed.
   *
   * Free text on purpose. A rating scale would force a judgement about dinner
   * into a shape the kitchen did not choose, and would then invite the app to
   * compute with it. Assistant-writable: never.
   */
  readonly verdict: string | null;
  readonly createdAt: IsoTimestamp;
};

export type CookEvent = {
  readonly id: CookEventId;
  readonly cookId: CookId;
  readonly ts: IsoTimestamp;
  readonly kind: CookEventKind;
  readonly body: string | null;
  /** Structured detail for kinds that have some, e.g. `{ celsius: 96 }`. */
  readonly meta: JsonValue | null;
  /** Required for `photo` events, forbidden otherwise. */
  readonly photoPath: PhotoLogicalPath | null;
};

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export type Finding = {
  readonly id: FindingId;
  readonly cookId: CookId;
  /** What kind of claim this is; never flattened away. */
  readonly class: FindingClass;
  readonly text: string;
  /** Why the claim was made. Most useful on an inference. */
  readonly rationale: string | null;
  readonly confidence: ConfidenceLevel | null;
  readonly status: ProposalStatus;
  /** Who wrote the words as they now stand. */
  readonly createdBy: CreatedBy;
  readonly provenance: Provenance;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp | null;
};

/**
 * A finding's citation of raw evidence.
 *
 * A finding cites timeline events and nothing else. Not cooks, not other
 * findings, not lessons: the chain from a claim back to something that was
 * actually observed is one link long and cannot be lengthened.
 */
export type FindingSource = {
  readonly findingId: FindingId;
  readonly cookEventId: CookEventId;
};

export type Lesson = {
  readonly id: LessonId;
  readonly cookId: CookId;
  readonly text: string;
  readonly status: ProposalStatus;
  readonly provenance: Provenance;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp | null;
};

// ---------------------------------------------------------------------------
// Tagging
// ---------------------------------------------------------------------------

export type Tag = {
  readonly id: TagId;
  /** Stored normalised (see `normaliseTagName`). */
  readonly name: string;
  /**
   * The namespace this tag belongs to, if it belongs to one.
   *
   * Nullable from schema version 2, and null for every tag the kitchen names
   * from then on. A tag is the cook's own word for something; which of four
   * boxes it belongs in is a question nobody asked, and a required answer to
   * it is a question the app would have to put in the way of writing one down.
   * The four kinds remain valid so that a tag that already has one keeps it.
   *
   * Uniqueness follows the same split: `(name, kind)` for a tag with a kind,
   * and `name` alone — ignoring case — for a tag without one.
   */
  readonly kind: TagKind | null;
};

export type CookTag = {
  readonly cookId: CookId;
  readonly tagId: TagId;
};

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export type Briefing = {
  readonly id: BriefingId;
  /** The new cook this briefing was prepared for. */
  readonly cookId: CookId;
  /** Structured advice, shaped by the screen that renders it. */
  readonly content: JsonValue;
  /**
   * Whether the cook found it useful: yes, no, or not yet said.
   *
   * Nullable on purpose. "No answer" and "no" are different answers, and only
   * one of them is feedback.
   */
  readonly useful: boolean | null;
  readonly createdAt: IsoTimestamp;
};

/** The earlier cooks a briefing was built from. */
export type BriefingSource = {
  readonly briefingId: BriefingId;
  readonly cookId: CookId;
};

// ---------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------

export type ImportBatch = {
  readonly id: ImportBatchId;
  readonly filename: string | null;
  readonly status: ImportBatchStatus;
  readonly candidatesTotal: number | null;
  readonly candidatesResolved: number | null;
  readonly createdAt: IsoTimestamp;
};

export type SchemaMeta = {
  readonly key: string;
  readonly value: string;
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
