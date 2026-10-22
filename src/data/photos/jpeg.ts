/**
 * Taking the metadata out of a JPEG, here rather than on the device.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * A photograph taken in a kitchen carries where the kitchen is. A phone camera
 * writes GPS coordinates, the device model, the serial of the lens, a thumbnail
 * of the original frame and a timestamp into EXIF, and a picture chosen from the
 * roll carries whatever the camera that took it wrote. Cooking Lab's promise is
 * that a cook's notebook is private; a photograph that quietly names the house
 * it was taken in breaks that promise the first time a file is shared.
 *
 * Re-encoding an image through the platform's own image pipeline normally drops
 * all of it, and the app does re-encode (see `PhotoEncoder`). But "normally" is
 * the problem. That behaviour is a property of a native module on a particular
 * Android version, it is not stated in any contract the app can hold it to, and
 * nothing in the app would notice the day it changed. A promise about privacy
 * cannot rest on a library's incidental behaviour.
 *
 * So the bytes are checked and cleaned here, in the app's own code, after the
 * device has had its turn and before anything is stored. If the platform
 * stripped the metadata, this finds nothing to do and costs a single pass over
 * the bytes. If it did not, this removes it anyway. Either way the file that
 * reaches the store has no metadata in it, and
 * `__tests__/photoCapture.test.ts` proves that against a JPEG carrying GPS.
 *
 * WHAT IS REMOVED, AND WHAT IS NOT
 * --------------------------------
 * Every `APPn` segment (EXIF and its GPS block, JFIF, XMP, ICC profiles, Flir,
 * Photoshop/IPTC) and every comment segment. Nothing else: the quantisation
 * tables, the frame header, the Huffman tables, the restart interval and the
 * entropy-coded scan are copied across byte for byte, so the picture that comes
 * out is the picture that went in. This module decodes no pixels and re-encodes
 * nothing; it walks a segment list.
 *
 * A colour profile is metadata by this definition and goes with the rest. A
 * photograph of dinner does not need one, and keeping ICC while dropping EXIF
 * would mean reading the APP list and making exceptions in it, which is how a
 * list of exceptions eventually grows an EXIF-shaped one.
 */

/** Marker bytes, from the JPEG specification. */
const MARKER_PREFIX = 0xff;
const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
/** `APP0` … `APP15`: where every metadata vendor puts its block. */
const APP_FIRST = 0xe0;
const APP_LAST = 0xef;
/** A free-text comment. */
const COM = 0xfe;
/** Standalone markers, which carry no length and no payload. */
const RESTART_FIRST = 0xd0;
const RESTART_LAST = 0xd7;
const TEM = 0x01;

export type JpegMetadataSegment = {
  /** The marker byte, e.g. `0xe1` for `APP1`, which is where EXIF lives. */
  readonly marker: number;
  /** A name for a message or a test failure: `APP1`, `COM`. */
  readonly name: string;
  /** Where the marker starts in the original bytes. */
  readonly offset: number;
  /** The whole segment, marker and length included. */
  readonly byteLength: number;
};

function nameOf(marker: number): string {
  if (marker >= APP_FIRST && marker <= APP_LAST) {
    return `APP${marker - APP_FIRST}`;
  }
  return marker === COM ? 'COM' : `0x${marker.toString(16)}`;
}

function carriesMetadata(marker: number): boolean {
  return (marker >= APP_FIRST && marker <= APP_LAST) || marker === COM;
}

/** A marker with no length field and nothing after it. */
function isStandalone(marker: number): boolean {
  return (
    marker === SOI ||
    marker === EOI ||
    marker === TEM ||
    (marker >= RESTART_FIRST && marker <= RESTART_LAST)
  );
}

/** Whether these bytes begin as a JPEG does: `FFD8`. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === MARKER_PREFIX && bytes[1] === SOI;
}

/**
 * The metadata segments in these bytes, in the order they appear.
 *
 * Empty for a JPEG with none, which is what a stored Cooking Lab photograph
 * must always be. The walk stops at the start of scan: everything after it is
 * compressed image data, and a `FF` byte in there is part of the picture rather
 * than a marker.
 *
 * Returns nothing at all — rather than throwing — for bytes that are not a
 * JPEG. "I found no metadata" and "this is not an image" are different answers
 * and the caller is given the second one by `looksLikeJpeg`.
 */
export function findJpegMetadataSegments(bytes: Uint8Array): readonly JpegMetadataSegment[] {
  if (!looksLikeJpeg(bytes)) {
    return [];
  }
  const found: JpegMetadataSegment[] = [];
  let at = 2;

  while (at + 1 < bytes.length) {
    if (bytes[at] !== MARKER_PREFIX) {
      // Not where a marker should be: the segment list is malformed and the
      // rest cannot be reasoned about. Stop rather than guess.
      break;
    }
    const marker = bytes[at + 1] ?? EOI;
    if (marker === MARKER_PREFIX) {
      // `FF` padding before a marker is legal; skip one byte and look again.
      at += 1;
      continue;
    }
    if (isStandalone(marker)) {
      at += 2;
      continue;
    }
    if (at + 3 >= bytes.length) {
      break;
    }
    const payload = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (payload < 2) {
      break;
    }
    const byteLength = 2 + payload;
    if (carriesMetadata(marker)) {
      found.push({ marker, name: nameOf(marker), offset: at, byteLength });
    }
    if (marker === SOS) {
      break;
    }
    at += byteLength;
  }

  return found;
}

export type JpegStripResult = {
  /** The same picture with no metadata segments left in it. */
  readonly bytes: Uint8Array;
  /** What was taken out. Empty when there was nothing to take out. */
  readonly removed: readonly JpegMetadataSegment[];
};

/**
 * The same JPEG with every metadata segment removed.
 *
 * A copy is always returned, even when nothing was removed, so a caller can
 * never be holding the original by accident and assume it was cleaned.
 *
 * Bytes that are not a JPEG come back untouched with nothing reported removed.
 * That is not this function's decision to make: it strips metadata, and whether
 * a file that is not an image may be stored is the capture pipeline's rule.
 */
export function stripJpegMetadata(bytes: Uint8Array): JpegStripResult {
  const removed = findJpegMetadataSegments(bytes);
  if (removed.length === 0) {
    return { bytes: bytes.slice(), removed };
  }

  const keep = bytes.length - removed.reduce((total, segment) => total + segment.byteLength, 0);
  const output = new Uint8Array(keep);
  let written = 0;
  let read = 0;

  for (const segment of removed) {
    output.set(bytes.subarray(read, segment.offset), written);
    written += segment.offset - read;
    read = segment.offset + segment.byteLength;
  }
  output.set(bytes.subarray(read), written);

  return { bytes: output, removed };
}
