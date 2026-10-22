/**
 * Resolving a cook's photographs to something the view layer can draw.
 *
 * A `photo` event carries a logical path and nothing else, which is what keeps
 * a device path out of the record (see `photoPaths.ts`). Drawing one still needs
 * a URI, so one is resolved here, held in component state for as long as the
 * screen is on screen, and thrown away with it. Nothing written down ever comes
 * from this hook.
 *
 * A photograph whose file is not there resolves to `null` rather than to a
 * broken image: the timeline then says the photo is no longer on the phone,
 * which is a true and useful thing to say, where a grey box says nothing.
 */

import { useEffect, useState } from 'react';

import type { PrivateFileStore } from '../data/adapters';
import type { CookEvent, CookEventId } from '../domain/entities';
import { useStorage } from './StorageProvider';

/** Event id to a drawable URI. A missing entry has not resolved yet. */
export type PhotoUris = Readonly<Record<CookEventId, string | null>>;

async function resolve(
  photos: PrivateFileStore,
  events: readonly CookEvent[],
): Promise<PhotoUris> {
  const resolved: Record<CookEventId, string | null> = {};
  for (const event of events) {
    if (event.kind !== 'photo' || event.photoPath === null) {
      continue;
    }
    try {
      resolved[event.id] = await photos.displayUri(event.photoPath);
    } catch {
      // An unreadable store is the same fact to a screen as a missing file:
      // there is nothing to draw, and the card says so.
      resolved[event.id] = null;
    }
  }
  return resolved;
}

/**
 * The URIs for whichever of these events are photographs.
 *
 * Re-resolves when the set of photo events changes — by id, not by array
 * identity, so a reload that returns the same timeline does not send the screen
 * back to the file system.
 */
export function usePhotoUris(events: readonly CookEvent[]): PhotoUris {
  const { photos } = useStorage();
  const [uris, setUris] = useState<PhotoUris>({});

  const key = events
    .filter((event) => event.kind === 'photo')
    .map((event) => `${event.id}:${event.photoPath ?? ''}`)
    .join('|');

  useEffect(() => {
    let live = true;
    resolve(photos, events).then((resolved) => {
      if (live) {
        setUris(resolved);
      }
    });
    return () => {
      live = false;
    };
    // `events` is deliberately not a dependency: `key` is its photo content,
    // and depending on the array itself would refetch on every reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, key]);

  return uris;
}
