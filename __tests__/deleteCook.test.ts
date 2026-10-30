/**
 * Deleting a cook, against real SQLite and a real photo store (0.2.2).
 *
 * The brief's four checks, each on a notebook with two cooks — the one being
 * deleted carries a note, a reading, a photograph with its file, an edit, a
 * lesson, a tag of its own and a tag it shares:
 *
 *   * delete then Undo restores everything, exactly;
 *   * delete then purge leaves no row and no photo file;
 *   * the other cook is untouched;
 *   * Export everything afterwards does not contain it.
 *
 * And the two edges: the assistant cannot delete a cook, and a deletion whose
 * undo window was cut short by the app closing is finished at the next start.
 */

import type { DatabaseAdapter, PrivateFileStore } from '../src/data/adapters';
import { createCookDeletionWorkflow, type CookDeletionWorkflow } from '../src/data/deletion/workflow';
import { createExportService } from '../src/data/export/service';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { buildPhotoLogicalPath } from '../src/data/photos/photoPaths';
import { LATEST_SCHEMA_VERSION, SCHEMA_TABLES } from '../src/data/schema/migrations';
import type { EvidenceDecision } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest, type MemoryFileSystem } from './support/memoryPorts';
import { recordingSink } from './support/screens';
import { sageSquareJpeg } from './fixtures/photoBytes';

const T0 = '2026-10-29T17:00:00.000Z';
const T1 = '2026-10-29T17:10:00.000Z';
const T2 = '2026-10-29T19:00:00.000Z';
const NOW = '2026-10-30T09:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

let db: TestDatabase;
let files: MemoryFileSystem;
let photos: PrivateFileStore;
let deletions: CookDeletionWorkflow;
let photoPath: string;

/** Every row of every table, in a fixed order. */
async function wholeDatabase(adapter: DatabaseAdapter): Promise<Record<string, unknown>> {
  const all: Record<string, unknown> = {};
  for (const table of SCHEMA_TABLES) {
    all[table] = await adapter.select({ sql: `SELECT * FROM ${table} ORDER BY rowid` });
  }
  return all;
}

/** Every row that hangs off this cook, table by table. */
async function rowsOf(adapter: DatabaseAdapter, cookId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const queries: Record<string, string> = {
    cooks: 'SELECT count(*) AS n FROM cooks WHERE id = ?',
    cook_events: 'SELECT count(*) AS n FROM cook_events WHERE cook_id = ?',
    revisions: 'SELECT count(*) AS n FROM revisions WHERE cook_id = ?',
    lessons: 'SELECT count(*) AS n FROM lessons WHERE cook_id = ?',
    findings: 'SELECT count(*) AS n FROM findings WHERE cook_id = ?',
    cook_tags: 'SELECT count(*) AS n FROM cook_tags WHERE cook_id = ?',
    briefings: 'SELECT count(*) AS n FROM briefings WHERE cook_id = ?',
    cook_deletions: 'SELECT count(*) AS n FROM cook_deletions WHERE cook_id = ?',
  };
  for (const [table, sql] of Object.entries(queries)) {
    const [row] = await adapter.select({ sql, params: [cookId] });
    counts[table] = Number(row?.n ?? -1);
  }
  return counts;
}

/** The other cook's rows, whole, so "untouched" means byte for byte. */
async function otherCook(adapter: DatabaseAdapter): Promise<unknown> {
  return {
    cook: await adapter.select({ sql: "SELECT * FROM cooks WHERE id = 'cook-keep'" }),
    events: await adapter.select({ sql: "SELECT * FROM cook_events WHERE cook_id = 'cook-keep' ORDER BY id" }),
    tags: await adapter.select({
      sql: "SELECT t.* FROM tags t JOIN cook_tags ct ON ct.tag_id = t.id WHERE ct.cook_id = 'cook-keep' ORDER BY t.id",
    }),
  };
}

beforeEach(async () => {
  db = await openTestDatabase('delete-cook.db');
  files = memoryFileSystem();
  photos = createPrivateFileStore(files, nodeDigest);
  deletions = createCookDeletionWorkflow({ data: db.data, photos, now: () => NOW });
  const { capture, tags, cookTags, lessons } = db.data;

  // The cook to delete.
  granted(await capture.startCook({ id: 'cook-gone', title: 'Burnt toast', startedAt: T0 }, 'user', T0));
  granted(
    await capture.addEvent(
      { id: 'event-note', cookId: 'cook-gone', ts: T1, kind: 'user_note', body: 'Smoke.' },
      'user',
    ),
  );
  granted(
    await capture.addEvent(
      { id: 'event-temp', cookId: 'cook-gone', ts: T1, kind: 'temp', meta: { celsius: 250, readingKind: 'oven' } },
      'user',
    ),
  );
  const built = buildPhotoLogicalPath({
    cookId: 'cook-gone',
    cookEventId: 'event-photo',
    capturedAt: T1,
    sequence: 0,
    extension: 'jpg',
  });
  if (!built.ok) {
    throw new Error('no path for the fixture photo');
  }
  photoPath = built.path;
  await photos.write(photoPath, sageSquareJpeg());
  granted(
    await capture.addEvent(
      { id: 'event-photo', cookId: 'cook-gone', ts: T1, kind: 'photo', photoPath },
      'user',
    ),
  );
  granted(await capture.reviseNote('event-note', 'Smoke everywhere.', { id: 'rev-1' }, 'user', T2));
  granted(await capture.saveReview('cook-gone', 'Never again.', 'user', T2));
  await lessons.create({
    id: 'lesson-1',
    cookId: 'cook-gone',
    text: 'Watch the grill.',
    status: 'approved',
    provenance: 'live',
    createdAt: T2,
    updatedAt: null,
  });
  const own = await tags.findOrCreate('toast', null);
  const shared = await tags.findOrCreate('breakfast', null);
  await cookTags.link({ cookId: 'cook-gone', tagId: own.id });
  await cookTags.link({ cookId: 'cook-gone', tagId: shared.id });

  // The cook to keep, sharing one tag.
  granted(await capture.startCook({ id: 'cook-keep', title: 'Porridge', startedAt: T0 }, 'user', T0));
  granted(
    await capture.addEvent(
      { id: 'event-keep', cookId: 'cook-keep', ts: T1, kind: 'user_note', body: 'Oats soaked.' },
      'user',
    ),
  );
  await cookTags.link({ cookId: 'cook-keep', tagId: shared.id });

  // A tag on no cook at all, kept since 0.2.1 so it stays offered.
  await tags.findOrCreate('spare', null);
});

afterEach(async () => {
  await db.close();
});

describe('asking to delete', () => {
  it('hides the cook from every list and count, and from Export everything', async () => {
    const outcome = await deletions.request('cook-gone');
    expect(outcome).toEqual({ status: 'pending', cookId: 'cook-gone', title: 'Burnt toast' });

    expect((await db.data.cooks.list()).map((cook) => cook.id)).toEqual(['cook-keep']);
    expect(await db.data.cooks.count()).toBe(1);
    expect((await db.data.cookTags.listMostUsedTags(10)).map((tag) => tag.name)).toEqual(['breakfast']);
    const snapshot = await db.data.snapshots.readSnapshot();
    expect(snapshot.cooks.map((cook) => cook.id)).toEqual(['cook-keep']);
    expect(snapshot.cookEvents.some((event) => event.cookId === 'cook-gone')).toBe(false);
    expect(snapshot.revisions).toEqual([]);
  });

  it('touches nothing of the cook itself, so it can still be found for Undo', async () => {
    await deletions.request('cook-gone');
    expect(await db.data.cooks.findById('cook-gone')).not.toBeNull();
    expect(await rowsOf(db.adapter, 'cook-gone')).toMatchObject({ cook_events: 3, revisions: 1, lessons: 1, cook_tags: 2 });
    expect(files.files.size).toBe(1);
  });

  it('is refused for the assistant, which leaves the cook listed', async () => {
    const decision = await db.data.capture.requestCookDeletion('cook-gone', 'ai', NOW);
    expect(decision.allowed).toBe(false);
    expect((await db.data.cooks.list()).map((cook) => cook.id).sort()).toEqual(['cook-gone', 'cook-keep']);
  });
});

describe('delete, then Undo', () => {
  it('restores everything exactly as it was', async () => {
    const before = await wholeDatabase(db.adapter);
    const snapshotBefore = await db.data.snapshots.readSnapshot();

    await deletions.request('cook-gone');
    await deletions.undo('cook-gone');

    expect(await wholeDatabase(db.adapter)).toEqual(before);
    expect(await db.data.snapshots.readSnapshot()).toEqual(snapshotBefore);
    expect(await photos.exists(photoPath)).toBe(true);
  });
});

describe('delete, then purge', () => {
  it('leaves no row and no photo file', async () => {
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');

    expect(await rowsOf(db.adapter, 'cook-gone')).toEqual({
      cooks: 0,
      cook_events: 0,
      revisions: 0,
      lessons: 0,
      findings: 0,
      cook_tags: 0,
      briefings: 0,
      cook_deletions: 0,
    });
    expect(await photos.exists(photoPath)).toBe(false);
    expect([...files.files.keys()].some((path) => path.includes('cook-gone'))).toBe(false);
  });

  it('drops the tags only that cook used, and keeps the shared one and the spare one', async () => {
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');

    expect((await db.data.tags.listByName()).map((tag) => tag.name)).toEqual(['breakfast', 'spare']);
  });

  it('leaves the other cook untouched', async () => {
    const before = await otherCook(db.adapter);
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');
    expect(await otherCook(db.adapter)).toEqual(before);
  });

  it('leaves it out of Export everything', async () => {
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');
    const sink = recordingSink();
    const exporter = createExportService({
      data: db.data,
      photos,
      schemaVersion: LATEST_SCHEMA_VERSION,
      sink,
      variant: 'test',
      now: () => NOW,
    });

    const outcome = await exporter.exportEverything();

    expect(outcome.ok).toBe(true);
    const text = sink.shared[0]?.text ?? '';
    expect(text).toContain('cook-keep');
    expect(text).not.toContain('cook-gone');
    expect(text).not.toContain('Burnt toast');
    expect(text).not.toContain('Smoke');
  });

  it('keeps a cook that followed on from it, with the link cleared by the schema', async () => {
    granted(
      await db.data.capture.startCook(
        { id: 'cook-again', parentCookId: 'cook-gone', startedAt: T2 },
        'user',
        T2,
      ),
    );
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');
    expect((await db.data.cooks.findById('cook-again'))?.parentCookId).toBeNull();
  });
});

describe('when the app closes during the undo window', () => {
  it('finishes the deletion at the next start', async () => {
    await deletions.request('cook-gone');

    // A new workflow over the same store, as the next launch builds one.
    const nextStart = createCookDeletionWorkflow({ data: db.data, photos, now: () => NOW });
    expect(await nextStart.finishPending()).toBe(1);

    expect(await db.data.cooks.findById('cook-gone')).toBeNull();
    expect(await photos.exists(photoPath)).toBe(false);
    expect(await db.data.cookDeletions.listPending()).toEqual([]);
    expect(await db.data.cooks.findById('cook-keep')).not.toBeNull();
  });

  it('also deletes a photo file left behind by a purge that stopped after its rows', async () => {
    await deletions.request('cook-gone');
    // The rows go, and the app stops before the files do.
    await db.data.cookDeletions.purge('cook-gone');
    expect(await photos.exists(photoPath)).toBe(true);

    await createCookDeletionWorkflow({ data: db.data, photos, now: () => NOW }).finishPending();

    expect(await photos.exists(photoPath)).toBe(false);
  });

  it('leaves the files of every cook that is still here', async () => {
    const before = [...files.files.keys()];
    expect(await deletions.finishPending()).toBe(0);
    expect([...files.files.keys()]).toEqual(before);
  });
});
