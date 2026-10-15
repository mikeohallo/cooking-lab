/**
 * One cook and its timeline, loaded for a screen.
 *
 * Reads go straight to the repositories; writes go through the capture
 * service and come back here as confirmed records, which is the only way the
 * local copy is ever updated. Nothing is shown as saved that the store has
 * not returned.
 */

import { useCallback, useEffect, useState } from 'react';

import type { DataLayer } from '../data/repositories';
import type { Cook, CookEvent, CookId, Lesson } from '../domain/entities';
import { useStorage } from './StorageProvider';

export type CookLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string }
  | {
      readonly status: 'ready';
      readonly cook: Cook;
      readonly events: readonly CookEvent[];
      /** The lessons the cook has approved for this cook. Proposed ones are not history. */
      readonly lessons: readonly Lesson[];
    };

async function loadCook(data: DataLayer, cookId: CookId): Promise<CookLoad> {
  try {
    const cook = await data.cooks.findById(cookId);
    if (cook === null) {
      return { status: 'missing' };
    }
    const [events, lessons] = await Promise.all([
      data.cookEvents.listForCook({ cookId, sort: 'oldest_first' }),
      data.lessons.list({ cookId, status: 'approved', sort: 'oldest_first' }),
    ]);
    return { status: 'ready', cook, events, lessons };
  } catch (cause: unknown) {
    return {
      status: 'failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function useCook(
  cookId: CookId,
  refreshToken = 0,
): {
  load: CookLoad;
  reload: () => Promise<void>;
  /** Replace the local cook with a record the store has just returned. */
  acceptCook: (cook: Cook) => void;
  /** Append an event the store has just returned. */
  acceptEvent: (event: CookEvent) => void;
} {
  const { data } = useStorage();
  const [load, setLoad] = useState<CookLoad>({ status: 'loading' });

  const reload = useCallback(async () => {
    setLoad(await loadCook(data, cookId));
  }, [data, cookId]);

  useEffect(() => {
    let live = true;
    loadCook(data, cookId).then((result) => {
      if (live) {
        setLoad(result);
      }
    });
    return () => {
      live = false;
    };
  }, [data, cookId, refreshToken]);

  const acceptCook = useCallback((cook: Cook) => {
    setLoad((current) => (current.status === 'ready' ? { ...current, cook } : current));
  }, []);

  const acceptEvent = useCallback((event: CookEvent) => {
    setLoad((current) =>
      current.status === 'ready' ? { ...current, events: [...current.events, event] } : current,
    );
  }, []);

  return { load, reload, acceptCook, acceptEvent };
}
