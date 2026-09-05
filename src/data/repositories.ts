/**
 * The boundary between Cooking Lab's screens and its storage.
 *
 * Everything here is an interface. There is no SQLite in this file and no
 * implementation anywhere in this milestone: the point of writing the boundary
 * first is that when the real `expo-sqlite` adapter arrives it has a shape to
 * fit into, and nothing above the boundary has to change to accept it.
 *
 * Three conventions hold throughout:
 *
 *   Records in, records out.  Repositories accept and return the domain records
 *   from `src/domain/entities.ts`. Column names, row shapes and SQL text stop
 *   at this line.
 *
 *   Repositories do not decide.  A repository stores what it is given. Whether
 *   a write is *allowed* is settled before the call, by the pure functions in
 *   `src/domain/evidence.ts`; the review services below exist to make that
 *   ordering the obvious one.
 *
 *   Everything is asynchronous.  Even reads. The eventual store is a native
 *   module, and a synchronous signature now would be a rewrite later.
 */

import type {
  Actor,
  AppliedFindingProposal,
  CookEventPatch,
  CookPatch,
  EvidenceDecision,
  FindingPatch,
  FindingProposal,
  LessonPatch,
  LessonProposal,
  NewCookEvent,
  ReviewDecision,
} from '../domain/evidence';
import type {
  Briefing,
  BriefingId,
  BriefingSource,
  Cook,
  CookEvent,
  CookEventId,
  CookId,
  CookTag,
  DatabaseSnapshot,
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
} from '../domain/entities';
import type {
  BriefingStatus,
  CookStatus,
  CookVerdict,
  ImportBatchOrigin,
  ImportBatchStatus,
  ReviewStatus,
  TagKind,
} from '../domain/enums';

/** Newest first, oldest first, or by nothing in particular. */
export type SortDirection = 'newest_first' | 'oldest_first';

export type PageRequest = {
  readonly limit: number;
  readonly offset?: number;
};

export type CookQuery = {
  readonly status?: CookStatus;
  readonly verdict?: CookVerdict;
  readonly tagIds?: readonly TagId[];
  readonly startedOnOrAfter?: IsoTimestamp;
  readonly startedBefore?: IsoTimestamp;
  readonly sort?: SortDirection;
  readonly page?: PageRequest;
};

/** What a screen supplies to start a cook. Everything else has a default. */
export type NewCook = {
  readonly id: CookId;
  readonly title: string;
  readonly status: CookStatus;
  readonly startedAt: IsoTimestamp;
  readonly notes?: string | null;
};

export type CookRepository = {
  create(cook: Cook): Promise<Cook>;
  findById(id: CookId): Promise<Cook | null>;
  list(query?: CookQuery): Promise<readonly Cook[]>;
  count(query?: CookQuery): Promise<number>;
  /**
   * Persist an already-authorised revision. The caller obtained `cook` from
   * `updateCook` or `recordCookVerdict`; this method does not re-decide.
   */
  save(cook: Cook): Promise<Cook>;
  /** Cascades to cook events, tags, citations and briefing links. */
  delete(id: CookId): Promise<void>;
};

export type CookEventQuery = {
  readonly cookId: CookId;
  readonly sort?: SortDirection;
  readonly page?: PageRequest;
};

export type CookEventRepository = {
  append(event: CookEvent): Promise<CookEvent>;
  findById(id: CookEventId): Promise<CookEvent | null>;
  /** The timeline, in the order it happened. */
  listForCook(query: CookEventQuery): Promise<readonly CookEvent[]>;
  save(event: CookEvent): Promise<CookEvent>;
  delete(id: CookEventId): Promise<void>;
};

export type FindingQuery = {
  readonly status?: ReviewStatus;
  readonly citesCookId?: CookId;
  readonly sort?: SortDirection;
  readonly page?: PageRequest;
};

/**
 * Findings and their citations.
 *
 * A finding and its sources are written together — `createWithSources` takes
 * both — because a finding that has lost its evidence is exactly the thing this
 * product must never produce.
 */
export type FindingRepository = {
  createWithSources(applied: AppliedFindingProposal): Promise<AppliedFindingProposal>;
  findById(id: FindingId): Promise<Finding | null>;
  list(query?: FindingQuery): Promise<readonly Finding[]>;
  save(finding: Finding): Promise<Finding>;
  /** Retained on rejection; only an explicit deletion removes a row. */
  delete(id: FindingId): Promise<void>;

  listSources(findingId: FindingId): Promise<readonly FindingSource[]>;
  addSource(source: FindingSource): Promise<FindingSource>;
  removeSource(source: FindingSource): Promise<void>;
  /** Every finding citing this cook, for "what did this cook teach me". */
  listCitingCook(cookId: CookId): Promise<readonly Finding[]>;
};

export type LessonQuery = {
  readonly status?: ReviewStatus;
  readonly originFindingId?: FindingId;
  readonly sort?: SortDirection;
  readonly page?: PageRequest;
};

export type LessonRepository = {
  create(lesson: Lesson): Promise<Lesson>;
  findById(id: LessonId): Promise<Lesson | null>;
  list(query?: LessonQuery): Promise<readonly Lesson[]>;
  save(lesson: Lesson): Promise<Lesson>;
  delete(id: LessonId): Promise<void>;
};

export type TagRepository = {
  /**
   * Find the tag with this normalised name and kind, or create it.
   *
   * One method rather than `find` then `create` because `(name, kind)` is
   * unique in the database and the check-then-insert version is a race that
   * would surface to a cook as a failed save.
   */
  findOrCreate(name: string, kind: TagKind, at: IsoTimestamp): Promise<Tag>;
  findById(id: TagId): Promise<Tag | null>;
  findByNameAndKind(name: string, kind: TagKind): Promise<Tag | null>;
  list(kind?: TagKind): Promise<readonly Tag[]>;
  rename(id: TagId, name: string): Promise<Tag>;
  delete(id: TagId): Promise<void>;
};

export type CookTagRepository = {
  link(link: CookTag): Promise<CookTag>;
  unlink(cookId: CookId, tagId: TagId): Promise<void>;
  listForCook(cookId: CookId): Promise<readonly Tag[]>;
  listCookIdsForTag(tagId: TagId): Promise<readonly CookId[]>;
};

export type BriefingQuery = {
  readonly cookId?: CookId;
  readonly status?: BriefingStatus;
  readonly sort?: SortDirection;
  readonly page?: PageRequest;
};

export type BriefingRepository = {
  createWithSources(
    briefing: Briefing,
    sources: readonly BriefingSource[],
  ): Promise<Briefing>;
  findById(id: BriefingId): Promise<Briefing | null>;
  list(query?: BriefingQuery): Promise<readonly Briefing[]>;
  save(briefing: Briefing): Promise<Briefing>;
  delete(id: BriefingId): Promise<void>;

  listSources(briefingId: BriefingId): Promise<readonly BriefingSource[]>;
  addSource(source: BriefingSource): Promise<BriefingSource>;
  removeSource(source: BriefingSource): Promise<void>;
};

export type ImportBatchRepository = {
  create(batch: ImportBatch): Promise<ImportBatch>;
  findById(id: ImportBatchId): Promise<ImportBatch | null>;
  list(status?: ImportBatchStatus): Promise<readonly ImportBatch[]>;
  listByOrigin(origin: ImportBatchOrigin): Promise<readonly ImportBatch[]>;
  save(batch: ImportBatch): Promise<ImportBatch>;
};

/** Reads and advances the `schema_meta` bookkeeping. */
export type SchemaStateRepository = {
  /** `{ schemaVersion: 0 }` for a database that has never been migrated. */
  read(): Promise<SchemaState>;
  /** Written by the migration runner, inside the migration's transaction. */
  recordVersion(version: number, at: IsoTimestamp): Promise<void>;
  /** The tables that actually exist, for verifying a migration landed. */
  listTables(): Promise<readonly string[]>;
};

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/**
 * The review workflow, as the screens see it.
 *
 * Each method is the composition of an evidence rule and a write: the rule
 * decides, and the write only happens if it was allowed. Returning the same
 * `EvidenceDecision` the pure function returned means a screen handles a
 * refusal exactly the same way whether it was refused in memory or on disk.
 */
export type ReviewService = {
  proposeFinding(
    proposal: FindingProposal,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<AppliedFindingProposal>>;
  editFinding(
    id: FindingId,
    patch: FindingPatch,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Finding>>;
  decideFinding(
    id: FindingId,
    decision: ReviewDecision,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Finding>>;

  proposeLesson(
    proposal: LessonProposal,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Lesson>>;
  editLesson(
    id: LessonId,
    patch: LessonPatch,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Lesson>>;
  decideLesson(
    id: LessonId,
    decision: ReviewDecision,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Lesson>>;
};

/** Capturing a cook. Every method here is a raw-evidence write. */
export type CookCaptureService = {
  startCook(input: NewCook, actor: Actor, at: IsoTimestamp): Promise<EvidenceDecision<Cook>>;
  updateCook(
    id: CookId,
    patch: CookPatch,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Cook>>;
  recordVerdict(
    id: CookId,
    verdict: CookVerdict,
    note: string | null,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Cook>>;
  addEvent(
    input: NewCookEvent,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<CookEvent>>;
  editEvent(
    id: CookEventId,
    patch: CookEventPatch,
    actor: Actor,
  ): Promise<EvidenceDecision<CookEvent>>;
};

/** Reads the whole database out for backup. Writing it back is deferred. */
export type SnapshotService = {
  readSnapshot(): Promise<DatabaseSnapshot>;
};

/**
 * Everything the app needs from storage, assembled in one place.
 *
 * A screen takes this, never a database handle, so the day the store changes is
 * the day one factory function changes.
 */
export type DataLayer = {
  readonly cooks: CookRepository;
  readonly cookEvents: CookEventRepository;
  readonly findings: FindingRepository;
  readonly lessons: LessonRepository;
  readonly tags: TagRepository;
  readonly cookTags: CookTagRepository;
  readonly briefings: BriefingRepository;
  readonly importBatches: ImportBatchRepository;
  readonly schemaState: SchemaStateRepository;
  readonly review: ReviewService;
  readonly capture: CookCaptureService;
  readonly snapshots: SnapshotService;
};
