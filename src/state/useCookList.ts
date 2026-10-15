/**
 * A list of cooks for Home and History, with the verdict excerpts they show.
 */

import { useEffect, useState } from 'react';

import type { CookQuery } from '../data/repositories';
import type { Cook } from '../domain/entities';
import { useStorage } from './StorageProvider';

export type CookListLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'ready'; readonly cooks: readonly Cook[] };

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
      .then((cooks) => {
        if (live) {
          setLoad({ status: 'ready', cooks });
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
