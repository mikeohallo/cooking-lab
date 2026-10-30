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
 *  11. Nothing the cook writes is lost (0.2.2). The cook may reword a note or
 *      a verdict, and an edit never overwrites: the original stays exactly as
 *      it was first written and each edit is a new `Revision` beside it, so
 *      every earlier version can still be read. A note's own words can no
 *      longer be overwritten in place at all — `updateCookEvent` refuses it —
 *      so the protection is stronger than before editing existed, not weaker.
 *      The assistant may reword nothing.
 *  12. A cook is deleted only when its owner deletes it (0.2.2). Deleting a
 *      whole cook is its own operation, asked for explicitly, confirmed on
 *      screen and offered back for a few seconds with Undo; it is not a
 *      relaxation of rule 10, which still governs a cook that is being kept.
 *      The assistant may delete nothing.
 *  13. The cook's own judgements are the cook's (0.3.0). A cook's meal type,
 *      its ingredients, who ate it and what they thought, the next-time line
 *      and starting it again are all written by the cook and never by the
 *      assistant. Ingredients and next-time lines keep every earlier version,
 *      as rule 11 keeps a note's. A rating is a current answer, changed in
 *      place, and "didn't eat it" is never a number.
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
  CookMealType,
  Finding,
  FindingId,
  FindingSource,
  HouseholdMemberId,
  IngredientVersion,
  IsoTimestamp,
  JsonValue,
  Lesson,
  LessonId,
  LessonRevision,
  PhotoLogicalPath,
  Rating,
  RatingId,
  Revision,
  RevisionId,
} from './entities';
import type {
  ConfidenceLevel,
  CookEventKind,
  CreatedBy,
  FindingClass,
  MealType,
  ProposalStatus,
  Provenance,
  Stars,
} from './enums';
import { isStars, isStoredMealType } from './enums';
import {
  MAX_PERSON_NAME_LENGTH,
  MAX_RATING_LINE_LENGTH,
  MAX_TEXT_LENGTH,
  isEntityId,
} from './invariants';

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
  | 'only_a_photo_may_be_removed'
  /** Rule 11: an overwrite of a note's words was asked for; edits are revisions. */
  | 'words_are_revised_not_overwritten'
  /** Rule 11: something other than a note was offered for rewording. */
  | 'only_a_note_may_be_reworded'
  /** Rule 11: a verdict was offered for rewording before the cook has a review. */
  | 'only_a_reviewed_verdict_may_be_reworded'
  /** Rule 11: an edit with no words in it. */
  | 'revision_needs_words'
  /** Rule 12: the assistant tried to delete a cook. */
  | 'ai_cannot_delete_a_cook'
  /** Rule 13: a save that would change nothing. */
  | 'nothing_changed'
  /** Rule 13: a rating that is not one person's whole stars or N/A. */
  | 'rating_not_valid'
  /** Rule 13: only a next-time line the cook approved can be edited by them. */
  | 'only_an_approved_lesson_may_be_reworded'
  /** The household: a name that is blank, too long or already on the list. */
  | 'name_not_valid';

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
  // Rule 11: once a cook is reviewed its verdict is kept as first saved, and a
  // change of words is an edit (`reviseVerdict`), never a second save over it.
  if (cook.status === 'reviewed' && verdict !== cook.verdict) {
    return deny(
      'words_are_revised_not_overwritten',
      'this cook is already reviewed; edit the verdict to change it, and the first words are kept',
    );
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

/**
 * Revise a timeline entry in place.
 *
 * From 0.2.2 this refuses to change a note's words, for the cook too. A note
 * is reworded with `reviseNote`, which keeps the original; an in-place change of
 * `body` would be the one way left to lose what the cook first wrote, so it is
 * closed rather than left unused. Nothing on any screen called this for a note.
 */
export function updateCookEvent(
  event: CookEvent,
  patch: CookEventPatch,
  actor: Actor,
): EvidenceDecision<CookEvent> {
  const denial = denyIfNotUser(actor, 'a timeline entry');
  if (denial) {
    return denial;
  }
  if (event.kind === 'user_note' && patch.body !== undefined && patch.body !== event.body) {
    return deny(
      'words_are_revised_not_overwritten',
      'a note keeps its first words; an edit is saved beside them as a new version',
    );
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
// Rule 11 — an edit keeps the earlier words
// ---------------------------------------------------------------------------

export type RevisionIdentity = {
  readonly id: RevisionId;
};

/** Words for an edit: something, not only spaces. Stored exactly as typed. */
function deniedWords(text: string): EvidenceDenial | null {
  if (typeof text !== 'string' || text.trim() === '') {
    return deny('revision_needs_words', 'write something first; an edit needs words');
  }
  return null;
}

/**
 * Reword a note.
 *
 * Returns a new `Revision` and leaves the note itself exactly as it was: the
 * original words stay in its row, byte for byte, and keep their place in the
 * timeline. The newest revision is what the screen shows, marked "edited", and
 * the earlier versions are a tap away. Open or reviewed makes no difference —
 * a cook remembers the right word after dinner as often as during it.
 *
 * Only a note: a reading is a number and a photograph is a picture, neither of
 * them words to reword, and the assistant's own message is not the cook's.
 */
export function reviseNote(
  event: CookEvent,
  text: string,
  identity: RevisionIdentity,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Revision> {
  const denial = denyIfNotUser(actor, 'a note');
  if (denial) {
    return denial;
  }
  if (event.kind !== 'user_note') {
    return deny(
      'only_a_note_may_be_reworded',
      'only a note can be edited; readings and photos stay as they were taken',
    );
  }
  const empty = deniedWords(text);
  if (empty) {
    return empty;
  }
  return allow({
    id: identity.id,
    cookId: event.cookId,
    cookEventId: event.id,
    field: 'note',
    text,
    revisedAt: at,
  });
}

/**
 * Reword the verdict on a reviewed cook.
 *
 * The verdict saved with the review stays in `cooks.verdict` as it was typed;
 * the edit is a new `Revision`. An open cook has no verdict to reword yet — it
 * gets one by being reviewed.
 */
export function reviseVerdict(
  cook: Cook,
  text: string,
  identity: RevisionIdentity,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Revision> {
  const denial = denyIfNotUser(actor, 'a verdict');
  if (denial) {
    return denial;
  }
  if (cook.status !== 'reviewed') {
    return deny(
      'only_a_reviewed_verdict_may_be_reworded',
      'a verdict is written in the review; edit it once the cook is reviewed',
    );
  }
  const empty = deniedWords(text);
  if (empty) {
    return empty;
  }
  return allow({
    id: identity.id,
    cookId: cook.id,
    cookEventId: null,
    field: 'verdict',
    text,
    revisedAt: at,
  });
}

/**
 * The words to show for a note or a verdict: the newest edit, or the original.
 *
 * `revisions` are the edits of that one note or verdict, in any order. The
 * newest by `revisedAt` wins, and on a tie the later in the list.
 */
export function latestWords(
  original: string | null,
  revisions: readonly Revision[],
): { readonly text: string | null; readonly edited: boolean } {
  let latest: Revision | null = null;
  for (const revision of revisions) {
    if (latest === null || revision.revisedAt >= latest.revisedAt) {
      latest = revision;
    }
  }
  return latest === null ? { text: original, edited: false } : { text: latest.text, edited: true };
}

// ---------------------------------------------------------------------------
// Rule 12 — a cook is deleted only by its owner
// ---------------------------------------------------------------------------

/**
 * Delete a whole cook: its notes, readings, photos, tag links and edits.
 *
 * Its own operation, not a wider `removeCookEvent`. Nothing about rule 10
 * changes: a cook that is being kept still loses only a photograph taken by
 * mistake. This is the cook's owner deciding the whole record should go, which
 * the screens ask them to confirm and then offer back for a few seconds. The
 * assistant is refused outright.
 */
export function deleteCook(cook: Cook, actor: Actor): EvidenceDecision<Cook> {
  if (actor !== 'user') {
    return deny('ai_cannot_delete_a_cook', 'the assistant cannot delete a cook');
  }
  return allow(cook);
}

// ---------------------------------------------------------------------------
// Rule 13 — meal type, ingredients, ratings, next time and cooking it again
// ---------------------------------------------------------------------------

/**
 * Set or clear a cook's meal type.
 *
 * `none` clears it: the decision is `null`, and the caller removes the row.
 * Any cook, open or reviewed.
 */
export function setMealType(
  cook: Cook,
  mealType: MealType,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<CookMealType | null> {
  const denial = denyIfNotUser(actor, 'a meal type');
  if (denial) {
    return denial;
  }
  if (mealType === 'none') {
    return allow(null);
  }
  if (!isStoredMealType(mealType)) {
    return deny('nothing_changed', 'that is not a meal type');
  }
  return allow({ cookId: cook.id, mealType, setAt: at });
}

export type IngredientIdentity = { readonly id: string };

/**
 * Save a cook's ingredients as a new version.
 *
 * Never an overwrite: the earlier versions stay, and the newest is the list.
 * Stored exactly as typed or pasted. A save needs words, and a save that is
 * the same as the list already there is refused as changing nothing.
 */
export function saveIngredients(
  cook: Cook,
  text: string,
  current: string | null,
  identity: IngredientIdentity,
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<IngredientVersion> {
  const denial = denyIfNotUser(actor, 'ingredients');
  if (denial) {
    return denial;
  }
  const empty = deniedWords(text);
  if (empty) {
    return empty;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return deny('revision_needs_words', `keep the ingredients under ${MAX_TEXT_LENGTH} characters`);
  }
  if (current !== null && text === current) {
    return deny('nothing_changed', 'the ingredients are already exactly this');
  }
  return allow({ id: identity.id, cookId: cook.id, text, savedAt: at });
}

/** Who a rating is from: a household member, or a guest named for this cook. */
export type RatingPerson =
  | { readonly memberId: HouseholdMemberId; readonly guestName?: undefined }
  | { readonly memberId?: undefined; readonly guestName: string };

export type RatingAnswer = {
  readonly stars: number | null;
  readonly notEaten: boolean;
  readonly line: string | null;
};

/**
 * One person's answer about a cook: whole stars, or N/A, and a line.
 *
 * Returns `null` when the answer says nothing at all — no stars, not N/A, no
 * line — which the caller takes as "remove this person's rating". A guest's
 * name and a line are trimmed of the spaces around them; a blank line is no
 * line. N/A and stars together are refused: a person who did not eat it gave
 * it no stars, and N/A is never counted as one.
 */
export function rateCook(
  cook: Cook,
  person: RatingPerson,
  answer: RatingAnswer,
  identity: { readonly id: RatingId },
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Rating | null> {
  const denial = denyIfNotUser(actor, 'a rating');
  if (denial) {
    return denial;
  }
  const memberId = person.memberId ?? null;
  const guestName = person.guestName === undefined ? null : person.guestName.trim();
  if ((memberId === null) === (guestName === null) || guestName === '') {
    return deny(
      'rating_not_valid',
      'a rating is from one person: someone in the household, or a named guest',
    );
  }
  if (guestName !== null && guestName.length > MAX_PERSON_NAME_LENGTH) {
    return deny('rating_not_valid', `keep a name under ${MAX_PERSON_NAME_LENGTH} characters`);
  }
  if (answer.stars !== null && !isStars(answer.stars)) {
    return deny('rating_not_valid', 'a rating is one to five whole stars');
  }
  if (answer.notEaten && answer.stars !== null) {
    return deny('rating_not_valid', 'someone who did not eat it gives it no stars');
  }
  const line = answer.line === null || answer.line.trim() === '' ? null : answer.line.trim();
  if (line !== null && line.length > MAX_RATING_LINE_LENGTH) {
    return deny('rating_not_valid', `keep the line under ${MAX_RATING_LINE_LENGTH} characters`);
  }
  if (answer.stars === null && !answer.notEaten && line === null) {
    return allow(null);
  }
  return allow({
    id: identity.id,
    cookId: cook.id,
    memberId,
    guestName,
    stars: answer.stars as Stars | null,
    notEaten: answer.notEaten,
    line,
    ratedAt: at,
  });
}

/**
 * Reword a next-time line: a new version beside it, as for a note.
 *
 * Only a lesson the cook has approved — which is every next-time line they
 * wrote. A proposal is the assistant's and is decided, not reworded here.
 */
export function reviseLesson(
  lesson: Lesson,
  text: string,
  identity: { readonly id: string },
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<LessonRevision> {
  const denial = denyIfNotUser(actor, 'a next-time line');
  if (denial) {
    return denial;
  }
  if (lesson.status !== 'approved') {
    return deny(
      'only_an_approved_lesson_may_be_reworded',
      'only a next-time line you wrote or approved can be edited',
    );
  }
  const empty = deniedWords(text);
  if (empty) {
    return empty;
  }
  return allow({
    id: identity.id,
    lessonId: lesson.id,
    cookId: lesson.cookId,
    text,
    revisedAt: at,
  });
}

/**
 * Start a new open cook from an earlier one ("Cook this again").
 *
 * The new cook has the same title and points back at the earlier one; the
 * caller copies the tags, the meal type and the current ingredients. Nothing
 * about the earlier cook changes.
 */
export function cookAgain(
  source: Cook,
  identity: { readonly id: CookId },
  actor: Actor,
  at: IsoTimestamp,
): EvidenceDecision<Cook> {
  const denial = denyIfNotUser(actor, 'a cook');
  if (denial) {
    return denial;
  }
  return createCook(
    { id: identity.id, title: source.title, parentCookId: source.id, startedAt: at },
    actor,
    at,
  );
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
