/**
 * Reading update 2's records the way every screen and export reads them
 * (0.3.0): the ingredients as they now stand, a next-time line as it now
 * reads, a rating in words, and how many times a dish has been cooked.
 *
 * Pure, so the screens, the text export and the search all agree.
 */

import type {
  Cook,
  CookId,
  HouseholdMember,
  IngredientVersion,
  Lesson,
  LessonRevision,
  Rating,
} from './entities';
import type { MealType } from './enums';

/** The newest version: the list as it now stands, or `null` for none yet. */
export function currentIngredients(
  versions: readonly IngredientVersion[],
): IngredientVersion | null {
  let newest: IngredientVersion | null = null;
  for (const version of versions) {
    if (newest === null || version.savedAt >= newest.savedAt) {
      newest = version;
    }
  }
  return newest;
}

/** The lines of an ingredients list that have something on them. */
export function ingredientLines(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
}

/** A next-time line as it now reads: its newest edit, or as first written. */
export function nextTimeWords(
  lesson: Lesson,
  edits: readonly LessonRevision[],
): { readonly text: string; readonly edited: boolean } {
  let newest: LessonRevision | null = null;
  for (const edit of edits) {
    if (edit.lessonId === lesson.id && (newest === null || edit.revisedAt >= newest.revisedAt)) {
      newest = edit;
    }
  }
  return newest === null ? { text: lesson.text, edited: false } : { text: newest.text, edited: true };
}

/** The names on screen for each meal type. `none` has no label. */
export const MEAL_TYPE_LABELS: Readonly<Record<Exclude<MealType, 'none'>, string>> = {
  breakfast: 'Breakfast',
  lunch_dinner: 'Lunch/Dinner',
  dessert: 'Dessert',
  snack: 'Snack',
};

export function mealTypeLabel(mealType: MealType | null | undefined): string | null {
  if (mealType === null || mealType === undefined || mealType === 'none') {
    return null;
  }
  return MEAL_TYPE_LABELS[mealType];
}

/** Who a rating is from, by name. A member no longer listed is "Someone". */
export function raterName(rating: Rating, members: readonly HouseholdMember[]): string {
  if (rating.guestName !== null) {
    return rating.guestName;
  }
  return members.find((member) => member.id === rating.memberId)?.name ?? 'Someone';
}

/** A rating's answer in words: "4 stars", "1 star", "N/A (didn't eat it)". */
export function ratingAnswerText(rating: Rating): string | null {
  if (rating.notEaten) {
    return 'N/A (didn’t eat it)';
  }
  if (rating.stars !== null) {
    return rating.stars === 1 ? '1 star' : `${rating.stars} stars`;
  }
  return null;
}

/**
 * Ratings in the order the review shows them: household members in their
 * order (retired ones after), then guests in the order they were added.
 */
export function orderRatings(
  ratings: readonly Rating[],
  members: readonly HouseholdMember[],
): readonly Rating[] {
  const rank = (rating: Rating): number => {
    if (rating.memberId === null) {
      return Number.MAX_SAFE_INTEGER;
    }
    const member = members.find((candidate) => candidate.id === rating.memberId);
    if (member === undefined) {
      return Number.MAX_SAFE_INTEGER - 1;
    }
    return (member.retiredAt === null ? 0 : 1_000_000) + member.position;
  };
  return [...ratings].sort(
    (left, right) => rank(left) - rank(right) || left.ratedAt.localeCompare(right.ratedAt),
  );
}

/**
 * How many times this dish has been cooked, counting this cook: 1 for a cook
 * with no parent, 2 for its first repeat, and so on along the parent chain.
 * A chain that loops (which the schema forbids for one step but not for
 * many) is cut where it repeats.
 */
export function timesCooked(cook: Cook, findParent: (id: CookId) => Cook | null): number {
  const seen = new Set<CookId>([cook.id]);
  let count = 1;
  let parentId = cook.parentCookId;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = findParent(parentId);
    if (parent === null) {
      break;
    }
    seen.add(parent.id);
    count += 1;
    parentId = parent.parentCookId;
  }
  return count;
}

/** "2nd", "3rd", "11th", "22nd". */
export function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** "2nd time cooking this", or `null` for a first time. */
export function timesCookedLine(count: number): string | null {
  return count < 2 ? null : `${ordinal(count)} time cooking this`;
}
