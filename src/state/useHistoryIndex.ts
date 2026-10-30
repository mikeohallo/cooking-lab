/**
 * What History's search and filters need beyond tags (0.3.0): each listed
 * cook's current ingredients and ratings, the household and every guest name
 * used before. Read once per visit, a statement per kind, like
 * `useTagIndex`; nothing here writes anything.
 */

import { useEffect, useState } from 'react';

import type { CookId, HouseholdMember, Rating } from '../domain/entities';
import { useStorage } from './StorageProvider';

export type HistoryIndex = {
  /** Cook id to its ingredients as they now stand. A cook with none is absent. */
  readonly ingredientsByCook: ReadonlyMap<CookId, string>;
  /** Cook id to its ratings. A cook with none is absent. */
  readonly ratingsByCook: ReadonlyMap<CookId, readonly Rating[]>;
  readonly household: readonly HouseholdMember[];
  readonly guestNames: readonly string[];
  readonly problem: string | null;
};

const EMPTY: HistoryIndex = {
  ingredientsByCook: new Map(),
  ratingsByCook: new Map(),
  household: [],
  guestNames: [],
  problem: null,
};

export function useHistoryIndex(cookIds: readonly CookId[], refreshToken = 0): HistoryIndex {
  const { data } = useStorage();
  const [index, setIndex] = useState<HistoryIndex>(EMPTY);
  const key = [...cookIds].sort().join('|');

  useEffect(() => {
    let live = true;
    const ids = key === '' ? [] : key.split('|');
    Promise.all([
      data.ingredients.currentForCooks(ids),
      data.ratings.listForCooks(ids),
      data.household.list(),
      data.ratings.listGuestNames(),
    ])
      .then(([ingredients, ratings, household, guestNames]) => {
        if (!live) {
          return;
        }
        const ratingsByCook = new Map<CookId, Rating[]>();
        for (const rating of ratings) {
          const list = ratingsByCook.get(rating.cookId);
          if (list === undefined) {
            ratingsByCook.set(rating.cookId, [rating]);
          } else {
            list.push(rating);
          }
        }
        setIndex({
          ingredientsByCook: new Map(ingredients.map((version) => [version.cookId, version.text])),
          ratingsByCook,
          household,
          guestNames,
          problem: null,
        });
      })
      .catch((cause: unknown) => {
        if (live) {
          // The list is still right without these; search and filters are
          // the poorer for it, and the screen says so.
          setIndex({ ...EMPTY, problem: cause instanceof Error ? cause.message : String(cause) });
        }
      });
    return () => {
      live = false;
    };
  }, [data, key, refreshToken]);

  return index;
}
