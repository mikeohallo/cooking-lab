/**
 * The export service against real SQL and a share sheet that only remembers.
 *
 * What is proved: the backup file is the validated portable format and reads
 * back to the same records; the cook file is the cook's own words; a failed
 * hand-over is reported with its reason and leaves the store exactly as it
 * was; and nothing secret can be in either file.
 */
import { createExportService, type ExportService } from '../src/data/export/service';
import { TEST_EXPORT_NOTICE } from '../src/data/export/cookText';
import { deserialiseBackup } from '../src/data/backup/validation';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { EvidenceDecision } from '../src/domain/evidence';
import { createUserLesson, isAllowed } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { recordingSink, type RecordingSink } from './support/screens';

const T0 = '2026-10-15T08:30:00.000Z';
const T1 = '2026-10-15T08:50:00.000Z';
const T2 = '2026-10-15T09:45:00.000Z';
const EXPORTED_AT = '2026-10-16T06:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!isAllowed(decision)) {
    throw new Error(`expected the operation to be allowed, but it was refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;
let sink: RecordingSink;

function exporter(variant: 'production' | 'test' = 'production'): ExportService {
  return createExportService({
    data: db.data,
    photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
    schemaVersion: LATEST_SCHEMA_VERSION,
    sink,
    variant,
    now: () => EXPORTED_AT,
  });
}

async function seedAReviewedCook(): Promise<void> {
  granted(await db.data.capture.startCook({ id: 'cook-01', title: 'Pork chops', startedAt: T0 }, 'user', T0));
  granted(
    await db.data.capture.addEvent(
      { id: 'ev-01', cookId: 'cook-01', ts: T0, kind: 'user_note', body: 'Dry brined overnight.' },
      'user',
    ),
  );
  granted(
    await db.data.capture.addEvent(
      { id: 'ev-02', cookId: 'cook-01', ts: T1, kind: 'temp', meta: { celsius: 58, where: 'thickest part' } },
      'user',
    ),
  );
  granted(await db.data.capture.openReview('cook-01', 'user', T1));
  granted(await db.data.capture.saveReview('cook-01', 'Great crust. Needed acid.', 'user', T2));
  await db.data.lessons.create(
    granted(createUserLesson({ cookId: 'cook-01', text: 'More acid.' }, { id: 'lesson-01' }, 'user', T2)),
  );
}

beforeEach(async () => {
  db = await openTestDatabase(`export-${String(Math.random()).slice(2)}.db`);
  sink = recordingSink();
});

afterEach(async () => {
  await db.close();
});

describe('exportEverything', () => {
  it('hands the share sheet one validated backup file that reads back to the same records', async () => {
    await seedAReviewedCook();

    const outcome = await exporter().exportEverything();

    expect(outcome).toEqual({
      ok: true,
      fileName: 'cooking-lab-backup-2026-10-16.json',
      summary: '1 cook in cooking-lab-backup-2026-10-16.json.',
    });
    expect(sink.shared).toHaveLength(1);
    const file = sink.shared[0]!;
    expect(file.mimeType).toBe('application/json');

    const parsed = deserialiseBackup(file.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.envelope.format).toBe('cooking-lab.backup');
    expect(parsed.envelope.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(parsed.envelope.entities.cooks.map((cook) => [cook.id, cook.verdict])).toEqual([
      ['cook-01', 'Great crust. Needed acid.'],
    ]);
    expect(parsed.envelope.entities.cookEvents.map((event) => event.id)).toEqual(['ev-01', 'ev-02']);
    expect(parsed.envelope.entities.lessons.map((lesson) => lesson.text)).toEqual(['More acid.']);
    expect(parsed.envelope.photoManifest).toEqual([]);
  });

  it('refuses to make an empty file', async () => {
    const outcome = await exporter().exportEverything();

    expect(outcome).toEqual({ ok: false, message: 'There are no cooks to export yet.' });
    expect(sink.shared).toEqual([]);
  });

  it('labels a TEST-build backup in its file name', async () => {
    await seedAReviewedCook();

    const outcome = await exporter('test').exportEverything();

    expect(outcome.ok && outcome.fileName).toBe('cooking-lab-TEST-backup-2026-10-16.json');
  });

  it('reports a failed hand-over with its reason and changes nothing', async () => {
    await seedAReviewedCook();
    const before = await db.data.snapshots.readSnapshot();
    sink.fail = new Error('The share sheet could not be opened.');

    const outcome = await exporter().exportEverything();

    expect(outcome).toEqual({ ok: false, message: 'The share sheet could not be opened.' });
    expect(await db.data.snapshots.readSnapshot()).toEqual(before);
  });

  it('says so when the device has nowhere to send a file', async () => {
    await seedAReviewedCook();
    sink.canShare = async () => false;

    const outcome = await exporter().exportEverything();

    expect(outcome).toEqual({ ok: false, message: 'This device has nowhere to send a file.' });
    expect(sink.shared).toEqual([]);
  });

  it('puts nothing key-shaped or device-specific in the file', async () => {
    await seedAReviewedCook();
    await exporter().exportEverything();

    const text = sink.shared[0]!.text.toLowerCase();
    for (const forbidden of ['key', 'secret', 'password', 'token', 'serial', 'file://', 'content://']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('exportCook', () => {
  it('hands the share sheet the cook as text, verbatim', async () => {
    await seedAReviewedCook();

    const outcome = await exporter().exportCook('cook-01');

    expect(outcome).toEqual({
      ok: true,
      fileName: 'cooking-lab-cook-2026-10-16-pork-chops.txt',
      summary: '2 timeline entries and the verdict in cooking-lab-cook-2026-10-16-pork-chops.txt.',
    });
    const file = sink.shared[0]!;
    expect(file.mimeType).toBe('text/plain');
    expect(file.text).toContain('Cooking Lab — Pork chops\n');
    expect(file.text).toContain('Verdict\nGreat crust. Needed acid.\n');
    expect(file.text).toContain('Next time\n- More acid.\n');
    expect(file.text).toContain('Dry brined overnight.');
    expect(file.text).toContain('58°C — thickest part');
    expect(file.text).not.toContain(TEST_EXPORT_NOTICE);
  });

  it('includes only approved lessons, never proposals', async () => {
    await seedAReviewedCook();
    await db.data.lessons.create({
      id: 'lesson-02',
      cookId: 'cook-01',
      text: 'A proposal nobody approved.',
      status: 'proposed',
      provenance: 'live',
      createdAt: T2,
      updatedAt: null,
    });

    await exporter().exportCook('cook-01');

    expect(sink.shared[0]!.text).not.toContain('A proposal nobody approved.');
  });

  it('labels a TEST-build file in the name and the text', async () => {
    await seedAReviewedCook();

    const outcome = await exporter('test').exportCook('cook-01');

    expect(outcome.ok && outcome.fileName).toBe('cooking-lab-TEST-cook-2026-10-16-pork-chops.txt');
    expect(sink.shared[0]!.text).toContain(TEST_EXPORT_NOTICE);
  });

  it('says when the cook is not there and makes no file', async () => {
    const outcome = await exporter().exportCook('no-such-cook');

    expect(outcome).toEqual({ ok: false, message: 'That cook isn’t here. Nothing was exported.' });
    expect(sink.shared).toEqual([]);
  });

  it('reports a failed hand-over and changes nothing', async () => {
    await seedAReviewedCook();
    const before = await db.data.snapshots.readSnapshot();
    sink.fail = new Error('No app accepted the file.');

    const outcome = await exporter().exportCook('cook-01');

    expect(outcome).toEqual({ ok: false, message: 'No app accepted the file.' });
    expect(await db.data.snapshots.readSnapshot()).toEqual(before);
  });
});
