/**
 * Evidence protections.
 *
 * Cooking Lab's whole value rests on one promise: what the cook actually
 * observed stays exactly as they recorded it, and nothing the assistant says
 * about it can quietly become part of the record. This module is where that
 * promise is enforced, in pure functions with no storage, no network and no
 * assistant of any kind in sight.
 *
 * The rules, stated once:
 *
 *   1. Raw evidence is the cook's.  The verdict and the timeline belong to the
 *      person who cooked. The assistant may never revise either. The one thing
 *      it may add is its own message, as an `assistant_msg` event, which it can
 *      then never touch again.
 *   2. The assistant hands over candidates, not rows.  An adapter returns
 *      `AiCandidateSet` and holds no database handle; see
 *      `src/data/adapters.ts`.
 *   3. A candidate becomes a `proposed` finding or lesson, or it becomes
 *      nothing. There is no approved-on-arrival path for the assistant.
 *   4. A finding keeps its class.  `observed`, `inference` and `knowledge` are
 *      different kinds of claim and are never flattened into one.
 *   5. An inference may carry its reasoning and how sure it is.
 *   6. Once the cook has approved a finding or a lesson, the assistant cannot
 *      change it. Nor may it change one the cook wrote or rejected.
 *   7. Rejection keeps the row. Nothing here deletes anything, and there is no
 *      way back out of `rejected`.
 *   8. When the cook edits a finding, the words become theirs: `createdBy`
 *      becomes `user` and `updatedAt` is stamped.
 *   9. A lesson has no author column, and editing one does not invent it.
 *  10. The cook may take back a photograph, and nothing else. A photograph is
 *      the one timeline entry that can be added by accident — a thumb on the
 *      shutter, the wrong picture out of the roll — and it is the one whose
 *      removal costs the record nothing, because it carries no words. Every
 *      other entry stays: a note the cook wishes they had not written is still
 *      what they observed. The assistant may remove nothing at all, ever.
 *
 * `provenance` never appears in any of this. It records whether a row came from
 * live cooking or an import, and it is not a way of saying who wrote something.
 *
 * Every operation returns a decision rather than throwing, so a caller has to
 * look at the outcome, and a denial always carries a code a screen can explain.
 */

import type {
  Briefing,
  Cook,
  CookEvent,
  CookEventId,
  CookId,
  Finding,
  FindingId,
  FindingSource,
  IsoTimestamp,
  JsonValue,
  Lesson,
  LessonId,
  PhotoLogicalPath,
} from './entities';
import type {
  ConfidenceLevel,
  CookEventKind,
  CreatedBy,
  FindingClass,
  ProposalStatus,
  Provenance,
} from './enums';
import { isEntityId } from './invariants';

/** Who is attempting the operation. There are only ever two actors. */
export type Actor = CreatedBy;

export type EvidenceDenialCode =
  /** Rule 1: the assistant tried to write or revise raw evidence. */
  | 'ai_cannot_write_raw_evidence'
  /** Rule 1: the assistant tried to add a timeline entry that is not its own message. */
  | 'ai_cannot_append_event_kind'
  /** Rule 3: the assistant tried to create an already-decided record. */
  | 'ai_cannot_create_approved_record'
  /** Rule 3: an assistant claim about this cook arrived citing nothing from it. */
  | 'candidate_requires_source_event'
  /** Rule 3: a candidate cited something that is not an identified timeline entry. */
  | 'candidate_source_must_be_cook_event'
  /** Rule 6: the assistant tried to approve or reject. */
  | 'ai_cannot_decide_status'
  /** Rule 7: the transition asked for is not one this record can make. */
  | 'invalid_status_transition'
  /** Rule 6: the assistant tried to change an approved record. */
  | 'ai_cannot_update_approved_record'
  /** Rule 6: the assistant tried to change a rejected record. */
  | 'ai_cannot_update_rejected_record'
  /** Rule 6: the assistant tried to change something the cook wrote. */
  | 'ai_cannot_update_user_authored_record'
  /** Rule 10: the assistant tried to remove a timeline entry. */
  | 'ai_cannot_remove_raw_evidence'
  /** Rule 10: something other than a photograph was offered for removal. */
  | 'only_a_photo_may_be_removed';

export type EvidenceDenial = {
  readonly allowed: false;
  readonly code: EvidenceDenialCode;
  readonly message: string;
};

export type EvidenceDecision<T> = { readonly allowed: true; readonly record: T } | EvidenceDenial;

function deny(code: EvidenceDenialCode, message: string): EvidenceDenial {
  return { allowed: false, code, message };
}

function allow<T>(record: T): EvidenceDecision<T> {
  return { allowed: true, record };
}

/** Narrowing helper for callers and tests. */
export function isAllowed<T>(
  decision: EvidenceDecision<T>,
): decision is { readonly allowed: true; readonly record: T } {
  return decision.allowed;
}

// ---------------------------------------------------------------------------
// Rule 1 — raw evidence is the cook's
// ---------------------------------------------------------------------------

/**
 * The single gate in front of every raw-evidence write.
 *
 * Deliberately not parameterised by anything except the actor: there is no
 * combination of circumstances in which the assistant may write the verdict or
 * revise the timeline, so there is no argument that could make this return
 * `null` for `'ai'`.
 */
export function denyIfNotUser(actor: Actor, what: string): EvidenceDenial | null {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_write_raw_evidence',
      `${what} is raw evidence and can only be recorded by the cook`,
    );
  }
  return null;
}

export type NewCook = {
  readonly id: CookId;
  readonly title?: string | null;
  /** Set when this cook follows on from an earlier one. */
  readonly parentCookId?: CookId | null;
  readonly startedAt: IsoTimestamp;
  /** `imported` only on the restore path; live cooking is `live`. */
  readonly provenance?: Provenance;
};

export function createCook(
  input: NewCook,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a cook');
  if (denial) {
    return denial;
  }
  return allow({
    id: input.id,
    title: input.title ?? null,
    status: 'open',
    provenance: input.provenance ?? 'live',
    parentCookId: input.parentCookId ?? null,
    startedAt: input.startedAt,
    reviewOpenedAt: null,
    reviewSavedAt: null,
    verdict: null,
    createdAt: at,
  });
}

/** The parts of a cook a user may revise while it is still open. */
export type CookPatch = {
  readonly title?: string | null;
  readonly parentCookId?: CookId | null;
};

export function updateCook(
  cook: Cook,
  patch: CookPatch,
  actor: Actor,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a cook');
  if (denial) {
    return denial;
  }
  return allow({
    ...cook,
    title: patch.title === undefined ? cook.title : patch.title,
    parentCookId: patch.parentCookId === undefined ? cook.parentCookId : patch.parentCookId,
  });
}

/** Note that the cook has started looking back over this cook. */
export function openCookReview(
  cook: Cook,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a review');
  if (denial) {
    return denial;
  }
  return allow({ ...cook, reviewOpenedAt: cook.reviewOpenedAt ?? at });
}

/**
 * Save the review, verdict and all.
 *
 * The verdict is stored exactly as it was typed — not trimmed, not cased, not
 * mapped onto a scale. It is the single most consequential thing in the app:
 * it is what every claim is ultimately measured against, and the moment the app
 * starts tidying it up it has started editing the evidence. Giving it its own
 * function means the assistant's inability to set it is visible in the call
 * graph rather than buried in a patch type.
 */
export function saveCookReview(
  cook: Cook,
  verdict: string | null,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a verdict');
  if (denial) {
    return denial;
  }
  return allow({
    ...cook,
    status: 'reviewed',
    reviewOpenedAt: cook.reviewOpenedAt ?? at,
    reviewSavedAt: at,
    verdict,
  });
}

export type NewCookEvent = {
  readonly id: CookEventId;
  readonly cookId: CookId;
  readonly ts: IsoTimestamp;
  readonly kind: CookEventKind;
  readonly body?: string | null;
  readonly meta?: JsonValue | null;
  readonly photoPath?: PhotoLogicalPath | null;
};

/**
 * Add a timeline entry.
 *
 * The assistant may add exactly one kind of entry — `assistant_msg`, the record
 * of what it itself said — and nothing else. It cannot record a note, a
 * temperature, a photograph or a plan on the cook's behalf, because those are
 * observations and the assistant did not observe anything. Having said
 * something, it can never edit or remove the entry: see `updateCookEvent`.
 */
export function appendCookEvent(
  input: NewCookEvent,
  actor: Actor,
): EvidenceDecision<CookEvent> {
  if (actor !== 'user' && input.kind !== 'assistant_msg') {
    return deny(
      'ai_cannot_append_event_kind',
      'the assistant may only add its own message to the timeline',
    );
  }
  return allow({
    id: input.id,
    cookId: input.cookId,
    ts: input.ts,
    kind: input.kind,
    body: input.body ?? null,
    meta: input.meta ?? null,
    photoPath: input.photoPath ?? null,
  });
}

export type CookEventPatch = {
  readonly body?: string | null;
  readonly meta?: JsonValue | null;
};

export function updateCookEvent(
  event: CookEvent,
  patch: CookEventPatch,
  actor: Actor,
): EvidenceDecision<CookEvent> {
  const denial = denyIfNotUser(actor, 'a timeline entry');
  if (denial) {
    return denial;
  }
  return allow({
    ...event,
    body: patch.body === undefined ? event.body : patch.body,
    meta: patch.meta === undefined ? event.meta : patch.meta,
  });
}

/**
 * Rule 10 — take back a photograph the cook did not mean to add.
 *
 * Narrow on purpose, in both directions. The assistant is refused outright: it
 * cannot remove a timeline entry under any circumstances, and the code says so
 * rather than relying on no caller ever passing `'ai'`. And the cook may only
 * remove a `photo`: a note, a reading, a plan or the assistant's own message is
 * a record of something that was observed or said, and the fact that the cook
 * would rather it were not there does not make it untrue. A photograph is
 * different only because it carries no words of anybody's — it is a picture
 * taken by mistake, and the file behind it is the person's to withdraw.
 *
 * The event is handed back rather than a bare `true`, because the caller has a
 * file to delete afterwards and the path to it is on the record it removed.
 *
 * Nothing about this weakens the protections above: removal is a new, gated
 * operation with two refusals of its own, where before there was an ungated
 * `delete` on the repository and no rule in front of it at all.
 */
export function removeCookEvent(
  event: CookEvent,
  actor: Actor,
): EvidenceDecision<CookEvent> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_remove_raw_evidence',
      'the assistant cannot remove anything from the timeline',
    );
  }
  if (event.kind !== 'photo') {
    return deny(
      'only_a_photo_may_be_removed',
      'only a photograph can be removed from a cook; everything else written down stays',
    );
  }
  return allow(event);
}

// ---------------------------------------------------------------------------
// Rules 2 to 5 — candidates become proposals, and nothing else
// ---------------------------------------------------------------------------

/**
 * What an assistant adapter is allowed to hand back.
 *
 * A candidate is not a row: it has no status, no `createdBy`, no `provenance`
 * and no timestamps. Those are decided here, by code the assistant does not
 * run, which is why there is no shape a candidate could take that turns into an
 * approved finding.
 */
export type FindingCandidate = {
  readonly cookId: CookId;
  readonly class: FindingClass;
  readonly text: string;
  readonly rationale?: string | null;
  readonly confidence?: ConfidenceLevel | null;
  /** The timeline entries this claim was read out of. */
  readonly sourceEventIds: readonly CookEventId[];
};

export type LessonCandidate = {
  readonly cookId: CookId;
  readonly text: string;
};

export type AiCandidateSet = {
  readonly findings: readonly FindingCandidate[];
  readonly lessons: readonly LessonCandidate[];
};

/** A finding and its citations arrive together or not at all. */
export type AppliedFinding = {
  readonly finding: Finding;
  readonly sources: readonly FindingSource[];
};

/**
 * A claim about what was cooked has to come from something that was recorded.
 *
 * `knowledge` is the exception, and only that: general cooking knowledge is not
 * a reading of this kitchen's timeline and does not pretend to cite it.
 */
function requiresSourceEvents(findingClass: FindingClass): boolean {
  return findingClass !== 'knowledge';
}

export type FindingIdentity = {
  readonly id: FindingId;
  /** `imported` only on the restore path. */
  readonly provenance?: Provenance;
};

/**
 * The only way an assistant candidate enters the database.
 *
 * Note what this function cannot express: there is no status argument and no
 * approved shortcut. The class the assistant assigned is carried through
 * untouched, as are its reasoning and its confidence — a claim that arrives as
 * a low-confidence inference is stored as one.
 */
export function applyFindingCandidate(
  candidate: FindingCandidate,
  identity: FindingIdentity,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<AppliedFinding> {
  if (actor === 'ai' && requiresSourceEvents(candidate.class) && candidate.sourceEventIds.length === 0) {
    return deny(
      'candidate_requires_source_event',
      `an assistant ${candidate.class} finding must cite at least one timeline entry`,
    );
  }
  for (const eventId of candidate.sourceEventIds) {
    // Candidates arrive from outside the type system, so the citation is
    // checked rather than assumed.
    if (!isEntityId(eventId)) {
      return deny(
        'candidate_source_must_be_cook_event',
        'a finding may only cite an identified timeline entry',
      );
    }
  }

  const sources: readonly FindingSource[] = candidate.sourceEventIds.map((cookEventId) => ({
    findingId: identity.id,
    cookEventId,
  }));

  return allow({
    finding: {
      id: identity.id,
      cookId: candidate.cookId,
      class: candidate.class,
      text: candidate.text,
      rationale: candidate.rationale ?? null,
      confidence: candidate.confidence ?? null,
      status: 'proposed',
      createdBy: actor,
      provenance: identity.provenance ?? 'live',
      createdAt: at,
      updatedAt: null,
    },
    sources,
  });
}

export type LessonIdentity = {
  readonly id: LessonId;
  readonly provenance?: Provenance;
};

/**
 * A lesson candidate becomes a proposed lesson.
 *
 * There is no actor parameter because there is nothing for it to change: a
 * lesson has no author column, and a lesson from either actor enters as
 * `proposed` and waits for the cook. Nor is a lesson required to generalise a
 * finding — advice for next time can stand on the cook itself.
 */
export function applyLessonCandidate(
  candidate: LessonCandidate,
  identity: LessonIdentity,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  return allow({
    id: identity.id,
    cookId: candidate.cookId,
    text: candidate.text,
    status: 'proposed',
    provenance: identity.provenance ?? 'live',
    createdAt: at,
    updatedAt: null,
  });
}

/**
 * A finding the cook wrote themselves, which needs nobody's approval.
 *
 * The assistant is refused here rather than silently downgraded to a proposal:
 * a caller that reaches for this function with `'ai'` has misunderstood the
 * model, and failing loudly is the point.
 */
export function createUserFinding(
  candidate: FindingCandidate,
  identity: FindingIdentity,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<AppliedFinding> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_create_approved_record',
      'the assistant may only propose; it cannot enter an approved finding',
    );
  }
  const applied = applyFindingCandidate(candidate, identity, 'user', at);
  if (!applied.allowed) {
    return applied;
  }
  return allow({
    finding: { ...applied.record.finding, status: 'approved' },
    sources: applied.record.sources,
  });
}

export function createUserLesson(
  candidate: LessonCandidate,
  identity: LessonIdentity,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_create_approved_record',
      'the assistant may only propose; it cannot enter an approved lesson',
    );
  }
  const applied = applyLessonCandidate(candidate, identity, at);
  if (!applied.allowed) {
    return applied;
  }
  return allow({ ...applied.record, status: 'approved' });
}

// ---------------------------------------------------------------------------
// Rules 6, 8 and 9 — the cook's own words are protected
// ---------------------------------------------------------------------------

/**
 * Whether `actor` may revise this finding at all.
 *
 * Returns the denial rather than a boolean so the caller can report *which*
 * protection stopped it; the codes are distinct because the remedies are
 * different.
 */
export function authoriseFindingUpdate(
  finding: Pick<Finding, 'status' | 'createdBy'>,
  actor: Actor,
): EvidenceDenial | null {
  if (actor === 'user') {
    return null;
  }
  if (finding.status === 'approved') {
    return deny(
      'ai_cannot_update_approved_record',
      'an approved finding has been accepted by the cook and the assistant cannot change it',
    );
  }
  if (finding.status === 'rejected') {
    return deny(
      'ai_cannot_update_rejected_record',
      'a rejected finding is kept as a record of the rejection and cannot be revised by the assistant',
    );
  }
  if (finding.createdBy === 'user') {
    return deny(
      'ai_cannot_update_user_authored_record',
      'the assistant cannot revise something the cook wrote',
    );
  }
  return null;
}

/** A lesson has no author column, so only its status protects it. */
export function authoriseLessonUpdate(
  lesson: Pick<Lesson, 'status'>,
  actor: Actor,
): EvidenceDenial | null {
  if (actor === 'user') {
    return null;
  }
  if (lesson.status === 'approved') {
    return deny(
      'ai_cannot_update_approved_record',
      'an approved lesson has been accepted by the cook and the assistant cannot change it',
    );
  }
  if (lesson.status === 'rejected') {
    return deny(
      'ai_cannot_update_rejected_record',
      'a rejected lesson is kept as a record of the rejection and cannot be revised by the assistant',
    );
  }
  return null;
}

export type FindingPatch = {
  readonly text?: string;
  readonly rationale?: string | null;
  readonly confidence?: ConfidenceLevel | null;
  readonly class?: FindingClass;
};

/**
 * Revise a finding's wording.
 *
 * When the cook edits it, the finding becomes theirs: `createdBy` becomes
 * `user`. That is not bookkeeping — it is the answer to "who wrote the words
 * that are on the screen now", and after an edit the answer is the cook. It
 * also means the assistant can never touch the record again, because rule 6
 * refuses it a user-authored record.
 *
 * The patch cannot carry `status`: a status change is a decision, and decisions
 * go through `decideFinding`.
 */
export function updateFinding(
  finding: Finding,
  patch: FindingPatch,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Finding> {
  const denial = authoriseFindingUpdate(finding, actor);
  if (denial) {
    return denial;
  }
  return allow({
    ...finding,
    class: patch.class ?? finding.class,
    text: patch.text ?? finding.text,
    rationale: patch.rationale === undefined ? finding.rationale : patch.rationale,
    confidence: patch.confidence === undefined ? finding.confidence : patch.confidence,
    createdBy: actor === 'user' ? 'user' : finding.createdBy,
    updatedAt: at,
  });
}

export type LessonPatch = {
  readonly text?: string;
};

/**
 * Revise a lesson's wording.
 *
 * A lesson has `text`, `status`, `provenance` and its timestamps, and an edit
 * touches the first and the last. There is no author column to update and none
 * is invented here.
 */
export function updateLesson(
  lesson: Lesson,
  patch: LessonPatch,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  const denial = authoriseLessonUpdate(lesson, actor);
  if (denial) {
    return denial;
  }
  return allow({
    ...lesson,
    text: patch.text ?? lesson.text,
    updatedAt: at,
  });
}

// ---------------------------------------------------------------------------
// Rule 7 — decisions are the cook's, and rejection keeps the row
// ---------------------------------------------------------------------------

export type ReviewDecision = 'approve' | 'reject';

/**
 * The complete set of permitted transitions.
 *
 * There is no way out of `rejected`. A rejected claim stays rejected and stays
 * on file: it is the record of a judgement the cook made, and re-opening it
 * would turn that record into a suggestion the app can keep making.
 */
type TransitionTable = Readonly<Record<ProposalStatus, ProposalStatus | null>>;

const REVIEW_TRANSITIONS: Readonly<Record<ReviewDecision, TransitionTable>> = {
  approve: { proposed: 'approved', approved: null, rejected: null },
  reject: { proposed: 'rejected', approved: 'rejected', rejected: null },
};

/** The status a decision would produce, or a denial explaining why it cannot. */
function resolveTransition(
  status: ProposalStatus,
  decision: ReviewDecision,
  actor: Actor,
): EvidenceDecision<ProposalStatus> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_decide_status',
      'only the cook may approve or reject a proposal',
    );
  }
  const next = REVIEW_TRANSITIONS[decision][status];
  if (next === null) {
    return deny('invalid_status_transition', `a ${status} record cannot be ${decision}d`);
  }
  return allow(next);
}

/**
 * Approve or reject a finding.
 *
 * Rejection keeps every other field, the id included, so the row survives and
 * the finding's citations — which live in `finding_sources` and are not touched
 * here — survive with it.
 */
export function decideFinding(
  finding: Finding,
  decision: ReviewDecision,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Finding> {
  const transition = resolveTransition(finding.status, decision, actor);
  if (!transition.allowed) {
    return transition;
  }
  return allow({ ...finding, status: transition.record, updatedAt: at });
}

export function decideLesson(
  lesson: Lesson,
  decision: ReviewDecision,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  const transition = resolveTransition(lesson.status, decision, actor);
  if (!transition.allowed) {
    return transition;
  }
  return allow({ ...lesson, status: transition.record, updatedAt: at });
}

// ---------------------------------------------------------------------------
// Briefings
// ---------------------------------------------------------------------------

/**
 * Record whether a briefing was any use.
 *
 * The cook's, like the verdict: it is feedback about the app's advice, and the
 * app answering on their behalf would make the answer worthless.
 */
export function recordBriefingUsefulness(
  briefing: Briefing,
  useful: boolean | null,
  actor: Actor,
): EvidenceDecision<Briefing> {
  const denial = denyIfNotUser(actor, 'briefing feedback');
  if (denial) {
    return denial;
  }
  return allow({ ...briefing, useful });
}
