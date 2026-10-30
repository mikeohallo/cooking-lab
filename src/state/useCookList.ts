/**
 * A list of cooks for Home and History, with the verdict excerpts they show.
 *
 * The verdicts are read as they now stand: a cook whose verdict has been
 * edited shows its newest words (`verdicts`), and `cook.verdict` stays what it
 * always was — the words first saved with the review.
 */

import { useEffect, useState } from 'react';

import type { CookQuery } from '../data/repositories';
import type { Cook, CookId } from '../domain/entities';
import type { StoredMealType } from '../domain/enums';
import { latestWords } from '../domain/evidence';
import { useStorage } from './StorageProvider';

export type CookListLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly cooks: readonly Cook[];
      /** The newest edit of each edited verdict, by cook. Absent when never edited. */
      readonly verdicts: Readonly<Record<CookId, string | null>>;
      /** Each listed cook's meal type, by cook. Absent for a cook with none (0.3.0). */
      readonly mealTypes: Readonly<Record<CookId, StoredMealType>>;
    };

export function useCookList(query: CookQuery, refreshToken = 0): CookListLoad {
  const { data } = useStorage();
  const [load, setLoad] = useState<CookListLoad>({ status: 'loading' });

  // The query is compared by value, so a screen can build it inline.
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let live = true;
    const parsed = JSON.parse(queryKey) as CookQuery;
    data.cooks
      .list(parsed)
      .then(async (cooks) => {
        const ids = cooks.map((cook) => cook.id);
        const [edits, meals] = await Promise.all([
          data.revisions.listVerdictsForCooks(ids),
          data.mealTypes.listForCooks(ids),
        ]);
        const mealTypes: Record<CookId, StoredMealType> = {};
        for (const meal of meals) {
          mealTypes[meal.cookId] = meal.mealType;
        }
        const verdicts: Record<CookId, string | null> = {};
        for (const cook of cooks) {
          const mine = edits.filter((edit) => edit.cookId === cook.id);
          if (mine.length > 0) {
            verdicts[cook.id] = latestWords(cook.verdict, mine).text;
          }
        }
        if (live) {
          setLoad({ status: 'ready', cooks, verdicts, mealTypes });
        }
      })
      .catch((cause: unknown) => {
        if (live) {
          setLoad({
            status: 'failed',
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    return () => {
      live = false;
    };
  }, [data, queryKey, refreshToken]);

  return load;
}

/** The first line or so of a verdict, for a card. */
export function verdictExcerpt(verdict: string | null, maxLength = 110): string | null {
  if (verdict === null) {
    return null;
  }
  const oneLine = verdict.replace(/\s+/g, ' ').trim();
  if (oneLine === '') {
    return null;
  }
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, maxLength - 1).trimEnd()}…`;
}
