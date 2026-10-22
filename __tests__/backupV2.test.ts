/**
 * Backup format version 2: the round trip, and reading what came before.
 *
 * The round trip is the only question worth asking of a backup format: if a
 * kitchen's whole notebook goes out through the file and comes back, is it the
 * same notebook? Here it goes out of a real database — through the real
 * snapshot service, the real assembler and the real serialiser — and comes back
 * as records, which are then compared with what the database actually holds.
 *
 * The rest of the file is about the version number meaning something. This
 * build writes 2 and reads 1 and 2, because every backup the kitchen already
 * has is a version 1 file; and a file that calls itself version 1 while
 * carrying a version 2 record is refused, because a version that is not checked
 * is a version that is decorative.
 */

import { assembleBackup } from '../src/data/backup/assemble';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  FIRST_UNTYPED_TAG_FORMAT_VERSION,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
} from '../src/data/backup/contract';
import {
  deserialiseBackup,
  serialiseBackup,
  validateBackup,
} from '../src/data/backup/validation';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { buildPhotoLogicalPath } from '../src/data/photos/photoPaths';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { PrivateFileStore } from '../src/data/adapters';
import type { BackupEnvelope } from '../src/data/backup/contract';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { sageSquareJpeg } from './fixtures/photoBytes';
import { syntheticBackupEnvelope } from './fixtures/syntheticData';

const AT = '2026-10-20T18:00:00.000Z';
const COOK = 'cook-roast';

let db: TestDatabase;
let photos: PrivateFileStore;

beforeEach(async () => {
  db = await openTestDatabase('backup-v2.db');
  photos = createPrivateFileStore(memoryFileSystem(), nodeDigest);
});

afterEach(async () => {
  await db.close();
});

/**
 * A notebook with one of everything slice 3 added.
 *
 * Built through the real services and repositories, so what goes into the
 * backup is what the app would really have written.
 */
async function fillNotebook(): Promise<string> {
  const { data } = db;
  await data.capture.startCook({ id: COOK, title: 'Sunday roast', startedAt: AT }, 'user', AT);

  await data.capture.addEvent(
    { id: 'event-note', cookId: COOK, ts: AT, kind: 'user_note', body: 'Lid off at the end.' },
    'user',
  );
  // One reading of each kind, and one that does not say — the three shapes a
  // reading can have.
  await data.capture.addEvent(
    { id: 'event-oven', cookId: COOK, ts: AT, kind: 'temp', meta: { celsius: 230, readingKind: 'oven' } },
    'user',
  );
  await data.capture.addEvent(
    {
      id: 'event-internal',
      cookId: COOK,
      ts: AT,
      kind: 'temp',
      meta: { celsius: 62.5, readingKind: 'internal' },
    },
    'user',
  );
  await data.capture.addEvent(
    { id: 'event-old', cookId: COOK, ts: AT, kind: 'temp', meta: { celsius: 96, where: 'centre' } },
    'user',
  );

  const built = buildPhotoLogicalPath({
    cookId: COOK,
    cookEventId: 'event-photo',
    capturedAt: AT,
    sequence: 0,
    extension: 'jpg',
  });
  if (!built.ok) {
    throw new Error('the fixture photo has nowhere to go');
  }
  await photos.write(built.path, sageSquareJpeg());
  await data.capture.addEvent(
    { id: 'event-photo', cookId: COOK, ts: AT, kind: 'photo', photoPath: built.path },
    'user',
  );

  // Tags with no kind, one of them two words.
  for (const name of ['sunday roast', 'brown butter']) {
    const tag = await data.tags.findOrCreate(name, null);
    await data.cookTags.link({ cookId: COOK, tagId: tag.id });
  }
  // And one with a kind, as a version 1 notebook would hold.
  const kinded = await data.tags.findOrCreate('beef', 'ingredient');
  await data.cookTags.link({ cookId: COOK, tagId: kinded.id });

  await data.capture.saveReview(COOK, '  Rested too long.\nStill good.  ', 'user', AT);

  return built.path;
}

async function assemble(): Promise<BackupEnvelope> {
  const assembly = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, AT);

  expect(assembly.issues).toEqual([]);
  expect(assembly.valid).toBe(true);
  expect(assembly.missingPhotos).toEqual([]);
  return assembly.envelope;
}

describe('the version this build writes', () => {
  it('is 2, and it reads 1 and 2', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(2);
    expect([...SUPPORTED_BACKUP_FORMAT_VERSIONS]).toEqual([1, 2]);
  });

  it('stamps the format, the envelope version and the schema version', async () => {
    await fillNotebook();
    const envelope = await assemble();

    expect(envelope.format).toBe(BACKUP_FORMAT);
    expect(envelope.formatVersion).toBe(2);
    expect(envelope.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(envelope.schemaVersion).toBe(2);
  });
});

describe('a round trip through the file', () => {
  it('brings back every record exactly as the database holds it', async () => {
    await fillNotebook();
    const snapshot = await db.data.snapshots.readSnapshot();

    const parsed = deserialiseBackup(serialiseBackup(await assemble()));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    // Every table, compared whole against what is actually on disk.
    expect(parsed.envelope.entities).toEqual(snapshot);
  });

  it('brings back a tag with no kind as a tag with no kind', async () => {
    await fillNotebook();

    const parsed = deserialiseBackup(serialiseBackup(await assemble()));
    if (!parsed.ok) {
      throw new Error('expected the backup to be readable');
    }

    const tags = [...parsed.envelope.entities.tags].sort((left, right) =>
      left.name < right.name ? -1 : 1,
    );
    expect(tags.map((tag) => [tag.name, tag.kind])).toEqual([
      ['beef', 'ingredient'],
      ['brown butter', null],
      ['sunday roast', null],
    ]);
  });

  it('brings back what each reading was taken of', async () => {
    await fillNotebook();

    const parsed = deserialiseBackup(serialiseBackup(await assemble()));
    if (!parsed.ok) {
      throw new Error('expected the backup to be readable');
    }

    const meta = (id: string) =>
      parsed.envelope.entities.cookEvents.find((event) => event.id === id)?.meta;

    expect(meta('event-oven')).toEqual({ celsius: 230, readingKind: 'oven' });
    expect(meta('event-internal')).toEqual({ celsius: 62.5, readingKind: 'internal' });
    // And the one that does not say comes back saying nothing, with no key
    // invented for it.
    expect(meta('event-old')).toEqual({ celsius: 96, where: 'centre' });
  });

  it('carries the photograph in the manifest, with its real digest', async () => {
    const path = await fillNotebook();
    const stored = await photos.info(path);

    const parsed = deserialiseBackup(serialiseBackup(await assemble()));
    if (!parsed.ok) {
      throw new Error('expected the backup to be readable');
    }

    expect(parsed.envelope.photoManifest).toHaveLength(1);
    const entry = parsed.envelope.photoManifest[0]!;
    expect(entry.logicalPath).toBe(path);
    expect(entry.cookId).toBe(COOK);
    expect(entry.cookEventId).toBe('event-photo');
    // The digest is read off the real bytes, not fabricated.
    expect(entry.sha256).toBe(stored?.sha256);
    expect(entry.byteLength).toBe(stored?.byteLength);
  });

  it('keeps the verdict exactly as it was typed', async () => {
    await fillNotebook();

    const parsed = deserialiseBackup(serialiseBackup(await assemble()));
    if (!parsed.ok) {
      throw new Error('expected the backup to be readable');
    }

    expect(parsed.envelope.entities.cooks[0]?.verdict).toBe('  Rested too long.\nStill good.  ');
  });

  it('writes the same bytes twice for the same notebook', async () => {
    await fillNotebook();

    const once = serialiseBackup(await assemble());
    const twice = serialiseBackup(await assemble());

    expect(once).toBe(twice);
  });

  it('reports a photograph the timeline names but the phone has lost', async () => {
    const path = await fillNotebook();
    await photos.delete(path);

    const assembly = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, AT);

    // Reported, never quietly dropped: a backup that silently omitted it would
    // validate and restore a cook whose picture is gone, with nothing to say so.
    expect(assembly.missingPhotos).toEqual([path]);
    expect(assembly.valid).toBe(false);
    expect(assembly.issues.map((issue) => issue.code)).toContain('photo_manifest_mismatch');
  });
});

describe('reading a version 1 backup', () => {
  /** The fixture envelope, relabelled as the version 1 file it would have been. */
  function asVersionOne(): unknown {
    const envelope = syntheticBackupEnvelope();
    return {
      ...envelope,
      formatVersion: 1,
      schemaVersion: 1,
      entities: {
        ...envelope.entities,
        // A version 1 file could only hold tags that have a kind.
        tags: envelope.entities.tags.filter((tag) => tag.kind !== null),
        cookTags: envelope.entities.cookTags.filter((link) =>
          envelope.entities.tags.some((tag) => tag.id === link.tagId && tag.kind !== null),
        ),
      },
    };
  }

  it('accepts one, because every backup the kitchen already has is one', () => {
    const validation = validateBackup(asVersionOne());

    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('reads it back to records', () => {
    const parsed = deserialiseBackup(JSON.stringify(asVersionOne()));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.formatVersion).toBe(1);
      expect(parsed.envelope.entities.cooks.length).toBeGreaterThan(0);
      for (const tag of parsed.envelope.entities.tags) {
        expect(tag.kind).not.toBeNull();
      }
    }
  });

  it('refuses one that carries a record it could not have held', () => {
    // A file that says it is version 1 and contains an untyped tag is wrong
    // about itself. Saying so is the whole point of carrying a version.
    const envelope = syntheticBackupEnvelope();
    const lying = { ...envelope, formatVersion: 1 };

    const validation = validateBackup(lying);

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('record_needs_a_later_format');
    expect(FIRST_UNTYPED_TAG_FORMAT_VERSION).toBe(2);
  });

  it('accepts the same records under version 2', () => {
    expect(validateBackup(syntheticBackupEnvelope()).valid).toBe(true);
  });

  it('refuses a version this build has never heard of', () => {
    const future = { ...syntheticBackupEnvelope(), formatVersion: 99 };

    const validation = validateBackup(future);

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('unsupported_format_version');
  });
});

describe('tag uniqueness, as the file carries it', () => {
  it('refuses two untyped tags of the same name', () => {
    const envelope = syntheticBackupEnvelope();
    const first = envelope.entities.tags.find((tag) => tag.kind === null)!;
    const duplicated = {
      ...envelope,
      entities: {
        ...envelope.entities,
        tags: [...envelope.entities.tags, { ...first, id: 'synthetic-tag-again' }],
      },
    };

    const validation = validateBackup(duplicated);

    expect(validation.issues.map((issue) => issue.code)).toContain('duplicate_key');
  });

  it('still allows the same word in two namespaces', () => {
    const envelope = syntheticBackupEnvelope();
    const widened = {
      ...envelope,
      entities: {
        ...envelope.entities,
        tags: [
          ...envelope.entities.tags,
          { id: 'synthetic-tag-butter-ing', name: 'butter', kind: 'ingredient' as const },
          { id: 'synthetic-tag-butter-tech', name: 'butter', kind: 'technique' as const },
          { id: 'synthetic-tag-butter-free', name: 'butter', kind: null },
        ],
      },
    };

    expect(validateBackup(widened).valid).toBe(true);
  });
});
