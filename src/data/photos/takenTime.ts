/**
 * When a photograph was taken, read from its own EXIF, and nothing else (0.2.2).
 *
 * A photograph chosen from the Gallery is placed in the timeline at the moment
 * it was taken (see `src/domain/photoTime.ts`). That moment is in the picture's
 * EXIF block, which the re-encode and `./jpeg.ts` then strip — so it has to be
 * read first, from the original bytes, and this is the only code that does.
 *
 * WHAT IS READ, AND WHAT IS NOT
 * -----------------------------
 * The date and time the picture was taken (`DateTimeOriginal`, or
 * `DateTimeDigitized` if that is all there is) and, when the camera wrote one,
 * the offset from UTC that goes with it (`OffsetTimeOriginal` /
 * `OffsetTimeDigitized`). Those two or four values and nothing else.
 *
 * The walk goes from the TIFF header to the first directory, from there to the
 * EXIF directory, and reads only the tags above. It never follows the GPS
 * directory's pointer, never reads a GPS tag, and returns no structure that
 * could carry one: the result is two short strings. Where a photograph was
 * taken is never read and never kept. The stripping that follows is unchanged.
 *
 * Pure, and defensive: a picture whose metadata is missing, truncated or
 * malformed has no taken-time, and that is all that happens to it.
 */

/** The EXIF APP1 marker and its identifier, `Exif\0\0`. */
const APP1 = 0xe1;
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

/** IFD0 → EXIF directory. (`0x8825`, the GPS directory, is deliberately absent.) */
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_OFFSET_TIME_DIGITIZED = 0x9012;

const TYPE_ASCII = 2;
const TYPE_LONG = 4;

/** Enough of any real camera's header block; the time is never further in. */
const MAX_ENTRIES_PER_DIRECTORY = 512;

export type TakenTime = {
  /** As the camera wrote it: `YYYY:MM:DD HH:MM:SS`. */
  readonly dateTime: string;
  /** `+HH:MM` or `-HH:MM`, or `null` when the camera wrote none. */
  readonly offset: string | null;
};

type Reader = {
  u16(at: number): number | null;
  u32(at: number): number | null;
  length: number;
};

function readerFor(bytes: Uint8Array, start: number, end: number, littleEndian: boolean): Reader {
  const at = (offset: number) => start + offset;
  return {
    length: end - start,
    u16(offset) {
      const i = at(offset);
      if (offset < 0 || i + 1 >= end) {
        return null;
      }
      const a = bytes[i] ?? 0;
      const b = bytes[i + 1] ?? 0;
      return littleEndian ? a | (b << 8) : (a << 8) | b;
    },
    u32(offset) {
      const i = at(offset);
      if (offset < 0 || i + 3 >= end) {
        return null;
      }
      const a = bytes[i] ?? 0;
      const b = bytes[i + 1] ?? 0;
      const c = bytes[i + 2] ?? 0;
      const d = bytes[i + 3] ?? 0;
      return littleEndian
        ? (a | (b << 8) | (c << 16) | (d << 24)) >>> 0
        : ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
    },
  };
}

/** The TIFF block inside the first EXIF APP1 segment, as [start, end), or null. */
function findExifTiff(bytes: Uint8Array): readonly [number, number] | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      // Start of scan, or the end: there is no metadata after this.
      return null;
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (length < 2) {
      return null;
    }
    const payload = at + 4;
    const end = Math.min(bytes.length, at + 2 + length);
    if (
      marker === APP1 &&
      end - payload > EXIF_ID.length + 8 &&
      EXIF_ID.every((value, index) => bytes[payload + index] === value)
    ) {
      return [payload + EXIF_ID.length, end];
    }
    at += 2 + length;
  }
  return null;
}

/** The ASCII value of one directory entry, without its terminator. */
function asciiValue(
  bytes: Uint8Array,
  tiffStart: number,
  reader: Reader,
  entry: number,
): string | null {
  const type = reader.u16(entry + 2);
  const count = reader.u32(entry + 4);
  if (type !== TYPE_ASCII || count === null || count === 0 || count > 64) {
    return null;
  }
  const valueAt = count <= 4 ? entry + 8 : reader.u32(entry + 8);
  if (valueAt === null || valueAt + count > reader.length) {
    return null;
  }
  let text = '';
  for (let i = 0; i < count; i += 1) {
    const code = bytes[tiffStart + valueAt + i] ?? 0;
    if (code === 0) {
      break;
    }
    if (code < 0x20 || code > 0x7e) {
      return null;
    }
    text += String.fromCharCode(code);
  }
  return text;
}

/** Tag number → entry offset, for one directory. Reads tag numbers only. */
function directory(reader: Reader, offset: number): Map<number, number> {
  const entries = new Map<number, number>();
  const count = reader.u16(offset);
  if (count === null || count > MAX_ENTRIES_PER_DIRECTORY) {
    return entries;
  }
  for (let i = 0; i < count; i += 1) {
    const entry = offset + 2 + i * 12;
    const tag = reader.u16(entry);
    if (tag === null) {
      break;
    }
    entries.set(tag, entry);
  }
  return entries;
}

const DATE_TIME_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const OFFSET_PATTERN = /^[+-](\d{2}):(\d{2})$/;

/**
 * When this JPEG was taken, by its own EXIF, or `null`.
 *
 * Reads the original bytes the picker handed over, before anything strips
 * them. See the note at the top of this file for what it does not read.
 */
export function readJpegTakenTime(bytes: Uint8Array): TakenTime | null {
  const tiff = findExifTiff(bytes);
  if (tiff === null) {
    return null;
  }
  const [start, end] = tiff;
  const order = String.fromCharCode(bytes[start] ?? 0, bytes[start + 1] ?? 0);
  if (order !== 'II' && order !== 'MM') {
    return null;
  }
  const reader = readerFor(bytes, start, end, order === 'II');
  if (reader.u16(2) !== 42) {
    return null;
  }
  const ifd0 = reader.u32(4);
  if (ifd0 === null) {
    return null;
  }

  const pointerEntry = directory(reader, ifd0).get(TAG_EXIF_IFD);
  if (pointerEntry === undefined || reader.u16(pointerEntry + 2) !== TYPE_LONG) {
    return null;
  }
  const exifOffset = reader.u32(pointerEntry + 8);
  if (exifOffset === null) {
    return null;
  }
  const exif = directory(reader, exifOffset);

  const read = (tag: number): string | null => {
    const entry = exif.get(tag);
    return entry === undefined ? null : asciiValue(bytes, start, reader, entry);
  };

  const original = read(TAG_DATE_TIME_ORIGINAL);
  const digitized = original === null ? read(TAG_DATE_TIME_DIGITIZED) : null;
  const dateTime = original ?? digitized;
  if (dateTime === null || !DATE_TIME_PATTERN.test(dateTime)) {
    return null;
  }
  const offset =
    original !== null ? read(TAG_OFFSET_TIME_ORIGINAL) : read(TAG_OFFSET_TIME_DIGITIZED);
  return { dateTime, offset: offset !== null && OFFSET_PATTERN.test(offset) ? offset : null };
}

/**
 * The instant a taken-time stands for, as an ISO UTC timestamp, or `null`.
 *
 * With an offset the instant is exact. Without one the camera's clock is taken
 * to be the phone's own local time, which is what a phone camera's clock is.
 */
export function takenTimeToInstant(taken: TakenTime): string | null {
  const match = DATE_TIME_PATTERN.exec(taken.dateTime);
  if (match === null) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = match.map(Number) as unknown as number[];
  if (
    y === undefined || mo === undefined || d === undefined ||
    h === undefined || mi === undefined || s === undefined ||
    mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59
  ) {
    return null;
  }
  // A day that does not exist (31 February) would roll over in `Date`; refuse it.
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) {
    return null;
  }
  let millis: number;
  if (taken.offset !== null) {
    const sign = taken.offset.startsWith('-') ? -1 : 1;
    const [oh, om] = taken.offset.slice(1).split(':').map(Number) as [number, number];
    millis = Date.UTC(y, mo - 1, d, h, mi, s) - sign * (oh * 60 + om) * 60_000;
  } else {
    millis = new Date(y, mo - 1, d, h, mi, s).getTime();
  }
  if (!Number.isFinite(millis)) {
    return null;
  }
  return new Date(millis).toISOString();
}
