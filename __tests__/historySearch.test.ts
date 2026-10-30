/**
 * Searching history: what matches, in what order, and what is highlighted.
 *
 * Pure, so the behaviour that is hardest to see on a phone — the ranking and
 * the grouping — can be stated as plainly as it was designed.
 */

import type { Cook, Tag } from '../src/domain/entities';
import {
  highlight,
  searchCooks,
  searchTerms,
  searchable,
  wordStartMatches,
  type SearchHit,
} from '../src/screens/history/search';

function cook(id: string, title: string | null, startedAt: string): Cook {
  return {
    id,
    title,
    status: 'reviewed',
    provenance: 'live',
    parentCookId: null,
    startedAt,
    reviewOpenedAt: startedAt,
    reviewSavedAt: startedAt,
    verdict: null,
    createdAt: startedAt,
  };
}

function tag(name: string): Tag {
  return { id: `tag-${name.replace(/\s/g, '-')}`, name, kind: null };
}

const CHOPS = cook('cook-chops', 'Pork chops', '2026-10-01T18:00:00.000Z');
const CIDER = cook('cook-cider', 'Cider braised shoulder', '2026-10-05T18:00:00.000Z');
const BUTTER = cook('cook-butter', 'Monday pasta', '2026-10-09T18:00:00.000Z');
const UNNAMED = cook('cook-unnamed', null, '2026-10-11T18:00:00.000Z');

// Tags in the order the repository hands them over: alphabetical by name.
const ENTRIES = [
  { cook: CHOPS, tags: [tag('cast iron'), tag('pork')] },
  { cook: CIDER, tags: [tag('cider'), tag('pork')] },
  { cook: BUTTER, tags: [tag('brown butter')] },
  { cook: UNNAMED, tags: [] },
];

function ids(hits: readonly SearchHit[]): readonly string[] {
  return hits.map((hit) => hit.cook.id);
}

function matchedText(hit: SearchHit): readonly string[] {
  return hit.title.filter((segment) => segment.matched).map((segment) => segment.text);
}

describe('the terms a search runs with', () => {
  it('splits what was typed into words', () => {
    expect(searchTerms({ typed: 'pork cider', pickedTags: [] })).toEqual([
      { text: 'pork', source: 'typed' },
      { text: 'cider', source: 'typed' },
    ]);
  });

  it('keeps a tapped tag whole, however many words it has', () => {
    // The difference that matters: "brown butter" is one thing the kitchen
    // named, not two colours of word.
    expect(searchTerms({ typed: '', pickedTags: ['brown butter'] })).toEqual([
      { text: 'brown butter', source: 'tag' },
    ]);
  });

  it('normalises and drops the empties', () => {
    expect(searchTerms({ typed: '  Pork   CHOPS  ', pickedTags: [] })).toEqual([
      { text: 'pork', source: 'typed' },
      { text: 'chops', source: 'typed' },
    ]);
    expect(searchTerms({ typed: '   ', pickedTags: [] })).toEqual([]);
  });

  it('counts a word typed and tapped as one term, the tapped one', () => {
    // Otherwise one word would score a cook twice and outrank a cook that
    // genuinely matched two different things.
    expect(searchTerms({ typed: 'pork', pickedTags: ['pork'] })).toEqual([
      { text: 'pork', source: 'tag' },
    ]);
  });
});

describe('what a term matches', () => {
  it('matches the start of a word, not the middle of one', () => {
    expect(wordStartMatches('Pork chops', 'pork')).toEqual([0]);
    expect(wordStartMatches('Pork chops', 'chop')).toEqual([5]);
    // "ham" should find the ham, not the Nottingham.
    expect(wordStartMatches('Nottingham ham hock', 'ham')).toEqual([11]);
  });

  it('matches a half-typed word', () => {
    expect(wordStartMatches('Pork chops', 'cho')).toEqual([5]);
  });

  it('matches a multi-word term as a phrase', () => {
    expect(wordStartMatches('brown butter sauce', 'brown butter')).toEqual([0]);
    expect(wordStartMatches('butter browned slowly', 'brown butter')).toEqual([]);
  });

  it('ignores case on both sides', () => {
    expect(wordStartMatches('PORK CHOPS', 'pork')).toEqual([0]);
  });
});

describe('grouping the results', () => {
  it('puts the cooks that matched everything first', () => {
    const results = searchCooks(ENTRIES, { typed: 'pork cider', pickedTags: [] });

    expect(ids(results.all)).toEqual(['cook-cider']);
    expect(ids(results.some)).toEqual(['cook-chops']);
  });

  it('does not hide a cook that only matched part of the search', () => {
    // A search for "pork cider" should still find the pork chops.
    const results = searchCooks(ENTRIES, { typed: 'pork cider', pickedTags: [] });

    expect([...ids(results.all), ...ids(results.some)]).toContain('cook-chops');
  });

  it('orders a group by most matches, then newest first', () => {
    const older = cook('cook-older', 'Pork cider pie', '2026-09-01T18:00:00.000Z');
    const newer = cook('cook-newer', 'Pork cider stew', '2026-10-20T18:00:00.000Z');
    const results = searchCooks(
      [...ENTRIES, { cook: older, tags: [] }, { cook: newer, tags: [] }],
      { typed: 'pork cider', pickedTags: [] },
    );

    expect(ids(results.all)).toEqual(['cook-newer', 'cook-cider', 'cook-older']);
  });

  it('ranks by how many terms matched, not how often one did', () => {
    const repeated = cook('cook-repeat', 'Pork pork pork', '2026-10-21T18:00:00.000Z');
    const results = searchCooks(
      [...ENTRIES, { cook: repeated, tags: [] }],
      { typed: 'pork cider', pickedTags: [] },
    );

    // The cook that matched both terms wins, however many times the other
    // cook says one of them.
    expect(ids(results.all)).toEqual(['cook-cider']);
    expect(ids(results.some)[0]).toBe('cook-repeat');
  });

  it('matches a tag as readily as a title', () => {
    const results = searchCooks(ENTRIES, { typed: 'cast', pickedTags: [] });

    expect(ids(results.all)).toEqual(['cook-chops']);
  });

  it('finds nothing in an untitled, untagged cook', () => {
    const results = searchCooks(ENTRIES, { typed: 'pork', pickedTags: [] });

    expect([...ids(results.all), ...ids(results.some)]).not.toContain('cook-unnamed');
  });

  it('returns both groups empty for an empty search', () => {
    // An empty box is not a search that found nothing, and History shows its
    // ordinary list rather than saying "nothing matched".
    const results = searchCooks(ENTRIES, { typed: '   ', pickedTags: [] });

    expect(results.terms).toEqual([]);
    expect(results.all).toEqual([]);
    expect(results.some).toEqual([]);
  });

  it('keeps a tapped multi-word tag together', () => {
    const together = searchCooks(ENTRIES, { typed: '', pickedTags: ['brown butter'] });
    const apart = searchCooks(ENTRIES, { typed: 'brown butter', pickedTags: [] });

    expect(ids(together.all)).toEqual(['cook-butter']);
    // Typed as two words it is two terms, and both still match this one cook,
    // so it lands in All — but as one term it is one match, which is the
    // distinction the tap preserves.
    expect(together.terms).toHaveLength(1);
    expect(apart.terms).toHaveLength(2);
  });
});

describe('highlighting', () => {
  it('picks out the matched run in a title', () => {
    const results = searchCooks(ENTRIES, { typed: 'pork', pickedTags: [] });
    // Both cooks carry the tag "pork", so both matched the one term; only one
    // of them has it in its title.
    const chops = results.all.find((hit) => hit.cook.id === 'cook-chops');

    expect(matchedText(chops!)).toEqual(['Pork']);
  });

  it('picks out the matched run in the tag line', () => {
    const results = searchCooks(ENTRIES, { typed: 'cider', pickedTags: [] });
    const hit = results.all[0]!;

    expect(hit.tagLine.filter((segment) => segment.matched).map((segment) => segment.text)).toEqual(
      ['cider'],
    );
    // The whole line is still readable, matched parts and all.
    expect(hit.tagLine.map((segment) => segment.text).join('')).toBe('cider · pork');
  });

  it('keeps the original text exactly, segment by segment', () => {
    const segments = highlight('Cider braised shoulder', [{ text: 'cider', source: 'typed' }]);

    expect(segments.map((segment) => segment.text).join('')).toBe('Cider braised shoulder');
    expect(segments[0]).toEqual({ text: 'Cider', matched: true });
  });

  it('merges overlapping matches instead of nesting them', () => {
    const segments = highlight('brown butter sauce', [
      { text: 'brown', source: 'typed' },
      { text: 'brown butter', source: 'tag' },
    ]);

    expect(segments).toEqual([
      { text: 'brown butter', matched: true },
      { text: ' sauce', matched: false },
    ]);
  });

  it('returns one unmatched run when nothing matched', () => {
    expect(highlight('Pork chops', [{ text: 'cider', source: 'typed' }])).toEqual([
      { text: 'Pork chops', matched: false },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(highlight('', [{ text: 'pork', source: 'typed' }])).toEqual([]);
  });
});

describe('putting cooks and their tags together', () => {
  it('gives a cook with no tags an empty list rather than dropping it', () => {
    const indexed = searchable([CHOPS, UNNAMED], new Map([[CHOPS.id, [tag('pork')]]]));

    expect(indexed).toEqual([
      { cook: CHOPS, tags: [tag('pork')], ingredients: null },
      { cook: UNNAMED, tags: [], ingredients: null },
    ]);
  });
});
