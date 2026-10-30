/**
 * Update 2's part of one cook, loaded for a screen (0.3.0): its meal type,
 * every version of its ingredients, its ratings, the household, the edits of
 * its next-time lines, how many times the dish has been cooked, and — for a
 * cook started with "Cook this again" — what the earlier cook said.
 *
 * Like `useCook`: reads go to the repositories, writes go through the
 * services, and a record the store has returned is the only thing that
 * changes the local copy.
 */

import { useCallback, useEffect, useState } from 'react';

import type { DataLayer } from '../data/repositories';
import { latestWords } from '../domain/evidence';
import { timesCooked } from '../domain/cookRecord';
import type {
  Cook,
  CookId,
  CookMealType,
  HouseholdMember,
  IngredientVersion,
  Lesson,
  LessonRevision,
  Rating,
} from '../domain/entities';
import { useStorage } from './StorageProvider';

/** What the "Last time" card shows about the cook this one came from. */
export type LastTime = {
  readonly cook: Cook;
  readonly ratings: readonly Rating[];
  /** Approved next-time lines, oldest first. */
  readonly lessons: readonly Lesson[];
  readonly lessonRevisions: readonly LessonRevision[];
  /** Its notes as they now read (the verdict's newest words). */
  readonly notes: string | null;
  /** Its meal type, for the label above it. */
  readonly mealType: CookMealType | null;
};

export type CookRecord = {
  readonly mealType: CookMealType | null;
  /** Oldest first; the last is the list as it now stands. */
  readonly ingredients: readonly IngredientVersion[];
  readonly ratings: readonly Rating[];
  /** Everyone, retired too, in order. */
  readonly household: readonly HouseholdMember[];
  readonly lessonRevisions: readonly LessonRevision[];
  /** 1 for a first time, 2 for a first repeat, … */
  readonly timesCooked: number;
  readonly lastTime: LastTime | null;
};

export type CookRecordLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | ({ readonly status: 'ready' } & CookRecord);

/** Walk the parent chain, at most this far: a guard, never a real limit. */
const MAX_CHAIN = 500;

async function loadRecord(data: DataLayer, cookId: CookId): Promise<CookRecordLoad> {
  try {
    const cook = await data.cooks.findById(cookId);
    if (cook === null) {
      return { status: 'failed', message: 'That cook isn’t here.' };
    }
    const [mealType, ingredients, ratings, household, lessonRevisions] = await Promise.all([
      data.mealTypes.findForCook(cookId),
      data.ingredients.listForCook(cookId),
      data.ratings.listForCook(cookId),
      data.household.list(),
      data.lessonRevisions.listForCook(cookId),
    ]);

    // The chain, read once, for the count and for the earlier cook.
    const chain = new Map<CookId, Cook>();
    let parentId = cook.parentCookId;
    while (parentId !== null && !chain.has(parentId) && chain.size < MAX_CHAIN) {
      const parent = await data.cooks.findById(parentId);
      if (parent === null) {
        break;
      }
      chain.set(parent.id, parent);
      parentId = parent.parentCookId;
    }
    const count = timesCooked(cook, (id) => chain.get(id) ?? null);

    let lastTime: LastTime | null = null;
    const parent = cook.parentCookId === null ? null : (chain.get(cook.parentCookId) ?? null);
    if (parent !== null) {
      const [parentRatings, parentLessons, parentLessonEdits, parentRevisions, parentMeal] =
        await Promise.all([
          data.ratings.listForCook(parent.id),
          data.lessons.list({ cookId: parent.id, status: 'approved', sort: 'oldest_first' }),
          data.lessonRevisions.listForCook(parent.id),
          data.revisions.listForCook(parent.id),
          data.mealTypes.findForCook(parent.id),
        ]);
      lastTime = {
        cook: parent,
        ratings: parentRatings,
        lessons: parentLessons,
        lessonRevisions: parentLessonEdits,
        notes: latestWords(
          parent.verdict,
          parentRevisions.filter((revision) => revision.field === 'verdict'),
        ).text,
        mealType: parentMeal,
      };
    }

    return {
      status: 'ready',
      mealType,
      ingredients,
      ratings,
      household,
      lessonRevisions,
      timesCooked: count,
      lastTime,
    };
  } catch (cause: unknown) {
    return { status: 'failed', message: cause instanceof Error ? cause.message : String(cause) };
  }
}

export function useCookRecord(
  cookId: CookId,
  refreshToken = 0,
): {
  record: CookRecordLoad;
  reload: () => Promise<void>;
  acceptMealType: (mealType: CookMealType | null) => void;
  acceptIngredients: (version: IngredientVersion) => void;
  /** A person's rating as the store returned it, or removed (`null`). */
  acceptRating: (rating: Rating | null, person: { memberId?: string; guestName?: string }) => void;
  acceptLessonRevision: (revision: LessonRevision) => void;
  acceptHousehold: (members: readonly HouseholdMember[]) => void;
} {
  const { data } = useStorage();
  const [record, setRecord] = useState<CookRecordLoad>({ status: 'loading' });

  const reload = useCallback(async () => {
    setRecord(await loadRecord(data, cookId));
  }, [data, cookId]);

  useEffect(() => {
    let live = true;
    loadRecord(data, cookId).then((result) => {
      if (live) {
        setRecord(result);
      }
    });
    return () => {
      live = false;
    };
  }, [data, cookId, refreshToken]);

  const update = useCallback((change: (ready: CookRecord) => Partial<CookRecord>) => {
    setRecord((current) => (current.status === 'ready' ? { ...current, ...change(current) } : current));
  }, []);

  const acceptMealType = useCallback(
    (mealType: CookMealType | null) => update(() => ({ mealType })),
    [update],
  );
  const acceptIngredients = useCallback(
    (version: IngredientVersion) => update((ready) => ({ ingredients: [...ready.ingredients, version] })),
    [update],
  );
  const acceptRating = useCallback(
    (rating: Rating | null, person: { memberId?: string; guestName?: string }) =>
      update((ready) => {
        const samePerson = (existing: Rating) =>
          person.memberId !== undefined
            ? existing.memberId === person.memberId
            : existing.guestName !== null &&
              existing.guestName.toLowerCase() === (person.guestName ?? '').trim().toLowerCase();
        const others = ready.ratings.filter((existing) => !samePerson(existing));
        return { ratings: rating === null ? others : [...others, rating] };
      }),
    [update],
  );
  const acceptLessonRevision = useCallback(
    (revision: LessonRevision) =>
      update((ready) => ({ lessonRevisions: [...ready.lessonRevisions, revision] })),
    [update],
  );
  const acceptHousehold = useCallback(
    (members: readonly HouseholdMember[]) => update(() => ({ household: members })),
    [update],
  );

  return {
    record,
    reload,
    acceptMealType,
    acceptIngredients,
    acceptRating,
    acceptLessonRevision,
    acceptHousehold,
  };
}
