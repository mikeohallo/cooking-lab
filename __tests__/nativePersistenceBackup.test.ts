import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import { assembleBackup, buildPhotoManifest } from '../src/data/backup/assemble';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { deserialiseBackup, serialiseBackup, validateBackup } from '../src/data/backup/validation';
import { isAllowed, type EvidenceDecision } from '../src/domain/evidence';
import { DATABASE_KEY_ALIAS, createDatabaseKeyProvider } from '../src/data/sqlite/keyProvider';
import {
  memoryFileSystem,
  memorySecureStore,
  nodeDigest,
  nodeRandomBytes,
} from './support/memoryPorts';
import { openTestDatabase, type TestDatabase } from './support/database';

/**
 * The backup format, fed from a real database rather than from a hand-built
 * object.
 *
 * This is the M1 half of the promise: a snapshot read out of the native store
 * becomes a valid, deterministic portable envelope, and nothing about the
 * device's encryption goes with it. The M2 half — a person asking for a backup,
 * choosing where it goes, and restoring from one — is deliberately not here.
 */

const T0 = '2026-09-05T18:00:00.000Z';
const T1 = '2026-09-05T19:00:00.000Z';
const T2 = '2026-09-06T09:00:00.000Z';
const PHOTO_PATH = 'cooks/cook-01/events/event-02/20260905t190000-01.jpg';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!isAllowed(decision)) {
    throw new Error(`expected the operation to be allowed, but it was refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;
let photos: ReturnType<typeof createPrivateFileStore>;
let device: ReturnType<typeof memoryFileSystem>;

/** A small kitchen with one of everything the model can hold. */
async function seedAKitchen(): Promise<void> {
  granted(
    await db.data.capture.startCook(
      { id: 'cook-01', title: 'Weeknight rice', startedAt: T0 },
      'user',
      T0,
    ),
  );
  granted(
    await db.data.capture.addEvent(
      { id: 'event-01', cookId: 'cook-01', ts: T0, kind: 'user_note', body: 'Lid on.' },
      'user',
    ),
  );
  granted(
    await db.data.capture.addEvent(
      { id: 'event-02', cookId: 'cook-01', ts: T1, kind: 'photo', photoPath: PHOTO_PATH },
      'user',
    ),
  );
  granted(
    await db.data.review.proposeFinding(
      {
        cookId: 'cook-01',
        class: 'inference',
        text: 'The rest made the difference.',
        rationale: 'It sat covered for ten minutes.',
        confidence: 'medium',
        sourceEventIds: ['event-01'],
      },
      { id: 'finding-01' },
      'ai',
      T2,
    ),
  );
  granted(await db.data.review.decideFinding('finding-01', 'reject', 'user', T2));
  granted(
    await db.data.review.proposeLesson(
      { cookId: 'cook-01', text: 'Rest it.' },
      { id: 'lesson-01' },
      T2,
    ),
  );
  const tag = await db.data.tags.findOrCreate('rice', 'dish');
  await db.data.cookTags.link({ cookId: 'cook-01', tagId: tag.id });
  await db.data.briefingWorkflow.createBriefing(
    {
      id: 'briefing-01',
      cookId: 'cook-01',
      content: { note: 'less water' },
      useful: null,
      createdAt: T2,
    },
    [],
  );
  await db.data.importBatches.create({
    id: 'import-01',
    filename: 'notes.txt',
    status: 'done',
    candidatesTotal: 1,
    candidatesResolved: 1,
    createdAt: T0,
  });
  granted(await db.data.capture.saveReview('cook-01', '  8/10 "close"  ', 'user', T2));
}

beforeEach(async () => {
  db = await openTestDatabase(`backup-${String(Math.random()).slice(2)}.db`);
  device = memoryFileSystem();
  photos = createPrivateFileStore(device, nodeDigest);
});

afterEach(async () => {
  await db.close();
});

describe('a database snapshot becomes a valid portable backup', () => {
  it('reads every table out and validates', async () => {
    await seedAKitchen();
    await photos.write(PHOTO_PATH, new Uint8Array([1, 2, 3, 4]));

    const assembled = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);

    expect(assembled.issues).toEqual([]);
    expect(assembled.valid).toBe(true);
    expect(assembled.missingPhotos).toEqual([]);
    expect(assembled.envelope.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(assembled.envelope.entities.cooks).toHaveLength(1);
    expect(assembled.envelope.entities.cookEvents).toHaveLength(2);
    expect(assembled.envelope.entities.findingSources).toHaveLength(1);
    expect(assembled.envelope.entities.cookTags).toHaveLength(1);
    expect(assembled.envelope.entities.importBatches).toHaveLength(1);
  });

  it('carries the verdict, the class, the confidence and the rejection through unchanged', async () => {
    await seedAKitchen();
    await photos.write(PHOTO_PATH, new Uint8Array([1, 2, 3, 4]));

    const assembled = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);
    const parsed = deserialiseBackup(serialiseBackup(assembled.envelope));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const cook = parsed.envelope.entities.cooks[0];
    const finding = parsed.envelope.entities.findings[0];
    expect(cook?.verdict).toBe('  8/10 "close"  ');
    expect(cook?.status).toBe('reviewed');
    expect(finding?.class).toBe('inference');
    expect(finding?.confidence).toBe('medium');
    // A rejected proposal is part of the record and travels with it.
    expect(finding?.status).toBe('rejected');
    expect(parsed.envelope.entities.lessons[0]?.status).toBe('proposed');
  });

  it('is deterministic: two reads of an unchanged database serialise identically', async () => {
    await seedAKitchen();
    await photos.write(PHOTO_PATH, new Uint8Array([1, 2, 3, 4]));

    const first = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);
    const second = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);

    expect(serialiseBackup(second.envelope)).toBe(serialiseBackup(first.envelope));
  });

  it('matches every photograph the timeline names to the file behind it', async () => {
    await seedAKitchen();
    const bytes = new Uint8Array([9, 9, 9]);
    const stored = await photos.write(PHOTO_PATH, bytes);

    const snapshot = await db.data.snapshots.readSnapshot();
    const manifest = await buildPhotoManifest(snapshot, photos);

    expect(manifest.missing).toEqual([]);
    expect(manifest.entries).toEqual([
      {
        logicalPath: PHOTO_PATH,
        cookId: 'cook-01',
        cookEventId: 'event-02',
        capturedAt: T1,
        byteLength: bytes.length,
        sha256: stored.sha256,
      },
    ]);
  });

  it('reports a photograph that is not on the device instead of quietly dropping it', async () => {
    await seedAKitchen();
    // The file was never written, so the timeline names a photo that is gone.

    const assembled = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);

    expect(assembled.missingPhotos).toEqual([PHOTO_PATH]);
    // The envelope does not paper over it either: validation notices that the
    // timeline refers to a photo the manifest does not have.
    expect(assembled.valid).toBe(false);
    expect(assembled.issues.map((issue) => issue.code)).toContain('photo_manifest_mismatch');
  });

  it('validates an envelope built from an empty kitchen', async () => {
    const assembled = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);

    expect(validateBackup(assembled.envelope).valid).toBe(true);
    expect(assembled.envelope.entities.cooks).toEqual([]);
    expect(device.files.size).toBe(0);
  });
});

describe('a backup owes nothing to the database key', () => {
  it('contains no key, no key alias and nothing that looks like key material', async () => {
    const store = memorySecureStore();
    const key = await createDatabaseKeyProvider(store, nodeRandomBytes).getOrCreateKey();
    await seedAKitchen();
    await photos.write(PHOTO_PATH, new Uint8Array([1, 2, 3, 4]));

    const assembled = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);
    const text = serialiseBackup(assembled.envelope);

    expect(text).not.toContain(key);
    expect(text).not.toContain(DATABASE_KEY_ALIAS);
    for (const word of ['encryption', 'sqlcipher', 'passphrase', 'secret', 'keychain']) {
      expect(text.toLowerCase()).not.toContain(word);
    }

    // A backup does contain 64-character hex strings, and it is supposed to:
    // they are the photo digests that make a restore verifiable. Every one of
    // them is accounted for, and once they are removed nothing key-shaped is
    // left anywhere in the file.
    const digests = assembled.envelope.photoManifest.map((entry) => entry.sha256);
    expect(digests).toHaveLength(1);
    const withoutDigests = digests.reduce(
      (remaining, digest) => remaining.split(digest).join('<photo digest>'),
      text,
    );
    expect(withoutDigests).not.toMatch(/[0-9a-f]{64}/);
  });

  it('is readable without the key, which is the only situation it exists for', async () => {
    await seedAKitchen();
    await photos.write(PHOTO_PATH, new Uint8Array([1, 2, 3, 4]));
    const assembled = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);

    // No key, no device, no store: just the text.
    const parsed = deserialiseBackup(serialiseBackup(assembled.envelope));

    expect(parsed.ok).toBe(true);
  });
});
