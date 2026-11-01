/**
 * The photographs a page of cook cards shows (0.4.0, part 1).
 *
 * One read per page, through `CardPhotoService.forCooks`: each card's own
 * first photo, or the nearest earlier cook's along the Cook this again chain,
 * or none — and a card with none draws its meal tile. The photo comes back as
 * its timeline entry; drawing it still goes through `usePhotoUris`, which
 * turns a missing file into "nothing to draw" rather than a broken image.
 *
 * Nothing here writes anything.
 */

import { useEffect, useState } from 'react';

import type { CardPhoto } from '../data/repositories';
import type { CookId } from '../domain/entities';
import { useStorage } from './StorageProvider';

export type CardPhotos = {
  /** Cook id to its card's photo. A cook with none is absent. */
  readonly byCook: ReadonlyMap<CookId, CardPhoto>;
  /** True until the first read for these cooks has come back. */
  readonly loading: boolean;
  readonly problem: string | null;
};

const NONE: ReadonlyMap<CookId, CardPhoto> = new Map();

export function useCardPhotos(cookIds: readonly CookId[], refreshToken = 0): CardPhotos {
  const { data } = useStorage();
  const [state, setState] = useState<CardPhotos>({ byCook: NONE, loading: true, problem: null });
  // Compared by value, in order, so a screen can build the list inline.
  const key = cookIds.join('|');

  useEffect(() => {
    let live = true;
    const ids = key === '' ? [] : key.split('|');
    data.cardPhotos
      .forCooks(ids)
      .then((byCook) => {
        if (live) {
          setState({ byCook, loading: false, problem: null });
        }
      })
      .catch((cause: unknown) => {
        if (live) {
          // Every card still draws, with its meal tile.
          setState({
            byCook: NONE,
            loading: false,
            problem: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    return () => {
      live = false;
    };
  }, [data, key, refreshToken]);

  return state;
}
