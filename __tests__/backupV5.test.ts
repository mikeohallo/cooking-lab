/**
 * Backup format version 5: Side and the cuisine go out with the notebook.
 *
 * Format 5 carries a fifth meal type and one new collection, `cookCuisines`.
 * The round trip goes out of a real database holding both, through the real
 * snapshot service, assembler and serialiser, and back, and is compared whole
 * with what the database holds.
 *
 * Then the version has to mean something: 1 to 4 are still read (as having
 * no cuisine), a format 4 file loads into a schema 5 notebook, an earlier
 * file that carries a cuisine or a side is refused as wrong about itself, a 5
 * without the collection is refused, and a bad row is a clear issue, never a
 * crash.
 *
 * The people are "You" and "Guest".
 */

import { assembleBackup } from '../src/data/backup/assemble';
import {
  BACKUP_FORMAT_VERSION,
  FIRST_CUISINE_FORMAT_VERSION,
  FORMAT_5_COLLECTIONS,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
  type BackupEnvelope,
} from '../src/data/backup/contract';
import { deserialiseBackup, serialiseBackup, validateBackup } from '../src/data/backup/validation';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { CookCuisine, CookMealType, DatabaseSnapshot } from '../src/domain/entities';
import type { EvidenceDecision } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { syntheticBackupEnvelope } from './fixtures/syntheticData';

const T0 = '2026-11-02T17:00:00.000Z';
const T1 = '2026-11-02T19:00:00.000Z';
const T2 = '2026-11-02T21:00:00.000Z';
const BAKE = 'synthetic-cook-sourdough-01';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('backup-v5.db');
});

afterEach(async () => {
  await db.close();
});

async function fillWithCuisines(): Promise<void> {
  const { capture, cookRecord, householdWorkflow } = db.data;
  granted(await householdWorkflow.add('You', { id: 'm-you' }, T0));
  granted(await capture.startCook({ id: 'cook-gyros', title: 'Gyros', startedAt: T0 }, 'user', T0));
  granted(await capture.startCook({ id: 'cook-chips', title: 'Chips', startedAt: T0 }, 'user', T0));
  granted(await capture.startCook({ id: 'cook-bread', title: 'Sourdough', startedAt: T0 }, 'user', T0));
  granted(await capture.startCook({ id: 'cook-plain', title: 'Rice', startedAt: T0 }, 'user', T0));
  granted(await cookRecord.setMealType('cook-gyros', 'lunch_dinner', 'user', T0));
  granted(await cookRecord.setMealType('cook-chips', 'side', 'user', T0));
  granted(await cookRecord.setCuisine('cook-gyros', 'greek', null, 'user', T0));
  granted(await cookRecord.setCuisine('cook-chips', 'american', null, 'user', T0));
  granted(await cookRecord.setCuisine('cook-bread', 'other', 'Home baking', 'user', T1));
  granted(await capture.saveReview('cook-gyros', 'Good.', 'user', T1));
  granted(await cookRecord.rate('cook-gyros', { memberId: 'm-you' }, { stars: 5, notEaten: false, line: null }, { id: 'r-you' }, 'user', T1));
  granted(await cookRecord.rate('cook-gyros', { guestName: 'Guest' }, { stars: 4, notEaten: false, line: null }, { id: 'r-guest' }, 'user', T1));
  granted(await cookRecord.cookAgain('cook-gyros', { id: 'cook-gyros-2', ingredientsId: 'ing-1' }, 'user', T2));
}

async function assemble(): Promise<BackupEnvelope> {
  const photos = createPrivateFileStore(memoryFileSystem(), nodeDigest);
  const assembly = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);
  expect(assembly.issues).toEqual([]);
  return assembly.envelope;
}

/** The synthetic file, with its entities changed. */
function withEntities(
  change: (entities: Record<string, unknown[]>) => void,
  formatVersion: number = BACKUP_FORMAT_VERSION,
): Record<string, unknown> {
  const envelope = syntheticBackupEnvelope();
  const entities = Object.fromEntries(
    Object.entries(envelope.entities).map(([key, rows]) => [key, [...(rows as unknown[])]]),
  ) as Record<string, unknown[]>;
  // Format 6's timers (0.5.0) are not in a file from before it.
  if (formatVersion < 6) {
    delete entities.timers;
  }
  change(entities);
  return { ...envelope, formatVersion, entities };
}

/** The synthetic file as format 4 wrote it: no cuisine collection, no side. */
function formatFourFile(): Record<string, unknown> {
  return withEntities((entities) => {
    delete entities.cookCuisines;
  }, 4);
}

function codes(candidate: unknown): readonly string[] {
  return validateBackup(candidate).issues.map((issue) => issue.code);
}

describe('the version this build writes', () => {
  it('is 6 now, carrying cuisines from 5, and it reads 1 to 6', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(6);
    expect(FIRST_CUISINE_FORMAT_VERSION).toBe(5);
    expect([...FORMAT_5_COLLECTIONS]).toEqual(['cookCuisines']);
    expect([...SUPPORTED_BACKUP_FORMAT_VERSIONS]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('a round trip with Side and cuisines in it', () => {
  it('carries every cuisine, Other’s words and a side, and comes back byte for byte', async () => {
    await fillWithCuisines();
    const snapshot = await db.data.snapshots.readSnapshot();

    expect(snapshot.cookCuisines).toHaveLength(4);
    expect(snapshot.cookCuisines.find((row) => row.cookId === 'cook-bread')).toEqual({
      cookId: 'cook-bread',
      cuisine: 'other',
      otherWords: 'Home baking',
      setAt: T1,
    });
    // Cook this again copied the earlier cook's cuisine.
    expect(snapshot.cookCuisines.find((row) => row.cookId === 'cook-gyros-2')).toMatchObject({ cuisine: 'greek' });
    expect(snapshot.cookMealTypes.find((row) => row.cookId === 'cook-chips')?.mealType).toBe('side');

    const text = serialiseBackup(await assemble());
    const parsed = deserialiseBackup(text);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.envelope.formatVersion).toBe(6);
    expect(parsed.envelope.schemaVersion).toBe(6);
    expect(parsed.envelope.entities).toEqual(snapshot);
    expect(serialiseBackup(parsed.envelope)).toBe(text);
  });

  it('carries the collection even when it is empty', async () => {
    granted(await db.data.capture.startCook({ id: 'cook-plain', title: 'Rice', startedAt: T0 }, 'user', T0));
    const text = serialiseBackup(await assemble());
    expect(text).toContain('"cookCuisines": []');
    expect(deserialiseBackup(text).ok).toBe(true);
  });

  it('validates the synthetic fixture, which carries a cuisine', () => {
    expect(syntheticBackupEnvelope().entities.cookCuisines).toHaveLength(1);
    expect(validateBackup(syntheticBackupEnvelope()).issues).toEqual([]);
  });
});

describe('reading earlier versions', () => {
  it('reads a format 4 file unchanged, as having no cuisine', () => {
    const file = formatFourFile();
    const parsed = deserialiseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.formatVersion).toBe(4);
      expect(parsed.envelope.entities.cookCuisines).toEqual([]);
      const given = file.entities as Partial<DatabaseSnapshot>;
      expect(parsed.envelope.entities.cookMealTypes).toEqual(given.cookMealTypes);
      expect(parsed.envelope.entities.ratings).toEqual(given.ratings);
    }
  });

  it('loads a format 4 file into a schema 5 notebook, row for row', async () => {
    const parsed = deserialiseBackup(JSON.stringify(formatFourFile()));
    if (!parsed.ok) {
      throw new Error('the format 4 file did not read');
    }
    const { entities } = parsed.envelope;
    // Restoring is not built yet; the rows a restore would write are written
    // here directly, into a notebook migrated to the latest schema.
    for (const row of entities.cooks) {
      await db.data.cooks.create(row);
    }
    for (const row of entities.cookMealTypes) {
      await db.data.mealTypes.set(row);
    }
    for (const row of entities.cookCuisines) {
      await db.data.cuisines.set(row);
    }
    expect(await db.data.mealTypes.listForCooks(entities.cooks.map((cook) => cook.id))).toEqual(entities.cookMealTypes);
    expect(await db.data.cuisines.listForCooks(entities.cooks.map((cook) => cook.id))).toEqual([]);
    expect(await db.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
  });

  it.each([1, 2, 3, 4])('refuses a format %i file that carries a cuisine, as wrong about itself', (version) => {
    const file = withEntities(() => undefined, version);
    expect(codes(file)).toContain('record_needs_a_later_format');
    expect(validateBackup(file).issues.some((issue) => issue.at === 'entities.cookCuisines')).toBe(true);
  });

  it('refuses a format 4 file that carries a side, as wrong about itself', () => {
    const file = withEntities((entities) => {
      delete entities.cookCuisines;
      entities.cookMealTypes = (entities.cookMealTypes ?? []).map((row) => ({ ...(row as CookMealType), mealType: 'side' }));
    }, 4);
    const issues = validateBackup(file).issues;
    expect(issues).toEqual([
      {
        at: 'entities.cookMealTypes[0].mealType',
        code: 'record_needs_a_later_format',
        message: 'the meal type side needs backup format 5 or later',
      },
    ]);
  });

  it('reads a format 4 file whose cuisine collection is there but empty', () => {
    const file = withEntities((entities) => {
      entities.cookCuisines = [];
    }, 4);
    expect(validateBackup(file).issues).toEqual([]);
  });

  it('refuses a format 5 file without the collection', () => {
    const file = withEntities((entities) => {
      delete entities.cookCuisines;
    });
    expect(codes(file)).toContain('missing_collection');
  });
});

describe('what format 5 checks', () => {
  const cuisines = (rows: readonly unknown[]) =>
    withEntities((entities) => {
      entities.cookCuisines = [...rows];
    });
  const row = (change: Partial<Record<keyof CookCuisine, unknown>>) => ({
    cookId: BAKE,
    cuisine: 'greek',
    otherWords: null,
    setAt: T0,
    ...change,
  });

  it('accepts a side, a named cuisine and an Other with its words', () => {
    const file = withEntities((entities) => {
      entities.cookMealTypes = [{ cookId: BAKE, mealType: 'side', setAt: T0 }];
      entities.cookCuisines = [row({ cuisine: 'other', otherWords: 'Home baking' })];
    });
    expect(validateBackup(file).issues).toEqual([]);
  });

  it('reports an unknown cuisine and an unknown meal type as issues, not a crash', () => {
    const file = withEntities((entities) => {
      entities.cookMealTypes = [{ cookId: BAKE, mealType: 'starter', setAt: T0 }];
      entities.cookCuisines = [row({ cuisine: 'british' })];
    });
    const issues = validateBackup(file).issues;
    expect(issues.map((issue) => [issue.at, issue.code])).toEqual([
      ['entities.cookMealTypes[0].mealType', 'invalid_record'],
      ['entities.cookCuisines[0].cuisine', 'invalid_record'],
    ]);
    expect(deserialiseBackup(JSON.stringify(file)).ok).toBe(false);
  });

  it('holds Other’s words to Other: present, trimmed and 1 to 40 characters', () => {
    const at = (rows: readonly unknown[]) => validateBackup(cuisines(rows)).issues.map((issue) => issue.at);
    expect(at([row({ cuisine: 'other', otherWords: null })])).toEqual(['entities.cookCuisines[0].otherWords']);
    expect(at([row({ cuisine: 'other', otherWords: '   ' })])).toEqual(['entities.cookCuisines[0].otherWords']);
    expect(at([row({ cuisine: 'other', otherWords: ' Home baking' })])).toEqual(['entities.cookCuisines[0].otherWords']);
    expect(at([row({ cuisine: 'other', otherWords: 'x'.repeat(41) })])).toEqual(['entities.cookCuisines[0].otherWords']);
    expect(at([row({ cuisine: 'other', otherWords: 7 })])).toEqual(['entities.cookCuisines[0].otherWords']);
    expect(at([row({ cuisine: 'greek', otherWords: 'Island' })])).toEqual(['entities.cookCuisines[0].otherWords']);
    expect(at([row({ cuisine: 'other', otherWords: 'x'.repeat(40) })])).toEqual([]);
  });

  it('catches a cuisine for a cook that is not in the file, and two cuisines on one cook', () => {
    const dangling = validateBackup(cuisines([row({ cookId: 'synthetic-cook-nowhere' })])).issues;
    expect(dangling).toEqual([
      {
        at: 'entities.cookCuisines[0].cookId',
        code: 'dangling_reference',
        message: 'cook synthetic-cook-nowhere is not in this backup',
      },
    ]);
    const twice = validateBackup(cuisines([row({}), row({ cuisine: 'thai' })])).issues;
    expect(twice.map((issue) => issue.code)).toEqual(['duplicate_key']);
  });

  it('reports a row that is not an object, or a collection that is not a list, without throwing', () => {
    expect(codes(cuisines(['greek', null]))).toEqual(['invalid_record', 'invalid_record']);
    const notAList = withEntities((entities) => {
      (entities as Record<string, unknown>).cookCuisines = { greek: true };
    });
    expect(() => validateBackup(notAList)).not.toThrow();
    expect(codes(notAList)).toContain('missing_collection');
  });
});
