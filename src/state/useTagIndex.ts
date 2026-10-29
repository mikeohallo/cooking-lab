/**
 * Every cook's tags, and the kitchen's whole tag list, for History.
 *
 * One hook because History needs both and needs them together: the tags of the
 * cooks it is listing, so a search can match and highlight them, and every tag
 * ever created, so *Show me my tags* offers the whole of the kitchen's words —
 * including one that is on no cook right now. Both are read once per visit rather than per cook — see
 * `listForCooks` — and nothing here writes anything.
 */

import { useEffect, useState } from 'react';

import type { CookId, Tag } from '../domain/entities';
import { useStorage } from './StorageProvider';

export type TagIndex = {
  /** Cook id to its tags, alphabetically. A cook with none is absent. */
  readonly byCook: ReadonlyMap<CookId, readonly Tag[]>;
  /** Every tag ever created, in one alphabet, on a cook now or not. */
  readonly allTags: readonly Tag[];
  readonly loading: boolean;
  /** Why the tags could not be read. The cooks are still listed without them. */
  readonly problem: string | null;
};

const EMPTY: ReadonlyMap<CookId, readonly Tag[]> = new Map();

export function useTagIndex(cookIds: readonly CookId[], refreshToken = 0): TagIndex {
  const { data } = useStorage();
  const [byCook, setByCook] = useState<ReadonlyMap<CookId, readonly Tag[]>>(EMPTY);
  const [allTags, setAllTags] = useState<readonly Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  // Compared by the ids themselves, so a reload that lists the same cooks does
  // not send the screen back to the database.
  const key = [...cookIds].sort().join('|');

  useEffect(() => {
    let live = true;
    const ids = key === '' ? [] : key.split('|');

    Promise.all([data.cookTags.listForCooks(ids), data.tags.listByName()])
      .then(([taggings, used]) => {
        if (!live) {
          return;
        }
        setByCook(new Map(taggings.map((tagging) => [tagging.cookId, tagging.tags])));
        setAllTags(used);
        setProblem(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!live) {
          return;
        }
        // History's job is to list the cooks. Tags that could not be read make
        // the search less useful; they do not make the list wrong, so the
        // screen is told and carries on.
        setProblem(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [data, key, refreshToken]);

  return { byCook, allTags, loading, problem };
}
