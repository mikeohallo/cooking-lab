/**
 * A cook's cuisine (schema version 5) and the fifth meal type, Side.
 *
 * Rule 13 in the domain, where each change is decided and the assistant is
 * refused; the repository and the cook record service on real SQLite; Cook
 * this again; delete with Undo and the deletion itself, with Export
 * everything during the undo window; and the cuisine where a cook is read —
 * the text export, the search and the filters.
 *
 * The people are "You" and "Guest".
 */

import { createCookDeletionWorkflow } from '../src/data/deletion/workflow';
import { renderCookAsText } from '../src/data/export/cookText';
import { createExportService } from '../src/data/export/service';
import type { ExportFile, ExportSink } from '../src/data/export/sink';
import { createPrivateFileStore } from '../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import { CUISINE_LABELS, MEAL_TYPE_LABELS, cuisineLabel, mealTypeLabel } from '../src/domain/cookRecord';
import type { Cook } from '../src/domain/entities';
import { CUISINES, MEAL_TYPES, NAMED_CUISINES, STORED_MEAL_TYPES } from '../src/domain/enums';
import { setCuisine, setMealType, type EvidenceDecision } from '../src/domain/evidence';
import { validateCookCuisine } from '../src/domain/invariants';
import {
  applyFilters,
  cuisineIs,
  cuisineOptions,
  filtersActive,
  sameCuisinePick,
  type CuisinePick,
} from '../src/screens/history/filters';
import { searchCooks, searchable } from '../src/screens/history/search';
import { openTestDatabase, type TestDatabase } from './support/database';
import { memoryFileSystem, nodeDigest } from './support/memoryPorts';

const T0 = '2026-11-02T17:00:00.000Z';
const T1 = '2026-11-02T18:00:00.000Z';
const T2 = '2026-11-02T19:00:00.000Z';
const T3 = '2026-11-02T20:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code} ${decision.message}`);
  }
  return decision.record;
}

function cook(id: string, title: string | null, status: 'open' | 'reviewed' = 'open', startedAt = T0): Cook {
  return {
    id,
    title,
    status,
    provenance: 'live',
    parentCookId: null,
    startedAt,
    reviewOpenedAt: status === 'reviewed' ? T1 : null,
    reviewSavedAt: status === 'reviewed' ? T1 : null,
    verdict: status === 'reviewed' ? 'Good.' : null,
    createdAt: startedAt,
  };
}

const SOUVLAKI = cook('cook-souvlaki', 'Souvlaki');

describe('the vocabularies', () => {
  it('stores five meal types, Side last, and labels it "Side"', () => {
    expect(STORED_MEAL_TYPES).toEqual(['breakfast', 'lunch_dinner', 'dessert', 'snack', 'side']);
    expect(MEAL_TYPES).toEqual(['breakfast', 'lunch_dinner', 'dessert', 'snack', 'side', 'none']);
    expect(Object.keys(MEAL_TYPE_LABELS)).toEqual([...STORED_MEAL_TYPES]);
    expect(mealTypeLabel('side')).toBe('Side');
  });

  it('has eleven cuisines, ten with a label and Other with the cook’s own words', () => {
    expect(CUISINES).toEqual([
      'american',
      'italian',
      'french',
      'greek',
      'middle_eastern',
      'indian',
      'japanese',
      'korean',
      'mexican',
      'thai',
      'other',
    ]);
    expect(NAMED_CUISINES).toEqual(CUISINES.filter((key) => key !== 'other'));
    expect(NAMED_CUISINES.map((key) => CUISINE_LABELS[key])).toEqual([
      'American',
      'Italian',
      'French',
      'Greek',
      'Middle Eastern',
      'Indian',
      'Japanese',
      'Korean',
      'Mexican',
      'Thai',
    ]);
    expect(cuisineLabel({ cuisine: 'middle_eastern', otherWords: null })).toBe('Middle Eastern');
    expect(cuisineLabel({ cuisine: 'other', otherWords: 'Home baking' })).toBe('Home baking');
    expect(cuisineLabel(null)).toBeNull();
  });
});

describe('rule 13: the cuisine is the cook’s', () => {
  it('refuses the assistant, set or clear, and on a reviewed cook too', () => {
    for (const target of [SOUVLAKI, cook('cook-done', 'Done', 'reviewed')]) {
      expect(setCuisine(target, 'greek', null, 'ai', T1)).toMatchObject({
        allowed: false,
        code: 'ai_cannot_write_raw_evidence',
      });
      expect(setCuisine(target, null, null, 'ai', T1)).toMatchObject({ allowed: false });
    }
    // Side is no different from the other meal types.
    expect(setMealType(SOUVLAKI, 'side', 'ai', T1)).toMatchObject({ allowed: false });
    expect(granted(setMealType(SOUVLAKI, 'side', 'user', T1))).toEqual({ cookId: 'cook-souvlaki', mealType: 'side', setAt: T1 });
  });

  it('sets a named cuisine on an open or a reviewed cook, and clears it with null', () => {
    expect(granted(setCuisine(SOUVLAKI, 'greek', null, 'user', T1))).toEqual({
      cookId: 'cook-souvlaki',
      cuisine: 'greek',
      otherWords: null,
      setAt: T1,
    });
    expect(granted(setCuisine(cook('cook-done', 'Done', 'reviewed'), 'thai', '   ', 'user', T1))).toMatchObject({
      cuisine: 'thai',
      otherWords: null,
    });
    expect(granted(setCuisine(SOUVLAKI, null, null, 'user', T1))).toBeNull();
  });

  it('keeps Other’s words trimmed, 1 to 40 characters on one line', () => {
    expect(granted(setCuisine(SOUVLAKI, 'other', '  Home baking  ', 'user', T1))).toMatchObject({
      cuisine: 'other',
      otherWords: 'Home baking',
    });
    expect(granted(setCuisine(SOUVLAKI, 'other', 'x'.repeat(40), 'user', T1))?.otherWords).toHaveLength(40);
    for (const words of [null, '', '    ', 'x'.repeat(41), 'Two\nlines']) {
      expect(setCuisine(SOUVLAKI, 'other', words, 'user', T1)).toMatchObject({
        allowed: false,
        code: 'cuisine_not_valid',
      });
    }
  });

  it('refuses words with a named cuisine and a cuisine that is not one of the eleven', () => {
    expect(setCuisine(SOUVLAKI, 'greek', 'Island', 'user', T1)).toMatchObject({ code: 'cuisine_not_valid' });
    expect(setCuisine(SOUVLAKI, 'british' as never, null, 'user', T1)).toMatchObject({ code: 'cuisine_not_valid' });
  });

  it('reads Other words that are one of the ten names as that cuisine', () => {
    expect(granted(setCuisine(SOUVLAKI, 'other', ' greek ', 'user', T1))).toMatchObject({
      cuisine: 'greek',
      otherWords: null,
    });
    expect(granted(setCuisine(SOUVLAKI, 'other', 'MIDDLE EASTERN', 'user', T1))).toMatchObject({
      cuisine: 'middle_eastern',
    });
  });

  it('validates a stored row the way the schema does', () => {
    const row = { cookId: 'cook-souvlaki', setAt: T1 };
    expect(validateCookCuisine({ ...row, cuisine: 'greek', otherWords: null })).toEqual([]);
    expect(validateCookCuisine({ ...row, cuisine: 'other', otherWords: 'Home baking' })).toEqual([]);
    expect(validateCookCuisine({ ...row, cuisine: 'other', otherWords: null }).map((i) => i.field)).toEqual(['otherWords']);
    expect(validateCookCuisine({ ...row, cuisine: 'other', otherWords: ' Home ' }).map((i) => i.field)).toEqual(['otherWords']);
    expect(validateCookCuisine({ ...row, cuisine: 'other', otherWords: 'x'.repeat(41) }).map((i) => i.code)).toEqual(['too_long']);
    expect(validateCookCuisine({ ...row, cuisine: 'greek', otherWords: 'Island' }).map((i) => i.field)).toEqual(['otherWords']);
    expect(validateCookCuisine({ ...row, cuisine: 'british' as never, otherWords: null }).map((i) => i.field)).toEqual(['cuisine']);
  });
});

describe('the cuisine on real SQLite', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openTestDatabase('cuisine.db');
    granted(await db.data.capture.startCook({ id: 'cook-souvlaki', title: 'Souvlaki', startedAt: T0 }, 'user', T0));
  });

  afterEach(async () => {
    await db.close();
  });

  it('sets, changes and clears a cuisine, one row at most; clearing deletes the row', async () => {
    const { cookRecord, cuisines } = db.data;
    granted(await cookRecord.setCuisine('cook-souvlaki', 'greek', null, 'user', T1));
    expect(await cuisines.findForCook('cook-souvlaki')).toEqual({
      cookId: 'cook-souvlaki',
      cuisine: 'greek',
      otherWords: null,
      setAt: T1,
    });
    granted(await cookRecord.setCuisine('cook-souvlaki', 'other', ' Taverna ', 'user', T2));
    expect(await cuisines.findForCook('cook-souvlaki')).toEqual({
      cookId: 'cook-souvlaki',
      cuisine: 'other',
      otherWords: 'Taverna',
      setAt: T2,
    });
    expect(await cuisines.listForCooks(['cook-souvlaki', 'cook-none'])).toHaveLength(1);

    expect(granted(await cookRecord.setCuisine('cook-souvlaki', null, null, 'user', T3))).toBeNull();
    expect(await cuisines.findForCook('cook-souvlaki')).toBeNull();
    const rows = await db.adapter.select({ sql: 'SELECT count(*) AS total FROM cook_cuisines' });
    expect(Number(rows[0]?.total)).toBe(0);
  });

  it('works on a reviewed cook, and refuses the assistant without writing anything', async () => {
    const { capture, cookRecord, cuisines } = db.data;
    granted(await capture.saveReview('cook-souvlaki', 'Good.', 'user', T1));
    granted(await cookRecord.setCuisine('cook-souvlaki', 'greek', null, 'user', T2));

    expect(await cookRecord.setCuisine('cook-souvlaki', 'thai', null, 'ai', T3)).toMatchObject({ allowed: false });
    expect(await cookRecord.setCuisine('cook-souvlaki', null, null, 'ai', T3)).toMatchObject({ allowed: false });
    expect(await cookRecord.setCuisine('cook-souvlaki', 'other', '', 'user', T3)).toMatchObject({
      code: 'cuisine_not_valid',
    });
    expect((await cuisines.findForCook('cook-souvlaki'))?.cuisine).toBe('greek');
    // Side through the same service the review and the cook's page use.
    granted(await cookRecord.setMealType('cook-souvlaki', 'side', 'user', T3));
    expect(await db.data.mealTypes.findForCook('cook-souvlaki')).toMatchObject({ mealType: 'side' });
  });

  it('lists every Other cuisine’s words once, ignoring case, leaving out a cook being deleted', async () => {
    const { capture, cookRecord, cuisines, cookDeletions } = db.data;
    const start = async (id: string, cuisine: 'other' | 'greek', words: string | null, at: string) => {
      granted(await capture.startCook({ id, title: id, startedAt: at }, 'user', at));
      granted(await cookRecord.setCuisine(id, cuisine, words, 'user', at));
    };
    await start('cook-a', 'other', 'Taverna', T0);
    await start('cook-b', 'other', 'taverna', T1);
    await start('cook-c', 'other', 'Home baking', T1);
    await start('cook-d', 'greek', null, T1);
    await start('cook-e', 'other', 'Street food', T2);
    await cookDeletions.request('cook-e', T3);

    expect(await cuisines.listOtherWords()).toEqual(['Home baking', 'Taverna']);
  });

  it('is copied by Cook this again, and the earlier cook is untouched', async () => {
    const { capture, cookRecord, cuisines } = db.data;
    granted(await cookRecord.setMealType('cook-souvlaki', 'side', 'user', T0));
    granted(await cookRecord.setCuisine('cook-souvlaki', 'other', 'Taverna', 'user', T0));
    granted(await capture.saveReview('cook-souvlaki', 'Good.', 'user', T1));

    granted(await cookRecord.cookAgain('cook-souvlaki', { id: 'cook-again', ingredientsId: 'ing-1' }, 'user', T2));

    expect(await cuisines.findForCook('cook-again')).toEqual({
      cookId: 'cook-again',
      cuisine: 'other',
      otherWords: 'Taverna',
      setAt: T2,
    });
    expect(await db.data.mealTypes.findForCook('cook-again')).toMatchObject({ mealType: 'side' });
    expect(await cuisines.findForCook('cook-souvlaki')).toMatchObject({ otherWords: 'Taverna', setAt: T0 });
  });

  it('cooks again a cook with no cuisine without giving the new one any', async () => {
    granted(await db.data.cookRecord.cookAgain('cook-souvlaki', { id: 'cook-again', ingredientsId: 'ing-1' }, 'user', T2));
    expect(await db.data.cuisines.findForCook('cook-again')).toBeNull();
  });
});

describe('deleting a cook takes its cuisine, and Undo brings it back', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openTestDatabase('cuisine-delete.db');
    const { capture, cookRecord } = db.data;
    for (const [id, cuisine, words] of [
      ['cook-gone', 'other', 'Taverna'],
      ['cook-keep', 'greek', null],
    ] as const) {
      granted(await capture.startCook({ id, title: id, startedAt: T0 }, 'user', T0));
      granted(await cookRecord.setMealType(id, 'side', 'user', T0));
      granted(await cookRecord.setCuisine(id, cuisine, words, 'user', T0));
      granted(await capture.saveReview(id, 'Fine.', 'user', T1));
    }
  });

  afterEach(async () => {
    await db.close();
  });

  const photos = () => createPrivateFileStore(memoryFileSystem(), nodeDigest);
  const workflow = () => createCookDeletionWorkflow({ data: db.data, photos: photos(), now: () => T3 });

  it('hides it from Export everything during the undo window, and Undo restores it exactly', async () => {
    const before = await db.adapter.select({ sql: 'SELECT rowid AS row_id, * FROM cook_cuisines ORDER BY rowid' });
    const deletions = workflow();
    expect((await deletions.request('cook-gone')).status).toBe('pending');

    const snapshot = await db.data.snapshots.readSnapshot();
    expect(snapshot.cookCuisines.map((row) => row.cookId)).toEqual(['cook-keep']);
    expect(snapshot.cookMealTypes.map((row) => row.cookId)).toEqual(['cook-keep']);

    // The file Export everything writes says the same.
    const shared: ExportFile[] = [];
    const sink: ExportSink = {
      canShare: async () => true,
      share: async (file) => {
        shared.push(file);
      },
    };
    const exporter = createExportService({
      data: db.data,
      photos: photos(),
      schemaVersion: LATEST_SCHEMA_VERSION,
      sink,
      variant: 'production',
      now: () => T3,
    });
    expect((await exporter.exportEverything()).ok).toBe(true);
    const file = shared[0]?.text ?? '';
    expect(file).not.toContain('cook-gone');
    expect(file).not.toContain('Taverna');
    expect(file).toContain('"cookCuisines"');

    await deletions.undo('cook-gone');
    expect(await db.adapter.select({ sql: 'SELECT rowid AS row_id, * FROM cook_cuisines ORDER BY rowid' })).toEqual(before);
    expect(await db.data.cuisines.listOtherWords()).toEqual(['Taverna']);
  });

  it('the deletion itself removes its cuisine and meal type, and keeps the other cook’s', async () => {
    const deletions = workflow();
    await deletions.request('cook-gone');
    await deletions.finish('cook-gone');

    expect(await db.data.cuisines.findForCook('cook-gone')).toBeNull();
    expect(await db.data.mealTypes.findForCook('cook-gone')).toBeNull();
    expect(await db.data.cuisines.findForCook('cook-keep')).toMatchObject({ cuisine: 'greek' });
    expect(await db.data.cuisines.listOtherWords()).toEqual([]);
    expect(await db.adapter.select({ sql: 'PRAGMA foreign_key_check' })).toEqual([]);
  });
});

describe('Export this cook', () => {
  const base = { tags: [], events: [], lessons: [], variant: 'production' as const, exportedAt: T3 };

  it('puts the cuisine on the meal type’s line', () => {
    const text = renderCookAsText({
      ...base,
      cook: SOUVLAKI,
      mealType: 'lunch_dinner',
      cuisine: { cuisine: 'greek', otherWords: null },
    });
    expect(text).toContain('Cooking Lab — Souvlaki\nMeal: Lunch/Dinner · Greek\n');
  });

  it('prints Side, and an Other cuisine as the cook’s words', () => {
    const text = renderCookAsText({
      ...base,
      cook: SOUVLAKI,
      mealType: 'side',
      cuisine: { cuisine: 'other', otherWords: 'Taverna' },
    });
    expect(text).toContain('\nMeal: Side · Taverna\n');
  });

  it('gives a cuisine with no meal type a line of its own, and prints neither when there is neither', () => {
    const cuisineOnly = renderCookAsText({ ...base, cook: SOUVLAKI, cuisine: { cuisine: 'thai', otherWords: null } });
    expect(cuisineOnly).toContain('Cooking Lab — Souvlaki\nCuisine: Thai\nStarted:');
    expect(cuisineOnly).not.toContain('Meal:');

    const neither = renderCookAsText({ ...base, cook: SOUVLAKI });
    expect(neither).not.toContain('Meal:');
    expect(neither).not.toContain('Cuisine:');
    expect(renderCookAsText({ ...base, cook: SOUVLAKI, mealType: 'snack' })).toContain('\nMeal: Snack\n');
  });

  it('carries it through the real export service', async () => {
    const db = await openTestDatabase('cuisine-export.db');
    try {
      granted(await db.data.capture.startCook({ id: 'cook-souvlaki', title: 'Souvlaki', startedAt: T0 }, 'user', T0));
      granted(await db.data.cookRecord.setMealType('cook-souvlaki', 'lunch_dinner', 'user', T1));
      granted(await db.data.cookRecord.setCuisine('cook-souvlaki', 'greek', null, 'user', T1));
      const shared: ExportFile[] = [];
      const exporter = createExportService({
        data: db.data,
        photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
        schemaVersion: LATEST_SCHEMA_VERSION,
        sink: { canShare: async () => true, share: async (file) => void shared.push(file) },
        variant: 'production',
        now: () => T3,
      });

      expect((await exporter.exportCook('cook-souvlaki')).ok).toBe(true);
      expect(shared[0]?.text).toContain('\nMeal: Lunch/Dinner · Greek\n');
    } finally {
      await db.close();
    }
  });
});

describe('search and filters', () => {
  const GYROS = cook('c-gyros', 'Gyros', 'reviewed', '2026-10-01T18:00:00.000Z');
  const FALAFEL = cook('c-falafel', 'Falafel wraps', 'reviewed', '2026-10-02T18:00:00.000Z');
  const BREAD = cook('c-bread', 'Sourdough', 'reviewed', '2026-10-03T18:00:00.000Z');
  const SALAD = cook('c-salad', 'Greek salad', 'reviewed', '2026-10-04T18:00:00.000Z');
  const PLAIN = cook('c-plain', 'Rice', 'reviewed', '2026-10-05T18:00:00.000Z');
  const COOKS = [GYROS, FALAFEL, BREAD, SALAD, PLAIN];
  const CUISINE_ROWS = {
    'c-gyros': { cuisine: 'greek', otherWords: null },
    'c-falafel': { cuisine: 'middle_eastern', otherWords: null },
    'c-bread': { cuisine: 'other', otherWords: 'Home baking' },
    'c-salad': { cuisine: 'italian', otherWords: null },
  } as const;
  const WORDS = new Map(
    Object.entries(CUISINE_ROWS).map(([id, row]) => [id, cuisineLabel(row) ?? ''] as const),
  );

  it('finds a cook by its cuisine’s label, from the start of a word', () => {
    const results = searchCooks(searchable(COOKS, new Map(), new Map(), WORDS), { typed: 'Greek', pickedTags: [] });
    // Gyros by its cuisine, the salad by its title.
    expect(results.all.map((hit) => hit.cook.id).sort()).toEqual(['c-gyros', 'c-salad']);
    expect(searchCooks(searchable(COOKS, new Map(), new Map(), WORDS), { typed: 'reek', pickedTags: [] }).all).toEqual([]);
    const eastern = searchCooks(searchable(COOKS, new Map(), new Map(), WORDS), { typed: 'middle east', pickedTags: [] });
    expect(eastern.all.map((hit) => hit.cook.id)).toEqual(['c-falafel']);
  });

  it('finds a cook by an Other cuisine’s words, and shows nothing new in the result', () => {
    const results = searchCooks(searchable(COOKS, new Map(), new Map(), WORDS), { typed: 'baking', pickedTags: [] });
    expect(results.all.map((hit) => hit.cook.id)).toEqual(['c-bread']);
    const hit = results.all[0];
    expect(hit?.title).toEqual([{ text: 'Sourdough', matched: false }]);
    expect(hit?.ingredientLine).toEqual([]);
    expect(Object.keys(hit ?? {}).sort()).toEqual(['cook', 'ingredientLine', 'matched', 'tagLine', 'tags', 'title']);
  });

  const inputs = { mealTypes: {}, ratingsByCook: new Map(), cuisines: CUISINE_ROWS };
  const named = (cuisine: 'greek' | 'italian' | 'middle_eastern' | 'thai'): CuisinePick => ({ kind: 'named', cuisine });

  it('filters by any of the cuisines picked; a cook with none matches none', () => {
    const none = { mealTypes: [], who: null };
    expect(applyFilters(COOKS, inputs, none)).toEqual(COOKS);
    expect(applyFilters(COOKS, inputs, { ...none, cuisines: [] })).toEqual(COOKS);
    expect(filtersActive({ ...none, cuisines: [] })).toBe(false);
    expect(filtersActive({ ...none, cuisines: [named('greek')] })).toBe(true);

    expect(applyFilters(COOKS, inputs, { ...none, cuisines: [named('greek')] })).toEqual([GYROS]);
    expect(applyFilters(COOKS, inputs, { ...none, cuisines: [named('greek'), named('middle_eastern')] })).toEqual([
      GYROS,
      FALAFEL,
    ]);
    expect(applyFilters(COOKS, inputs, { ...none, cuisines: [{ kind: 'other', words: ' home BAKING ' }] })).toEqual([BREAD]);
    expect(applyFilters(COOKS, inputs, { ...none, cuisines: [named('thai')] })).toEqual([]);
    // Combined with a meal type: both must hold.
    expect(
      applyFilters(
        COOKS,
        { ...inputs, mealTypes: { 'c-gyros': 'side', 'c-salad': 'side' } },
        { mealTypes: ['side'], who: null, cuisines: [named('italian')] },
      ),
    ).toEqual([SALAD]);
  });

  it('offers the ten, then each Other cuisine’s words once, not repeating a name', () => {
    const options = cuisineOptions(['Home baking', 'home baking', 'Taverna', ' greek ', '']);
    expect(options.map((option) => option.label)).toEqual([
      'American',
      'Italian',
      'French',
      'Greek',
      'Middle Eastern',
      'Indian',
      'Japanese',
      'Korean',
      'Mexican',
      'Thai',
      'Home baking',
      'Taverna',
    ]);
    expect(options[10]).toEqual({
      pick: { kind: 'other', words: 'Home baking' },
      label: 'Home baking',
      key: 'cuisine-other-home baking',
    });
    expect(options[3]).toEqual({ pick: { kind: 'named', cuisine: 'greek' }, label: 'Greek', key: 'cuisine-greek' });
    expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
  });

  it('compares picks and cuisines the same way', () => {
    expect(sameCuisinePick({ kind: 'other', words: 'Taverna' }, { kind: 'other', words: 'taverna ' })).toBe(true);
    expect(sameCuisinePick(named('greek'), { kind: 'other', words: 'Greek' })).toBe(false);
    expect(cuisineIs({ cuisine: 'other', otherWords: 'Taverna' }, { kind: 'other', words: 'TAVERNA' })).toBe(true);
    expect(cuisineIs(null, named('greek'))).toBe(false);
  });
});
