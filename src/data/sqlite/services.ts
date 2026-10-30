/**
 * Where the evidence rules and the database meet.
 *
 * Each method here is the same two steps in the same order: ask the pure rule
 * in `src/domain/evidence.ts` whether the operation is allowed, and write only
 * if it said yes. The rule returns a record; the write stores that record
 * unchanged. Nothing in this file decides anything on its own.
 *
 * WHY THE ORDER IS FIXED HERE AND NOT LEFT TO CALLERS
 * ---------------------------------------------------
 * A screen that called the repository directly would bypass every protection
 * the domain layer provides, and it would do so while looking entirely
 * reasonable. Putting the composition in one place means there is exactly one
 * door, and `DataLayer` hands out only that door. The repositories are still
 * exported — a repository is not a secret — but nothing above the data layer is
 * given one.
 *
 * A refusal comes back as the same `EvidenceDecision` the pure function
 * produced, so a screen handles it identically whether it was refused in memory
 * or would have been refused on disk. A record that is simply not there is a
 * different thing: it is a programming error rather than a judgement about
 * evidence, and it throws.
 */

import type {
  Briefing,
  BriefingId,
  BriefingSource,
  Cook,
  CookEvent,
  CookEventId,
  CookId,
  DatabaseSnapshot,
  Finding,
  FindingId,
  IsoTimestamp,
  Lesson,
  LessonId,
  Revision,
} from '../../domain/entities';
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
  RevisionIdentity,
} from '../../domain/evidence';
import {
  appendCookEvent,
  applyFindingCandidate,
  applyLessonCandidate,
  createCook,
  decideFinding as decideFindingRule,
  deleteCook,
  decideLesson as decideLessonRule,
  openCookReview,
  recordBriefingUsefulness,
  removeCookEvent,
  reviseNote as reviseNoteRule,
  reviseVerdict as reviseVerdictRule,
  saveCookReview,
  updateCook as updateCookRule,
  updateCookEvent,
  updateFinding as updateFindingRule,
  updateLesson as updateLessonRule,
} from '../../domain/evidence';
import type { DatabaseAdapter } from '../adapters';
import type {
  BriefingRepository,
  BriefingService,
  CookCaptureService,
  CookDeletionRepository,
  CookEventRepository,
  CookRepository,
  FindingRepository,
  LessonRepository,
  ReviewService,
  RevisionRepository,
  SnapshotService,
} from '../repositories';
import { RecordNotFoundError } from './repositories';
import {
  COOK_MEAL_TYPE_COLUMNS,
  HOUSEHOLD_MEMBER_COLUMNS,
  INGREDIENT_VERSION_COLUMNS,
  LESSON_REVISION_COLUMNS,
  RATING_COLUMNS,
  toBriefing as toBriefingRecord,
  toBriefingSource,
  toCook as toCookRecord,
  toCookEvent as toCookEventRecord,
  toCookMealType,
  toCookTag,
  toFinding as toFindingRecord,
  toFindingSource,
  toHouseholdMember,
  toImportBatch,
  toIngredientVersion,
  toLesson as toLessonRecord,
  toLessonRevision,
  toRating,
  toRevision as toRevisionRecord,
  toTag,
} from './rows';

/** Load a record or say plainly which one is missing. */
async function loadOrThrow<T>(
  load: () => Promise<T | null>,
  what: string,
  id: string,
): Promise<T> {
  const record = await load();
  if (record === null) {
    throw new RecordNotFoundError(what, id);
  }
  return record;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export function createReviewService(
  findings: FindingRepository,
  lessons: LessonRepository,
): ReviewService {
  return {
    /**
     * The only way an assistant candidate becomes a row.
     *
     * `applyFindingCandidate` has no status parameter, so what is written here
     * is a proposal or nothing at all. The finding and its citations go in
     * together, in one transaction, because a claim without its evidence is the
     * failure this product exists to prevent.
     */
    async proposeFinding(
      candidate: FindingCandidate,
      identity: FindingIdentity,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<AppliedFinding>> {
      const decision = applyFindingCandidate(candidate, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await findings.createWithSources(decision.record) };
    },

    async editFinding(
      id: FindingId,
      patch: FindingPatch,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Finding>> {
      const current = await loadOrThrow(() => findings.findById(id), 'finding', id);
      const decision = updateFindingRule(current, patch, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await findings.save(decision.record) };
    },

    /**
     * Approve or reject.
     *
     * Rejection is a write, not a delete: the row keeps its id, its text, its
     * class and its citations, and only `status` and `updatedAt` change.
     */
    async decideFinding(
      id: FindingId,
      decision: ReviewDecision,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Finding>> {
      const current = await loadOrThrow(() => findings.findById(id), 'finding', id);
      const outcome = decideFindingRule(current, decision, actor, at);
      if (!outcome.allowed) {
        return outcome;
      }
      return { allowed: true, record: await findings.save(outcome.record) };
    },

    async proposeLesson(
      candidate: LessonCandidate,
      identity: LessonIdentity,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Lesson>> {
      const decision = applyLessonCandidate(candidate, identity, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await lessons.create(decision.record) };
    },

    async editLesson(
      id: LessonId,
      patch: LessonPatch,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Lesson>> {
      const current = await loadOrThrow(() => lessons.findById(id), 'lesson', id);
      const decision = updateLessonRule(current, patch, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await lessons.save(decision.record) };
    },

    async decideLesson(
      id: LessonId,
      decision: ReviewDecision,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Lesson>> {
      const current = await loadOrThrow(() => lessons.findById(id), 'lesson', id);
      const outcome = decideLessonRule(current, decision, actor, at);
      if (!outcome.allowed) {
        return outcome;
      }
      return { allowed: true, record: await lessons.save(outcome.record) };
    },
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Everything in this service touches raw evidence.
 *
 * Which is why every method starts by asking a rule that refuses the assistant
 * outright. There is no argument, no flag and no circumstance under which one
 * of these writes happens for an actor other than the cook — apart from the
 * single exception the model itself carries, which is that the assistant may
 * append its own `assistant_msg` and may then never touch it again.
 */
export function createCookCaptureService(
  cooks: CookRepository,
  events: CookEventRepository,
  revisions: RevisionRepository,
  deletions: CookDeletionRepository,
): CookCaptureService {
  return {
    async startCook(
      input: NewCook,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Cook>> {
      const decision = createCook(input, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await cooks.create(decision.record) };
    },

    async updateCook(
      id: CookId,
      patch: CookPatch,
      actor: Actor,
    ): Promise<EvidenceDecision<Cook>> {
      const current = await loadOrThrow(() => cooks.findById(id), 'cook', id);
      const decision = updateCookRule(current, patch, actor);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await cooks.save(decision.record) };
    },

    async openReview(
      id: CookId,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Cook>> {
      const current = await loadOrThrow(() => cooks.findById(id), 'cook', id);
      const decision = openCookReview(current, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await cooks.save(decision.record) };
    },

    /**
     * Save the review and the verdict.
     *
     * The verdict reaches SQLite as a bound parameter, exactly as the cook typed
     * it — whitespace, line breaks, quotation marks and all. Nothing on this
     * path trims it, cases it or maps it onto a scale.
     */
    async saveReview(
      id: CookId,
      verdict: string | null,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Cook>> {
      const current = await loadOrThrow(() => cooks.findById(id), 'cook', id);
      const decision = saveCookReview(current, verdict, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await cooks.save(decision.record) };
    },

    async addEvent(input: NewCookEvent, actor: Actor): Promise<EvidenceDecision<CookEvent>> {
      const decision = appendCookEvent(input, actor);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await events.append(decision.record) };
    },

    async editEvent(
      id: CookEventId,
      patch: CookEventPatch,
      actor: Actor,
    ): Promise<EvidenceDecision<CookEvent>> {
      const current = await loadOrThrow(() => events.findById(id), 'cook event', id);
      const decision = updateCookEvent(current, patch, actor);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await events.save(decision.record) };
    },

    /**
     * Reword a note. The rule decides and builds the revision; the note's own
     * row is not written to at all, which is what keeps its first words.
     */
    async reviseNote(
      id: CookEventId,
      text: string,
      identity: RevisionIdentity,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Revision>> {
      const current = await loadOrThrow(() => events.findById(id), 'cook event', id);
      const decision = reviseNoteRule(current, text, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await revisions.create(decision.record) };
    },

    /** Reword a reviewed cook's verdict. `cooks.verdict` is not written to. */
    async reviseVerdict(
      id: CookId,
      text: string,
      identity: RevisionIdentity,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Revision>> {
      const current = await loadOrThrow(() => cooks.findById(id), 'cook', id);
      const decision = reviseVerdictRule(current, text, identity, actor, at);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await revisions.create(decision.record) };
    },

    /**
     * Ask for a cook to be deleted: rule 12 decides, and the cook is then
     * hidden for its undo window. Nothing of it is removed here; see
     * `src/data/deletion/workflow.ts` for the rest.
     */
    async requestCookDeletion(
      id: CookId,
      actor: Actor,
      at: IsoTimestamp,
    ): Promise<EvidenceDecision<Cook>> {
      const current = await loadOrThrow(() => cooks.findById(id), 'cook', id);
      const decision = deleteCook(current, actor);
      if (!decision.allowed) {
        return decision;
      }
      await deletions.request(id, at);
      return decision;
    },

    /**
     * Take back a photograph.
     *
     * The rule decides first, as everywhere else here, and it refuses the
     * assistant outright and refuses every kind but `photo`. The row is deleted
     * only once it has said yes, and the event is handed back so the caller can
     * then delete the file — which this service deliberately cannot do, because
     * it has no file store and should not have one.
     */
    async removeEvent(id: CookEventId, actor: Actor): Promise<EvidenceDecision<CookEvent>> {
      const current = await loadOrThrow(() => events.findById(id), 'cook event', id);
      const decision = removeCookEvent(current, actor);
      if (!decision.allowed) {
        return decision;
      }
      await events.delete(decision.record.id);
      return decision;
    },
  };
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

export function createBriefingService(briefings: BriefingRepository): BriefingService {
  return {
    async createBriefing(
      briefing: Briefing,
      sourceCookIds: readonly CookId[],
    ): Promise<Briefing> {
      const sources: readonly BriefingSource[] = sourceCookIds.map((cookId) => ({
        briefingId: briefing.id,
        cookId,
      }));
      return briefings.createWithSources(briefing, sources);
    },

    /** Whether the advice helped is the cook's answer, so the rule refuses anyone else. */
    async recordUsefulness(
      id: BriefingId,
      useful: boolean | null,
      actor: Actor,
    ): Promise<EvidenceDecision<Briefing>> {
      const current = await loadOrThrow(() => briefings.findById(id), 'briefing', id);
      const decision = recordBriefingUsefulness(current, useful, actor);
      if (!decision.allowed) {
        return decision;
      }
      return { allowed: true, record: await briefings.save(decision.record) };
    },
  };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/**
 * The whole database, read out as records.
 *
 * This is what a backup is built from, and it is deliberately a read of the
 * domain records rather than a copy of the database file. A file copy would be
 * encrypted, would need the key to be readable, and would therefore be
 * worthless on the one day a backup matters — a phone that is gone. Reading
 * records means the portable format owes nothing to SQLCipher.
 *
 * Every collection is ordered here so that two reads of an unchanged database
 * produce the same snapshot. Row order carries no meaning in SQL, and leaving
 * it to whatever SQLite happened to return would make a deterministic backup
 * format produce two different files from one database.
 */
export function createSnapshotService(adapter: DatabaseAdapter): SnapshotService {
  const cookColumns =
    'id, title, status, provenance, parent_cook_id, started_at, review_opened_at, review_saved_at, verdict, created_at';
  const eventColumns = 'id, cook_id, ts, kind, body, meta, photo_path';
  const findingColumns =
    'id, cook_id, class, text, rationale, confidence, status, created_by, provenance, created_at, updated_at';
  const lessonColumns = 'id, cook_id, text, status, provenance, created_at, updated_at';
  const briefingColumns = 'id, cook_id, content, useful, created_at';
  const importColumns =
    'id, filename, status, candidates_total, candidates_resolved, created_at';
  const revisionColumns = 'id, cook_id, cook_event_id, field, text, revised_at';
  // A cook whose deletion is pending is not exported: to the cook it is
  // already gone, and the file is "everything" they still have. Its rows are
  // left out wherever they hang off it.
  const KEPT = (column: string) => `${column} NOT IN (SELECT cook_id FROM cook_deletions)`;

  const rowsOf = async (sql: string) => adapter.select({ sql, params: [] });

  return {
    async readSnapshot(): Promise<DatabaseSnapshot> {
      const [
        cooks,
        cookEvents,
        findings,
        findingSources,
        lessons,
        tags,
        cookTags,
        briefings,
        briefingSources,
        importBatches,
        revisions,
        cookMealTypes,
        ingredientVersions,
        householdMembers,
        ratings,
        lessonRevisions,
      ] = await Promise.all([
        rowsOf(`SELECT ${cookColumns} FROM cooks WHERE ${KEPT('id')} ORDER BY id ASC`),
        rowsOf(`SELECT ${eventColumns} FROM cook_events WHERE ${KEPT('cook_id')} ORDER BY id ASC`),
        rowsOf(`SELECT ${findingColumns} FROM findings WHERE ${KEPT('cook_id')} ORDER BY id ASC`),
        rowsOf(
          `SELECT finding_id, cook_event_id FROM finding_sources
           WHERE finding_id IN (SELECT id FROM findings WHERE ${KEPT('cook_id')})
           ORDER BY finding_id ASC, cook_event_id ASC`,
        ),
        rowsOf(`SELECT ${lessonColumns} FROM lessons WHERE ${KEPT('cook_id')} ORDER BY id ASC`),
        rowsOf('SELECT id, name, kind FROM tags ORDER BY id ASC'),
        rowsOf(
          `SELECT cook_id, tag_id FROM cook_tags WHERE ${KEPT('cook_id')} ORDER BY cook_id ASC, tag_id ASC`,
        ),
        rowsOf(`SELECT ${briefingColumns} FROM briefings WHERE ${KEPT('cook_id')} ORDER BY id ASC`),
        rowsOf(
          `SELECT briefing_id, cook_id FROM briefing_sources
           WHERE ${KEPT('cook_id')}
             AND briefing_id IN (SELECT id FROM briefings WHERE ${KEPT('cook_id')})
           ORDER BY briefing_id ASC, cook_id ASC`,
        ),
        rowsOf(`SELECT ${importColumns} FROM import_batches ORDER BY id ASC`),
        rowsOf(`SELECT ${revisionColumns} FROM revisions WHERE ${KEPT('cook_id')} ORDER BY id ASC`),
        rowsOf(
          `SELECT ${COOK_MEAL_TYPE_COLUMNS} FROM cook_meal_types WHERE ${KEPT('cook_id')} ORDER BY cook_id ASC`,
        ),
        rowsOf(
          `SELECT ${INGREDIENT_VERSION_COLUMNS} FROM ingredient_versions WHERE ${KEPT('cook_id')} ORDER BY id ASC`,
        ),
        // The household is not any one cook's, so a pending deletion hides none of it.
        rowsOf(`SELECT ${HOUSEHOLD_MEMBER_COLUMNS} FROM household_members ORDER BY id ASC`),
        rowsOf(`SELECT ${RATING_COLUMNS} FROM ratings WHERE ${KEPT('cook_id')} ORDER BY id ASC`),
        rowsOf(
          `SELECT ${LESSON_REVISION_COLUMNS} FROM lesson_revisions WHERE ${KEPT('cook_id')} ORDER BY id ASC`,
        ),
      ]);

      return {
        cooks: cooks.map(toCookRecord),
        cookEvents: cookEvents.map(toCookEventRecord),
        findings: findings.map(toFindingRecord),
        findingSources: findingSources.map(toFindingSource),
        lessons: lessons.map(toLessonRecord),
        tags: tags.map(toTag),
        cookTags: cookTags.map(toCookTag),
        briefings: briefings.map(toBriefingRecord),
        briefingSources: briefingSources.map(toBriefingSource),
        importBatches: importBatches.map(toImportBatch),
        revisions: revisions.map(toRevisionRecord),
        cookMealTypes: cookMealTypes.map(toCookMealType),
        ingredientVersions: ingredientVersions.map(toIngredientVersion),
        householdMembers: householdMembers.map(toHouseholdMember),
        ratings: ratings.map(toRating),
        lessonRevisions: lessonRevisions.map(toLessonRevision),
      };
    },
  };
}
