/**
 * Backup format version 4: update 2 goes out with the notebook (0.3.0).
 *
 * Version 4 adds five collections — meal types, ingredient versions, the
 * household, ratings and next-time edits. The round trip goes out of a real
 * database holding all of them, through the real snapshot service, assembler
 * and serialiser, and back, and is compared whole with what the database
 * holds.
 *
 * Then the version has to mean something: 1, 2 and 3 are still read (as
 * having none of it), 4 is validated, an earlier file that carries any of it
 * is refused, a 4 without the collections is refused, and a reference to
 * nothing is refused.
 */

import { assembleBackup } from '../src/data/backup/assemble';
import {
  BACKUP_FORMAT_VERSION,
  FIRST_UPDATE_2_FORMAT_VERSION,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
  UPDATE_2_COLLECTIONS,
  type BackupEnvelope,
} from '../src/data/backup/contract';
import { deserialiseBackup, serialiseBackup, validateBackup } from '../src/data/backup/validation';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { EvidenceDecision } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { syntheticBackupEnvelope } from './fixtures/syntheticData';

const T0 = '2026-10-30T17:00:00.000Z';
const T1 = '2026-10-30T19:00:00.000Z';
const T2 = '2026-10-30T21:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('backup-v4.db');
});

afterEach(async () => {
  await db.close();
});

async function fillWithUpdate2(): Promise<void> {
  const { capture, cookRecord, householdWorkflow } = db.data;
  granted(await householdWorkflow.add('Alex', { id: 'm-alex' }, T0));
  granted(await householdWorkflow.add('Sam', { id: 'm-sam' }, T0));
  granted(await householdWorkflow.add('Jo', { id: 'm-jo' }, T0));
  granted(await householdWorkflow.retire('m-jo', T1));
  granted(await capture.startCook({ id: 'cook-dal', title: 'Dal', startedAt: T0 }, 'user', T0));
  granted(await cookRecord.setMealType('cook-dal', 'lunch_dinner', 'user', T0));
  granted(await cookRecord.saveIngredients('cook-dal', '200 g red lentils\n1 onion', { id: 'ing-1' }, 'user', T0));
  granted(await cookRecord.saveIngredients('cook-dal', '250 g red lentils\n1 onion\nginger', { id: 'ing-2' }, 'user', T1));
  granted(await capture.saveReview('cook-dal', '  Good.\nThicker next time.  ', 'user', T1));
  granted(await cookRecord.rate('cook-dal', { memberId: 'm-alex' }, { stars: 4, notEaten: false, line: 'Lovely.' }, { id: 'r-alex' }, 'user', T1));
  granted(await cookRecord.rate('cook-dal', { memberId: 'm-sam' }, { stars: null, notEaten: true, line: null }, { id: 'r-sam' }, 'user', T1));
  granted(await cookRecord.rate('cook-dal', { guestName: 'A neighbour' }, { stars: 5, notEaten: false, line: null }, { id: 'r-guest' }, 'user', T1));
  granted(await cookRecord.addNextTime('cook-dal', 'Less water.', { id: 'lesson-1' }, 'user', T1));
  granted(await cookRecord.reviseNextTime('lesson-1', 'Much less water.', { id: 'lr-1' }, 'user', T2));
  granted(await cookRecord.cookAgain('cook-dal', { id: 'cook-dal-2', ingredientsId: 'ing-3' }, 'user', T2));
}

async function assemble(): Promise<BackupEnvelope> {
  const photos = createPrivateFileStore(memoryFileSystem(), nodeDigest);
  const assembly = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, T2);
  expect(assembly.issues).toEqual([]);
  return assembly.envelope;
}

describe('the version this build writes', () => {
  it('is 4, and it reads 1, 2, 3 and 4', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(4);
    expect(FIRST_UPDATE_2_FORMAT_VERSION).toBe(4);
    expect([...SUPPORTED_BACKUP_FORMAT_VERSIONS]).toEqual([1, 2, 3, 4]);
  });
});

describe('a round trip with update 2 in it', () => {
  it('carries every meal type, ingredient version, person, rating and next-time edit', async () => {
    await fillWithUpdate2();
    const snapshot = await db.data.snapshots.readSnapshot();

    expect(snapshot.cookMealTypes).toHaveLength(2);
    expect(snapshot.ingredientVersions).toHaveLength(3);
    expect(snapshot.householdMembers).toHaveLength(3);
    expect(snapshot.ratings).toHaveLength(3);
    expect(snapshot.lessonRevisions).toHaveLength(1);

    const text = serialiseBackup(await assemble());
    const parsed = deserialiseBackup(text);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.envelope.formatVersion).toBe(4);
    expect(parsed.envelope.schemaVersion).toBe(4);
    expect(parsed.envelope.entities).toEqual(snapshot);
    // N/A comes back as N/A, not as a number; the retired person is still there.
    expect(parsed.envelope.entities.ratings.find((r) => r.id === 'r-sam')).toMatchObject({ stars: null, notEaten: true });
    expect(parsed.envelope.entities.householdMembers.find((m) => m.id === 'm-jo')?.retiredAt).toBe(T1);
    // And the same data serialises to the same bytes.
    expect(serialiseBackup(parsed.envelope)).toBe(text);
  });

  it('validates the synthetic fixture, which carries all five collections', () => {
    expect(validateBackup(syntheticBackupEnvelope()).issues).toEqual([]);
  });
});

/** An earlier version of the synthetic file: the newer collections taken out. */
function olderFile(version: number): Record<string, unknown> {
  const envelope = syntheticBackupEnvelope();
  const entities: Record<string, unknown> = { ...envelope.entities };
  for (const key of UPDATE_2_COLLECTIONS) {
    delete entities[key];
  }
  if (version < 3) {
    delete entities.revisions;
  }
  if (version < 2) {
    entities.tags = envelope.entities.tags.filter((tag) => tag.kind !== null);
    entities.cookTags = envelope.entities.cookTags.filter((link) =>
      envelope.entities.tags.some((tag) => tag.id === link.tagId && tag.kind !== null),
    );
  }
  return { ...envelope, formatVersion: version, entities };
}

describe('reading earlier versions', () => {
  it.each([1, 2, 3])('reads a version %i file as having none of update 2', (version) => {
    const parsed = deserialiseBackup(JSON.stringify(olderFile(version)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      for (const key of UPDATE_2_COLLECTIONS) {
        expect(parsed.envelope.entities[key]).toEqual([]);
      }
    }
  });

  it('refuses a version 3 file that carries a rating, as wrong about itself', () => {
    const file = olderFile(3);
    const synthetic = syntheticBackupEnvelope().entities;
    const entities = { ...(file.entities as Record<string, unknown>), ratings: synthetic.ratings, householdMembers: synthetic.householdMembers };
    const validation = validateBackup({ ...file, entities });
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('record_needs_a_later_format');
  });

  it('refuses a version 4 file without the collections', () => {
    const file = olderFile(3);
    const validation = validateBackup({ ...file, formatVersion: 4 });
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain('missing_collection');
  });
});

describe('what version 4 checks', () => {
  const withEntities = (change: (entities: Record<string, unknown[]>) => void) => {
    const envelope = syntheticBackupEnvelope();
    const entities = Object.fromEntries(
      Object.entries(envelope.entities).map(([key, rows]) => [key, [...(rows as unknown[])]]),
    ) as Record<string, unknown[]>;
    change(entities);
    return validateBackup({ ...envelope, entities });
  };

  it('refuses a rating from a person who is not in the file', () => {
    const result = withEntities((entities) => {
      entities.householdMembers = (entities.householdMembers ?? []).filter(
        (member) => (member as { id: string }).id !== 'synthetic-member-alex',
      );
    });
    expect(result.issues.map((issue) => issue.code)).toContain('dangling_reference');
  });

  it('refuses stars on someone who did not eat it, and stars out of range', () => {
    const result = withEntities((entities) => {
      entities.ratings = (entities.ratings ?? []).map((rating) => {
        const row = rating as { id: string };
        if (row.id === 'synthetic-rating-sam') {
          return { ...row, stars: 3 };
        }
        if (row.id === 'synthetic-rating-alex') {
          return { ...row, stars: 7 };
        }
        return row;
      });
    });
    expect(result.valid).toBe(false);
    expect(result.issues.filter((issue) => issue.code === 'invalid_record').length).toBeGreaterThanOrEqual(2);
  });

  it('refuses two ratings by one person on one cook, and two meal types on one cook', () => {
    const result = withEntities((entities) => {
      const first = (entities.ratings ?? [])[0] as Record<string, unknown>;
      entities.ratings = [...(entities.ratings ?? []), { ...first, id: 'synthetic-rating-again' }];
      const meal = (entities.cookMealTypes ?? [])[0] as Record<string, unknown>;
      entities.cookMealTypes = [...(entities.cookMealTypes ?? []), { ...meal, mealType: 'snack' }];
    });
    expect(result.issues.filter((issue) => issue.code === 'duplicate_key').length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a next-time edit of a line that is not there, or on another cook', () => {
    const result = withEntities((entities) => {
      entities.lessonRevisions = [
        ...(entities.lessonRevisions ?? []),
        {
          id: 'synthetic-lesson-revision-2',
          lessonId: 'synthetic-lesson-nowhere',
          cookId: 'synthetic-cook-sourdough-01',
          text: 'x',
          revisedAt: '2026-08-16T09:00:00.000Z',
        },
        {
          id: 'synthetic-lesson-revision-3',
          lessonId: 'synthetic-lesson-approved',
          cookId: 'synthetic-cook-imported-00',
          text: 'x',
          revisedAt: '2026-08-16T09:00:00.000Z',
        },
      ];
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('dangling_reference');
    expect(codes).toContain('invalid_record');
  });

  it('refuses ingredients for a cook that is not there, and blank ingredients', () => {
    const result = withEntities((entities) => {
      entities.ingredientVersions = [
        ...(entities.ingredientVersions ?? []),
        { id: 'synthetic-ingredients-9', cookId: 'synthetic-cook-nowhere', text: 'eggs', savedAt: '2026-08-14T14:55:00.000Z' },
        { id: 'synthetic-ingredients-10', cookId: 'synthetic-cook-sourdough-01', text: '  ', savedAt: '2026-08-14T14:55:00.000Z' },
      ];
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('dangling_reference');
    expect(codes).toContain('invalid_record');
  });

  it('refuses two people who eat here now with one name', () => {
    const result = withEntities((entities) => {
      entities.householdMembers = [
        ...(entities.householdMembers ?? []),
        { id: 'synthetic-member-alex-2', name: 'alex', position: 5, retiredAt: null, createdAt: '2026-08-01T10:00:00.000Z' },
      ];
    });
    expect(result.issues.map((issue) => issue.code)).toContain('duplicate_key');
  });
});
