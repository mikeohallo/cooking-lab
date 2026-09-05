/**
 * Evidence protections.
 *
 * Cooking Lab's whole value rests on one promise: what the cook actually
 * observed stays exactly as they recorded it, and nothing the assistant says
 * about it can quietly become part of the record. This module is where that
 * promise is enforced, in pure functions with no storage, no network and no
 * assistant of any kind in sight.
 *
 * The four rules, stated once:
 *
 *   1. Raw evidence is the cook's.  Cooks and cook events — including the
 *      verdict and the timeline — can only be written by the user. There is no
 *      assistant-authored path to them, not even a supervised one.
 *   2. The assistant may only ever propose.  A finding or lesson raised by the
 *      assistant enters as `proposed`, cites its evidence, and stops there.
 *   3. A decision is the cook's, and it is explicit.  Approval and rejection
 *      are separate operations that only the user may perform. Rejection keeps
 *      the row; nothing here deletes anything.
 *   4. The cook's own words are protected.  Once a record is approved, or has
 *      been edited by the user, the assistant cannot touch it again.
 *
 * Every operation returns a decision rather than throwing, so a caller has to
 * look at the outcome, and a denial always carries a code a screen can explain.
 */

import type {
  Cook,
  CookEvent,
  CookId,
  CookEventId,
  Finding,
  FindingId,
  FindingSource,
  IsoTimestamp,
  Lesson,
  LessonId,
  PhotoLogicalPath,
  ReviewableFacts,
} from './entities';
import type {
  CookEventKind,
  CookVerdict,
  EvidenceStrength,
  Provenance,
  ReviewStatus,
  SourceRelation,
} from './enums';
import { isFindingSourceKind } from './enums';
import { isEntityId } from './invariants';

/** Who is attempting the operation. There are only ever two actors. */
export type Actor = Provenance;

export type EvidenceDenialCode =
  /** Rule 1: the assistant tried to write a cook or a cook event. */
  | 'ai_cannot_write_raw_evidence'
  /** Rule 2: the assistant tried to create an already-decided record. */
  | 'ai_cannot_create_decided_record'
  /** Rule 2: an assistant proposal arrived without evidence behind it. */
  | 'proposal_requires_supporting_source'
  /** Rule 2: a proposal cited something other than raw evidence. */
  | 'proposal_source_must_be_raw_evidence'
  /** Rule 3: the assistant tried to approve, reject or reinstate. */
  | 'ai_cannot_decide_review_status'
  /** Rule 3: the transition asked for is not one this record can make. */
  | 'invalid_status_transition'
  /** Rule 4: the assistant tried to change an approved record. */
  | 'ai_cannot_update_approved_record'
  /** Rule 4: the assistant tried to change a rejected record. */
  | 'ai_cannot_update_rejected_record'
  /** Rule 4: the assistant tried to change something the user wrote. */
  | 'ai_cannot_update_user_authored_record'
  /** Rule 4: the assistant tried to overwrite the user's own edit. */
  | 'ai_cannot_overwrite_user_edit';

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
 * combination of circumstances in which the assistant may write raw evidence,
 * so there is no argument that could make this return `null` for `'ai'`.
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

/** The parts of a cook a user may revise after the fact. */
export type CookPatch = {
  readonly title?: string;
  readonly status?: Cook['status'];
  readonly finishedAt?: IsoTimestamp | null;
  readonly notes?: string | null;
};

export function updateCook(
  cook: Cook,
  patch: CookPatch,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a cook');
  if (denial) {
    return denial;
  }
  return allow({
    ...cook,
    title: patch.title ?? cook.title,
    status: patch.status ?? cook.status,
    finishedAt: patch.finishedAt === undefined ? cook.finishedAt : patch.finishedAt,
    notes: patch.notes === undefined ? cook.notes : patch.notes,
    updatedAt: at,
  });
}

/**
 * Record the cook's verdict.
 *
 * Separated from `updateCook` because the verdict is the single most
 * consequential piece of evidence in the app: it is what findings are measured
 * against. Giving it its own function means the assistant's inability to set it
 * is visible in the call graph, not buried in a patch type.
 */
export function recordCookVerdict(
  cook: Cook,
  verdict: CookVerdict,
  verdictNote: string | null,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a verdict');
  if (denial) {
    return denial;
  }
  return allow({
    ...cook,
    verdict,
    // An unrated cook cannot carry a verdict note; see `validateCook`.
    verdictNote: verdict === 'unrated' ? null : verdictNote,
    updatedAt: at,
  });
}

export type NewCookEvent = {
  readonly id: CookEventId;
  readonly cookId: CookId;
  readonly kind: CookEventKind;
  readonly occurredAt: IsoTimestamp;
  readonly offsetSeconds?: number | null;
  readonly label?: string | null;
  readonly text?: string | null;
  readonly numericValue?: number | null;
  readonly unit?: string | null;
  readonly photoPath?: PhotoLogicalPath | null;
};

export function createCookEvent(
  input: NewCookEvent,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<CookEvent> {
  const denial = denyIfNotUser(actor, 'a timeline entry');
  if (denial) {
    return denial;
  }
  return allow({
    id: input.id,
    cookId: input.cookId,
    kind: input.kind,
    occurredAt: input.occurredAt,
    offsetSeconds: input.offsetSeconds ?? null,
    label: input.label ?? null,
    text: input.text ?? null,
    numericValue: input.numericValue ?? null,
    unit: input.unit ?? null,
    photoPath: input.photoPath ?? null,
    createdAt: at,
  });
}

export type CookEventPatch = {
  readonly label?: string | null;
  readonly text?: string | null;
  readonly numericValue?: number | null;
  readonly unit?: string | null;
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
    label: patch.label === undefined ? event.label : patch.label,
    text: patch.text === undefined ? event.text : patch.text,
    numericValue: patch.numericValue === undefined ? event.numericValue : patch.numericValue,
    unit: patch.unit === undefined ? event.unit : patch.unit,
  });
}

// ---------------------------------------------------------------------------
// Evidence strength
// ---------------------------------------------------------------------------

/**
 * How much cooking stands behind a finding.
 *
 * Only supporting sources count, and only distinct ones: citing the same cook
 * twice is one cook's worth of evidence, however it was recorded.
 */
export function deriveEvidenceStrength(
  sources: readonly FindingSource[],
): EvidenceStrength {
  const supporting = new Set<string>();
  for (const source of sources) {
    if (source.relation !== 'supports') {
      continue;
    }
    const ref = source.sourceKind === 'cook' ? source.cookId : source.cookEventId;
    if (ref !== null) {
      supporting.add(`${source.sourceKind}:${ref}`);
    }
  }
  if (supporting.size === 0) {
    return 'unsupported';
  }
  if (supporting.size === 1) {
    return 'single';
  }
  if (supporting.size === 2) {
    return 'corroborated';
  }
  return 'strong';
}

// ---------------------------------------------------------------------------
// Rule 2 — the assistant may only propose
// ---------------------------------------------------------------------------

/** A citation of raw evidence, as offered with a proposal. */
export type ProposedSource = {
  readonly sourceKind: 'cook' | 'cook_event';
  readonly sourceId: CookId | CookEventId;
  readonly relation: SourceRelation;
};

export type FindingProposal = {
  readonly id: FindingId;
  readonly title: string;
  readonly detail: string | null;
  readonly sources: readonly ProposedSource[];
};

/** A proposal becomes a finding *and* its citations, together or not at all. */
export type AppliedFindingProposal = {
  readonly finding: Finding;
  readonly sources: readonly FindingSource[];
};

/**
 * The only way an assistant candidate enters the database.
 *
 * Note what this function cannot express: there is no status argument, no
 * `approved` shortcut and no way to attach a citation to anything other than a
 * cook or a cook event. An assistant proposal that carries no supporting
 * evidence is refused outright — a claim about cooking has to come from cooking.
 */
export function applyFindingProposal(
  proposal: FindingProposal,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<AppliedFindingProposal> {
  const supporting = proposal.sources.filter((source) => source.relation === 'supports');
  if (actor === 'ai' && supporting.length === 0) {
    return deny(
      'proposal_requires_supporting_source',
      'an assistant proposal must cite at least one supporting cook or cook event',
    );
  }
  for (const source of proposal.sources) {
    // Proposals arrive from outside the type system, so the citation is checked
    // rather than assumed: a finding may only ever point at raw evidence.
    if (!isFindingSourceKind(source.sourceKind) || !isEntityId(source.sourceId)) {
      return deny(
        'proposal_source_must_be_raw_evidence',
        'a finding may only cite an identified cook or cook event',
      );
    }
  }

  const sources: readonly FindingSource[] = proposal.sources.map((source) => ({
    findingId: proposal.id,
    sourceKind: source.sourceKind,
    cookId: source.sourceKind === 'cook' ? source.sourceId : null,
    cookEventId: source.sourceKind === 'cook_event' ? source.sourceId : null,
    relation: source.relation,
    createdAt: at,
  }));

  return allow({
    finding: {
      id: proposal.id,
      title: proposal.title,
      detail: proposal.detail,
      evidenceStrength: deriveEvidenceStrength(sources),
      status: 'proposed',
      createdBy: actor,
      userEdited: false,
      createdAt: at,
      updatedAt: at,
      decidedAt: null,
    },
    sources,
  });
}

export type LessonProposal = {
  readonly id: LessonId;
  readonly title: string;
  readonly guidance: string;
  /** The finding this generalises. Required of assistant proposals. */
  readonly originFindingId: FindingId | null;
};

export function applyLessonProposal(
  proposal: LessonProposal,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  // A lesson is advice for the next cook. When the assistant offers one it must
  // be traceable to an approved finding, so the chain back to real cooking is
  // never broken.
  if (actor === 'ai' && proposal.originFindingId === null) {
    return deny(
      'proposal_requires_supporting_source',
      'an assistant lesson must generalise a finding',
    );
  }
  return allow({
    id: proposal.id,
    title: proposal.title,
    guidance: proposal.guidance,
    originFindingId: proposal.originFindingId,
    status: 'proposed',
    createdBy: actor,
    userEdited: false,
    createdAt: at,
    updatedAt: at,
    decidedAt: null,
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
  input: {
    readonly id: FindingId;
    readonly title: string;
    readonly detail: string | null;
    readonly sources: readonly ProposedSource[];
  },
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<AppliedFindingProposal> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_create_decided_record',
      'the assistant may only propose; it cannot enter an approved finding',
    );
  }
  const applied = applyFindingProposal(
    { id: input.id, title: input.title, detail: input.detail, sources: input.sources },
    'user',
    at,
  );
  if (!applied.allowed) {
    return applied;
  }
  return allow({
    finding: {
      ...applied.record.finding,
      status: 'approved',
      decidedAt: at,
    },
    sources: applied.record.sources,
  });
}

export function createUserLesson(
  input: {
    readonly id: LessonId;
    readonly title: string;
    readonly guidance: string;
    readonly originFindingId: FindingId | null;
  },
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_create_decided_record',
      'the assistant may only propose; it cannot enter an approved lesson',
    );
  }
  const applied = applyLessonProposal(input, 'user', at);
  if (!applied.allowed) {
    return applied;
  }
  return allow({ ...applied.record, status: 'approved', decidedAt: at });
}

// ---------------------------------------------------------------------------
// Rule 4 — the cook's own words are protected
// ---------------------------------------------------------------------------

/**
 * Whether `actor` may revise this reviewable record at all.
 *
 * Returns the denial rather than a boolean so the caller can report *which*
 * protection stopped it; the codes are distinct because the remedies are
 * different (approve it yourself, reinstate it, or write it yourself).
 */
export function authoriseReviewableUpdate(
  record: ReviewableFacts,
  actor: Actor,
): EvidenceDenial | null {
  if (actor === 'user') {
    return null;
  }
  if (record.status === 'approved') {
    return deny(
      'ai_cannot_update_approved_record',
      'an approved record has been accepted by the cook and the assistant cannot change it',
    );
  }
  if (record.status === 'rejected') {
    return deny(
      'ai_cannot_update_rejected_record',
      'a rejected record is kept as a record of the rejection and cannot be revised by the assistant',
    );
  }
  if (record.createdBy === 'user') {
    return deny(
      'ai_cannot_update_user_authored_record',
      'the assistant cannot revise something the cook wrote',
    );
  }
  if (record.userEdited) {
    return deny(
      'ai_cannot_overwrite_user_edit',
      'the cook has edited this record; the assistant cannot overwrite their words',
    );
  }
  return null;
}

export type FindingPatch = {
  readonly title?: string;
  readonly detail?: string | null;
};

/**
 * Revise a finding's wording.
 *
 * The patch type cannot carry `status`, `decidedAt`, `createdBy` or
 * `userEdited`: a status change is a decision, and decisions go through
 * `decideFinding`. A user edit is stamped as such, which is what keeps
 * "the cook rewrote this" distinguishable from "the cook accepted it as
 * written" for the rest of the record's life.
 */
export function updateFinding(
  finding: Finding,
  patch: FindingPatch,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Finding> {
  const denial = authoriseReviewableUpdate(finding, actor);
  if (denial) {
    return denial;
  }
  return allow({
    ...finding,
    title: patch.title ?? finding.title,
    detail: patch.detail === undefined ? finding.detail : patch.detail,
    userEdited: actor === 'user' ? true : finding.userEdited,
    updatedAt: at,
  });
}

export type LessonPatch = {
  readonly title?: string;
  readonly guidance?: string;
};

export function updateLesson(
  lesson: Lesson,
  patch: LessonPatch,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  const denial = authoriseReviewableUpdate(lesson, actor);
  if (denial) {
    return denial;
  }
  return allow({
    ...lesson,
    title: patch.title ?? lesson.title,
    guidance: patch.guidance ?? lesson.guidance,
    userEdited: actor === 'user' ? true : lesson.userEdited,
    updatedAt: at,
  });
}

/**
 * Recompute a finding's strength after its citations changed.
 *
 * Permitted for either actor because it asserts nothing new: the value is a
 * function of rows that already exist, and the wording is untouched.
 */
export function refreshEvidenceStrength(
  finding: Finding,
  sources: readonly FindingSource[],
  at: IsoTimestamp,
): Finding {
  return {
    ...finding,
    evidenceStrength: deriveEvidenceStrength(
      sources.filter((source) => source.findingId === finding.id),
    ),
    updatedAt: at,
  };
}

// ---------------------------------------------------------------------------
// Rule 3 — decisions are the cook's, and they are explicit
// ---------------------------------------------------------------------------

export type ReviewDecision = 'approve' | 'reject' | 'reinstate';

/**
 * The complete set of permitted review transitions.
 *
 * `rejected -> proposed` exists because a rejection is a judgement, not a
 * deletion, and the cook is allowed to change their mind. There is no
 * transition that removes a row, and no transition any actor but the user can
 * cause.
 */
type TransitionTable = Readonly<Record<ReviewStatus, ReviewStatus | null>>;

const REVIEW_TRANSITIONS: Readonly<Record<ReviewDecision, TransitionTable>> = {
  approve: { proposed: 'approved', approved: null, rejected: null },
  reject: { proposed: 'rejected', approved: 'rejected', rejected: null },
  reinstate: { proposed: null, approved: null, rejected: 'proposed' },
};

/** The status a decision would produce, or a denial explaining why it cannot. */
function resolveReviewTransition(
  record: ReviewableFacts,
  decision: ReviewDecision,
  actor: Actor,
): EvidenceDecision<ReviewStatus> {
  if (actor !== 'user') {
    return deny(
      'ai_cannot_decide_review_status',
      'only the cook may approve, reject or reinstate a record',
    );
  }
  const next = REVIEW_TRANSITIONS[decision][record.status];
  if (next === null) {
    return deny(
      'invalid_status_transition',
      `a ${record.status} record cannot be ${decision}d`,
    );
  }
  return allow(next);
}

/**
 * Approve, reject or reinstate a finding.
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
  const transition = resolveReviewTransition(finding, decision, actor);
  if (!transition.allowed) {
    return transition;
  }
  const status = transition.record;
  return allow({
    ...finding,
    status,
    decidedAt: status === 'proposed' ? null : at,
    updatedAt: at,
  });
}

export function decideLesson(
  lesson: Lesson,
  decision: ReviewDecision,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Lesson> {
  const transition = resolveReviewTransition(lesson, decision, actor);
  if (!transition.allowed) {
    return transition;
  }
  const status = transition.record;
  return allow({
    ...lesson,
    status,
    decidedAt: status === 'proposed' ? null : at,
    updatedAt: at,
  });
}
