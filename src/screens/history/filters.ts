/**
 * History's filters (0.3.0), as pure functions over records: meal type, and
 * "Who & stars". Search (`./search.ts`) then runs over what is left, so the
 * two combine.
 *
 *   Meal type   any of the ones picked. A cook with no meal type matches no
 *               meal-type filter: nothing is guessed for it.
 *   Who & stars one person — someone in the household, or a guest name used
 *               before — and a minimum number of stars. A cook matches when
 *               that person gave it at least that many. N/A ("didn't eat it")
 *               never matches: it is not a number of stars.
 */

import type { Cook, CookId, HouseholdMember, HouseholdMemberId, Rating } from '../../domain/entities';
import type { Stars, StoredMealType } from '../../domain/enums';

/** Who the "Who & stars" filter is about. */
export type PersonPick =
  | { readonly kind: 'member'; readonly id: HouseholdMemberId }
  | { readonly kind: 'guest'; readonly name: string };

export type WhoAndStars = {
  readonly person: PersonPick;
  readonly minStars: Stars;
};

export type CookFilters = {
  readonly mealTypes: readonly StoredMealType[];
  readonly who: WhoAndStars | null;
};

export const NO_FILTERS: CookFilters = { mealTypes: [], who: null };

export function filtersActive(filters: CookFilters): boolean {
  return filters.mealTypes.length > 0 || filters.who !== null;
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
