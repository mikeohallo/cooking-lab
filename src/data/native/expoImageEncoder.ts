/**
 * Re-encoding a picture as a JPEG the app is willing to keep.
 *
 * `expo-image-manipulator` decodes the picture, resizes it if it needs it, and
 * writes a fresh JPEG. Three things follow from that and all three are wanted:
 * the long edge is capped, the file is a JPEG whatever arrived, and the new file
 * is written from a decoded bitmap, so none of the original's metadata is
 * carried into it.
 *
 * That last one is not relied upon. The bytes are read back here and handed to
 * the app's own metadata check before anything is stored — see
 * `../photos/jpeg.ts` for why a privacy promise cannot rest on a library's
 * incidental behaviour.
 *
 * THE TEMPORARY FILE IS THIS MODULE'S TO CLEAN UP
 * -----------------------------------------------
 * `saveAsync` writes into the cache directory, which is exactly right for a
 * file that exists for the half second it takes to read it and exactly wrong
 * for anything kept — see `./expoFileSystem.ts`, where `Paths.cache` appears
 * nowhere. The bytes are read, the file is deleted, and the caller is handed
 * bytes and no path at all, so there is no second copy for anybody to store by
 * mistake.
 */

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { CapturedImage, EncodedPhoto, PhotoEncoder } from '../adapters';
import { PHOTO_JPEG_QUALITY } from '../photos/capture';

/**
 * The resize that caps the long edge, or nothing at all.
 *
 * A picture already within the cap is left at its own size rather than scaled
 * to it: enlarging a small photograph would invent pixels, and scaling it to
 * exactly the cap would do that to anything that was merely close.
 */
function resizeFor(image: CapturedImage, maxLongEdge: number): { width?: number; height?: number } | null {
  const longEdge = Math.max(image.width, image.height);
  if (!Number.isFinite(longEdge) || longEdge <= 0 || longEdge <= maxLongEdge) {
    return null;
  }
  // One dimension only; the other is computed by the module, which keeps the
  // ratio exactly rather than to whatever rounding this code would have done.
  return image.width >= image.height ? { width: maxLongEdge } : { height: maxLongEdge };
}

export const expoPhotoEncoder: PhotoEncoder = {
  async encodeJpeg(image: CapturedImage, maxLongEdge: number): Promise<EncodedPhoto> {
    const context = ImageManipulator.manipulate(image.uri);
    const resize = resizeFor(image, maxLongEdge);
    if (resize !== null) {
      context.resize(resize);
    }

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: PHOTO_JPEG_QUALITY,
      base64: false,
    });

    const temporary = new File(saved.uri);
    try {
      const bytes = await temporary.bytes();
      return { bytes, width: saved.width, height: saved.height };
    } finally {
      try {
        if (temporary.exists) {
          temporary.delete();
        }
      } catch {
        // The bytes are already in hand and that is what the caller needs. A
        // file left in the cache directory is the operating system's to
        // reclaim, and failing the whole capture over it would be absurd.
      }
    }
  },
};
