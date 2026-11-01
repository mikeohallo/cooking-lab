/**
 * The photograph on a cook's card (0.4.0, part 1), on real SQLite.
 *
 * Three cases and the ways they can go wrong: the cook's own first photo (in
 * the timeline's order — by its place in the timeline, then the order it was
 * written); otherwise the first photo of the nearest earlier cook along the
 * Cook this again chain; otherwise none, and the card draws its meal tile. A
 * deleted earlier cook cuts the chain — for good once it is gone, and while
 * its deletion is pending — and Undo mends it.
 */

import type { DatabaseAdapter, SqlStatement } from '../src/data/adapters';
import { createCookDeletionWorkflow } from '../src/data/deletion/workflow';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { buildPhotoLogicalPath } from '../src/data/photos/photoPaths';
import { createCardPhotoService } from '../src/data/sqlite/cardPhotos';
import type { EvidenceDecision } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';

const T0 = '2026-11-02T17:00:00.000Z';
const T1 = '2026-11-02T17:10:00.000Z';
const T2 = '2026-11-02T17:20:00.000Z';
const T3 = '2026-11-02T17:30:00.000Z';
const LATER = '2026-11-02T21:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code} ${decision.message}`);
  }
  return decision.record;
}

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('card-photos.db');
});

afterEach(async () => {
  await db.close();
});

async function startCook(id: string, parentCookId: string | null = null): Promise<void> {
  granted(await db.data.capture.startCook({ id, title: id, parentCookId, startedAt: T0 }, 'user', T0));
}

let sequence = 0;
async function addPhoto(cookId: string, eventId: string, ts: string): Promise<string> {
  sequence += 1;
  const built = buildPhotoLogicalPath({ cookId, cookEventId: eventId, capturedAt: ts, sequence, extension: 'jpg' });
  if (!built.ok) {
    throw new Error('no path for the fixture photo');
  }
  granted(
    await db.data.capture.addEvent({ id: eventId, cookId, ts, kind: 'photo', photoPath: built.path }, 'user'),
  );
  return built.path;
}

async function addNote(cookId: string, eventId: string, ts: string): Promise<void> {
  granted(await db.data.capture.addEvent({ id: eventId, cookId, ts, kind: 'user_note', body: 'Smells right.' }, 'user'));
}

/** Card id to the photo's event id, and whose photo it is. */
async function cards(...cookIds: string[]): Promise<Record<string, string>> {
  const photos = await db.data.cardPhotos.forCooks(cookIds);
  return Object.fromEntries(
    [...photos.entries()].map(([cookId, photo]) => [cookId, `${photo.event.id} of ${photo.fromCookId}`]),
  );
}

describe('a cook with photos of its own', () => {
  it('shows its first photo in the timeline’s order, not the first one added', async () => {
    await startCook('cook-roast');
    await addNote('cook-roast', 'event-note', T0);
    // Added first, but it sits later in the timeline.
    await addPhoto('cook-roast', 'event-late', T3);
    // Added second, from the Gallery, placed at the earlier moment it was taken.
    await addPhoto('cook-roast', 'event-early', T1);

    const photos = await db.data.cardPhotos.forCooks(['cook-roast']);
    const photo = photos.get('cook-roast');
    expect(photo).toMatchObject({ cookId: 'cook-roast', fromCookId: 'cook-roast', inherited: false });
    expect(photo?.event).toMatchObject({ id: 'event-early', kind: 'photo', ts: T1 });
    expect(photo?.event.photoPath).toContain('cooks/cook-roast/events/event-early/');
  });

  it('breaks a tie on time by the order the photos were written, as the timeline does', async () => {
    await startCook('cook-roast');
    await addPhoto('cook-roast', 'event-b', T1);
    await addPhoto('cook-roast', 'event-a', T1);

    expect(await cards('cook-roast')).toEqual({ 'cook-roast': 'event-b of cook-roast' });
    const timeline = await db.data.cookEvents.listForCook({ cookId: 'cook-roast' });
    expect(timeline[0]?.id).toBe('event-b');
  });

  it('prefers its own photo to an earlier cook’s', async () => {
    await startCook('cook-first');
    await addPhoto('cook-first', 'event-first', T0);
    await startCook('cook-second', 'cook-first');
    await addPhoto('cook-second', 'event-second', T2);

    expect(await cards('cook-second')).toEqual({ 'cook-second': 'event-second of cook-second' });
  });
});

describe('a cook with none of its own', () => {
  it('borrows the first photo of the cook it was cooked again from', async () => {
    await startCook('cook-first');
    await addPhoto('cook-first', 'event-first-b', T2);
    await addPhoto('cook-first', 'event-first-a', T1);
    await startCook('cook-second', 'cook-first');
    await addNote('cook-second', 'event-note', T1);

    const photo = (await db.data.cardPhotos.forCooks(['cook-second'])).get('cook-second');
    expect(photo).toMatchObject({ cookId: 'cook-second', fromCookId: 'cook-first', inherited: true });
    expect(photo?.event.id).toBe('event-first-a');
  });

  it('follows the chain back past cooks with no photo, nearest first', async () => {
    await startCook('cook-1');
    await addPhoto('cook-1', 'event-1', T0);
    await startCook('cook-2', 'cook-1');
    await addPhoto('cook-2', 'event-2', T0);
    await startCook('cook-3', 'cook-2');
    await startCook('cook-4', 'cook-3');
    await startCook('cook-5', 'cook-4');

    expect(await cards('cook-5', 'cook-4', 'cook-3')).toEqual({
      'cook-5': 'event-2 of cook-2',
      'cook-4': 'event-2 of cook-2',
      'cook-3': 'event-2 of cook-2',
    });
  });

  it('has none when nothing along its chain has a photo either: the card shows its meal tile', async () => {
    await startCook('cook-first');
    await addNote('cook-first', 'event-note', T0);
    await startCook('cook-second', 'cook-first');
    await startCook('cook-alone');

    const photos = await db.data.cardPhotos.forCooks(['cook-second', 'cook-alone', 'cook-nowhere']);
    expect(photos.size).toBe(0);
    expect(await db.data.cardPhotos.forCooks([])).toEqual(new Map());
  });

  it('stops at a loop in the chain rather than going round it', async () => {
    await startCook('cook-a');
    await startCook('cook-b', 'cook-a');
    // The schema refuses a cook that follows on from itself, not a longer loop.
    await db.adapter.execute({ sql: "UPDATE cooks SET parent_cook_id = 'cook-b' WHERE id = 'cook-a'" });

    expect(await cards('cook-a', 'cook-b')).toEqual({});
    await addPhoto('cook-a', 'event-a', T1);
    expect(await cards('cook-a', 'cook-b')).toEqual({
      'cook-a': 'event-a of cook-a',
      'cook-b': 'event-a of cook-a',
    });
  });
});

describe('when the earlier cook is deleted', () => {
  const workflow = () =>
    createCookDeletionWorkflow({
      data: db.data,
      photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
      now: () => LATER,
    });

  beforeEach(async () => {
    await startCook('cook-1');
    await addPhoto('cook-1', 'event-1', T0);
    await startCook('cook-2', 'cook-1');
    await addPhoto('cook-2', 'event-2', T0);
    await startCook('cook-3', 'cook-2');
  });

  it('takes its photo off the later card while the deletion is pending, and Undo puts it back', async () => {
    const deletions = workflow();
    expect(await cards('cook-3')).toEqual({ 'cook-3': 'event-2 of cook-2' });

    await deletions.request('cook-2');
    // Gone to the cook, so it lends nothing — nor does anything beyond it,
    // as once the deletion goes through the link is cut.
    expect(await cards('cook-3')).toEqual({});

    await deletions.undo('cook-2');
    expect(await cards('cook-3')).toEqual({ 'cook-3': 'event-2 of cook-2' });
  });

  it('leaves the later card with none once it is deleted for good: the chain is cut there', async () => {
    const deletions = workflow();
    await deletions.request('cook-2');
    await deletions.finish('cook-2');

    expect((await db.data.cooks.findById('cook-3'))?.parentCookId).toBeNull();
    expect(await cards('cook-3', 'cook-1')).toEqual({ 'cook-1': 'event-1 of cook-1' });
  });
});

describe('a page of cards', () => {
  it('is read in three statements, however many cards and however long their chains', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const id = `cook-${index}`;
      await startCook(id, index === 0 ? null : `cook-${index - 1}`);
      if (index % 4 === 0) {
        await addPhoto(id, `event-${index}`, T1);
      }
      ids.push(id);
    }

    const statements: string[] = [];
    const counting: DatabaseAdapter = {
      ...db.adapter,
      select: (statement: SqlStatement) => {
        statements.push(statement.sql);
        return db.adapter.select(statement);
      },
    };
    const photos = await createCardPhotoService(counting).forCooks([...ids].reverse());

    expect(statements).toHaveLength(3);
    expect(
      Object.fromEntries([...photos.entries()].map(([id, photo]) => [id, photo.fromCookId])),
    ).toEqual({
      'cook-0': 'cook-0',
      'cook-1': 'cook-0',
      'cook-2': 'cook-0',
      'cook-3': 'cook-0',
      'cook-4': 'cook-4',
      'cook-5': 'cook-4',
      'cook-6': 'cook-4',
      'cook-7': 'cook-4',
      'cook-8': 'cook-8',
      'cook-9': 'cook-8',
    });
  });
});
