/**
 * The tag reads the screens are built from, against real SQL.
 *
 * Every list on screen comes from one of these, and each has a rule behind it
 * that is easy to get subtly wrong: only tags that are on a cook, each of them
 * once, in an order that does not move about between visits.
 */

import type { Tag } from '../src/domain/entities';
import { openTestDatabase, type TestDatabase } from './support/database';

const AT = '2026-10-20T18:00:00.000Z';

let db: TestDatabase;

function names(tags: readonly Tag[]): readonly string[] {
  return tags.map((tag) => tag.name);
}

beforeEach(async () => {
  db = await openTestDatabase('tag-reads.db');
});

afterEach(async () => {
  await db.close();
});

/** Four cooks and a handful of tags, linked the way a kitchen would. */
async function fill(): Promise<void> {
  const { data } = db;
  for (const id of ['cook-1', 'cook-2', 'cook-3', 'cook-4']) {
    await data.capture.startCook({ id, startedAt: AT }, 'user', AT);
  }

  const pork = await data.tags.findOrCreate('pork chops', null);
  const butter = await data.tags.findOrCreate('brown butter', null);
  const cider = await data.tags.findOrCreate('cider', null);
  const iron = await data.tags.findOrCreate('cast iron', null);
  // Used on no cook at all: created once, then taken off its only cook.
  const abandoned = await data.tags.findOrCreate('aubergine', null);

  await data.cookTags.link({ cookId: 'cook-1', tagId: pork.id });
  await data.cookTags.link({ cookId: 'cook-1', tagId: butter.id });
  await data.cookTags.link({ cookId: 'cook-2', tagId: pork.id });
  await data.cookTags.link({ cookId: 'cook-2', tagId: cider.id });
  await data.cookTags.link({ cookId: 'cook-3', tagId: pork.id });
  await data.cookTags.link({ cookId: 'cook-4', tagId: iron.id });

  await data.cookTags.link({ cookId: 'cook-4', tagId: abandoned.id });
  await data.cookTags.unlink('cook-4', abandoned.id);
}

describe('creating a tag with no kind', () => {
  it('normalises the name and stores no kind', async () => {
    const tag = await db.data.tags.findOrCreate('  Brown   Butter ', null);

    expect(tag).toEqual({ id: 'tag-01', name: 'brown butter', kind: null });
  });

  it('finds the same tag again rather than making a second', async () => {
    const first = await db.data.tags.findOrCreate('brown butter', null);
    const second = await db.data.tags.findOrCreate('BROWN BUTTER', null);

    expect(second).toEqual(first);
    expect(await db.data.tags.listByName()).toHaveLength(1);
  });

  it('keeps an untyped tag and a typed one of the same name apart', async () => {
    const untyped = await db.data.tags.findOrCreate('butter', null);
    const typed = await db.data.tags.findOrCreate('butter', 'ingredient');

    expect(untyped.id).not.toBe(typed.id);
    expect(await db.data.tags.findByNameAndKind('butter', null)).toEqual(untyped);
    expect(await db.data.tags.findByNameAndKind('butter', 'ingredient')).toEqual(typed);
  });
});

describe('the whole alphabet', () => {
  it('lists every tag by name, whatever kind it has', async () => {
    await db.data.tags.findOrCreate('rhubarb', null);
    await db.data.tags.findOrCreate('anchovy', 'ingredient');
    await db.data.tags.findOrCreate('braise', null);

    expect(names(await db.data.tags.listByName())).toEqual(['anchovy', 'braise', 'rhubarb']);
  });

  it('is one alphabet, not one per kind', async () => {
    // `list()` orders by kind first, which is right for a namespaced listing
    // and wrong for "show me my tags".
    await db.data.tags.findOrCreate('zucchini', null);
    await db.data.tags.findOrCreate('apple', 'ingredient');

    expect(names(await db.data.tags.listByName())).toEqual(['apple', 'zucchini']);
  });
});

describe('suggesting as he types', () => {
  beforeEach(fill);

  it('offers the tags that begin with what was typed, first', async () => {
    expect(names(await db.data.tags.suggest('b', 10))).toEqual(['brown butter']);
    // "chops" starts with a c as well, so it is offered — after the two tags
    // whose first word does, shortest first.
    expect(names(await db.data.tags.suggest('c', 10))).toEqual([
      'cider',
      'cast iron',
      'pork chops',
    ]);
  });

  it('finds a word inside a multi-word tag', async () => {
    expect(names(await db.data.tags.suggest('butter', 10))).toEqual(['brown butter']);
    expect(names(await db.data.tags.suggest('iron', 10))).toEqual(['cast iron']);
  });

  it('ignores case and surrounding space', async () => {
    expect(names(await db.data.tags.suggest('  CIDER  ', 10))).toEqual(['cider']);
  });

  it('offers nothing for nothing typed', async () => {
    expect(await db.data.tags.suggest('', 10)).toEqual([]);
    expect(await db.data.tags.suggest('   ', 10)).toEqual([]);
  });

  it('treats a wildcard character as a character', async () => {
    // What was typed is matched as literal text: a `%` finds the tag with a
    // percent sign in it, not every tag there is.
    await db.data.tags.findOrCreate('50% rye', null);

    expect(names(await db.data.tags.suggest('50%', 10))).toEqual(['50% rye']);
    expect(names(await db.data.tags.suggest('%', 10))).toEqual([]);
    expect(names(await db.data.tags.suggest('_', 10))).toEqual([]);
  });

  it('does not offer a tag that merely contains the letters mid-word', async () => {
    // Typing "b" offers "brown butter" and not "aubergine", which is the same
    // rule History's search uses.
    expect(names(await db.data.tags.suggest('b', 10))).not.toContain('aubergine');
    expect(names(await db.data.tags.suggest('erg', 10))).toEqual([]);
  });

  it('stops at the limit it was given', async () => {
    expect(await db.data.tags.suggest('c', 1)).toHaveLength(1);
  });
});

describe('the tags that are actually in use', () => {
  beforeEach(fill);

  it('lists every tag on at least one cook, alphabetically, once each', async () => {
    expect(names(await db.data.cookTags.listUsedTags())).toEqual([
      'brown butter',
      'cast iron',
      'cider',
      'pork chops',
    ]);
  });

  it('leaves out a tag that is on no cook', async () => {
    // Not deleted — "not on any cook" and "not a word I use" are different —
    // but not offered back either.
    expect(names(await db.data.cookTags.listUsedTags())).not.toContain('aubergine');
    expect(names(await db.data.tags.listByName())).toContain('aubergine');
  });

  it('orders the most used first, then alphabetically', async () => {
    expect(names(await db.data.cookTags.listMostUsedTags(10))).toEqual([
      'pork chops',
      'brown butter',
      'cast iron',
      'cider',
    ]);
  });

  it('stops at the limit it was given', async () => {
    expect(names(await db.data.cookTags.listMostUsedTags(2))).toEqual([
      'pork chops',
      'brown butter',
    ]);
  });
});

describe('several cooks’ tags at once', () => {
  beforeEach(fill);

  it('returns each cook with its own tags, alphabetically', async () => {
    const taggings = await db.data.cookTags.listForCooks(['cook-1', 'cook-2']);

    expect(
      taggings.map((tagging) => [tagging.cookId, names(tagging.tags)]),
    ).toEqual([
      ['cook-1', ['brown butter', 'pork chops']],
      ['cook-2', ['cider', 'pork chops']],
    ]);
  });

  it('leaves out a cook with no tags rather than returning it empty', async () => {
    const taggings = await db.data.cookTags.listForCooks(['cook-1', 'cook-4']);
    const abandonedOnly = await db.data.cookTags.listForCooks(['cook-4']);

    expect(taggings.map((tagging) => tagging.cookId)).toEqual(['cook-1', 'cook-4']);
    // cook-4 still has `cast iron`; a cook with nothing at all is absent.
    expect(names(abandonedOnly[0]?.tags ?? [])).toEqual(['cast iron']);
    expect(await db.data.cookTags.listForCooks(['cook-nothing'])).toEqual([]);
  });

  it('asks for nothing when given no cooks', async () => {
    expect(await db.data.cookTags.listForCooks([])).toEqual([]);
  });
});

describe('taking a tag off one cook', () => {
  beforeEach(fill);

  it('leaves it on every other cook', async () => {
    const pork = await db.data.tags.findByNameAndKind('pork chops', null);

    await db.data.cookTags.unlink('cook-1', pork!.id);

    expect(names(await db.data.cookTags.listForCook('cook-1'))).toEqual(['brown butter']);
    expect(names(await db.data.cookTags.listForCook('cook-2'))).toContain('pork chops');
    expect(names(await db.data.cookTags.listForCook('cook-3'))).toEqual(['pork chops']);
  });

  it('does not delete the tag itself', async () => {
    const butter = await db.data.tags.findByNameAndKind('brown butter', null);

    await db.data.cookTags.unlink('cook-1', butter!.id);

    expect(await db.data.tags.findById(butter!.id)).toEqual(butter);
  });
});
