/**
 * Where a photograph goes in the timeline (0.2.2).
 *
 * Until 0.2.1 a photograph went in at the moment it was added. A picture taken
 * at the stove and added after dinner therefore sat after the verdict's worth
 * of notes it belonged among. From 0.2.2 a photograph chosen from the Gallery
 * goes in at the moment it was *taken*, read from its own metadata before that
 * metadata is stripped — when that moment is believable for this cook:
 *
 *   * it is no later than now (a camera clock in the future is wrong), and
 *   * it is no earlier than one hour before the cook started (a photo of the
 *     raw ingredients that morning belongs to this cook; last week's does not).
 *
 * Otherwise it goes in at the time it was added, and says so: "Photo · added
 * 18:42". A photograph taken with the in-app camera is taken and added at the
 * same moment, so it behaves exactly as before and carries nothing new.
 *
 * WHAT IS WRITTEN DOWN
 * --------------------
 * The event's `ts` is where it sits. `meta` says how that was decided, for a
 * photograph from the Gallery only:
 *
 *   `{ "photoTime": "taken", "addedAt": "<when it was added>" }`
 *   `{ "photoTime": "added" }`
 *
 * A photograph with no `meta` — every one stored before 0.2.2, and every one
 * from the camera — is read exactly as it always was. Nothing stored moves.
 * Only a date and a time are ever read from a picture; never where it was taken.
 */

import type { CookEvent, IsoTimestamp, JsonObject } from './entities';

export const PHOTO_TIME_META_KEY = 'photoTime' as const;
export const PHOTO_ADDED_AT_META_KEY = 'addedAt' as const;

/** How far before a cook started a photograph may have been taken and still belong to it. */
export const PHOTO_BEFORE_START_ALLOWANCE_MS = 60 * 60 * 1000;

export type PhotoPlacement = {
  /** Where the photograph sits in the timeline. */
  readonly ts: IsoTimestamp;
  /** What to write in the event's `meta`. */
  readonly meta: JsonObject;
};

/**
 * Decide where a photograph from the Gallery goes.
 *
 * `takenAt` is the instant read from the picture, or `null` when it had none
 * that could be read.
 */
export function placeGalleryPhoto(
  takenAt: IsoTimestamp | null,
  addedAt: IsoTimestamp,
  cookStartedAt: IsoTimestamp,
): PhotoPlacement {
  if (takenAt !== null) {
    const taken = Date.parse(takenAt);
    const added = Date.parse(addedAt);
    const earliest = Date.parse(cookStartedAt) - PHOTO_BEFORE_START_ALLOWANCE_MS;
    if (Number.isFinite(taken) && taken <= added && taken >= earliest) {
      return {
        ts: new Date(taken).toISOString(),
        meta: { [PHOTO_TIME_META_KEY]: 'taken', [PHOTO_ADDED_AT_META_KEY]: addedAt },
      };
    }
  }
  return { ts: addedAt, meta: { [PHOTO_TIME_META_KEY]: 'added' } };
}

/** True for a photograph that sits at the time it was added because its own time would not do. */
export function photoPlacedWhenAdded(event: CookEvent): boolean {
  const meta = event.meta;
  if (event.kind !== 'photo' || meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return false;
  }
  return (meta as Record<string, unknown>)[PHOTO_TIME_META_KEY] === 'added';
}
