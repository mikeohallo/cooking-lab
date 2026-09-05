/**
 * Where a Cooking Lab photograph lives, as a rule rather than a convention.
 *
 * A photo is referenced by a *logical path*: a short, relative, app-private
 * location such as
 *
 *     cooks/cook-0f3a/events/event-91b2/20260905t183100-01.jpg
 *
 * The path is derived entirely from the cook and event it belongs to, so the
 * same photo always resolves to the same place, a backup manifest can be
 * matched to files by name alone, and a stray reference is obviously stray.
 *
 * WHAT A LOGICAL PATH IS NOT
 * --------------------------
 *   * Not absolute. Nothing above the file store learns a device path, so a
 *     path recorded today still means something after an OS upgrade moves the
 *     app's sandbox — which on both platforms it does.
 *   * Not a URL. `http:`, `file:`, `content:` and friends are refused. A photo
 *     that lives somewhere else is not private, and privacy is the product.
 *   * Not in a cache or temp directory. The camera hands over a file in one;
 *     the operating system may delete it at any time; keeping the reference
 *     there is how a cook's photos silently disappear.
 *   * Not user-supplied. Every segment is generated from validated ids and a
 *     timestamp, so there is no path for a filename to smuggle a `..` in.
 *
 * This module is pure. It computes and checks strings; it does not touch a
 * filesystem, which is `PrivateFileStore`'s job and is deferred.
 */

import type { CookEventId, CookId, IsoTimestamp, PhotoLogicalPath } from '../../domain/entities';
import { isEntityId, isIsoTimestamp } from '../../domain/invariants';

/** Every photo lives under this root, inside the app-private directory. */
export const PHOTO_ROOT = 'cooks';

/** The image types the app stores. `jpeg` is normalised to `jpg`. */
export const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'png', 'heic', 'webp'] as const;
export type PhotoExtension = (typeof ALLOWED_PHOTO_EXTENSIONS)[number];

/** Path roots the operating system is entitled to empty without telling us. */
export const VOLATILE_PATH_ROOTS = ['cache', 'caches', 'tmp', 'temp'] as const;

/** At most one hundred photos share a second within one cook or event. */
export const MAX_PHOTO_SEQUENCE = 99;

/**
 * The complete shape of a valid logical path.
 *
 * Deliberately a whole-string match over a small character set: a path that
 * this does not describe is not a Cooking Lab photo path, and there is no
 * repair step that would make it one.
 */
const LOGICAL_PATH_PATTERN =
  /^cooks\/[a-z0-9][a-z0-9-]{0,63}(\/events\/[a-z0-9][a-z0-9-]{0,63})?\/\d{8}t\d{6}-\d{2}\.(jpg|png|heic|webp)$/;

export type PhotoPathInput = {
  readonly cookId: CookId;
  /** Set when the photo belongs to a specific timeline event. */
  readonly cookEventId?: CookEventId | null;
  readonly capturedAt: IsoTimestamp;
  /** Distinguishes photos captured within the same second. */
  readonly sequence: number;
  readonly extension: string;
};

export type PhotoPathRejectionReason =
  | 'invalid_cook_id'
  | 'invalid_cook_event_id'
  | 'invalid_timestamp'
  | 'invalid_sequence'
  | 'unsupported_extension';

export type PhotoPathResult =
  | { readonly ok: true; readonly path: PhotoLogicalPath }
  | { readonly ok: false; readonly reason: PhotoPathRejectionReason };

/**
 * Normalise a file extension to one of the stored types.
 *
 * Returns `null` rather than a default: guessing that an unknown extension is
 * probably a JPEG is how a file that is not an image ends up named like one.
 */
export function normalisePhotoExtension(raw: string): PhotoExtension | null {
  const cleaned = raw.trim().toLowerCase().replace(/^\./, '');
  const canonical = cleaned === 'jpeg' ? 'jpg' : cleaned;
  return (ALLOWED_PHOTO_EXTENSIONS as readonly string[]).includes(canonical)
    ? (canonical as PhotoExtension)
    : null;
}

/** `2026-09-05T18:31:00.000Z` becomes `20260905t183100`. */
function compactInstant(timestamp: IsoTimestamp): string {
  return timestamp.slice(0, 19).replace(/[-:]/g, '').toLowerCase();
}

/**
 * The logical path for a photo, or the reason there isn't one.
 *
 * Deterministic: the same input always yields the same path, which is what lets
 * a restore put a file back exactly where the database expects it.
 */
export function buildPhotoLogicalPath(input: PhotoPathInput): PhotoPathResult {
  if (!isEntityId(input.cookId)) {
    return { ok: false, reason: 'invalid_cook_id' };
  }
  const eventId = input.cookEventId ?? null;
  if (eventId !== null && !isEntityId(eventId)) {
    return { ok: false, reason: 'invalid_cook_event_id' };
  }
  if (!isIsoTimestamp(input.capturedAt)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (
    !Number.isInteger(input.sequence) ||
    input.sequence < 0 ||
    input.sequence > MAX_PHOTO_SEQUENCE
  ) {
    return { ok: false, reason: 'invalid_sequence' };
  }
  const extension = normalisePhotoExtension(input.extension);
  if (extension === null) {
    return { ok: false, reason: 'unsupported_extension' };
  }

  const directory =
    eventId === null
      ? `${PHOTO_ROOT}/${input.cookId}`
      : `${PHOTO_ROOT}/${input.cookId}/events/${eventId}`;
  const fileName = `${compactInstant(input.capturedAt)}-${String(input.sequence).padStart(2, '0')}.${extension}`;

  return { ok: true, path: `${directory}/${fileName}` };
}

/**
 * Whether a string is a path this app is willing to touch.
 *
 * Used on the way in from anywhere the app did not itself generate the string:
 * a restored backup, a migrated row, a manifest. The explicit checks below are
 * all implied by `LOGICAL_PATH_PATTERN`; they are written out because a future
 * change to that pattern must not be able to quietly re-admit them.
 */
export function isSafePhotoLogicalPath(value: unknown): value is PhotoLogicalPath {
  if (typeof value !== 'string' || value === '') {
    return false;
  }
  if (value.includes('\\') || value.includes('..') || value.includes('//')) {
    return false;
  }
  if (value.startsWith('/') || /^[a-z]:/i.test(value)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return false;
  }
  const firstSegment = value.split('/')[0]?.toLowerCase() ?? '';
  if ((VOLATILE_PATH_ROOTS as readonly string[]).includes(firstSegment)) {
    return false;
  }
  return LOGICAL_PATH_PATTERN.test(value);
}

/** The cook a logical path belongs to, or `null` if it is not a valid path. */
export function cookIdFromPhotoPath(value: string): CookId | null {
  if (!isSafePhotoLogicalPath(value)) {
    return null;
  }
  return value.split('/')[1] ?? null;
}

/** The cook event a logical path belongs to, if it belongs to one. */
export function cookEventIdFromPhotoPath(value: string): CookEventId | null {
  if (!isSafePhotoLogicalPath(value)) {
    return null;
  }
  const segments = value.split('/');
  return segments.length === 5 && segments[2] === 'events' ? (segments[3] ?? null) : null;
}
