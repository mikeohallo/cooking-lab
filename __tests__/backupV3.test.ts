/**
 * Backup format version 3: every edit goes out with the notebook (0.2.2).
 *
 * Version 3 adds one collection, `entities.revisions`. The round trip here
 * goes out of a real database holding edited notes and an edited verdict —
 * through the real snapshot service, assembler and serialiser — and back, and
 * is compared whole with what the database holds: originals untouched, every
 * revision present.
 *
 * Then the version has to mean something: 1 and 2 are still read (as having no
 * edits), 3 is validated, a 1 or 2 that carries an edit is refused, a 3 without
 * the collection is refused, and an edit that points at nothing is refused.
 */

import { assembleBackup } from '../src/data/backup/assemble';
import {
  BACKUP_FORMAT_VERSION,
  FIRST_REVISIONS_FORMAT_VERSION,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
  type BackupEnvelope,
} from '../src/data/backup/contract';
import { deserialiseBackup, serialiseBackup, validateBackup } from '../src/data/backup/validation';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { EvidenceDecision } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { syntheticBackupEnvelope } from './fixtures/syntheticData';

const AT = '2026-10-29T18:00:00.000Z';
const LATER = '2026-10-29T21:00:00.000Z';
const LATEST = '2026-10-30T08:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('backup-v3.db');
});

afterEach(async () => {
  await db.close();
});

async function fillWithEdits(): Promise<void> {
  const { capture } = db.data;
  granted(await capture.startCook({ id: 'cook-pork', title: 'Pork chops', startedAt: AT }, 'user', AT));
  granted(
    await capture.addEvent(
      { id: 'event-note', cookId: 'cook-pork', ts: AT, kind: 'user_note', body: 'Salted at 8.' },
      'user',
    ),
  );
  granted(await capture.saveReview('cook-pork', 'Good.', 'user', AT));
  granted(await capture.reviseNote('event-note', 'Salted at 7.', { id: 'rev-note-1' }, 'user', LATER));
  granted(await capture.reviseNote('event-note', 'Salted at 7:30.', { id: 'rev-note-2' }, 'user', LATEST));
  granted(await capture.reviseVerdict('cook-pork', 'Good. More acid.', { id: 'rev-verdict-1' }, 'user', LATER));
}

async function assemble(): Promise<BackupEnvelope> {
  const photos = createPrivateFileStore(memoryFileSystem(), nodeDigest);
  const assembly = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, LATEST);
  expect(assembly.issues).toEqual([]);
  return assembly.envelope;
}

describe('the version this build writes', () => {
  it('is 3, and it reads 1, 2 and 3', () => {
    expect(BACKUP_FORMAT_VERSION).toBe(3);
    expect(FIRST_REVISIONS_FORMAT_VERSION).toBe(3);
    expect([...SUPPORTED_BACKUP_FORMAT_VERSIONS]).toEqual([1, 2, 3]);
  });
});

describe('a round trip with edits in it', () => {
  it('carries every revision, and every original exactly as first written', async () => {
    await fillWithEdits();
    const snapshot = await db.data.snapshots.readSnapshot();

    const text = serialiseBackup(await assemble());
    const parsed = deserialiseBackup(text);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.envelope.formatVersion).toBe(3);
    expect(parsed.envelope.entities).toEqual(snapshot);

    const { entities } = parsed.envelope;
    expect(entities.cookEvents.find((event) => event.id === 'event-note')?.body).toBe('Salted at 8.');
    expect(entities.cooks.find((cook) => cook.id === 'cook-pork')?.verdict).toBe('Good.');
    expect(
      [...entities.revisions]
        .sort((left, right) => (left.id < right.id ? -1 : 1))
        .map((revision) => [revision.id, revision.text, revision.revisedAt]),
    ).toEqual([
      ['rev-note-1', 'Salted at 7.', LATER],
      ['rev-note-2', 'Salted at 7:30.', LATEST],
      ['rev-verdict-1', 'Good. More acid.', LATER],
    ]);
  });

  it('serialises the same notebook to the same bytes twice', async () => {
    await fillWithEdits();
    expect(serialiseBackup(await assemble())).toBe(serialiseBackup(await assemble()));
  });
});

describe('reading versions 1 and 2', () => {
  function asVersion(version: 1 | 2): Record<string, unknown> {
    const envelope = syntheticBackupEnvelope();
    const { revisions: _none, ...withoutEdits } = envelope.entities;
    return {
      ...envelope,
      formatVersion: version,
      schemaVersion: version,
      entities: {
        ...withoutEdits,
        // A version 1 file could only hold tags that have a kind.
        tags:
          version === 1
            ? envelope.entities.tags.filter((tag) => tag.kind !== null)
            : envelope.entities.tags,
        cookTags:
          version === 1
            ? envelope.entities.cookTags.filter((link) =>
                envelope.entities.tags.some((tag) => tag.id === link.tagId && tag.kind !== null),
              )
            : envelope.entities.cookTags,
      },
    };
  }

  it.each([1, 2] as const)('reads a version %i file, which has no edits, as having none', (version) => {
    const file = asVersion(version);
    expect(validateBackup(file).issues).toEqual([]);

    const parsed = deserialiseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.formatVersion).toBe(version);
      expect(parsed.envelope.entities.revisions).toEqual([]);
    }
  });

  it.each([1, 2] as const)('refuses a version %i file that carries an edit', (version) => {
    const file = asVersion(version);
    const lying = {
      ...file,
      entities: { ...(file.entities as object), revisions: syntheticBackupEnvelope().entities.revisions },
    };
    const issues = validateBackup(lying).issues;
    expect(issues.some((issue) => issue.code === 'record_needs_a_later_format')).toBe(true);
  });
});

describe('validating version 3', () => {
  it('accepts the synthetic notebook, edits and all', () => {
    const envelope = syntheticBackupEnvelope();
    expect(envelope.entities.revisions.length).toBeGreaterThan(0);
    expect(validateBackup(envelope).issues).toEqual([]);
  });

  it('refuses a version 3 file with no edits collection at all', () => {
    const envelope = syntheticBackupEnvelope();
    const { revisions: _gone, ...withoutEdits } = envelope.entities;
    const issues = validateBackup({ ...envelope, entities: withoutEdits }).issues;
    expect(issues).toEqual([
      expect.objectContaining({ at: 'entities.revisions', code: 'missing_collection' }),
    ]);
  });

  it('refuses an edit of a note that is not in the file, or that is not a note', () => {
    const envelope = syntheticBackupEnvelope();
    const [first] = envelope.entities.revisions;
    if (first === undefined) {
      throw new Error('the fixture should hold an edit');
    }
    const dangling = {
      ...envelope,
      entities: { ...envelope.entities, revisions: [{ ...first, cookEventId: 'synthetic-nowhere' }] },
    };
    expect(validateBackup(dangling).issues.map((issue) => issue.code)).toContain('dangling_reference');

    const notANote = {
      ...envelope,
      entities: {
        ...envelope.entities,
        revisions: [{ ...first, cookEventId: 'synthetic-event-oven-temp' }],
      },
    };
    expect(validateBackup(notANote).issues.map((issue) => issue.code)).toContain('invalid_record');
  });

  it('refuses an edit with no words, or a verdict edit that names an entry', () => {
    const envelope = syntheticBackupEnvelope();
    const [first] = envelope.entities.revisions;
    if (first === undefined) {
      throw new Error('the fixture should hold an edit');
    }
    const blank = {
      ...envelope,
      entities: { ...envelope.entities, revisions: [{ ...first, text: '  ' }] },
    };
    expect(validateBackup(blank).valid).toBe(false);

    const misfiled = {
      ...envelope,
      entities: { ...envelope.entities, revisions: [{ ...first, field: 'verdict' }] },
    };
    expect(validateBackup(misfiled).valid).toBe(false);
  });
});
