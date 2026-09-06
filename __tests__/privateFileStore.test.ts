import { createHash } from 'node:crypto';

import {
  PRIVATE_MEDIA_ROOT,
  PrivateFileError,
  createPrivateFileStore,
  staysInsideRoot,
} from '../src/data/files/privateFileStore';
import { buildPhotoLogicalPath } from '../src/data/photos/photoPaths';
import { openTestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest, type MemoryFileSystem } from './support/memoryPorts';

/**
 * The photo store: where a file goes, what it is allowed to be called, and
 * what happens when the device says no.
 *
 * The store is the real one. What stands in for the device is a map from
 * relative path to bytes, which is what lets every rule below be exercised:
 * the path checks, the digest, the listing and — the one that matters most —
 * that a failed import leaves nothing behind and destroys nothing.
 */

const COOK_ID = 'cook-01';
const EVENT_ID = 'event-01';
const CAPTURED_AT = '2026-09-06T09:00:00.000Z';

function logicalPath(sequence = 1): string {
  const built = buildPhotoLogicalPath({
    cookId: COOK_ID,
    cookEventId: EVENT_ID,
    capturedAt: CAPTURED_AT,
    sequence,
    extension: 'jpg',
  });
  if (!built.ok) {
    throw new Error(`the fixture path is not valid: ${built.reason}`);
  }
  return built.path;
}

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** The error a promise was rejected with, failing the test if it was not. */
async function refusal<T>(promise: Promise<unknown>): Promise<T> {
  try {
    await promise;
  } catch (cause) {
    return cause as T;
  }
  throw new Error('expected the operation to be refused, but it succeeded');
}

function expectedDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

let device: MemoryFileSystem;
let store: ReturnType<typeof createPrivateFileStore>;

beforeEach(() => {
  device = memoryFileSystem();
  store = createPrivateFileStore(device, nodeDigest);
});

describe('a logical path is the only way in', () => {
  it.each([
    ['a parent traversal', '../secrets.jpg'],
    ['a traversal inside the tree', 'cooks/cook-01/../../secrets.jpg'],
    ['an absolute path', '/data/data/com.other.app/files/photo.jpg'],
    ['a file URL', 'file:///tmp/photo.jpg'],
    ['a content URI', 'content://media/external/images/1'],
    ['an http URL', 'https://example.com/photo.jpg'],
    ['a cache root', 'cache/cook-01/20260906t090000-01.jpg'],
    ['a temp root', 'tmp/cook-01/20260906t090000-01.jpg'],
    ['an empty path', ''],
    ['a bare filename', 'photo.jpg'],
  ])('refuses %s', async (_description, candidate) => {
    await expect(store.exists(candidate)).rejects.toBeInstanceOf(PrivateFileError);
    await expect(store.read(candidate)).rejects.toMatchObject({ reason: 'unsafe_path' });
    await expect(store.write(candidate, BYTES)).rejects.toMatchObject({ reason: 'unsafe_path' });
    await expect(store.delete(candidate)).rejects.toMatchObject({ reason: 'unsafe_path' });
    await expect(store.importFile('anywhere', candidate)).rejects.toMatchObject({
      reason: 'unsafe_path',
    });
  });

  it('refuses a Windows separator rather than converting it', async () => {
    const backslash = String.fromCharCode(92);
    const candidate = `cooks${backslash}cook-01${backslash}20260906t090000-01.jpg`;

    await expect(store.exists(candidate)).rejects.toMatchObject({ reason: 'unsafe_path' });
  });

  it('names the path it refused, and nothing about the device', async () => {
    const attempt = store.read('../secrets.jpg');

    await expect(attempt).rejects.toBeInstanceOf(PrivateFileError);
    const error = await refusal<PrivateFileError>(attempt);
    expect(error.logicalPath).toBe('../secrets.jpg');
    expect(error.message).not.toContain(PRIVATE_MEDIA_ROOT);
  });

  it('has a root check that would catch an escape the grammar let through', () => {
    // The second line of defence, tested on its own so it is known to work
    // rather than merely known to be unreachable today.
    expect(staysInsideRoot('cooks/cook-01/photo.jpg')).toBe(true);
    expect(staysInsideRoot('cooks/../../elsewhere/photo.jpg')).toBe(false);
    expect(staysInsideRoot('../photo.jpg')).toBe(false);
    expect(staysInsideRoot('/photo.jpg')).toBe(false);
    expect(staysInsideRoot('cooks//photo.jpg')).toBe(false);
    expect(staysInsideRoot('')).toBe(false);
    expect(staysInsideRoot('cooks/./photo.jpg')).toBe(false);
  });
});

describe('files go into durable app-private storage and come back unchanged', () => {
  it('writes, reads and describes a file', async () => {
    const path = logicalPath();

    const written = await store.write(path, BYTES);

    expect(written).toEqual({
      logicalPath: path,
      byteLength: BYTES.length,
      sha256: expectedDigest(BYTES),
    });
    expect(await store.exists(path)).toBe(true);
    expect(await store.read(path)).toEqual(BYTES);
    expect(await store.info(path)).toEqual(written);
  });

  it('creates the store root before the first write, and never a cache directory', async () => {
    expect(device.rootCreated).toBe(false);

    await store.write(logicalPath(), BYTES);

    expect(device.rootCreated).toBe(true);
    // The root is a named subdirectory of the documents directory; nothing in
    // the store's own vocabulary mentions a cache.
    expect(PRIVATE_MEDIA_ROOT).not.toMatch(/cache|tmp|temp/i);
  });

  it('says nothing is there rather than inventing an answer', async () => {
    expect(await store.exists(logicalPath())).toBe(false);
    expect(await store.info(logicalPath())).toBeNull();
    await expect(store.read(logicalPath())).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('deletes what is there and shrugs at what is not', async () => {
    const path = logicalPath();
    await store.write(path, BYTES);

    await store.delete(path);
    await store.delete(path);

    expect(await store.exists(path)).toBe(false);
  });

  it('computes the same digest every time, and a different one for different bytes', async () => {
    const path = logicalPath();
    const other = logicalPath(2);

    await store.write(path, BYTES);
    await store.write(other, new Uint8Array([...BYTES, 0x01]));

    const first = await store.info(path);
    const again = await store.info(path);
    const different = await store.info(other);

    expect(first?.sha256).toBe(again?.sha256);
    expect(first?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(different?.sha256).not.toBe(first?.sha256);
  });

  it('lists everything it holds, in a stable order', async () => {
    await store.write(logicalPath(2), BYTES);
    await store.write(logicalPath(1), BYTES);

    const listed = await store.list();

    expect(listed.map((entry) => entry.logicalPath)).toEqual([logicalPath(1), logicalPath(2)]);
    expect(listed[0]?.sha256).toBe(expectedDigest(BYTES));
  });

  it('lists a file it would refuse to open, so reconciliation can see it', async () => {
    // A stray file cannot be read, written or deleted through the store — every
    // method refuses the path — but hiding it would make a reconciliation
    // report a tidy store with an unexplained file sitting in it.
    device.files.set('stray.txt', new Uint8Array([1, 2, 3]));

    expect((await store.list()).map((entry) => entry.logicalPath)).toContain('stray.txt');
    await expect(store.read('stray.txt')).rejects.toMatchObject({ reason: 'unsafe_path' });
  });
});

describe('importing a photograph', () => {
  it('moves the file out of wherever it was and into the store', async () => {
    const path = logicalPath();
    device.elsewhere.set('file:///cache/capture-1.jpg', BYTES);

    const stored = await store.importFile('file:///cache/capture-1.jpg', path);

    expect(stored.sha256).toBe(expectedDigest(BYTES));
    expect(await store.read(path)).toEqual(BYTES);
    // The original is gone: a photograph left in a cache directory is one the
    // system may delete without telling anyone.
    expect(device.elsewhere.has('file:///cache/capture-1.jpg')).toBe(false);
  });

  it('leaves nothing behind when the source is not there', async () => {
    const path = logicalPath();

    await expect(store.importFile('file:///cache/missing.jpg', path)).rejects.toMatchObject({
      reason: 'device_refused',
    });

    expect(await store.exists(path)).toBe(false);
    expect(device.files.size).toBe(0);
  });

  it('leaves nothing behind when the device refuses the write', async () => {
    const path = logicalPath();
    device.elsewhere.set('file:///cache/capture-1.jpg', BYTES);
    device.refuseWrites = true;

    await expect(
      store.importFile('file:///cache/capture-1.jpg', path),
    ).rejects.toBeInstanceOf(PrivateFileError);

    expect(device.files.size).toBe(0);
  });

  it('cannot touch a cook or an event, whatever goes wrong', () => {
    // The store is built from two ports and holds nothing else. There is no
    // database, no repository and no data layer in it, so a failed import has
    // nothing to delete but the file it was writing.
    const members = Object.getOwnPropertyNames(store);
    expect(members.sort()).toEqual([
      'delete',
      'exists',
      'importFile',
      'info',
      'list',
      'read',
      'write',
    ]);
  });
});

describe('a stored photograph is never replaced or destroyed by a failure', () => {
  const ORIGINAL = new Uint8Array([1, 2, 3, 4, 5]);
  const REPLACEMENT = new Uint8Array([9, 9, 9]);

  /** The photo that is already there, and the digest that proves it is untouched. */
  async function alreadyStored(path: string) {
    const stored = await store.write(path, ORIGINAL);
    return stored;
  }

  it('imports to a path that is free', async () => {
    const path = logicalPath();
    device.elsewhere.set('file:///cache/capture-1.jpg', ORIGINAL);

    const stored = await store.importFile('file:///cache/capture-1.jpg', path);

    expect(stored.sha256).toBe(expectedDigest(ORIGINAL));
    expect(await store.read(path)).toEqual(ORIGINAL);
  });

  it('refuses an import onto a path that already holds a photograph', async () => {
    const path = logicalPath();
    const original = await alreadyStored(path);
    device.elsewhere.set('file:///cache/capture-2.jpg', REPLACEMENT);

    await expect(
      store.importFile('file:///cache/capture-2.jpg', path),
    ).rejects.toMatchObject({ reason: 'already_exists' });

    // The photograph that was there is exactly the photograph that is there.
    expect(await store.read(path)).toEqual(ORIGINAL);
    expect((await store.info(path))?.sha256).toBe(original.sha256);
    expect((await store.info(path))?.byteLength).toBe(ORIGINAL.length);
    // And the incoming file was not consumed either, so nothing was lost.
    expect(device.elsewhere.get('file:///cache/capture-2.jpg')).toEqual(REPLACEMENT);
  });

  it('refuses before it reaches the device, so no overwriting call is ever made', async () => {
    const path = logicalPath();
    await alreadyStored(path);
    // If the refusal happened after the native call, this would have run and the
    // original bytes would already be gone.
    device.elsewhere.set('file:///cache/capture-2.jpg', REPLACEMENT);
    const before = device.files.get(path);

    await expect(store.importFile('file:///cache/capture-2.jpg', path)).rejects.toBeDefined();

    expect(device.files.get(path)).toBe(before);
  });

  it('leaves no partial file when an import to a free path fails', async () => {
    const path = logicalPath();

    await expect(
      store.importFile('file:///cache/never-existed.jpg', path),
    ).rejects.toMatchObject({ reason: 'device_refused' });

    expect(await store.exists(path)).toBe(false);
    expect(device.files.size).toBe(0);
  });

  it('refuses a write onto a path that already holds a photograph', async () => {
    const path = logicalPath();
    const original = await alreadyStored(path);

    await expect(store.write(path, REPLACEMENT)).rejects.toMatchObject({
      reason: 'already_exists',
    });

    expect(await store.read(path)).toEqual(ORIGINAL);
    expect((await store.info(path))?.sha256).toBe(original.sha256);
  });

  it('leaves no partial file when a write to a free path fails', async () => {
    const path = logicalPath();
    device.refuseWrites = true;

    await expect(store.write(path, ORIGINAL)).rejects.toMatchObject({
      reason: 'device_refused',
    });

    expect(await store.exists(path)).toBe(false);
    expect(device.files.size).toBe(0);
  });

  it('never removes a stored photograph while recovering from a failure', async () => {
    const kept = logicalPath(1);
    const attempted = logicalPath(2);
    const original = await alreadyStored(kept);
    device.refuseWrites = true;

    await expect(store.write(attempted, REPLACEMENT)).rejects.toBeDefined();
    await expect(store.importFile('file:///cache/missing.jpg', attempted)).rejects.toBeDefined();

    // Cleanup touched only the path the failing operation was writing to.
    expect(await store.exists(attempted)).toBe(false);
    expect((await store.info(kept))?.sha256).toBe(original.sha256);
    expect(await store.read(kept)).toEqual(ORIGINAL);
  });

  it('still allows a replacement after the photograph is explicitly deleted', async () => {
    // Refusing to overwrite is not refusing to ever change: it makes the
    // destruction a separate, deliberate act instead of a side effect.
    const path = logicalPath();
    await alreadyStored(path);

    await store.delete(path);
    const replaced = await store.write(path, REPLACEMENT);

    expect(replaced.sha256).toBe(expectedDigest(REPLACEMENT));
  });
});

describe('a photo failure never reaches the cook or the timeline', () => {
  const T0 = '2026-09-05T18:00:00.000Z';
  const T1 = '2026-09-05T19:00:00.000Z';

  it('leaves the cook, the timeline and the photo event intact when the import fails', async () => {
    const db = await openTestDatabase('photo-failure.db');
    try {
      const started = await db.data.capture.startCook(
        { id: COOK_ID, title: 'Weeknight rice', startedAt: T0 },
        'user',
        T0,
      );
      expect(started.allowed).toBe(true);

      const path = logicalPath();
      const added = await db.data.capture.addEvent(
        { id: EVENT_ID, cookId: COOK_ID, ts: T1, kind: 'photo', photoPath: path },
        'user',
      );
      expect(added.allowed).toBe(true);

      // Both ways a photo write can fail, against a store that has no database.
      device.refuseWrites = true;
      await expect(store.importFile('file:///cache/capture.jpg', path)).rejects.toBeDefined();
      await expect(store.write(path, BYTES)).rejects.toBeDefined();

      // The evidence is untouched: the cook, its timeline and the photo event's
      // own reference all survive a photograph that could not be stored.
      const cook = await db.data.cooks.findById(COOK_ID);
      expect(cook).not.toBeNull();
      expect(cook?.title).toBe('Weeknight rice');

      const timeline = await db.data.cookEvents.listForCook({ cookId: COOK_ID });
      expect(timeline.map((event) => event.id)).toEqual([EVENT_ID]);
      expect(timeline[0]?.photoPath).toBe(path);
      expect(timeline[0]?.kind).toBe('photo');
    } finally {
      await db.close();
    }
  });
});
