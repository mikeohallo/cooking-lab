import type { BackupEnvelope } from '../src/data/backup/contract';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '../src/data/backup/contract';
import {
  buildBackupEnvelope,
  canonicaliseBackup,
  deserialiseBackup,
  serialiseBackup,
  validateBackup,
} from '../src/data/backup/validation';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import { emptySnapshot } from '../src/domain/entities';
import {
  SYNTHETIC_PHOTO_PATH,
  SYNTHETIC_VERDICT,
  syntheticBackupEnvelope,
  syntheticPhotoManifest,
  syntheticSnapshot,
} from './fixtures/syntheticData';

const codesFrom = (validation: ReturnType<typeof validateBackup>): readonly string[] =>
  validation.issues.map((issue) => issue.code);

describe('a well-formed backup', () => {
  it('validates', () => {
    const validation = validateBackup(syntheticBackupEnvelope());

    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('carries both versions, which mean different things', () => {
    const envelope = syntheticBackupEnvelope();

    expect(envelope.format).toBe(BACKUP_FORMAT);
    expect(envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(envelope.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
  });

  it('covers every entity, every relationship and the photo manifest', () => {
    const envelope = syntheticBackupEnvelope();

    for (const key of Object.keys(emptySnapshot())) {
      expect(envelope.entities).toHaveProperty(key);
    }
    expect(envelope.entities.findingSources.length).toBeGreaterThan(0);
    expect(envelope.entities.briefingSources.length).toBeGreaterThan(0);
    expect(envelope.entities.cookTags.length).toBeGreaterThan(0);
    expect(envelope.photoManifest).toHaveLength(1);
  });

  it('accepts an empty database', () => {
    const empty = buildBackupEnvelope(emptySnapshot(), [], LATEST_SCHEMA_VERSION, '2026-09-05T18:00:00.000Z');

    expect(validateBackup(empty).valid).toBe(true);
  });
});

describe('the backup carries the corrected model', () => {
  const envelope = syntheticBackupEnvelope();

  it('serialises a cook with the controlled columns and no rejected ones', () => {
    const cook = envelope.entities.cooks.find((entry) => entry.status === 'reviewed');

    expect(Object.keys(cook ?? {}).sort()).toEqual([
      'createdAt',
      'id',
      'parentCookId',
      'provenance',
      'reviewOpenedAt',
      'reviewSavedAt',
      'startedAt',
      'status',
      'title',
      'verdict',
    ]);
  });

  it('links a finding to timeline entries only', () => {
    for (const source of envelope.entities.findingSources) {
      expect(Object.keys(source).sort()).toEqual(['cookEventId', 'findingId']);
      expect(
        envelope.entities.cookEvents.some((event) => event.id === source.cookEventId),
      ).toBe(true);
    }
  });

  it('links a briefing to cooks only', () => {
    expect(envelope.entities.briefingSources.length).toBeGreaterThan(0);
    for (const source of envelope.entities.briefingSources) {
      expect(Object.keys(source).sort()).toEqual(['briefingId', 'cookId']);
      expect(envelope.entities.cooks.some((cook) => cook.id === source.cookId)).toBe(true);
    }
  });

  it('keeps a briefing answer nullable and free of any lifecycle', () => {
    const answers = envelope.entities.briefings.map((briefing) => briefing.useful);

    expect(answers).toContain(null);
    expect(answers).toContain(true);
    for (const briefing of envelope.entities.briefings) {
      expect(Object.keys(briefing).sort()).toEqual([
        'content',
        'cookId',
        'createdAt',
        'id',
        'useful',
      ]);
    }
  });

  it('carries the verdict through text unchanged, whitespace and all', () => {
    const parsed = deserialiseBackup(serialiseBackup(envelope));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const restored = parsed.envelope.entities.cooks.find(
        (cook) => cook.verdict !== null && cook.verdict.includes('pale base'),
      );

      expect(restored?.verdict).toBe(SYNTHETIC_VERDICT);
    }
  });

  it('carries a finding’s class, reasoning and confidence through text', () => {
    const parsed = deserialiseBackup(serialiseBackup(envelope));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const inference = parsed.envelope.entities.findings.find(
        (finding) => finding.class === 'inference',
      );

      expect(inference?.confidence).toBe('medium');
      expect(inference?.rationale).not.toBeNull();
      expect(inference?.createdBy).toBe('ai');
      expect(inference?.provenance).toBe('live');
    }
  });

  it('keeps a rejected proposal in the backup', () => {
    const rejected = envelope.entities.findings.filter(
      (finding) => finding.status === 'rejected',
    );

    expect(rejected.length).toBeGreaterThan(0);
  });

  it('carries structured meta and content as structure, not as text', () => {
    const parsed = deserialiseBackup(serialiseBackup(envelope));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const temp = parsed.envelope.entities.cookEvents.find((event) => event.kind === 'temp');

      expect(temp?.meta).toEqual({ celsius: 245 });
      expect(parsed.envelope.entities.briefings[0]?.content).toEqual(
        envelope.entities.briefings[0]?.content,
      );
    }
  });

  it('contains nothing to do with the database key', () => {
    const text = serialiseBackup(envelope).toLowerCase();

    for (const secret of ['encryption', 'sqlcipher', 'passphrase', 'secret', 'keychain']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('deterministic serialisation', () => {
  it('produces identical text for the same data in a different order', () => {
    const snapshot = syntheticSnapshot();
    const shuffled = {
      ...snapshot,
      cooks: [...snapshot.cooks].reverse(),
      cookEvents: [...snapshot.cookEvents].reverse(),
      findings: [...snapshot.findings].reverse(),
      findingSources: [...snapshot.findingSources].reverse(),
      lessons: [...snapshot.lessons].reverse(),
      tags: [...snapshot.tags].reverse(),
      cookTags: [...snapshot.cookTags].reverse(),
      briefings: [...snapshot.briefings].reverse(),
      briefingSources: [...snapshot.briefingSources].reverse(),
      importBatches: [...snapshot.importBatches].reverse(),
    };
    const at = '2026-08-21T06:00:00.000Z';

    const first = serialiseBackup(
      buildBackupEnvelope(snapshot, syntheticPhotoManifest(), LATEST_SCHEMA_VERSION, at),
    );
    const second = serialiseBackup(
      buildBackupEnvelope(shuffled, syntheticPhotoManifest(), LATEST_SCHEMA_VERSION, at),
    );

    expect(second).toBe(first);
  });

  it('is stable across repeated calls', () => {
    const envelope = syntheticBackupEnvelope();

    expect(serialiseBackup(envelope)).toBe(serialiseBackup(envelope));
  });

  it('orders object keys, not just rows', () => {
    const text = serialiseBackup(syntheticBackupEnvelope());

    expect(text.indexOf('"createdAt"')).toBeLessThan(text.indexOf('"entities"'));
    expect(text.startsWith('{"createdAt"')).toBe(true);
  });

  it('round-trips through text without losing anything', () => {
    const envelope = syntheticBackupEnvelope();
    const parsed = deserialiseBackup(serialiseBackup(envelope));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope).toEqual(canonicaliseBackup(envelope));
      expect(serialiseBackup(parsed.envelope)).toBe(serialiseBackup(envelope));
    }
  });

  it('reports malformed text rather than throwing', () => {
    const parsed = deserialiseBackup('{not json');

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.map((issue) => issue.code)).toContain('malformed_json');
    }
  });
});

describe('a backup that cannot be trusted', () => {
  const envelope = syntheticBackupEnvelope();

  it('is rejected when it is not a backup at all', () => {
    expect(codesFrom(validateBackup(null))).toContain('not_an_object');
    expect(codesFrom(validateBackup({ ...envelope, format: 'something-else' }))).toContain(
      'wrong_format',
    );
  });

  it('is rejected when it comes from a format this build cannot read', () => {
    expect(codesFrom(validateBackup({ ...envelope, formatVersion: 99 }))).toContain(
      'unsupported_format_version',
    );
  });

  it('is rejected when a collection is missing entirely', () => {
    const withoutTags = {
      ...envelope,
      entities: { ...envelope.entities, tags: undefined },
    };

    expect(codesFrom(validateBackup(withoutTags))).toContain('missing_collection');
  });

  it('is rejected when a timeline entry points at a cook that is not here', () => {
    const dangling: BackupEnvelope = {
      ...envelope,
      entities: {
        ...envelope.entities,
        cookEvents: envelope.entities.cookEvents.map((event) => ({
          ...event,
          cookId: 'cook-missing',
        })),
      },
    };

    expect(codesFrom(validateBackup(dangling))).toContain('dangling_reference');
  });

  it('is rejected when a citation points at a timeline entry that is not here', () => {
    const dangling: BackupEnvelope = {
      ...envelope,
      entities: {
        ...envelope.entities,
        findingSources: envelope.entities.findingSources.map((source) => ({
          ...source,
          cookEventId: 'event-missing',
        })),
      },
    };

    expect(codesFrom(validateBackup(dangling))).toContain('dangling_reference');
  });

  it('is rejected when a briefing cites a cook that is not here', () => {
    const dangling: BackupEnvelope = {
      ...envelope,
      entities: {
        ...envelope.entities,
        briefingSources: envelope.entities.briefingSources.map((source) => ({
          ...source,
          cookId: 'cook-missing',
        })),
      },
    };

    expect(codesFrom(validateBackup(dangling))).toContain('dangling_reference');
  });

  it('is rejected when a cook follows on from one that is not here', () => {
    const dangling: BackupEnvelope = {
      ...envelope,
      entities: {
        ...envelope.entities,
        cooks: envelope.entities.cooks.map((cook) => ({
          ...cook,
          parentCookId: cook.parentCookId === null ? null : 'cook-missing',
        })),
      },
    };

    expect(codesFrom(validateBackup(dangling))).toContain('dangling_reference');
  });

  it('is rejected when the same row appears twice', () => {
    const duplicated: BackupEnvelope = {
      ...envelope,
      entities: { ...envelope.entities, cooks: [...envelope.entities.cooks, ...envelope.entities.cooks] },
    };

    expect(codesFrom(validateBackup(duplicated))).toContain('duplicate_key');
  });

  it('is rejected when two tags share a name and kind', () => {
    const firstTag = envelope.entities.tags[0];
    const duplicated: BackupEnvelope = {
      ...envelope,
      entities: {
        ...envelope.entities,
        tags: [...envelope.entities.tags, { ...(firstTag as NonNullable<typeof firstTag>), id: 'tag-copy' }],
      },
    };

    expect(codesFrom(validateBackup(duplicated))).toContain('duplicate_key');
  });

  it('is rejected when a photo is referenced by anything but an app-private path', () => {
    for (const unsafe of [
      'https://example.com/photo.jpg',
      '/data/data/com.cookinglab/files/photo.jpg',
      'cooks/../../etc/passwd',
      'cache/photo.jpg',
    ]) {
      const tampered = {
        ...envelope,
        photoManifest: envelope.photoManifest.map((entry) => ({ ...entry, logicalPath: unsafe })),
      };

      expect(codesFrom(validateBackup(tampered))).toContain('unsafe_photo_path');
    }
  });

  it('is rejected when a photograph in the timeline is missing from the manifest', () => {
    const withoutPhotos: BackupEnvelope = { ...envelope, photoManifest: [] };
    const validation = validateBackup(withoutPhotos);

    expect(codesFrom(validation)).toContain('photo_manifest_mismatch');
    expect(
      validation.issues.some((issue) => issue.message.includes(SYNTHETIC_PHOTO_PATH)),
    ).toBe(true);
  });

  it('is rejected when a manifest digest is not a digest', () => {
    const tampered = {
      ...envelope,
      photoManifest: envelope.photoManifest.map((entry) => ({ ...entry, sha256: 'nope' })),
    };

    expect(codesFrom(validateBackup(tampered))).toContain('invalid_record');
  });

  it('is rejected when a record uses a vocabulary this build does not have', () => {
    const tampered = {
      ...envelope,
      entities: {
        ...envelope.entities,
        cooks: envelope.entities.cooks.map((cook) => ({ ...cook, status: 'complete' })),
      },
    };

    expect(codesFrom(validateBackup(tampered))).toContain('invalid_record');
  });

  it('does not repair anything it rejects', () => {
    const before = JSON.stringify(envelope);
    validateBackup(envelope);

    expect(JSON.stringify(syntheticBackupEnvelope())).toBe(before);
  });
});
