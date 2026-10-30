/**
 * Update 2's records (0.3.0), against real SQLite through the real services:
 * meal type, ingredients, the household, ratings, next-time edits and "Cook
 * this again" — and rule 13 in the domain, where each one is decided.
 *
 * The people are made up: Alex, Sam and Jo.
 */

import type { DatabaseAdapter } from '../src/data/adapters';
import { createCookDeletionWorkflow } from '../src/data/deletion/workflow';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { HOUSEHOLD_ASKED_KEY } from '../src/data/sqlite/cookRecord';
import { SCHEMA_TABLES } from '../src/data/schema/migrations';
import {
  currentIngredients,
  ingredientLines,
  mealTypeLabel,
  nextTimeWords,
  ordinal,
  orderRatings,
  raterName,
  ratingAnswerText,
  timesCooked,
  timesCookedLine,
} from '../src/domain/cookRecord';
import type { Cook } from '../src/domain/entities';
import {
  cookAgain,
  rateCook,
  reviseLesson,
  saveIngredients,
  setMealType,
  type EvidenceDecision,
} from '../src/domain/evidence';
import { activeMembers, addMember, moveMember, retiredMembers } from '../src/domain/household';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';

const T0 = '2026-10-30T17:00:00.000Z';
const T1 = '2026-10-30T18:00:00.000Z';
const T2 = '2026-10-30T19:00:00.000Z';
const T3 = '2026-10-30T20:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code} ${decision.message}`);
  }
  return decision.record;
}

const COOK: Cook = {
  id: 'cook-1',
  title: 'Shakshuka',
  status: 'open',
  provenance: 'live',
  parentCookId: null,
  startedAt: T0,
  reviewOpenedAt: null,
  reviewSavedAt: null,
  verdict: null,
  createdAt: T0,
};

describe('rule 13 in the domain', () => {
  it('refuses the assistant every write', () => {
    expect(setMealType(COOK, 'breakfast', 'ai', T1)).toMatchObject({ allowed: false, code: 'ai_cannot_write_raw_evidence' });
    expect(saveIngredients(COOK, 'eggs', null, { id: 'i1' }, 'ai', T1)).toMatchObject({ allowed: false });
    expect(rateCook(COOK, { memberId: 'm1' }, { stars: 5, notEaten: false, line: null }, { id: 'r1' }, 'ai', T1)).toMatchObject({ allowed: false });
    expect(cookAgain(COOK, { id: 'cook-2' }, 'ai', T1)).toMatchObject({ allowed: false });
    expect(
      reviseLesson(
        { id: 'l1', cookId: 'cook-1', text: 'x', status: 'approved', provenance: 'live', createdAt: T0, updatedAt: null },
        'y',
        { id: 'lr1' },
        'ai',
        T1,
      ),
    ).toMatchObject({ allowed: false });
  });

  it('sets a meal type, and clears it with none', () => {
    expect(granted(setMealType(COOK, 'dessert', 'user', T1))).toEqual({ cookId: 'cook-1', mealType: 'dessert', setAt: T1 });
    expect(granted(setMealType(COOK, 'none', 'user', T1))).toBeNull();
  });

  it('keeps ingredients exactly as typed, needs words, and refuses a save that changes nothing', () => {
    const text = '  4 eggs\n1 tin tomatoes\n\n';
    expect(granted(saveIngredients(COOK, text, null, { id: 'i1' }, 'user', T1)).text).toBe(text);
    expect(saveIngredients(COOK, '   ', null, { id: 'i1' }, 'user', T1)).toMatchObject({ code: 'revision_needs_words' });
    expect(saveIngredients(COOK, 'eggs', 'eggs', { id: 'i2' }, 'user', T1)).toMatchObject({ code: 'nothing_changed' });
  });

  it('takes one to five whole stars, or N/A with none, from exactly one person', () => {
    const rate = (stars: number | null, notEaten = false, line: string | null = null) =>
      rateCook(COOK, { memberId: 'm-alex' }, { stars, notEaten, line }, { id: 'r1' }, 'user', T1);
    for (const stars of [1, 2, 3, 4, 5]) {
      expect(granted(rate(stars))?.stars).toBe(stars);
    }
    for (const stars of [0, 6, 2.5, -1]) {
      expect(rate(stars)).toMatchObject({ allowed: false, code: 'rating_not_valid' });
    }
    expect(rate(3, true)).toMatchObject({ allowed: false, code: 'rating_not_valid' });
    expect(granted(rate(null, true))).toMatchObject({ stars: null, notEaten: true });
    expect(granted(rate(null, false, '  Too spicy.  '))).toMatchObject({ stars: null, line: 'Too spicy.' });
    // Saying nothing at all is the rating taken away.
    expect(granted(rate(null, false, '   '))).toBeNull();
    expect(
      rateCook(COOK, { guestName: '  ' }, { stars: 4, notEaten: false, line: null }, { id: 'r2' }, 'user', T1),
    ).toMatchObject({ allowed: false });
    expect(
      granted(rateCook(COOK, { guestName: ' Jo ' }, { stars: 4, notEaten: false, line: null }, { id: 'r2' }, 'user', T1)),
    ).toMatchObject({ guestName: 'Jo', memberId: null });
  });

  it('starts a cook again with the same title, pointing back at the earlier one', () => {
    const again = granted(cookAgain({ ...COOK, status: 'reviewed', reviewSavedAt: T1, verdict: 'Good.' }, { id: 'cook-2' }, 'user', T2));
    expect(again).toMatchObject({
      id: 'cook-2',
      title: 'Shakshuka',
      status: 'open',
      parentCookId: 'cook-1',
      startedAt: T2,
      verdict: null,
    });
  });

  it('adds household members in order, refuses a blank or repeated name, and moves them', () => {
    const alex = granted(addMember(' Alex ', [], { id: 'm-alex' }, T0));
    expect(alex).toMatchObject({ name: 'Alex', position: 0, retiredAt: null });
    const sam = granted(addMember('Sam', [alex], { id: 'm-sam' }, T0));
    expect(sam.position).toBe(1);
    expect(addMember('alex', [alex, sam], { id: 'x' }, T0)).toMatchObject({ allowed: false, code: 'name_not_valid' });
    expect(addMember('  ', [alex], { id: 'x' }, T0)).toMatchObject({ allowed: false });
    expect(moveMember([alex, sam], 'm-sam', 'up')).toEqual(['m-sam', 'm-alex']);
    expect(moveMember([alex, sam], 'm-alex', 'up')).toEqual(['m-alex', 'm-sam']);
    const jo = { ...granted(addMember('Jo', [alex, sam], { id: 'm-jo' }, T0)), retiredAt: T1 };
    expect(activeMembers([jo, sam, alex]).map((m) => m.name)).toEqual(['Alex', 'Sam']);
    expect(retiredMembers([jo, sam, alex]).map((m) => m.name)).toEqual(['Jo']);
    // A retired name may be used again.
    expect(addMember('Jo', [alex, sam, jo], { id: 'm-jo-2' }, T1).allowed).toBe(true);
  });
});

describe('reading the records', () => {
  it('finds the current ingredients and their lines', () => {
    expect(currentIngredients([])).toBeNull();
    const versions = [
      { id: 'a', cookId: 'c', text: 'old', savedAt: T0 },
      { id: 'b', cookId: 'c', text: 'eggs\n\n  \ntomatoes  \n', savedAt: T1 },
    ];
    expect(currentIngredients(versions)?.id).toBe('b');
    expect(ingredientLines('eggs\n\n  \ntomatoes  \r\nfeta')).toEqual(['eggs', 'tomatoes', 'feta']);
  });

  it('says how many times a dish has been cooked, along the parent chain', () => {
    const one: Cook = { ...COOK, id: 'c1' };
    const two: Cook = { ...COOK, id: 'c2', parentCookId: 'c1' };
    const three: Cook = { ...COOK, id: 'c3', parentCookId: 'c2' };
    const all = new Map([one, two, three].map((cook) => [cook.id, cook]));
    const find = (id: string) => all.get(id) ?? null;
    expect(timesCooked(one, find)).toBe(1);
    expect(timesCooked(three, find)).toBe(3);
    expect(timesCookedLine(1)).toBeNull();
    expect(timesCookedLine(2)).toBe('2nd time cooking this');
    expect(timesCookedLine(3)).toBe('3rd time cooking this');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
    // A loop is cut where it repeats rather than counted for ever.
    const loopA: Cook = { ...COOK, id: 'a', parentCookId: 'b' };
    const loopB: Cook = { ...COOK, id: 'b', parentCookId: 'a' };
    const loop = new Map([loopA, loopB].map((cook) => [cook.id, cook]));
    expect(timesCooked(loopA, (id) => loop.get(id) ?? null)).toBe(2);
  });

  it('names meal types, raters and answers, and never turns N/A into a number', () => {
    expect(mealTypeLabel('lunch_dinner')).toBe('Lunch/Dinner');
    expect(mealTypeLabel('none')).toBeNull();
    expect(mealTypeLabel(null)).toBeNull();
    const members = [
      { id: 'm-sam', name: 'Sam', position: 1, retiredAt: null, createdAt: T0 },
      { id: 'm-alex', name: 'Alex', position: 0, retiredAt: null, createdAt: T0 },
    ];
    const base = { cookId: 'c', guestName: null, notEaten: false, line: null, ratedAt: T1 };
    const sam = { ...base, id: 'r-sam', memberId: 'm-sam', stars: null, notEaten: true } as const;
    const alex = { ...base, id: 'r-alex', memberId: 'm-alex', stars: 1 } as const;
    const guest = { ...base, id: 'r-jo', memberId: null, guestName: 'Jo', stars: 5 } as const;
    expect(orderRatings([guest, sam, alex], members).map((r) => r.id)).toEqual(['r-alex', 'r-sam', 'r-jo']);
    expect(raterName(guest, members)).toBe('Jo');
    expect(raterName(alex, members)).toBe('Alex');
    expect(ratingAnswerText(alex)).toBe('1 star');
    expect(ratingAnswerText(guest)).toBe('5 stars');
    expect(ratingAnswerText(sam)).toBe('N/A (didn’t eat it)');
  });
});

describe('the services, on real SQLite', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openTestDatabase('cook-record.db');
    granted(await db.data.capture.startCook({ id: 'cook-1', title: 'Shakshuka', startedAt: T0 }, 'user', T0));
  });

  afterEach(async () => {
    await db.close();
  });

  it('sets, changes and clears a meal type, one row at most', async () => {
    const { cookRecord, mealTypes } = db.data;
    granted(await cookRecord.setMealType('cook-1', 'breakfast', 'user', T1));
    granted(await cookRecord.setMealType('cook-1', 'lunch_dinner', 'user', T2));
    expect(await mealTypes.findForCook('cook-1')).toEqual({ cookId: 'cook-1', mealType: 'lunch_dinner', setAt: T2 });
    expect(await mealTypes.listForCooks(['cook-1', 'cook-none'])).toHaveLength(1);
    expect(granted(await cookRecord.setMealType('cook-1', 'none', 'user', T3))).toBeNull();
    expect(await mealTypes.findForCook('cook-1')).toBeNull();
  });

  it('keeps every version of the ingredients, the newest current', async () => {
    const { cookRecord, ingredients } = db.data;
    granted(await cookRecord.saveIngredients('cook-1', '4 eggs\n1 tin tomatoes', { id: 'ing-1' }, 'user', T1));
    expect(await cookRecord.saveIngredients('cook-1', '4 eggs\n1 tin tomatoes', { id: 'ing-x' }, 'user', T2)).toMatchObject({
      allowed: false,
      code: 'nothing_changed',
    });
    granted(await cookRecord.saveIngredients('cook-1', '5 eggs\n1 tin tomatoes\nfeta', { id: 'ing-2' }, 'user', T2));

    const versions = await ingredients.listForCook('cook-1');
    expect(versions.map((v) => v.text)).toEqual(['4 eggs\n1 tin tomatoes', '5 eggs\n1 tin tomatoes\nfeta']);
    expect((await ingredients.currentForCooks(['cook-1']))[0]?.id).toBe('ing-2');
    // The first version's row is unchanged by the second save.
    const [first] = await db.adapter.select({ sql: "SELECT * FROM ingredient_versions WHERE id = 'ing-1'" });
    expect(first).toMatchObject({ text: '4 eggs\n1 tin tomatoes', saved_at: T1 });
  });

  it('rates per person: a member, a guest; changed in place; removed when it says nothing', async () => {
    const { cookRecord, ratings, householdWorkflow } = db.data;
    granted(await householdWorkflow.add('Alex', { id: 'm-alex' }, T0));
    granted(await householdWorkflow.add('Sam', { id: 'm-sam' }, T0));

    granted(await cookRecord.rate('cook-1', { memberId: 'm-alex' }, { stars: 4, notEaten: false, line: null }, { id: 'r-1' }, 'user', T1));
    const changed = granted(
      await cookRecord.rate('cook-1', { memberId: 'm-alex' }, { stars: 5, notEaten: false, line: 'Best yet.' }, { id: 'r-new' }, 'user', T2),
    );
    expect(changed?.id).toBe('r-1');
    granted(await cookRecord.rate('cook-1', { memberId: 'm-sam' }, { stars: null, notEaten: true, line: null }, { id: 'r-2' }, 'user', T2));
    granted(await cookRecord.rate('cook-1', { guestName: 'Jo' }, { stars: 3, notEaten: false, line: null }, { id: 'r-3' }, 'user', T2));
    // The same guest, typed differently, is the same rating.
    granted(await cookRecord.rate('cook-1', { guestName: 'jo' }, { stars: 2, notEaten: false, line: null }, { id: 'r-4' }, 'user', T3));

    const rows = await ratings.listForCook('cook-1');
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.memberId === 'm-alex')).toMatchObject({ stars: 5, line: 'Best yet.' });
    expect(rows.find((r) => r.memberId === 'm-sam')).toMatchObject({ stars: null, notEaten: true });
    expect(rows.find((r) => r.guestName !== null)).toMatchObject({ id: 'r-3', stars: 2 });
    expect(await ratings.listGuestNames()).toEqual(['jo']);

    expect(granted(await cookRecord.rate('cook-1', { memberId: 'm-sam' }, { stars: null, notEaten: false, line: null }, { id: 'x' }, 'user', T3))).toBeNull();
    expect(await ratings.listForCook('cook-1')).toHaveLength(2);
  });

  it('retires a member without losing their ratings, and brings them back', async () => {
    const { cookRecord, ratings, household, householdWorkflow } = db.data;
    granted(await householdWorkflow.add('Alex', { id: 'm-alex' }, T0));
    granted(await householdWorkflow.add('Sam', { id: 'm-sam' }, T0));
    granted(await cookRecord.rate('cook-1', { memberId: 'm-sam' }, { stars: 2, notEaten: false, line: null }, { id: 'r-1' }, 'user', T1));

    granted(await householdWorkflow.retire('m-sam', T2));
    expect(activeMembers(await household.list()).map((m) => m.name)).toEqual(['Alex']);
    expect(await ratings.listForCook('cook-1')).toHaveLength(1);
    // Nothing can delete a member a rating points at.
    await expect(db.adapter.execute({ sql: "DELETE FROM household_members WHERE id = 'm-sam'" })).rejects.toThrow();

    granted(await householdWorkflow.restore('m-sam'));
    expect(activeMembers(await household.list()).map((m) => m.name)).toEqual(['Alex', 'Sam']);
    const moved = await householdWorkflow.move('m-sam', 'up');
    expect(activeMembers(moved).map((m) => m.name)).toEqual(['Sam', 'Alex']);
    expect(await householdWorkflow.add('sam', { id: 'm-x' }, T3)).toMatchObject({ allowed: false });
  });

  it('remembers that the household question was asked', async () => {
    expect(await db.data.settings.get(HOUSEHOLD_ASKED_KEY)).toBeNull();
    await db.data.settings.set(HOUSEHOLD_ASKED_KEY, 'yes');
    await db.data.settings.set(HOUSEHOLD_ASKED_KEY, 'yes');
    expect(await db.data.settings.get(HOUSEHOLD_ASKED_KEY)).toBe('yes');
  });

  it('adds a next-time line later, and edits it keeping the first words', async () => {
    const { cookRecord, lessons, lessonRevisions } = db.data;
    granted(await db.data.capture.saveReview('cook-1', null, 'user', T1));
    const lesson = granted(await cookRecord.addNextTime('cook-1', '  Less cumin.  ', { id: 'lesson-1' }, 'user', T1));
    expect(lesson).toMatchObject({ text: 'Less cumin.', status: 'approved' });
    expect(await cookRecord.addNextTime('cook-1', '   ', { id: 'lesson-2' }, 'user', T1)).toMatchObject({ allowed: false });

    granted(await cookRecord.reviseNextTime('lesson-1', 'Half the cumin.', { id: 'lr-1' }, 'user', T2));
    const edits = await lessonRevisions.listForCook('cook-1');
    expect(nextTimeWords(lesson, edits)).toEqual({ text: 'Half the cumin.', edited: true });
    expect((await lessons.findById('lesson-1'))?.text).toBe('Less cumin.');
  });

  it('cooks it again: a new open cook with the title, tags, meal type and a copy of the ingredients', async () => {
    const { capture, cookRecord, cookTags, tags, ingredients, mealTypes, cooks } = db.data;
    const tag = await tags.findOrCreate('eggs', null);
    await cookTags.link({ cookId: 'cook-1', tagId: tag.id });
    granted(await cookRecord.setMealType('cook-1', 'breakfast', 'user', T0));
    granted(await cookRecord.saveIngredients('cook-1', '4 eggs', { id: 'ing-1' }, 'user', T0));
    granted(await cookRecord.saveIngredients('cook-1', '5 eggs', { id: 'ing-2' }, 'user', T1));
    granted(await capture.saveReview('cook-1', 'Good.', 'user', T1));
    const before = await everythingAbout(db.adapter, 'cook-1');

    const again = granted(await cookRecord.cookAgain('cook-1', { id: 'cook-2', ingredientsId: 'ing-3' }, 'user', T2));

    expect(again).toMatchObject({ id: 'cook-2', title: 'Shakshuka', status: 'open', parentCookId: 'cook-1' });
    expect((await cooks.findById('cook-2'))?.parentCookId).toBe('cook-1');
    expect((await cookTags.listForCook('cook-2')).map((t) => t.name)).toEqual(['eggs']);
    expect(await mealTypes.findForCook('cook-2')).toMatchObject({ mealType: 'breakfast' });
    expect(await ingredients.listForCook('cook-2')).toEqual([{ id: 'ing-3', cookId: 'cook-2', text: '5 eggs', savedAt: T2 }]);
    // Nothing on the earlier cook changed.
    expect(await everythingAbout(db.adapter, 'cook-1')).toEqual(before);
  });

  it('cooks again a cook with no tags, meal type or ingredients', async () => {
    const again = granted(await db.data.cookRecord.cookAgain('cook-1', { id: 'cook-2', ingredientsId: 'ing-1' }, 'user', T2));
    expect(again.parentCookId).toBe('cook-1');
    expect(await db.data.ingredients.listForCook('cook-2')).toEqual([]);
    expect(await db.data.mealTypes.findForCook('cook-2')).toBeNull();
  });
});

/** Every row about one cook in every table that has a `cook_id`, and the cook. */
async function everythingAbout(adapter: DatabaseAdapter, cookId: string): Promise<Record<string, unknown>> {
  const all: Record<string, unknown> = {
    cooks: await adapter.select({ sql: 'SELECT * FROM cooks WHERE id = ?', params: [cookId] }),
  };
  for (const table of SCHEMA_TABLES) {
    const columns = await adapter.select({ sql: `PRAGMA table_info(${table})` });
    if (columns.some((column) => column.name === 'cook_id')) {
      all[table] = await adapter.select({
        sql: `SELECT * FROM ${table} WHERE cook_id = ? ORDER BY rowid`,
        params: [cookId],
      });
    }
  }
  return all;
}

describe('deleting a cook takes update 2 with it, and Undo brings it back exactly', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openTestDatabase('cook-record-delete.db');
    const { capture, cookRecord, householdWorkflow } = db.data;
    granted(await householdWorkflow.add('Alex', { id: 'm-alex' }, T0));
    for (const id of ['cook-gone', 'cook-keep']) {
      granted(await capture.startCook({ id, title: id, startedAt: T0 }, 'user', T0));
      granted(await cookRecord.setMealType(id, 'snack', 'user', T0));
      granted(await cookRecord.saveIngredients(id, `${id} list`, { id: `${id}-ing` }, 'user', T0));
      granted(await capture.saveReview(id, 'Fine.', 'user', T1));
      granted(await cookRecord.rate(id, { memberId: 'm-alex' }, { stars: 3, notEaten: false, line: null }, { id: `${id}-r` }, 'user', T1));
      granted(await cookRecord.rate(id, { guestName: 'Jo' }, { stars: null, notEaten: true, line: null }, { id: `${id}-g` }, 'user', T1));
      granted(await cookRecord.addNextTime(id, 'More salt.', { id: `${id}-l` }, 'user', T1));
      granted(await cookRecord.reviseNextTime(`${id}-l`, 'Much more salt.', { id: `${id}-lr` }, 'user', T2));
    }
  });

  afterEach(async () => {
    await db.close();
  });

  const workflow = () =>
    createCookDeletionWorkflow({
      data: db.data,
      photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
      now: () => T3,
    });

  it('Undo restores every row exactly', async () => {
    const before = await everythingAbout(db.adapter, 'cook-gone');
    const deletions = workflow();
    expect((await deletions.request('cook-gone')).status).toBe('pending');
    // Hidden from the lists, and from Export everything.
    const snapshot = await db.data.snapshots.readSnapshot();
    expect(snapshot.ratings.some((r) => r.cookId === 'cook-gone')).toBe(false);
    expect(snapshot.ingredientVersions.some((v) => v.cookId === 'cook-gone')).toBe(false);
    expect(snapshot.cookMealTypes.some((m) => m.cookId === 'cook-gone')).toBe(false);
    expect(snapshot.lessonRevisions.some((m) => m.cookId === 'cook-gone')).toBe(false);
    expect(snapshot.householdMembers).toHaveLength(1);

    await deletions.undo('cook-gone');
    expect(await everythingAbout(db.adapter, 'cook-gone')).toEqual(before);
  });

  it('the deletion itself leaves no row of it, keeps the other cook, and keeps the household', async () => {
    const keep = await everythingAbout(db.adapter, 'cook-keep');
    const deletions = workflow();
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');

    const gone = await everythingAbout(db.adapter, 'cook-gone');
    for (const rows of Object.values(gone)) {
      expect(rows).toEqual([]);
    }
    expect(await everythingAbout(db.adapter, 'cook-keep')).toEqual(keep);
    expect(await db.data.household.list()).toHaveLength(1);
    expect(await db.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
  });
});
