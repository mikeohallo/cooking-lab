/**
 * The boundary between Cooking Lab's screens and its storage.
 *
 * Everything here is an interface. There is no SQLite in this file and no
 * implementation anywhere in this milestone: the point of writing the boundary
 * first is that when the real `expo-sqlite` adapter arrives it has a shape to
 * fit into, and nothing above the boundary has to change to accept it.
 *
 * Four conventions hold throughout:
 *
 *   Records in, records out.  Repositories accept and return the domain records
 *   from `src/domain/entities.ts`. Column names, row shapes and SQL text stop
 *   at this line.
 *
 *   Repositories do not decide.  A repository stores what it is given. Whether
 *   a write is *allowed* is settled before the call, by the pure functions in
 *   `src/domain/evidence.ts`; the services below exist to make that ordering
 *   the obvious one.
 *
 *   The assistant reaches storage through a service or not at all.  No
 *   repository is ever handed to an assistant adapter; see `AiAdapter` in
 *   `src/data/adapters.ts`, which returns candidates and holds no handle.
 *
 *   Everything is asynchronous.  Even reads. The eventual store is a native
 *   module, and a synchronous signature now would be a rewrite later.
 */

import type {
  Actor,
  AppliedFinding,
  CookEventPatch,
  CookPatch,
  EvidenceDecision,
  FindingCandidate,
  FindingIdentity,
  FindingPatch,
  LessonCandidate,
  LessonIdentity,
  LessonPatch,
  NewCook,
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
  CookEventKind,
  CookStatus,
  FindingClass,
  ImportBatchStatus,
  ProposalStatus,
  Provenance,
  TagKind,
} from '../domain/enums';

/** Newest first or oldest first. */
export type SortDirection = 'newest_first' | 'oldest_first';

export type PageRequest = {
  readonly limit: number;
  readonly offset?: number;
};

export type CookQuery = {
  readonly status?: CookStatus;
  readonly provenance?: Provenance;
  readonly parentCookId?: CookId;
  readonly tagIds?: readonly TagId[];
  readonly startedOnOrAfter?: IsoTimestamp;
  readonly startedBefore?: IsoTimestamp;
  readonly sort?: SortDirection;
  readonly page?: PageRequest;
};

export type CookRepository = {
  create(cook: Cook): Promise<Cook>;
  findById(id: CookId): Promise<Cook | null>;
  list(query?: CookQuery): Promise<readonly Cook[]>;
  count(query?: CookQuery): Promise<number>;
  /**
   * Persist an already-authorised revision. The caller obtained `cook` from
   * `updateCook`, `openCookReview` or `saveCookReview`; this does not re-decide.
   */
  save(cook: Cook): Promise<Cook>;
  /** The cooks that followed on from this one. */
  listChildren(id: CookId): Promise<readonly Cook[]>;
  /** Cascades to events, findings, lessons, tags and briefing links. */
  delete(id: CookId): Promise<void>;
};

export type CookEventQuery = {
  readonly cookId: CookId;
  readonly kind?: CookEventKind;
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
  readonly cookId?: CookId;
  readonly status?: ProposalStatus;
  readonly class?: FindingClass;
  readonly citesCookEventId?: CookEventId;
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
  createWithSources(applied: AppliedFinding): Promise<AppliedFinding>;
  findById(id: FindingId): Promise<Finding | null>;
  list(query?: FindingQuery): Promise<readonly Finding[]>;
  save(finding: Finding): Promise<Finding>;
  /** Retained on rejection; only an explicit deletion removes a row. */
  delete(id: FindingId): Promise<void>;

  listSources(findingId: FindingId): Promise<readonly FindingSource[]>;
  /** The timeline entries behind a finding, resolved. */
  listSourceEvents(findingId: FindingId): Promise<readonly CookEvent[]>;
  addSource(source: FindingSource): Promise<FindingSource>;
  removeSource(source: FindingSource): Promise<void>;
  /** Every finding citing this timeline entry. */
  listCitingEvent(cookEventId: CookEventId): Promise<readonly Finding[]>;
};

export type LessonQuery = {
  readonly cookId?: CookId;
  readonly status?: ProposalStatus;
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
   * One method rather than `find` then `create` because the name is unique in
   * the database and the check-then-insert version is a race that would
   * surface to a cook as a failed save. `null` is the ordinary kind from
   * schema version 2 on: a tag is the kitchen's own word for something.
   */
  findOrCreate(name: string, kind: TagKind | null): Promise<Tag>;
  findById(id: TagId): Promise<Tag | null>;
  findByNameAndKind(name: string, kind: TagKind | null): Promise<Tag | null>;
  list(kind?: TagKind): Promise<readonly Tag[]>;
  /**
   * Every tag, alphabetically, whatever kind it has or has not.
   *
   * Separate from `list` because `list()` orders by kind first, which puts the
   * tags with no kind in a block of their own — correct for a namespaced
   * listing and wrong for "show me my tags", which is one alphabet.
   */
  listByName(): Promise<readonly Tag[]>;
  /** Tags whose name begins with, or contains, what has been typed so far. */
  suggest(fragment: string, limit: number): Promise<readonly Tag[]>;
  rename(id: TagId, name: string): Promise<Tag>;
  delete(id: TagId): Promise<void>;
};

/** One cook and the tags on it, for a screen that needs several cooks' tags. */
export type CookTagging = {
  readonly cookId: CookId;
  readonly tags: readonly Tag[];
};

export type CookTagRepository = {
  link(link: CookTag): Promise<CookTag>;
  unlink(cookId: CookId, tagId: TagId): Promise<void>;
  listForCook(cookId: CookId): Promise<readonly Tag[]>;
  /**
   * The tags on each of these cooks, in one read.
   *
   * For History's search, which needs every listed cook's tags at once. Cooks
   * with no tags are simply absent rather than present and empty: the caller
   * is matching against tags, and a cook with none has nothing to match.
   */
  listForCooks(cookIds: readonly CookId[]): Promise<readonly CookTagging[]>;
  listCookIdsForTag(tagId: TagId): Promise<readonly CookId[]>;
  /**
   * Every tag that is on at least one cook, alphabetically.
   *
   * What the tag lists on screen are built from. A tag that is on no cook is
   * not shown anywhere: it is either one the cook has just taken off its last
   * cook, or one restored from a backup of a cook that is gone, and offering
   * it back would be the app suggesting its own leftovers.
   */
  listUsedTags(): Promise<readonly Tag[]>;
  /** The tags on the most cooks, most-used first, then alphabetically. */
  listMostUsedTags(limit: number): Promise<readonly Tag[]>;
};

export type BriefingQuery = {
  readonly cookId?: CookId;
  /** `true` for helpful, `false` for not, omitted for every briefing. */
  readonly useful?: boolean;
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

  /** The earlier cooks this briefing was built from. */
  listSources(briefingId: BriefingId): Promise<readonly BriefingSource[]>;
  listSourceCooks(briefingId: BriefingId): Promise<readonly Cook[]>;
  addSource(source: BriefingSource): Promise<BriefingSource>;
  removeSource(source: BriefingSource): Promise<void>;
};

export type ImportBatchRepository = {
  create(batch: ImportBatch): Promise<ImportBatch>;
  findById(id: ImportBatchId): Promise<ImportBatch | null>;
  list(status?: ImportBatchStatus): Promise<readonly ImportBatch[]>;
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
 *
 * This is also the only door an assistant candidate can come through. An
 * adapter produces `FindingCandidate` and `LessonCandidate` values; they become
 * rows here, as proposals, or not at all.
 */
export type ReviewService = {
  proposeFinding(
    candidate: FindingCandidate,
    identity: FindingIdentity,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<AppliedFinding>>;
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
    candidate: LessonCandidate,
    identity: LessonIdentity,
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

/** Capturing a cook. Every method here touches raw evidence. */
export type CookCaptureService = {
  startCook(input: NewCook, actor: Actor, at: IsoTimestamp): Promise<EvidenceDecision<Cook>>;
  updateCook(
    id: CookId,
    patch: CookPatch,
    actor: Actor,
  ): Promise<EvidenceDecision<Cook>>;
  openReview(id: CookId, actor: Actor, at: IsoTimestamp): Promise<EvidenceDecision<Cook>>;
  /** The verdict is stored exactly as typed. */
  saveReview(
    id: CookId,
    verdict: string | null,
    actor: Actor,
    at: IsoTimestamp,
  ): Promise<EvidenceDecision<Cook>>;
  addEvent(input: NewCookEvent, actor: Actor): Promise<EvidenceDecision<CookEvent>>;
  editEvent(
    id: CookEventId,
    patch: CookEventPatch,
    actor: Actor,
  ): Promise<EvidenceDecision<CookEvent>>;
  /**
   * Take back a photograph. Refused for every other kind, and for the
   * assistant; see `removeCookEvent` in `src/domain/evidence.ts`.
   *
   * Returns the event that was removed, so the caller still has the logical
   * path of the file it now has to delete.
   */
  removeEvent(id: CookEventId, actor: Actor): Promise<EvidenceDecision<CookEvent>>;
};

/** Preparing a briefing for a new cook, and hearing whether it helped. */
export type BriefingService = {
  createBriefing(
    briefing: Briefing,
    sourceCookIds: readonly CookId[],
  ): Promise<Briefing>;
  recordUsefulness(
    id: BriefingId,
    useful: boolean | null,
    actor: Actor,
  ): Promise<EvidenceDecision<Briefing>>;
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
  readonly briefingWorkflow: BriefingService;
  readonly snapshots: SnapshotService;
};
