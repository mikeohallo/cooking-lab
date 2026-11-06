/**
 * Kitchen timers in the notebook (schema version 6, backup format 6; 0.5.0).
 *
 * Every write goes through the data services as the user, like a reading;
 * the assistant is refused. A name takes its colour and keeps it. Backup
 * format 6 carries the timers and comes back byte for byte; formats 1 to 5
 * still read, as having none. Export this cook lists them. Deleting a cook
 * cancels its timers in the timers module when its Undo window passes.
 */
import { assembleBackup } from '../src/data/backup/assemble';
import { FIRST_TIMERS_FORMAT_VERSION, FORMAT_6_COLLECTIONS } from '../src/data/backup/contract';
import { deserialiseBackup, serialiseBackup, validateBackup } from '../src/data/backup/validation';
import { createCookDeletionWorkflow } from '../src/data/deletion/workflow';
import { createExportService } from '../src/data/export/service';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { Timer } from '../src/domain/entities';
import type { EvidenceDecision } from '../src/domain/evidence';
import { formatTime } from '../src/format/dateTime';
import { MINUTE } from '../src/timers/model';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { recordingSink } from './support/screens';
import { syntheticBackupEnvelope } from './fixtures/syntheticData';

const T0 = '2026-11-06T08:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * MINUTE).toISOString();

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code} ${decision.message}`);
  }
  return decision.record;
}

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('timers.db');
  granted(await db.data.capture.startCook({ id: 'cook-roast', title: 'Roast', startedAt: T0 }, 'user', T0));
  granted(await db.data.capture.startCook({ id: 'cook-done', title: 'Soup', startedAt: T0 }, 'user', T0));
  granted(await db.data.capture.saveReview('cook-done', 'Good.', 'user', T0));
});

afterEach(async () => {
  await db.close();
});

const start = async (name: string, minutes: number, id: string, when = 0): Promise<Timer> =>
  granted(await db.data.timerWorkflow.start('cook-roast', name, minutes * MINUTE, { id }, 'user', at(when)));

describe('writing timers, as the user', () => {
  it('starts a timer on an open cook, kept as its end time', async () => {
    const rest = await start('Rest', 15, 't-rest');
    expect(rest).toEqual({
      id: 't-rest',
      cookId: 'cook-roast',
      name: 'Rest',
      colour: 'blue',
      lengthMs: 15 * MINUTE,
      startedAt: T0,
      endsAt: at(15),
      pausedLeftMs: null,
      ranOutAt: null,
      stoppedAt: null,
    });
    expect(await db.data.timers.findById('t-rest')).toEqual(rest);
  });

  it('pauses, resumes, adds a minute and five, and stops, each written as it happens', async () => {
    await start('Meat', 70, 't-meat');
    const { timerWorkflow, timers } = db.data;
    granted(await timerWorkflow.pause('t-meat', 'user', at(10)));
    expect((await timers.findById('t-meat'))?.pausedLeftMs).toBe(60 * MINUTE);
    granted(await timerWorkflow.resume('t-meat', 'user', at(30)));
    expect((await timers.findById('t-meat'))?.endsAt).toBe(at(90));
    granted(await timerWorkflow.add('t-meat', MINUTE, 'user', at(31)));
    granted(await timerWorkflow.add('t-meat', 5 * MINUTE, 'user', at(32)));
    expect((await timers.findById('t-meat'))?.endsAt).toBe(at(96));
    granted(await timerWorkflow.stop('t-meat', 'user', at(40)));
    expect((await timers.findById('t-meat'))?.stoppedAt).toBe(at(40));
    expect(await timers.listLive()).toEqual([]);
  });

  it('marks one finished at the end time the phone gives', async () => {
    await start('Rest', 15, 't-rest');
    granted(await db.data.timerWorkflow.finish('t-rest', at(15), 'user'));
    expect((await db.data.timers.findById('t-rest'))?.ranOutAt).toBe(at(15));
    // Still live until it is stopped: it shows as Done.
    expect((await db.data.timers.listLive()).map((timer) => timer.id)).toEqual(['t-rest']);
  });

  it('refuses the assistant, a cook that has been reviewed, and a change the timer cannot take', async () => {
    const { timerWorkflow } = db.data;
    expect((await timerWorkflow.start('cook-roast', 'Rest', 15 * MINUTE, { id: 't-ai' }, 'ai', T0)).allowed).toBe(false);
    const reviewed = await timerWorkflow.start('cook-done', 'Rest', 15 * MINUTE, { id: 't-late' }, 'user', T0);
    expect(reviewed).toMatchObject({ allowed: false, code: 'timer_not_valid' });
    await start('Rest', 15, 't-rest');
    expect((await timerWorkflow.pause('t-rest', 'ai', at(1))).allowed).toBe(false);
    expect(await timerWorkflow.resume('t-rest', 'user', at(1))).toMatchObject({ allowed: false, code: 'timer_not_valid' });
    expect(await db.data.timers.findById('t-ai')).toBeNull();
    expect(await db.data.timers.findById('t-late')).toBeNull();
  });

  it('gives a name its colour and keeps it; other names take plum, then gold', async () => {
    expect((await start('Gravy', 10, 't-1')).colour).toBe('plum');
    expect((await start('Meat', 70, 't-2')).colour).toBe('warm');
    expect((await start('Sauce', 5, 't-3', 1)).colour).toBe('gold');
    expect((await start('gravy', 10, 't-4', 2)).colour).toBe('plum');
    expect((await start('Veg', 25, 't-5', 3)).colour).toBe('green');
  });
});

describe('backup format 6', () => {
  async function assemble() {
    const photos = createPrivateFileStore(memoryFileSystem(), nodeDigest);
    const assembly = await assembleBackup(db.data.snapshots, photos, LATEST_SCHEMA_VERSION, at(60));
    expect(assembly.issues).toEqual([]);
    return assembly.envelope;
  }

  it('is the first to carry timers', () => {
    expect(FIRST_TIMERS_FORMAT_VERSION).toBe(6);
    expect([...FORMAT_6_COLLECTIONS]).toEqual(['timers']);
  });

  it('carries every timer, running, paused and stopped, and comes back byte for byte', async () => {
    await start('Rest', 15, 't-rest');
    await start('Meat', 70, 't-meat');
    await start('Gravy', 10, 't-gravy');
    granted(await db.data.timerWorkflow.pause('t-meat', 'user', at(5)));
    granted(await db.data.timerWorkflow.stop('t-gravy', 'user', at(12)));
    const snapshot = await db.data.snapshots.readSnapshot();
    expect(snapshot.timers.map((timer) => timer.id).sort()).toEqual(['t-gravy', 't-meat', 't-rest']);

    const text = serialiseBackup(await assemble());
    const parsed = deserialiseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.envelope.formatVersion).toBe(6);
    expect([...parsed.envelope.entities.timers].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(
      [...snapshot.timers].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect(serialiseBackup(parsed.envelope)).toBe(text);
  });

  it('carries the collection even when it is empty', async () => {
    const text = serialiseBackup(await assemble());
    expect(text).toContain('"timers": []');
    expect(deserialiseBackup(text).ok).toBe(true);
  });

  it('validates the synthetic fixture, which carries two timers', () => {
    expect(syntheticBackupEnvelope().entities.timers).toHaveLength(2);
    expect(validateBackup(syntheticBackupEnvelope()).issues).toEqual([]);
  });

  // Format 1 (no untyped tags) is read as having no timers in `backupV2.test.ts`.
  it.each([2, 3, 4, 5])('still reads a format %i file, as having no timers', (version) => {
    const envelope = syntheticBackupEnvelope();
    const entities: Record<string, unknown> = { ...envelope.entities };
    delete entities.timers;
    if (version < 5) {
      delete entities.cookCuisines;
    }
    if (version < 4) {
      for (const key of ['cookMealTypes', 'ingredientVersions', 'householdMembers', 'ratings', 'lessonRevisions']) {
        delete entities[key];
      }
    }
    if (version < 3) {
      delete entities.revisions;
    }
    const parsed = deserialiseBackup(JSON.stringify({ ...envelope, formatVersion: version, entities }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.entities.timers).toEqual([]);
    }
  });

  it('refuses a format 5 file that carries timers, and a format 6 file without the collection', () => {
    const envelope = syntheticBackupEnvelope();
    expect(validateBackup({ ...envelope, formatVersion: 5 }).issues).toContainEqual({
      at: 'entities.timers',
      code: 'record_needs_a_later_format',
      message: 'timers needs backup format 6 or later',
    });
    const entities: Record<string, unknown> = { ...envelope.entities };
    delete entities.timers;
    expect(validateBackup({ ...envelope, entities }).issues.map((issue) => issue.code)).toContain('missing_collection');
  });

  it('refuses a timer that is not one: bad colour, untrimmed name, no length, a cook not in the file', () => {
    const envelope = syntheticBackupEnvelope();
    const first = envelope.entities.timers[0]!;
    const withTimer = (row: Record<string, unknown>) =>
      validateBackup({ ...envelope, entities: { ...envelope.entities, timers: [row] } }).issues.map((issue) => issue.at);
    expect(withTimer({ ...first, colour: 'red' })).toEqual(['entities.timers[0].colour']);
    expect(withTimer({ ...first, name: ' Rest' })).toEqual(['entities.timers[0].name']);
    expect(withTimer({ ...first, lengthMs: 0 })).toEqual(['entities.timers[0].lengthMs']);
    expect(withTimer({ ...first, cookId: 'cook-not-here' })).toEqual(['entities.timers[0].cookId']);
  });
});

describe('Export this cook', () => {
  it('lists the timers on one line: "Timers: Rest 15 min, ended 7:42 pm"', async () => {
    await start('Rest', 15, 't-rest');
    granted(await db.data.timerWorkflow.stop('t-rest', 'user', at(16)));
    await start('Meat', 70, 't-meat', 1);
    const sink = recordingSink();
    const exporter = createExportService({
      data: db.data,
      photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
      schemaVersion: LATEST_SCHEMA_VERSION,
      sink,
      variant: 'production',
      now: () => at(20),
    });
    expect((await exporter.exportCook('cook-roast')).ok).toBe(true);
    const text = sink.shared[0]?.text ?? '';
    expect(text).toContain(`Timers: Rest 15 min, ended ${formatTime(at(15))}, Meat 1 h 10 min, ends ${formatTime(at(71))}`);
  });
});

describe('deleting a cook', () => {
  it('keeps its timers through the Undo window and cancels them in the timers module when it passes', async () => {
    await start('Rest', 15, 't-rest');
    await start('Gravy', 10, 't-gravy');
    granted(await db.data.timerWorkflow.stop('t-gravy', 'user', at(2)));
    const cancelled: string[] = [];
    const deletions = createCookDeletionWorkflow({
      data: db.data,
      photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
      now: () => at(3),
      cancelTimer: (id) => cancelled.push(id),
    });
    expect((await deletions.request('cook-roast')).status).toBe('pending');
    expect(cancelled).toEqual([]);
    await deletions.undo('cook-roast');
    expect((await db.data.timers.listLive()).map((timer) => timer.id)).toEqual(['t-rest']);

    expect((await deletions.request('cook-roast')).status).toBe('pending');
    await deletions.finish('cook-roast');
    expect(cancelled).toEqual(['t-rest']);
    expect(await db.data.timers.findById('t-rest')).toBeNull();
    expect(await db.data.timers.findById('t-gravy')).toBeNull();
  });

  it('cancels them too when the window was cut short by the app closing', async () => {
    await start('Rest', 15, 't-rest');
    const cancelled: string[] = [];
    const deletions = createCookDeletionWorkflow({
      data: db.data,
      photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
      now: () => at(3),
      cancelTimer: (id) => cancelled.push(id),
    });
    await deletions.request('cook-roast');
    expect(await deletions.finishPending()).toBe(1);
    expect(cancelled).toEqual(['t-rest']);
  });
});
