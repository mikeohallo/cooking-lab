/**
 * History's filters (0.3.0), as pure functions over records: meal type,
 * "Who & stars" and cuisine. Search (`./search.ts`) then runs over what is left, so the
 * two combine.
 *
 *   Meal type   any of the ones picked. A cook with no meal type matches no
 *               meal-type filter: nothing is guessed for it.
 *   Who & stars one person — someone in the household, or a guest name used
 *               before — and a minimum number of stars. A cook matches when
 *               that person gave it at least that many. N/A ("didn't eat it")
 *               never matches: it is not a number of stars.
 *   Cuisine     any of the ones picked (schema version 5): one of the ten
 *               named cuisines, or an Other cuisine by its words, compared
 *               ignoring case. A cook with no cuisine matches no cuisine
 *               filter.
 */

import { CUISINE_LABELS } from '../../domain/cookRecord';
import type {
  Cook,
  CookCuisine,
  CookId,
  HouseholdMember,
  HouseholdMemberId,
  Rating,
} from '../../domain/entities';
import type { NamedCuisine, Stars, StoredMealType } from '../../domain/enums';
import { NAMED_CUISINES } from '../../domain/enums';

/** Who the "Who & stars" filter is about. */
export type PersonPick =
  | { readonly kind: 'member'; readonly id: HouseholdMemberId }
  | { readonly kind: 'guest'; readonly name: string };

export type WhoAndStars = {
  readonly person: PersonPick;
  readonly minStars: Stars;
};

/**
 * A cuisine the filter can pick: one of the ten by its key, or an Other
 * cuisine by its words. Other words are compared ignoring case and the spaces
 * around them, so "Home baking" and "home baking" are one choice.
 */
export type CuisinePick =
  | { readonly kind: 'named'; readonly cuisine: NamedCuisine }
  | { readonly kind: 'other'; readonly words: string };

export type CookFilters = {
  readonly mealTypes: readonly StoredMealType[];
  readonly who: WhoAndStars | null;
  /** Any of these cuisines (schema version 5). Absent or empty: no cuisine filter. */
  readonly cuisines?: readonly CuisinePick[];
};

export const NO_FILTERS: CookFilters = { mealTypes: [], who: null, cuisines: [] };

export function filtersActive(filters: CookFilters): boolean {
  return filters.mealTypes.length > 0 || filters.who !== null || (filters.cuisines ?? []).length > 0;
}

function sameWords(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** A cook's cuisine as the filters read it. */
export type CuisineValue = Pick<CookCuisine, 'cuisine' | 'otherWords'>;

/** Whether a cook's cuisine is this pick. */
export function cuisineIs(cuisine: CuisineValue | null | undefined, pick: CuisinePick): boolean {
  if (cuisine === null || cuisine === undefined) {
    return false;
  }
  if (pick.kind === 'named') {
    return cuisine.cuisine === pick.cuisine;
  }
  return (
    cuisine.cuisine === 'other' && cuisine.otherWords !== null && sameWords(cuisine.otherWords, pick.words)
  );
}

export function sameCuisinePick(left: CuisinePick, right: CuisinePick): boolean {
  if (left.kind === 'named' && right.kind === 'named') {
    return left.cuisine === right.cuisine;
  }
  if (left.kind === 'other' && right.kind === 'other') {
    return sameWords(left.words, right.words);
  }
  return false;
}

export type CuisineOption = {
  readonly pick: CuisinePick;
  /** What the chip says: the label, or the cook's own words. */
  readonly label: string;
  /** Stable and unique: `cuisine-greek`, or `cuisine-other-` and the words in lower case. */
  readonly key: string;
};

/**
 * Every cuisine the filter offers: the ten named ones in their order, then
 * each Other cuisine's words in use (from `CuisineRepository.listOtherWords`:
 * one spelling per word ignoring case, alphabetical), as the cook wrote them.
 * Words that are one of the ten names, or already offered, are not offered
 * twice.
 */
export function cuisineOptions(otherWordsInUse: readonly string[]): readonly CuisineOption[] {
  const named: CuisineOption[] = NAMED_CUISINES.map((cuisine) => ({
    pick: { kind: 'named', cuisine } as const,
    label: CUISINE_LABELS[cuisine],
    key: `cuisine-${cuisine}`,
  }));
  const taken = new Set(named.map((option) => option.label.toLowerCase()));
  const others: CuisineOption[] = [];
  for (const raw of otherWordsInUse) {
    const words = raw.trim();
    const key = words.toLowerCase();
    if (words === '' || taken.has(key)) {
      continue;
    }
    taken.add(key);
    others.push({ pick: { kind: 'other', words } as const, label: words, key: `cuisine-other-${key}` });
  }
  return [...named, ...others];
}

/** Whether this rating is by this person. A guest's name ignores case. */
export function ratingIsBy(rating: Rating, person: PersonPick): boolean {
  if (person.kind === 'member') {
    return rating.memberId === person.id;
  }
  return rating.guestName !== null && rating.guestName.trim().toLowerCase() === person.name.trim().toLowerCase();
}

/** Whether a cook's ratings give this person at least these stars. N/A never does. */
export function meetsWhoAndStars(ratings: readonly Rating[], who: WhoAndStars): boolean {
  return ratings.some(
    (rating) =>
      ratingIsBy(rating, who.person) &&
      !rating.notEaten &&
      rating.stars !== null &&
      rating.stars >= who.minStars,
  );
}

export type FilterInputs = {
  readonly mealTypes: Readonly<Record<CookId, StoredMealType>>;
  readonly ratingsByCook: ReadonlyMap<CookId, readonly Rating[]>;
  /** Each cook's cuisine, by cook; absent for a cook with none (schema version 5). */
  readonly cuisines?: Readonly<Record<CookId, CuisineValue>>;
};

/** The cooks that pass every active filter, in the order given. */
export function applyFilters(
  cooks: readonly Cook[],
  inputs: FilterInputs,
  filters: CookFilters,
): readonly Cook[] {
  return cooks.filter((cook) => {
    if (filters.mealTypes.length > 0) {
      const mealType = inputs.mealTypes[cook.id];
      if (mealType === undefined || !filters.mealTypes.includes(mealType)) {
        return false;
      }
    }
    if (filters.who !== null && !meetsWhoAndStars(inputs.ratingsByCook.get(cook.id) ?? [], filters.who)) {
      return false;
    }
    const cuisines = filters.cuisines ?? [];
    if (cuisines.length > 0) {
      const cuisine = inputs.cuisines?.[cook.id];
      if (!cuisines.some((pick) => cuisineIs(cuisine, pick))) {
        return false;
      }
    }
    return true;
  });
}

/** Everyone the filter can be about: the household in order, then guest names used before. */
export function peopleToPick(
  household: readonly HouseholdMember[],
  guestNames: readonly string[],
): readonly { readonly pick: PersonPick; readonly name: string; readonly key: string }[] {
  const members = [...household].sort(
    (left, right) =>
      Number(left.retiredAt !== null) - Number(right.retiredAt !== null) || left.position - right.position,
  );
  const memberNames = new Set(
    members.filter((member) => member.retiredAt === null).map((member) => member.name.toLowerCase()),
  );
  return [
    ...members.map((member) => ({
      pick: { kind: 'member', id: member.id } as const,
      name: member.name,
      key: `member-${member.id}`,
    })),
    ...guestNames
      .filter((name) => !memberNames.has(name.toLowerCase()))
      .map((name) => ({ pick: { kind: 'guest', name } as const, name, key: `guest-${name.toLowerCase()}` })),
  ];
}

export function samePick(left: PersonPick, right: PersonPick): boolean {
  if (left.kind === 'member' && right.kind === 'member') {
    return left.id === right.id;
  }
  if (left.kind === 'guest' && right.kind === 'guest') {
    return left.name.toLowerCase() === right.name.toLowerCase();
  }
  return false;
}
