/**
 * Adding a photograph to a cook, and taking one back.
 *
 * Everything the operation needs is behind a port — the camera, the encoder,
 * the private store, the data layer — so the whole of the order below is
 * exercised by the test suite rather than only on a phone. The order is the
 * safety property, and it is written once, here:
 *
 *   1. Ask the device for a picture. Cancelled, refused and failed are three
 *      different answers and all three come back as values.
 *   2. Re-encode it as a JPEG with its long edge capped.
 *   3. Check and clean the bytes (`./jpeg.ts`). Nothing reaches the store that
 *      still has metadata in it, whatever the device did at step 2.
 *   4. Work out the logical path, from the cook, the event and the instant.
 *   5. Write the file.
 *   6. Write the timeline entry, through the capture service, as the cook.
 *
 * Steps 5 and 6 are in that order because the entry is what makes the photo
 * part of the cook. If the file cannot be written there is no entry and the
 * timeline is untouched; if the entry cannot be written the file is deleted
 * again, so the store is left with nothing nothing refers to. Nothing here
 * can fail in a way that leaves a `photo` event with no photograph behind it.
 *
 * WHAT A COPY MEANS
 * -----------------
 * The file in the store is Cooking Lab's own. Deleting the original from the
 * Gallery afterwards does not touch the cook, because what the app kept is a
 * re-encoded copy in its private directory and not a reference into the roll.
 * Nothing is ever written back to the Gallery: there is no code here that
 * could, and no permission in the manifest that would allow it.
 */

import type {
  PhotoEncoder,
  PhotoOrigin,
  PhotoSource,
  PrivateFileStore,
} from '../adapters';
import type { CookEvent, CookEventId, CookId, IsoTimestamp } from '../../domain/entities';
import type { DataLayer } from '../repositories';
import { PrivateFileError } from '../files/privateFileStore';
import { buildPhotoLogicalPath, MAX_PHOTO_SEQUENCE } from './photoPaths';
import { looksLikeJpeg, stripJpegMetadata } from './jpeg';

/**
 * The longest edge a stored photograph may have.
 *
 * 2048 px is a picture that still shows whether the crust caught, at roughly a
 * third of a megabyte — a kitchen's worth of cooks fits on the phone without
 * anybody thinking about it. The original is not kept: a notebook is not a
 * photo library, and keeping both would make Cooking Lab the largest thing on
 * the device within a month.
 */
export const MAX_PHOTO_LONG_EDGE = 2048;

/** JPEG quality for the stored copy. High enough that nothing visible is lost. */
export const PHOTO_JPEG_QUALITY = 0.85;

export type PhotoAddOutcome =
  | { readonly status: 'added'; readonly event: CookEvent }
  /** The person backed out of the camera or the picker. Say nothing. */
  | { readonly status: 'cancelled' }
  | { readonly status: 'denied'; readonly canAskAgain: boolean }
  | { readonly status: 'failed'; readonly message: string };

export type PhotoRemoveOutcome =
  | { readonly status: 'removed' }
  | { readonly status: 'refused'; readonly message: string }
  | { readonly status: 'failed'; readonly message: string };

export type PhotoService = {
  add(cookId: CookId, origin: PhotoOrigin): Promise<PhotoAddOutcome>;
  /** Take back a photograph added by mistake: the entry and the file. */
  remove(eventId: CookEventId): Promise<PhotoRemoveOutcome>;
};

export type PhotoServiceDependencies = {
  readonly data: DataLayer;
  readonly photos: PrivateFileStore;
  readonly source: PhotoSource;
  readonly encoder: PhotoEncoder;
  readonly newId: () => string;
  readonly now: () => IsoTimestamp;
};

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createPhotoService(deps: PhotoServiceDependencies): PhotoService {
  const { data, photos, source, encoder, newId, now } = deps;

  /**
   * A free logical path for this photograph.
   *
   * The sequence number exists for two photographs captured in the same second,
   * and the event id already makes that impossible — but the path is only free
   * if the store says so, and asking is cheaper than reasoning about it. A
   * store that has run out of sequence numbers for one second is reported
   * rather than overwriting anything.
   */
  async function freePathFor(
    cookId: CookId,
    eventId: CookEventId,
    capturedAt: IsoTimestamp,
  ): Promise<string> {
    for (let sequence = 0; sequence <= MAX_PHOTO_SEQUENCE; sequence += 1) {
      const built = buildPhotoLogicalPath({
        cookId,
        cookEventId: eventId,
        capturedAt,
        sequence,
        extension: 'jpg',
      });
      if (!built.ok) {
        throw new Error(`this photo has nowhere to go (${built.reason})`);
      }
      if (!(await photos.exists(built.path))) {
        return built.path;
      }
    }
    throw new Error('there are already too many photos stored for this moment');
  }

  return {
    async add(cookId: CookId, origin: PhotoOrigin): Promise<PhotoAddOutcome> {
      let storedPath: string | null = null;
      try {
        const picked =
          origin === 'camera' ? await source.takePhoto() : await source.choosePhoto();
        if (picked.status !== 'captured') {
          return picked;
        }

        const encoded = await encoder.encodeJpeg(picked.image, MAX_PHOTO_LONG_EDGE);
        if (!looksLikeJpeg(encoded.bytes)) {
          return {
            status: 'failed',
            message: 'that file did not come back as a photograph, so nothing was saved',
          };
        }

        // The app's own guarantee, applied after the device has had its turn:
        // no EXIF, no GPS, no thumbnail of the original frame, nothing.
        const cleaned = stripJpegMetadata(encoded.bytes);

        const eventId = newId();
        const at = now();
        const logicalPath = await freePathFor(cookId, eventId, at);

        await photos.write(logicalPath, cleaned.bytes);
        storedPath = logicalPath;

        const decision = await data.capture.addEvent(
          { id: eventId, cookId, ts: at, kind: 'photo', photoPath: logicalPath },
          'user',
        );
        if (!decision.allowed) {
          await discard(logicalPath);
          storedPath = null;
          return { status: 'failed', message: decision.message };
        }

        storedPath = null;
        return { status: 'added', event: decision.record };
      } catch (cause: unknown) {
        // Anything that got as far as a stored file and then failed takes the
        // file with it, so a cook never carries a photograph it cannot show and
        // the store never carries one no cook refers to.
        if (storedPath !== null) {
          await discard(storedPath);
        }
        if (cause instanceof PrivateFileError) {
          return { status: 'failed', message: cause.message };
        }
        return { status: 'failed', message: describe(cause) };
      }
    },

    /**
     * Take back a photograph.
     *
     * The entry goes first and the file second. A file deleted before its entry
     * would leave a `photo` event pointing at nothing — a cook with a hole in
     * it, and a backup that reports a missing photograph — whereas an entry
     * removed before its file leaves at most an unreferenced file, which
     * `PrivateFileStore.list` can find and nothing on screen is the worse for.
     *
     * The rule decides whether the removal is allowed at all, and refuses
     * anything that is not a photograph: see `removeCookEvent`.
     */
    async remove(eventId: CookEventId): Promise<PhotoRemoveOutcome> {
      try {
        const decision = await data.capture.removeEvent(eventId, 'user');
        if (!decision.allowed) {
          return { status: 'refused', message: decision.message };
        }
        const path = decision.record.photoPath;
        if (path !== null) {
          await photos.delete(path);
        }
        return { status: 'removed' };
      } catch (cause: unknown) {
        return { status: 'failed', message: describe(cause) };
      }
    },
  };

  /** Remove a file this operation itself wrote. Never reports its own failure. */
  async function discard(logicalPath: string): Promise<void> {
    try {
      await photos.delete(logicalPath);
    } catch {
      // The caller is about to be told why the photo was not added; a failure
      // to clean up must not take the place of that reason. The file is
      // unreferenced and `PrivateFileStore.list` will find it.
    }
  }
}
