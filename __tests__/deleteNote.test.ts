/**
 * Deleting a written note, against real SQLite (0.4.0, rule 14).
 *
 * A notebook with two cooks. The note to delete has two earlier versions and
 * is cited by a finding, beside a second note, a reading and a photograph on
 * the same cook; the other cook has a note of its own. The brief's checks:
 *
 *   * delete then Undo restores the note, its earlier versions and its place;
 *   * delete then the window passing leaves no row and no revision;
 *   * other notes and other cooks are untouched;
 *   * closing during the window keeps the note;
 *   * both exports leave it out, waiting on Undo and once gone;
 *   * only the owner's written note can be deleted;
 *   * every table that references `cook_events`, and what happens to its rows.
 */

import type { DatabaseAdapter } from '../src/data/adapters';
import {
  createNoteDeletionWorkflow,
  snapshotWithoutHeldNotes,
  type NoteDeletionWorkflow,
} from '../src/data/deletion/notes';
import { createExportService, type ExportService } from '../src/data/export/service';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION, SCHEMA_TABLES } from '../src/data/schema/migrations';
import type { EvidenceDecision } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';
import { recordingSink, type RecordingSink } from './support/screens';

const T0 = '2026-11-02T17:00:00.000Z';
const T1 = '2026-11-02T17:05:00.000Z';
const T2 = '2026-11-02T17:10:00.000Z';
const T3 = '2026-11-02T17:15:00.000Z';
const T4 = '2026-11-02T18:00:00.000Z';
const T5 = '2026-11-02T18:30:00.000Z';
const NOW = '2026-11-02T19:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;
let notes: NoteDeletionWorkflow;
let sink: RecordingSink;
let exporter: ExportService;

/** Every row of every table, in a fixed order. */
async function wholeDatabase(adapter: DatabaseAdapter): Promise<Record<string, unknown>> {
  const all: Record<string, unknown> = {};
  for (const table of SCHEMA_TABLES) {
    all[table] = await adapter.select({ sql: `SELECT * FROM ${table} ORDER BY rowid` });
  }
  return all;
}

async function count(adapter: DatabaseAdapter, sql: string, params: string[]): Promise<number> {
  const [row] = await adapter.select({ sql, params });
  return Number(row?.n ?? -1);
}

/** Everything but the deleted note and what hangs off it, so "untouched" means byte for byte. */
async function everythingElse(adapter: DatabaseAdapter): Promise<unknown> {
  return {
    events: await adapter.select({ sql: "SELECT * FROM cook_events WHERE id <> 'note-gone' ORDER BY rowid" }),
    revisions: await adapter.select({
      sql: "SELECT * FROM revisions WHERE cook_event_id IS NULL OR cook_event_id <> 'note-gone' ORDER BY rowid",
    }),
    cooks: await adapter.select({ sql: 'SELECT * FROM cooks ORDER BY rowid' }),
    findings: await adapter.select({ sql: 'SELECT * FROM findings ORDER BY rowid' }),
    sources: await adapter.select({
      sql: "SELECT * FROM finding_sources WHERE cook_event_id <> 'note-gone' ORDER BY rowid",
    }),
  };
}

beforeEach(async () => {
  db = await openTestDatabase('delete-note.db');
  const photos = createPrivateFileStore(memoryFileSystem(), nodeDigest);
  notes = createNoteDeletionWorkflow({ data: db.data });
  sink = recordingSink();
  exporter = createExportService({
    data: db.data,
    photos,
    schemaVersion: LATEST_SCHEMA_VERSION,
    sink,
    variant: 'test',
    now: () => NOW,
    heldNotes: () => notes.pending(),
  });
  const { capture, findings } = db.data;

  granted(await capture.startCook({ id: 'cook-roast', title: 'Roast chicken', startedAt: T0 }, 'user', T0));
  granted(
    await capture.addEvent(
      { id: 'note-first', cookId: 'cook-roast', ts: T1, kind: 'user_note', body: 'Salted the night before.' },
      'user',
    ),
  );
  granted(
    await capture.addEvent(
      { id: 'note-gone', cookId: 'cook-roast', ts: T2, kind: 'user_note', body: 'Wrong cook entirely.' },
      'user',
    ),
  );
  granted(
    await capture.addEvent(
      { id: 'reading-1', cookId: 'cook-roast', ts: T2, kind: 'temp', meta: { celsius: 220, readingKind: 'oven' } },
      'user',
    ),
  );
  granted(
    await capture.addEvent(
      { id: 'note-last', cookId: 'cook-roast', ts: T3, kind: 'user_note', body: 'Skin crisping nicely.' },
      'user',
    ),
  );
  granted(await capture.reviseNote('note-gone', 'Wrong cook, really.', { id: 'rev-gone-1' }, 'user', T4));
  granted(await capture.reviseNote('note-gone', 'Meant for the lamb.', { id: 'rev-gone-2' }, 'user', T5));
  granted(await capture.reviseNote('note-first', 'Salted the day before.', { id: 'rev-first' }, 'user', T4));
  await findings.createWithSources({
    finding: {
      id: 'finding-1',
      cookId: 'cook-roast',
      class: 'observed',
      text: 'The oven ran hot.',
      rationale: null,
      confidence: null,
      status: 'proposed',
      createdBy: 'ai',
      provenance: 'live',
      createdAt: T4,
      updatedAt: null,
    },
    sources: [
      { findingId: 'finding-1', cookEventId: 'note-gone' },
      { findingId: 'finding-1', cookEventId: 'reading-1' },
    ],
  });

  granted(await capture.startCook({ id: 'cook-porridge', title: 'Porridge', startedAt: T0 }, 'user', T0));
  granted(
    await capture.addEvent(
      { id: 'note-other-cook', cookId: 'cook-porridge', ts: T1, kind: 'user_note', body: 'Oats soaked.' },
      'user',
    ),
  );
});

afterEach(async () => {
  await db.close();
});

describe('what references cook_events', () => {
  it('is revisions and finding_sources, each cascading on delete', async () => {
    const references: string[] = [];
    for (const table of SCHEMA_TABLES) {
      const keys = await db.adapter.select({ sql: `SELECT * FROM pragma_foreign_key_list('${table}')` });
      for (const key of keys) {
        if (key.table === 'cook_events') {
          references.push(`${table}.${String(key.from)} ${String(key.on_delete)}`);
        }
      }
    }
    expect(references.sort()).toEqual([
      'finding_sources.cook_event_id CASCADE',
      'revisions.cook_event_id CASCADE',
    ]);
  });
});

describe('asking to delete a note', () => {
  it('holds it back and writes nothing at all', async () => {
    const before = await wholeDatabase(db.adapter);

    const outcome = await notes.request('note-gone');

    expect(outcome).toEqual({ status: 'pending', noteId: 'note-gone', cookId: 'cook-roast' });
    expect([...notes.pending()]).toEqual(['note-gone']);
    expect(await wholeDatabase(db.adapter)).toEqual(before);
  });

  it('is refused for a reading and for a missing entry, holding nothing back', async () => {
    expect((await notes.request('reading-1')).status).toBe('refused');
    expect((await notes.request('no-such-note')).status).toBe('failed');
    expect(notes.pending().size).toBe(0);
  });
});

describe('delete, then Undo', () => {
  it('brings the note back exactly: words, place and earlier versions', async () => {
    const before = await wholeDatabase(db.adapter);
    const timeline = await db.data.cookEvents.listForCook({ cookId: 'cook-roast' });
    const edits = await db.data.revisions.listForCook('cook-roast');

    await notes.request('note-gone');
    notes.undo('note-gone');
    // The window passing after Undo deletes nothing.
    await notes.finish('note-gone');

    expect(notes.pending().size).toBe(0);
    expect(await wholeDatabase(db.adapter)).toEqual(before);
    expect(await db.data.cookEvents.listForCook({ cookId: 'cook-roast' })).toEqual(timeline);
    expect(await db.data.revisions.listForCook('cook-roast')).toEqual(edits);
  });
});

describe('delete, then the window passes', () => {
  it('leaves no row and no revision of the note', async () => {
    await notes.request('note-gone');
    await notes.finish('note-gone');

    expect(notes.pending().size).toBe(0);
    expect(await db.data.cookEvents.findById('note-gone')).toBeNull();
    expect(await count(db.adapter, 'SELECT count(*) AS n FROM revisions WHERE cook_event_id = ?', ['note-gone'])).toBe(0);
    expect(
      await count(db.adapter, 'SELECT count(*) AS n FROM finding_sources WHERE cook_event_id = ?', ['note-gone']),
    ).toBe(0);
  });

  it('leaves the other notes, the reading, the finding and the other cook untouched', async () => {
    const before = await everythingElse(db.adapter);
    await notes.request('note-gone');
    await notes.finish('note-gone');

    expect(await everythingElse(db.adapter)).toEqual(before);
    expect((await db.data.cookEvents.listForCook({ cookId: 'cook-roast' })).map((event) => event.id)).toEqual([
      'note-first',
      'reading-1',
      'note-last',
    ]);
    // The finding is the cook's, not the note's: it stays, citing the reading.
    expect((await db.data.findings.listSources('finding-1')).map((source) => source.cookEventId)).toEqual([
      'reading-1',
    ]);
  });
});

describe('when the app closes during the undo window', () => {
  it('keeps the note: nothing was written, and nothing is pending at the next start', async () => {
    const before = await wholeDatabase(db.adapter);
    await notes.request('note-gone');

    // The app stops here. The next launch builds a new workflow over the same store.
    const nextStart = createNoteDeletionWorkflow({ data: db.data });

    expect(nextStart.pending().size).toBe(0);
    expect(await db.data.cookEvents.findById('note-gone')).not.toBeNull();
    expect(await wholeDatabase(db.adapter)).toEqual(before);
  });
});

describe('the rule, at the store', () => {
  it('refuses the assistant, and keeps the note and its versions', async () => {
    const before = await wholeDatabase(db.adapter);
    expect((await db.data.capture.requestNoteDeletion('note-gone', 'ai')).allowed).toBe(false);
    const decision = await db.data.capture.deleteNote('note-gone', 'ai');
    expect(decision.allowed ? null : decision.code).toBe('ai_cannot_delete_a_note');
    expect(await wholeDatabase(db.adapter)).toEqual(before);
  });

  it('refuses anything but a written note, for the cook too', async () => {
    const before = await wholeDatabase(db.adapter);
    const decision = await db.data.capture.deleteNote('reading-1', 'user');
    expect(decision.allowed ? null : decision.code).toBe('only_a_written_note_may_be_deleted');
    // And the transaction itself reaches nothing but a note.
    expect(await db.data.cookEvents.deleteNote('reading-1')).toBe(false);
    expect(await wholeDatabase(db.adapter)).toEqual(before);
  });
});

describe('export', () => {
  it('leaves a note waiting on Undo out of both exports, and keeps the rest', async () => {
    await notes.request('note-gone');

    expect((await exporter.exportEverything()).ok).toBe(true);
    expect((await exporter.exportCook('cook-roast')).ok).toBe(true);
    const [backup, cookText] = sink.shared.map((file) => file.text);

    for (const text of [backup, cookText]) {
      expect(text).not.toContain('Wrong cook');
      expect(text).not.toContain('Meant for the lamb');
      expect(text).toContain('Salted the day before.');
      expect(text).toContain('Skin crisping nicely.');
    }
    expect(backup).not.toContain('note-gone');
    expect(backup).toContain('reading-1');
    expect(backup).toContain('Oats soaked.');
  });

  it('leaves it out once it is gone for good, the same way', async () => {
    await notes.request('note-gone');
    const whileHeld = snapshotWithoutHeldNotes(await db.data.snapshots.readSnapshot(), notes.pending());
    await notes.finish('note-gone');

    // The backup while waiting is exactly the notebook after: format 5, nothing more.
    expect(await db.data.snapshots.readSnapshot()).toEqual(whileHeld);
    expect((await exporter.exportEverything()).ok).toBe(true);
    expect(sink.shared[0]?.text).not.toContain('note-gone');
    expect(sink.shared[0]?.text).toContain('"formatVersion": 5');
  });

  it('puts the note back in both exports after Undo', async () => {
    await notes.request('note-gone');
    notes.undo('note-gone');
    await exporter.exportEverything();
    await exporter.exportCook('cook-roast');
    for (const file of sink.shared) {
      expect(file.text).toContain('Meant for the lamb.');
    }
  });
});
