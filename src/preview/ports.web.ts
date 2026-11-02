/**
 * Harmless stand-ins for the phone's own services, for the web preview
 * (0.4.0, part 7). Web only.
 *
 * - Photos live in memory. A preview photo is a flat colour block drawn in
 *   code: its "file" holds nothing but a colour, and the URI handed to an
 *   `<Image>` is a one-rectangle SVG of that colour. No image file exists.
 * - The camera and the photo library answer "cancelled".
 * - Sharing an export does nothing and says it can't.
 *
 * The encrypted database, the secure key store and the phone's file system
 * are not stubbed: the preview never asks for them (`src/data/runtime.web.ts`
 * builds its notebook without them).
 */

import type { PhotoEncoder, PhotoSource } from '../data/adapters';
import type { ExportSink } from '../data/export/sink';
import type { FoundFile, PrivateFileSystemPort } from '../data/files/privateFileStore';

/** The words a preview photo's "file" holds: a colour such as `#c8743a`. */
const COLOUR = /^#[0-9a-f]{6}$/i;

export function colourBytes(colour: string): Uint8Array {
  if (!COLOUR.test(colour)) {
    throw new Error(`not a colour: ${colour}`);
  }
  return new Uint8Array([...colour].map((character) => character.charCodeAt(0)));
}

function colourOf(bytes: Uint8Array): string {
  const text = String.fromCharCode(...bytes);
  return COLOUR.test(text) ? text : '#9aa39f';
}

/** A one-rectangle SVG of a colour, as a data URI an `<Image>` can draw. */
export function colourBlockUri(colour: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100" viewBox="0 0 120 100">` +
    `<rect width="120" height="100" fill="${colour}"/></svg>`;
  // Raw, not URI-encoded: react-native-web encodes an SVG data URI itself.
  return `data:image/svg+xml;utf8,${svg}`;
}

/** Photos kept in memory for as long as the page is open. */
export function previewFileSystem(): PrivateFileSystemPort {
  const files = new Map<string, Uint8Array>();
  return {
    async ensureRoot() {},
    async exists(relativePath) {
      return files.has(relativePath);
    },
    async byteLength(relativePath) {
      return files.get(relativePath)?.length ?? null;
    },
    async read(relativePath) {
      const bytes = files.get(relativePath);
      if (bytes === undefined) {
        throw new Error('no photo there');
      }
      return bytes;
    },
    async write(relativePath, bytes) {
      if (files.has(relativePath)) {
        throw new Error('there is already a photo there');
      }
      files.set(relativePath, bytes);
    },
    async importFrom() {
      throw new Error('the preview has no camera');
    },
    async delete(relativePath) {
      files.delete(relativePath);
    },
    async list(): Promise<readonly FoundFile[]> {
      return [...files.entries()].map(([relativePath, bytes]) => ({
        relativePath,
        byteLength: bytes.length,
      }));
    },
    uri(relativePath) {
      return colourBlockUri(colourOf(files.get(relativePath) ?? new Uint8Array()));
    },
  };
}

/** The camera and library: always "cancelled", so nothing is added. */
export const previewPhotoSource: PhotoSource = {
  async takePhoto() {
    return { status: 'cancelled' };
  },
  async choosePhoto() {
    return { status: 'cancelled' };
  },
};

/** Never reached, because the photo source never hands over a picture. */
export const previewPhotoEncoder: PhotoEncoder = {
  async encodeJpeg() {
    throw new Error('the preview has no camera');
  },
};

/** Exports go nowhere: the browser has no share sheet for them. */
export const previewExportSink: ExportSink = {
  async canShare() {
    return false;
  },
  async share() {},
};
