/**
 * Adding a photograph to a cook, and taking one back.
 *
 * Against the real capture pipeline, the real private file store, the real
 * evidence rules and real SQLite. Three things stand in for the device, and
 * each is a plain implementation of a small port rather than an imitation of
 * Android: a camera that answers however the test tells it to, an encoder that
 * hands back whatever bytes it was given, and a map of files.
 *
 * The encoder is the interesting one. It deliberately does *not* strip
 * metadata, which is what the platform's own encoder normally does as a side
 * effect of re-encoding. That is the case this file exists for: if the device
 * ever stops doing it, a stored photograph must still carry no location,
 * because the app cleans the bytes itself.
 */

import type {
  CapturedImage,
  EncodedPhoto,
  PhotoEncoder,
  PhotoSource,
  PhotoSourceOutcome,
  PrivateFileStore,
} from '../src/data/adapters';
import type { DataLayer } from '../src/data/repositories';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { findJpegMetadataSegments } from '../src/data/photos/jpeg';
import {
  MAX_PHOTO_LONG_EDGE,
  createPhotoService,
  type PhotoService,
} from '../src/data/photos/capture';
import { cookIdFromPhotoPath, isSafePhotoLogicalPath } from '../src/data/photos/photoPaths';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest, type MemoryFileSystem } from './support/memoryPorts';
import {
  containsBytes,
  jpegWithGpsMetadata,
  sageSquareJpeg,
} from './fixtures/photoBytes';

const COOK = 'cook-01';
const AT = '2026-10-20T18:30:00.000Z';

/** `Exif`, which is where a camera writes a location. */
const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66];

type Rig = {
  readonly db: TestDatabase;
  readonly data: DataLayer;
  readonly photos: PrivateFileStore;
  readonly files: MemoryFileSystem;
  readonly service: PhotoService;
  /** What the camera or the roll will answer next. */
  next(outcome: PhotoSourceOutcome): void;
  /** What the encoder will hand back next. */
  encodes(bytes: Uint8Array): void;
  /** Every size cap the encoder was asked for, in order. */
  readonly caps: number[];
  /** Every image the encoder was given, in order. */
  readonly encoded: CapturedImage[];
  close(): Promise<void>;
};

async function openRig(fileName: string): Promise<Rig> {
  const db = await openTestDatabase(fileName);
  const files = memoryFileSystem();
  const photos = createPrivateFileStore(files, nodeDigest);

  let outcome: PhotoSourceOutcome = {
    status: 'captured',
    image: { uri: 'file:///cache/shot.jpg', width: 4000, height: 3000 },
  };
  let bytes = sageSquareJpeg();
  const caps: number[] = [];
  const encoded: CapturedImage[] = [];

  const source: PhotoSource = {
    async takePhoto() {
      return outcome;
    },
    async choosePhoto() {
      return outcome;
    },
  };

  const encoder: PhotoEncoder = {
    async encodeJpeg(image: CapturedImage, maxLongEdge: number): Promise<EncodedPhoto> {
      caps.push(maxLongEdge);
      encoded.push(image);
      return { bytes, width: image.width, height: image.height };
    },
  };

  let nextId = 0;
  const service = createPhotoService({
    data: db.data,
    photos,
    source,
    encoder,
    newId: () => {
      nextId += 1;
      return `photo-event-${String(nextId).padStart(2, '0')}`;
    },
    now: () => AT,
  });

  await db.data.capture.startCook({ id: COOK, startedAt: AT }, 'user', AT);

  return {
    db,
    data: db.data,
    photos,
    files,
    service,
    caps,
    encoded,
    next(value) {
      outcome = value;
    },
    encodes(value) {
      bytes = value;
    },
    close: () => db.close(),
  };
}

let rig: Rig;

afterEach(async () => {
  await rig.close();
});

describe('a photograph becomes part of a cook', () => {
  beforeEach(async () => {
    rig = await openRig('photo-add.db');
  });

  it('stores the file and the timeline entry together', async () => {
    const outcome = await rig.service.add(COOK, 'camera');

    expect(outcome.status).toBe('added');
    if (outcome.status !== 'added') {
      return;
    }
    expect(outcome.event.kind).toBe('photo');
    expect(outcome.event.cookId).toBe(COOK);
    expect(outcome.event.ts).toBe(AT);

    // The row is on disk, not only in the returned value.
    const events = await rig.data.cookEvents.listForCook({ cookId: COOK });
    expect(events).toHaveLength(1);
    expect(events[0]?.photoPath).toBe(outcome.event.photoPath);
    expect(await rig.photos.exists(outcome.event.photoPath!)).toBe(true);
  });

  it('references the photograph by an app-private logical path and nothing else', async () => {
    const outcome = await rig.service.add(COOK, 'camera');
    if (outcome.status !== 'added') {
      throw new Error('expected the photo to be added');
    }
    const path = outcome.event.photoPath!;

    expect(isSafePhotoLogicalPath(path)).toBe(true);
    expect(cookIdFromPhotoPath(path)).toBe(COOK);
    // Not a device path and not a URL: the record cannot be made to carry one.
    expect(path).not.toContain('file:');
    expect(path).not.toContain('/memory/');
    expect(path.startsWith('cooks/')).toBe(true);
    expect(path.endsWith('.jpg')).toBe(true);
  });

  it('asks the encoder to cap the long edge at 2048', async () => {
    await rig.service.add(COOK, 'camera');

    expect(rig.caps).toEqual([MAX_PHOTO_LONG_EDGE]);
    expect(MAX_PHOTO_LONG_EDGE).toBe(2048);
    expect(rig.encoded[0]).toEqual({
      uri: 'file:///cache/shot.jpg',
      width: 4000,
      height: 3000,
    });
  });

  it('stores no metadata, even when the device left the location in', async () => {
    // The whole privacy promise, end to end: the camera hands over a JPEG that
    // knows where it was taken, the encoder does nothing about it, and what
    // ends up in the store has none of it.
    const dirty = jpegWithGpsMetadata();
    expect(containsBytes(dirty, EXIF_SIGNATURE)).toBe(true);
    rig.encodes(dirty);

    const outcome = await rig.service.add(COOK, 'camera');
    if (outcome.status !== 'added') {
      throw new Error('expected the photo to be added');
    }

    const stored = await rig.photos.read(outcome.event.photoPath!);
    expect(findJpegMetadataSegments(stored)).toEqual([]);
    expect(containsBytes(stored, EXIF_SIGNATURE)).toBe(false);
    expect(Buffer.from(stored).toString('latin1')).not.toContain('GPSLatitude');
    expect(stored.length).toBeLessThan(dirty.length);
  });

  it('takes the picture from the roll when that is what was asked for', async () => {
    const outcome = await rig.service.add(COOK, 'library');

    expect(outcome.status).toBe('added');
  });

  it('gives two photographs two files', async () => {
    const first = await rig.service.add(COOK, 'camera');
    const second = await rig.service.add(COOK, 'camera');

    if (first.status !== 'added' || second.status !== 'added') {
      throw new Error('expected both photos to be added');
    }
    expect(first.event.photoPath).not.toBe(second.event.photoPath);
    expect(await rig.photos.list()).toHaveLength(2);
  });
});

describe('a photograph that does not arrive', () => {
  beforeEach(async () => {
    rig = await openRig('photo-refused.db');
  });

  it('says nothing and changes nothing when the person backs out', async () => {
    rig.next({ status: 'cancelled' });

    expect(await rig.service.add(COOK, 'camera')).toEqual({ status: 'cancelled' });
    expect(await rig.data.cookEvents.listForCook({ cookId: COOK })).toEqual([]);
    expect(rig.files.files.size).toBe(0);
  });

  it('reports a refused camera, and whether asking again is any use', async () => {
    rig.next({ status: 'denied', canAskAgain: false });

    expect(await rig.service.add(COOK, 'camera')).toEqual({
      status: 'denied',
      canAskAgain: false,
    });
    expect(await rig.data.cookEvents.listForCook({ cookId: COOK })).toEqual([]);
  });

  it('reports a camera that failed, and stores nothing', async () => {
    rig.next({ status: 'failed', message: 'the camera was busy' });

    const outcome = await rig.service.add(COOK, 'camera');

    expect(outcome).toEqual({ status: 'failed', message: 'the camera was busy' });
    expect(rig.files.files.size).toBe(0);
  });

  it('refuses a file that did not come back as a photograph', async () => {
    rig.encodes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]));

    const outcome = await rig.service.add(COOK, 'camera');

    expect(outcome.status).toBe('failed');
    expect(await rig.data.cookEvents.listForCook({ cookId: COOK })).toEqual([]);
    expect(rig.files.files.size).toBe(0);
  });

  it('leaves no file behind when the timeline entry cannot be written', async () => {
    // The order the pipeline writes in is the point: the file goes down first,
    // so a failed row has to take the file with it or the store is left holding
    // a photograph no cook refers to.
    const failing: DataLayer = {
      ...rig.data,
      capture: {
        ...rig.data.capture,
        addEvent: async () => {
          throw new Error('the store refused the write');
        },
      },
    };
    const service = createPhotoService({
      data: failing,
      photos: rig.photos,
      source: {
        async takePhoto() {
          return {
            status: 'captured',
            image: { uri: 'file:///cache/shot.jpg', width: 100, height: 100 },
          };
        },
        async choosePhoto() {
          return { status: 'cancelled' };
        },
      },
      encoder: {
        async encodeJpeg(image) {
          return { bytes: sageSquareJpeg(), width: image.width, height: image.height };
        },
      },
      newId: () => 'orphan-event',
      now: () => AT,
    });

    const outcome = await service.add(COOK, 'camera');

    expect(outcome.status).toBe('failed');
    expect(await rig.data.cookEvents.listForCook({ cookId: COOK })).toEqual([]);
    expect(rig.files.files.size).toBe(0);
    expect(await rig.photos.list()).toEqual([]);
  });

  it('never lets the assistant add one', async () => {
    // The pipeline always writes as the cook, so this is checked at the rule
    // rather than through the service: the assistant has no route to a camera.
    const decision = await rig.data.capture.addEvent(
      {
        id: 'ai-photo',
        cookId: COOK,
        ts: AT,
        kind: 'photo',
        photoPath: 'cooks/cook-01/events/ai-photo/20261020t183000-00.jpg',
      },
      'ai',
    );

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe('ai_cannot_append_event_kind');
    }
  });
});

describe('taking a photograph back', () => {
  beforeEach(async () => {
    rig = await openRig('photo-remove.db');
  });

  it('removes the entry and the file', async () => {
    const added = await rig.service.add(COOK, 'camera');
    if (added.status !== 'added') {
      throw new Error('expected the photo to be added');
    }
    const path = added.event.photoPath!;

    expect(await rig.service.remove(added.event.id)).toEqual({ status: 'removed' });

    expect(await rig.data.cookEvents.listForCook({ cookId: COOK })).toEqual([]);
    expect(await rig.photos.exists(path)).toBe(false);
    expect(rig.files.files.size).toBe(0);
  });

  it('leaves the rest of the cook exactly as it was', async () => {
    await rig.data.capture.addEvent(
      { id: 'note-01', cookId: COOK, ts: AT, kind: 'user_note', body: 'Crust caught' },
      'user',
    );
    const added = await rig.service.add(COOK, 'camera');
    if (added.status !== 'added') {
      throw new Error('expected the photo to be added');
    }

    await rig.service.remove(added.event.id);

    const events = await rig.data.cookEvents.listForCook({ cookId: COOK });
    expect(events.map((event) => [event.kind, event.body])).toEqual([
      ['user_note', 'Crust caught'],
    ]);
    expect(await rig.data.cooks.findById(COOK)).not.toBeNull();
  });

  it('refuses to remove anything that is not a photograph', async () => {
    await rig.data.capture.addEvent(
      { id: 'note-01', cookId: COOK, ts: AT, kind: 'user_note', body: 'Crust caught' },
      'user',
    );

    const outcome = await rig.service.remove('note-01');

    expect(outcome.status).toBe('refused');
    // The note is still there, which is the whole of the rule.
    expect(await rig.data.cookEvents.findById('note-01')).not.toBeNull();
  });

  it('refuses the assistant outright', async () => {
    const added = await rig.service.add(COOK, 'camera');
    if (added.status !== 'added') {
      throw new Error('expected the photo to be added');
    }

    const decision = await rig.data.capture.removeEvent(added.event.id, 'ai');

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe('ai_cannot_remove_raw_evidence');
    }
    expect(await rig.data.cookEvents.findById(added.event.id)).not.toBeNull();
  });
});
