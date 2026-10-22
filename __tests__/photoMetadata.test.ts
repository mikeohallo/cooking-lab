/**
 * A stored photograph carries no metadata, and therefore no location.
 *
 * This is the test behind the privacy claim in `src/data/photos/jpeg.ts`. It
 * works on a real JPEG with a real EXIF GPS block spliced into it (see
 * `./fixtures/photoBytes.ts`) and asks three separate questions, because
 * "there is no metadata" is easy to pass by accident:
 *
 *   1. was the metadata there to begin with? — otherwise the rest proves
 *      nothing at all;
 *   2. is it gone afterwards, both as segments and as the actual coordinate
 *      bytes;
 *   3. is the *picture* still the same picture? — a strip that quietly damaged
 *      the image would pass the first two.
 */

import {
  findJpegMetadataSegments,
  looksLikeJpeg,
  stripJpegMetadata,
} from '../src/data/photos/jpeg';
import {
  FIXTURE_LATITUDE_DEGREES,
  FIXTURE_LATITUDE_MINUTES,
  containsBytes,
  jpegWithGpsMetadata,
  sageSquareJpeg,
} from './fixtures/photoBytes';

/** `Exif`, the marker that opens an EXIF block. */
const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66];
/** The latitude as it is actually encoded: 51/1 then 30/1, little-endian. */
const LATITUDE_BYTES = [
  FIXTURE_LATITUDE_DEGREES,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  FIXTURE_LATITUDE_MINUTES,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
];

describe('the fixture really is a JPEG that knows where it was taken', () => {
  it('is a JPEG', () => {
    expect(looksLikeJpeg(jpegWithGpsMetadata())).toBe(true);
    expect(looksLikeJpeg(sageSquareJpeg())).toBe(true);
  });

  it('carries an EXIF block, an XMP packet and a comment', () => {
    const found = findJpegMetadataSegments(jpegWithGpsMetadata());

    // The encoder's own JFIF APP0 is in there too, which is why this is four.
    expect(found.map((segment) => segment.name)).toEqual(['APP1', 'APP1', 'COM', 'APP0']);
  });

  it('has the coordinates in it as bytes, not just as a label', () => {
    const bytes = jpegWithGpsMetadata();

    expect(containsBytes(bytes, EXIF_SIGNATURE)).toBe(true);
    expect(containsBytes(bytes, LATITUDE_BYTES)).toBe(true);
    // The XMP packet writes the position out as text as well.
    expect(Buffer.from(bytes).toString('latin1')).toContain('GPSLatitude');
  });
});

describe('stripping a JPEG', () => {
  it('takes every metadata segment out, and says which', () => {
    const result = stripJpegMetadata(jpegWithGpsMetadata());

    expect(result.removed.map((segment) => segment.name)).toEqual([
      'APP1',
      'APP1',
      'COM',
      'APP0',
    ]);
    expect(findJpegMetadataSegments(result.bytes)).toEqual([]);
  });

  it('leaves no trace of where the photograph was taken', () => {
    const { bytes } = stripJpegMetadata(jpegWithGpsMetadata());

    expect(containsBytes(bytes, EXIF_SIGNATURE)).toBe(false);
    expect(containsBytes(bytes, LATITUDE_BYTES)).toBe(false);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).not.toContain('GPSLatitude');
    expect(text).not.toContain('GPSLongitude');
    expect(text).not.toContain('Synthetic Fixture Camera');
  });

  it('is still the same picture afterwards', () => {
    // The strongest form of this: a picture with metadata and the same picture
    // without it strip down to byte-identical files. Everything that is not a
    // metadata segment — the quantisation tables, the frame header, the Huffman
    // tables and the whole entropy-coded scan — came across untouched.
    const fromDirty = stripJpegMetadata(jpegWithGpsMetadata()).bytes;
    const fromClean = stripJpegMetadata(sageSquareJpeg()).bytes;

    expect([...fromDirty]).toEqual([...fromClean]);
    expect(looksLikeJpeg(fromDirty)).toBe(true);
    // Start of scan, and the last two bytes are still end of image.
    expect(containsBytes(fromDirty, [0xff, 0xda])).toBe(true);
    expect([...fromDirty.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it('is cheap and harmless on a picture that already has none', () => {
    const once = stripJpegMetadata(sageSquareJpeg());
    const twice = stripJpegMetadata(once.bytes);

    expect(twice.removed).toEqual([]);
    expect([...twice.bytes]).toEqual([...once.bytes]);
  });

  it('always hands back a copy, so a caller cannot be holding the original', () => {
    const original = sageSquareJpeg();
    const result = stripJpegMetadata(original);

    expect(result.bytes).not.toBe(original);
  });

  it('leaves something that is not a JPEG alone rather than mangling it', () => {
    // Whether a file that is not an image may be stored is the capture
    // pipeline's rule, not this module's. See `photoCapture.test.ts`.
    const notAnImage = new Uint8Array([1, 2, 3, 4, 5]);
    const result = stripJpegMetadata(notAnImage);

    expect(result.removed).toEqual([]);
    expect([...result.bytes]).toEqual([1, 2, 3, 4, 5]);
    expect(looksLikeJpeg(notAnImage)).toBe(false);
  });

  it('stops at the start of scan rather than reading the picture as markers', () => {
    // A `FF` byte inside compressed image data is part of the picture. A walk
    // that carried on past the scan would eventually read one as a marker and
    // cut the photograph in half.
    const bytes = sageSquareJpeg();
    const scanAt = bytes.findIndex(
      (byte, index) => byte === 0xff && bytes[index + 1] === 0xda,
    );

    expect(scanAt).toBeGreaterThan(0);
    for (const segment of findJpegMetadataSegments(bytes)) {
      expect(segment.offset).toBeLessThan(scanAt);
    }
  });
});
