/**
 * How many notes each of a few cooks has (0.4.0, part 2), for the Cooking now
 * card's "3 notes". One read per cook: there are only ever a handful of open
 * cooks. Nothing here writes anything.
 *
 * A note waiting on Undo (0.4.0) is not counted: to the cook it is gone.
 */

import { useEffect, useState } from 'react';

import type { CookEventId, CookId } from '../domain/entities';
import { useStorage } from './StorageProvider';

const NONE: ReadonlyMap<CookId, number> = new Map();

export function useNoteCounts(
  cookIds: readonly CookId[],
  refreshToken = 0,
  heldNote: CookEventId | null = null,
): ReadonlyMap<CookId, number> {
  const { data } = useStorage();
  const [counts, setCounts] = useState<ReadonlyMap<CookId, number>>(NONE);
  const key = cookIds.join('|');

  useEffect(() => {
    let live = true;
    const ids = key === '' ? [] : key.split('|');
    Promise.all(ids.map((cookId) => data.cookEvents.listForCook({ cookId, kind: 'user_note' })))
      .then((lists) => {
        if (live) {
          setCounts(
            new Map(
              ids.map((id, index) => [id, (lists[index] ?? []).filter((note) => note.id !== heldNote).length]),
            ),
          );
        }
      })
      .catch(() => {
        // The card still draws; it leaves the count out.
        if (live) {
          setCounts(NONE);
        }
      });
    return () => {
      live = false;
    };
  }, [data, key, refreshToken, heldNote]);

  return counts;
}
