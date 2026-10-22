/**
 * SYNTHETIC TEST IMAGES — NOT PRODUCTION CODE, NOT A REAL PHOTOGRAPH.
 *
 * A real JPEG, and the same JPEG with location metadata spliced into it.
 *
 * WHAT THE PICTURE IS
 * -------------------
 * A 16 by 16 square of the app's own sage, encoded as a baseline JPEG. It is
 * not a photograph of anything, has never been near a camera, and shows nothing
 * but one colour — so there is nothing in it to review before it goes into the
 * repository, and it is carried as base64 text in this file rather than as an
 * image.
 *
 * WHAT THE METADATA IS
 * --------------------
 * Invented coordinates — 51°30′N 0°7′W, which is the middle of London and
 * nobody's kitchen — written as a correct little-endian EXIF block with a real
 * GPS IFD, plus an XMP packet and a comment. It is built here by hand rather
 * than copied out of a camera file for two reasons: a camera file would be
 * somebody's actual photograph with somebody's actual house in it, and a block
 * assembled byte by byte in code can be read and checked by whoever is
 * reviewing the test.
 *
 * The point of all this is `src/data/photos/jpeg.ts`: a photograph stored by
 * Cooking Lab has no metadata in it, and this is the picture that proves it.
 */

/** The marker bytes a metadata segment can begin with. */
const APP0 = 0xe0;
const APP1 = 0xe1;
const COM = 0xfe;

/**
 * A real 16×16 baseline JPEG of one colour, with its own JFIF `APP0` segment.
 *
 * Produced by an ordinary JPEG encoder, so the quantisation tables, the frame
 * header, the Huffman tables and the entropy-coded scan in it are genuine — the
 * things `stripJpegMetadata` must copy across untouched.
 */
const SAGE_SQUARE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAcFBQYFBAcGBQYIBwcIChELCgkJChUPEAwRGBUaGRgV' +
  'GBcbHichGx0lHRcYIi4iJSgpKywrGiAvMy8qMicqKyr/2wBDAQcICAoJChQLCxQqHBgcKioqKioq' +
  'KioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKir/wAARCAAQABADASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEA' +
  'AwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSEx' +
  'QRJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElK' +
  'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3' +
  'uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmqKKK' +
  'wOQ//9k=';

/** The picture with nothing in it but the picture, plus its JFIF header. */
export function sageSquareJpeg(): Uint8Array {
  return new Uint8Array(Buffer.from(SAGE_SQUARE_JPEG_BASE64, 'base64'));
}

/** A `length`-prefixed JPEG segment: `FF <marker> <length> <payload>`. */
function segment(marker: number, payload: readonly number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/** Little-endian 16- and 32-bit integers, as a TIFF header asks for. */
function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

/** One IFD entry: tag, type, count, then four bytes of value or offset. */
function ifdEntry(tag: number, type: number, count: number, value: readonly number[]): number[] {
  const padded = [...value];
  while (padded.length < 4) {
    padded.push(0);
  }
  return [...u16(tag), ...u16(type), ...u32(count), ...padded.slice(0, 4)];
}

function rational(numerator: number, denominator: number): number[] {
  return [...u32(numerator), ...u32(denominator)];
}

const TIFF_TYPE_ASCII = 2;
const TIFF_TYPE_LONG = 4;
const TIFF_TYPE_RATIONAL = 5;

/** The invented coordinates, so a test can look for them by value. */
export const FIXTURE_LATITUDE_DEGREES = 51;
export const FIXTURE_LATITUDE_MINUTES = 30;
export const FIXTURE_LONGITUDE_MINUTES = 7;

/**
 * An EXIF `APP1` payload whose only content is a GPS position.
 *
 * Laid out explicitly, with every offset derived from the sizes above it, so
 * the structure can be followed by eye:
 *
 *   0   TIFF header — `II`, magic 42, offset of the first IFD
 *   8   IFD0 — one entry, the pointer to the GPS IFD
 *   26  GPS IFD — latitude and longitude, with their hemispheres
 *   80  the latitude and longitude values themselves
 */
function exifWithGps(): number[] {
  const ifd0Offset = 8;
  const ifd0Size = 2 + 12 + 4;
  const gpsIfdOffset = ifd0Offset + ifd0Size;
  const gpsIfdSize = 2 + 4 * 12 + 4;
  const latitudeOffset = gpsIfdOffset + gpsIfdSize;
  const longitudeOffset = latitudeOffset + 24;

  const header = [...ascii('II'), ...u16(42), ...u32(ifd0Offset)];

  const ifd0 = [
    ...u16(1),
    // 0x8825 GPSInfoIFDPointer: the whole of IFD0 is a pointer to the GPS block.
    ...ifdEntry(0x8825, TIFF_TYPE_LONG, 1, u32(gpsIfdOffset)),
    ...u32(0),
  ];

  const gpsIfd = [
    ...u16(4),
    // 0x0001 GPSLatitudeRef, 0x0002 GPSLatitude,
    // 0x0003 GPSLongitudeRef, 0x0004 GPSLongitude.
    ...ifdEntry(0x0001, TIFF_TYPE_ASCII, 2, ascii('N\u0000')),
    ...ifdEntry(0x0002, TIFF_TYPE_RATIONAL, 3, u32(latitudeOffset)),
    ...ifdEntry(0x0003, TIFF_TYPE_ASCII, 2, ascii('W\u0000')),
    ...ifdEntry(0x0004, TIFF_TYPE_RATIONAL, 3, u32(longitudeOffset)),
    ...u32(0),
  ];

  const latitude = [
    ...rational(FIXTURE_LATITUDE_DEGREES, 1),
    ...rational(FIXTURE_LATITUDE_MINUTES, 1),
    ...rational(0, 1),
  ];
  const longitude = [
    ...rational(0, 1),
    ...rational(FIXTURE_LONGITUDE_MINUTES, 1),
    ...rational(0, 1),
  ];

  return [...ascii('Exif\u0000\u0000'), ...header, ...ifd0, ...gpsIfd, ...latitude, ...longitude];
}

/** An XMP packet, which is the other place a device writes a location. */
function xmpPacket(): number[] {
  return ascii(
    'http://ns.adobe.com/xap/1.0/\u0000' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description ' +
      'exif:GPSLatitude="51,30.000000N" exif:GPSLongitude="0,7.000000W" ' +
      'tiff:Model="Synthetic Fixture Camera"/></rdf:RDF></x:xmpmeta>',
  );
}

/** The marker and name of every metadata segment this fixture adds. */
export const FIXTURE_METADATA_SEGMENTS = ['APP1', 'APP1', 'COM'] as const;

/**
 * The same picture, carrying a location.
 *
 * The segments go immediately after the start-of-image marker and before the
 * encoder's own `APP0`, which is where a camera puts them.
 */
export function jpegWithGpsMetadata(): Uint8Array {
  const clean = sageSquareJpeg();
  const inserted = [
    ...segment(APP1, exifWithGps()),
    ...segment(APP1, xmpPacket()),
    ...segment(COM, ascii('Taken with a synthetic fixture camera at 51.5N 0.12W')),
  ];

  const out = new Uint8Array(clean.length + inserted.length);
  // `FFD8`, then the metadata, then everything the encoder wrote.
  out.set(clean.subarray(0, 2), 0);
  out.set(inserted, 2);
  out.set(clean.subarray(2), 2 + inserted.length);
  return out;
}

/** Whether these bytes contain this run of bytes anywhere. */
export function containsBytes(haystack: Uint8Array, needle: readonly number[]): boolean {
  outer: for (let at = 0; at <= haystack.length - needle.length; at += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[at + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/** The `APP0` marker, for a test that wants to name it. */
export const JFIF_MARKER = APP0;
