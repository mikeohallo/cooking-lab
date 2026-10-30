/**
 * A cook's ratings on one line of its Home card (0.3.0): "★ 5 Alex · ★ 4 Sam".
 *
 * From the data only: each person who gave stars, in the order the review
 * shows them (household order, then guests). N/A is left out — "didn't eat
 * it" is not a score — and so is a rating that is only a line of words. A cook
 * with no stars has no line at all; an old review shows its notes and nothing
 * here.
 */

import { orderRatings, raterName } from '../../domain/cookRecord';
import type { HouseholdMember, Rating } from '../../domain/entities';
import type { Stars } from '../../domain/enums';

export type StarredRating = {
  readonly key: string;
  readonly name: string;
  readonly stars: Stars;
};

export function starredRatings(
  ratings: readonly Rating[],
  household: readonly HouseholdMember[],
): readonly StarredRating[] {
  return orderRatings(ratings, household).flatMap((rating) =>
    rating.notEaten || rating.stars === null
      ? []
      : [{ key: rating.id, name: raterName(rating, household), stars: rating.stars }],
  );
}

/** The same line as words, for TalkBack: "Alex 5 stars, Sam 4 stars". */
export function ratingsSpoken(starred: readonly StarredRating[]): string {
  return starred
    .map((rating) => `${rating.name} ${rating.stars === 1 ? '1 star' : `${rating.stars} stars`}`)
    .join(', ');
}
