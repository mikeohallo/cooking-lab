/**
 * Photos in the order they were taken (0.2.2).
 *
 * A photograph chosen from the Gallery goes into the timeline at the time it
 * was taken — read from its own EXIF before the re-encode strips it, date and
 * time only — when that time is no later than now and no earlier than an hour
 * before the cook started. Otherwise it goes in at the time it was added, and
 * says so. A camera photograph behaves as it always did. Nothing stored moves.
 *
 * The brief's three fixtures, through the real capture pipeline and real
 * SQLite: a JPEG with a taken-time and GPS lands at the taken-time and is
 * stored with no metadata; one with no time is placed at the time added and
 * marked "added"; one taken outside the window likewise.
 */

import { cleanup, screen } from '@testing-library/react-native';

import type { PhotoSource, PhotoSourceOutcome } from '../src/data/adapters';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { createPhotoService, type PhotoService } from '../src/data/photos/capture';
import { findJpegMetadataSegments, stripJpegMetadata } from '../src/data/photos/jpeg';
import { readJpegTakenTime, takenTimeToInstant } from '../src/data/photos/takenTime';
import {
  PHOTO_BEFORE_START_ALLOWANCE_MS,
  photoPlacedWhenAdded,
  placeGalleryPhoto,
} from '../src/domain/photoTime';
import { CookScreen } from '../src/screens/CookScreen';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest, type MemoryFileSystem } from './support/memoryPorts';
import { openScreenHarness, passThroughEncoder, type ScreenHarness } from './support/screens';
import {
  FIXTURE_LATITUDE_DEGREES,
  FIXTURE_LATITUDE_MINUTES,
  containsBytes,
  jpegWithGpsMetadata,
  jpegWithTakenTimeAndGps,
  sageSquareJpeg,
} from './fixtures/photoBytes';

const STARTED = '2026-10-29T17:00:00.000Z';
const ADDED = '2026-10-29T19:30:00.000Z';

describe('reading when a picture was taken', () => {
  it('reads the date, the time and the offset, and nothing else', () => {
    const taken = readJpegTakenTime(jpegWithTakenTimeAndGps('2026:10:29 18:05:30', '+01:00'));

    expect(taken).toEqual({ dateTime: '2026:10:29 18:05:30', offset: '+01:00' });
    expect(Object.keys(taken ?? {}).sort()).toEqual(['dateTime', 'offset']);
    expect(takenTimeToInstant(taken!)).toBe('2026-10-29T17:05:30.000Z');
  });

  it('takes a time with no offset as the phone’s own local time', () => {
    const taken = readJpegTakenTime(jpegWithTakenTimeAndGps('2026:10:29 18:05:30', null));

    expect(taken).toEqual({ dateTime: '2026:10:29 18:05:30', offset: null });
    expect(takenTimeToInstant(taken!)).toBe(new Date(2026, 9, 29, 18, 5, 30).toISOString());
  });

  it('finds nothing in a picture that has a place but no time', () => {
    expect(readJpegTakenTime(jpegWithGpsMetadata())).toBeNull();
  });

  it('finds nothing in a picture with no metadata, or in something that is not a JPEG', () => {
    expect(readJpegTakenTime(sageSquareJpeg())).toBeNull();
    expect(readJpegTakenTime(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  it('gives up quietly on a truncated block', () => {
    const whole = jpegWithTakenTimeAndGps('2026:10:29 18:05:30', '+01:00');
    for (const cut of [8, 20, 40, 60, 90]) {
      expect(() => readJpegTakenTime(whole.slice(0, cut))).not.toThrow();
    }
  });

  it('refuses a day that does not exist', () => {
    expect(takenTimeToInstant({ dateTime: '2026:02:31 12:00:00', offset: '+00:00' })).toBeNull();
    expect(takenTimeToInstant({ dateTime: '2026:13:01 12:00:00', offset: null })).toBeNull();
  });
});

describe('where a Gallery photo goes', () => {
  it('goes at the time taken when that is between an hour before the start and now', () => {
    const taken = '2026-10-29T18:00:00.000Z';
    expect(placeGalleryPhoto(taken, ADDED, STARTED)).toEqual({
      ts: taken,
      meta: { photoTime: 'taken', addedAt: ADDED },
    });
    const anHourBefore = new Date(Date.parse(STARTED) - PHOTO_BEFORE_START_ALLOWANCE_MS).toISOString();
    expect(placeGalleryPhoto(anHourBefore, ADDED, STARTED).ts).toBe(anHourBefore);
    expect(placeGalleryPhoto(ADDED, ADDED, STARTED).ts).toBe(ADDED);
  });

  it('goes at the time added, marked "added", when the time is missing, in the future or too early', () => {
    const added = { ts: ADDED, meta: { photoTime: 'added' } };
    expect(placeGalleryPhoto(null, ADDED, STARTED)).toEqual(added);
    expect(placeGalleryPhoto('2026-10-29T19:31:00.000Z', ADDED, STARTED)).toEqual(added);
    expect(placeGalleryPhoto('2026-10-29T15:59:59.000Z', ADDED, STARTED)).toEqual(added);
  });
});

/** A Gallery whose next picture, and its original bytes, a test decides. */
function gallery(original: Uint8Array | null): PhotoSource & { reads: number } {
  const image = { uri: 'file:///picker/picked.jpg', width: 16, height: 16 };
  const picked: PhotoSourceOutcome = { status: 'captured', image };
  const source = {
    reads: 0,
    async takePhoto() {
      return picked;
    },
    async choosePhoto() {
      return picked;
    },
    async readOriginal() {
      source.reads += 1;
      return original;
    },
  };
  return source;
}

describe('the capture pipeline, with the brief’s three fixtures', () => {
  let db: TestDatabase;
  let files: MemoryFileSystem;
  let next = 0;

  beforeEach(async () => {
    db = await openTestDatabase('photo-time.db');
    files = memoryFileSystem();
    next = 0;
    await db.data.capture.startCook({ id: 'cook-01', startedAt: STARTED }, 'user', STARTED);
    await db.data.capture.addEvent(
      { id: 'note-early', cookId: 'cook-01', ts: '2026-10-29T17:30:00.000Z', kind: 'user_note', body: 'Seared.' },
      'user',
    );
    await db.data.capture.addEvent(
      { id: 'note-late', cookId: 'cook-01', ts: '2026-10-29T19:00:00.000Z', kind: 'user_note', body: 'Resting.' },
      'user',
    );
  });

  afterEach(async () => {
    await db.close();
  });

  function service(bytes: Uint8Array, source: PhotoSource): PhotoService {
    return createPhotoService({
      data: db.data,
      photos: createPrivateFileStore(files, nodeDigest),
      source,
      // Hands the metadata straight back, as an encoder that forgot to strip
      // it would: the stripping proven here is the app's own.
      encoder: passThroughEncoder(bytes),
      newId: () => `photo-${(next += 1)}`,
      now: () => ADDED,
    });
  }

  it('puts a picture with a taken-time and GPS at its taken-time, and stores it with no metadata', async () => {
    const bytes = jpegWithTakenTimeAndGps('2026:10:29 18:15:00', '+00:00');
    const outcome = await service(bytes, gallery(bytes)).add('cook-01', 'library');

    expect(outcome.status).toBe('added');
    const timeline = await db.data.cookEvents.listForCook({ cookId: 'cook-01' });
    expect(timeline.map((event) => event.id)).toEqual(['note-early', 'photo-1', 'note-late']);
    const photo = timeline[1]!;
    expect(photo.ts).toBe('2026-10-29T18:15:00.000Z');
    expect(photo.meta).toEqual({ photoTime: 'taken', addedAt: ADDED });
    expect(photoPlacedWhenAdded(photo)).toBe(false);

    const stored = [...files.files.values()][0]!;
    expect(findJpegMetadataSegments(stored)).toEqual([]);
    expect(containsBytes(stored, [FIXTURE_LATITUDE_DEGREES, 0, 0, 0, 1, 0, 0, 0, FIXTURE_LATITUDE_MINUTES])).toBe(false);
    expect(containsBytes(stored, [...'2026:10:29'].map((c) => c.charCodeAt(0)))).toBe(false);
    // Byte for byte the same picture as the plain one, cleaned the same way.
    expect(stored).toEqual(stripJpegMetadata(sageSquareJpeg()).bytes);
    // Nothing about where it was taken was written down anywhere.
    expect(JSON.stringify(photo)).not.toMatch(/gps|lat|long|51/i);
  });

  it('puts a picture with no time at the time added, marked "added"', async () => {
    const bytes = jpegWithGpsMetadata();
    await service(bytes, gallery(bytes)).add('cook-01', 'library');

    const timeline = await db.data.cookEvents.listForCook({ cookId: 'cook-01' });
    expect(timeline.map((event) => event.id)).toEqual(['note-early', 'note-late', 'photo-1']);
    expect(timeline[2]?.ts).toBe(ADDED);
    expect(timeline[2]?.meta).toEqual({ photoTime: 'added' });
    expect(photoPlacedWhenAdded(timeline[2]!)).toBe(true);
    expect(findJpegMetadataSegments([...files.files.values()][0]!)).toEqual([]);
  });

  it('puts a picture taken outside the window at the time added, marked "added"', async () => {
    const lastWeek = jpegWithTakenTimeAndGps('2026:10:22 18:15:00', '+00:00');
    await service(lastWeek, gallery(lastWeek)).add('cook-01', 'library');
    const tomorrow = jpegWithTakenTimeAndGps('2026:10:30 18:15:00', '+00:00');
    await service(tomorrow, gallery(tomorrow)).add('cook-01', 'library');

    const photos = (await db.data.cookEvents.listForCook({ cookId: 'cook-01' })).filter(
      (event) => event.kind === 'photo',
    );
    expect(photos).toHaveLength(2);
    for (const photo of photos) {
      expect(photo.ts).toBe(ADDED);
      expect(photo.meta).toEqual({ photoTime: 'added' });
    }
  });

  it('puts a camera photo in now, as before, without reading anything', async () => {
    const bytes = jpegWithTakenTimeAndGps('2026:10:29 18:15:00', '+00:00');
    const source = gallery(bytes);
    await service(bytes, source).add('cook-01', 'camera');

    const [photo] = await db.data.cookEvents.listForCook({ cookId: 'cook-01', kind: 'photo' });
    expect(photo?.ts).toBe(ADDED);
    expect(photo?.meta).toBeNull();
    expect(source.reads).toBe(0);
  });

  it('puts a picture whose original cannot be read at the time added', async () => {
    const bytes = jpegWithTakenTimeAndGps('2026:10:29 18:15:00', '+00:00');
    await service(bytes, gallery(null)).add('cook-01', 'library');

    const [photo] = await db.data.cookEvents.listForCook({ cookId: 'cook-01', kind: 'photo' });
    expect(photo?.ts).toBe(ADDED);
    expect(photo?.meta).toEqual({ photoTime: 'added' });
  });
});

describe('on screen', () => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    harness = await openScreenHarness();
  });

  afterEach(async () => {
    await cleanup();
    await harness.close();
  });

  it('labels a photo placed when added "Photo · added <time>", and leaves older photos as they were', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-01', startedAt: now() }, 'user', now());
    const at = harness.tick();
    for (const [id, meta] of [
      ['photo-old', null],
      ['photo-added', { photoTime: 'added' }],
      ['photo-taken', { photoTime: 'taken', addedAt: at }],
    ] as const) {
      const path = `cooks/cook-01/events/${id}/20261015t083100-00.jpg`;
      await harness.storage.photos.write(path, sageSquareJpeg());
      await data.capture.addEvent(
        { id, cookId: 'cook-01', ts: at, kind: 'photo', photoPath: path, meta },
        'user',
      );
    }

    await harness.render(<CookScreen cookId="cook-01" onBack={() => {}} onReview={() => {}} />);

    expect((await screen.findByTestId('photo-caption-photo-added')).props.children).toMatch(
      /^Photo · added \d{1,2}:\d{2}/,
    );
    expect(screen.getByTestId('photo-caption-photo-old').props.children).toMatch(/^Photo · \d{1,2}:\d{2}/);
    expect(screen.getByTestId('photo-caption-photo-taken').props.children).toMatch(/^Photo · \d{1,2}:\d{2}/);
  });
});
