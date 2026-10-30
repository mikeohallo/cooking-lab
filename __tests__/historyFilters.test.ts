/**
 * History's filters and the ingredient search (0.3.0), as pure functions.
 *
 * Meal type: any of the ones picked; a cook with none matches no meal-type
 * filter. Who & stars: that person gave at least that many; N/A never
 * matches. Search: titles, tags and the current ingredients, still grouped
 * All then Some. Made-up people: Alex, Sam, Jo.
 */

import type { Cook, HouseholdMember, Rating } from '../src/domain/entities';
import {
  NO_FILTERS,
  applyFilters,
  filtersActive,
  meetsWhoAndStars,
  peopleToPick,
  ratingIsBy,
} from '../src/screens/history/filters';
import { searchCooks, searchable } from '../src/screens/history/search';

const AT = '2026-10-30T18:00:00.000Z';

function cook(id: string, title: string, startedAt = AT): Cook {
  return {
    id,
    title,
    status: 'reviewed',
    provenance: 'live',
    parentCookId: null,
    startedAt,
    reviewOpenedAt: AT,
    reviewSavedAt: AT,
    verdict: null,
    createdAt: AT,
  };
}

function rating(cookId: string, who: { memberId?: string; guestName?: string }, stars: number | null, notEaten = false): Rating {
  return {
    id: `${cookId}-${who.memberId ?? who.guestName}`,
    cookId,
    memberId: who.memberId ?? null,
    guestName: who.guestName ?? null,
    stars: stars as Rating['stars'],
    notEaten,
    line: null,
    ratedAt: AT,
  };
}

const PANCAKES = cook('c-pancakes', 'Pancakes');
const TART = cook('c-tart', 'Lemon tart');
const STEW = cook('c-stew', 'Stew');
const COOKS = [PANCAKES, TART, STEW];

const INPUTS = {
  mealTypes: { 'c-pancakes': 'breakfast', 'c-tart': 'dessert' } as const,
  ratingsByCook: new Map<string, readonly Rating[]>([
    ['c-pancakes', [rating('c-pancakes', { memberId: 'm-alex' }, 5)]],
    ['c-tart', [rating('c-tart', { memberId: 'm-alex' }, 3), rating('c-tart', { memberId: 'm-sam' }, 4)]],
    ['c-stew', [rating('c-stew', { memberId: 'm-alex' }, null, true), rating('c-stew', { guestName: 'Jo' }, 2)]],
  ]),
};

describe('meal-type filter', () => {
  it('passes everything with no filter, and is not active', () => {
    expect(applyFilters(COOKS, INPUTS, NO_FILTERS)).toEqual(COOKS);
    expect(filtersActive(NO_FILTERS)).toBe(false);
  });

  it('keeps any of the meal types picked, and never a cook with none', () => {
    expect(applyFilters(COOKS, INPUTS, { mealTypes: ['dessert'], who: null })).toEqual([TART]);
    expect(applyFilters(COOKS, INPUTS, { mealTypes: ['dessert', 'breakfast'], who: null })).toEqual([PANCAKES, TART]);
    expect(applyFilters(COOKS, INPUTS, { mealTypes: ['snack'], who: null })).toEqual([]);
  });
});

describe('who & stars', () => {
  it('matches at least that many stars from that person', () => {
    const alexAtLeast = (minStars: 1 | 2 | 3 | 4 | 5) =>
      applyFilters(COOKS, INPUTS, { mealTypes: [], who: { person: { kind: 'member', id: 'm-alex' }, minStars } });
    expect(alexAtLeast(1)).toEqual([PANCAKES, TART]);
    expect(alexAtLeast(4)).toEqual([PANCAKES]);
    expect(alexAtLeast(5)).toEqual([PANCAKES]);
  });

  it('never matches N/A, at any number of stars', () => {
    const naOnly = [rating('c', { memberId: 'm-alex' }, null, true)];
    expect(meetsWhoAndStars(naOnly, { person: { kind: 'member', id: 'm-alex' }, minStars: 1 })).toBe(false);
  });

  it('matches a guest by name, ignoring case', () => {
    const who = { person: { kind: 'guest', name: 'jo' } as const, minStars: 2 as const };
    expect(applyFilters(COOKS, INPUTS, { mealTypes: [], who })).toEqual([STEW]);
    expect(ratingIsBy(rating('c', { guestName: 'Jo' }, 3), { kind: 'guest', name: ' JO ' })).toBe(true);
    expect(ratingIsBy(rating('c', { memberId: 'm-jo' }, 3), { kind: 'guest', name: 'Jo' })).toBe(false);
  });

  it('combines with the meal-type filter', () => {
    const who = { person: { kind: 'member', id: 'm-alex' } as const, minStars: 1 as const };
    expect(applyFilters(COOKS, INPUTS, { mealTypes: ['dessert'], who })).toEqual([TART]);
  });

  it('offers the household in order, retired after, then guests not already named', () => {
    const members: HouseholdMember[] = [
      { id: 'm-sam', name: 'Sam', position: 1, retiredAt: null, createdAt: AT },
      { id: 'm-jo', name: 'Jo', position: 0, retiredAt: AT, createdAt: AT },
      { id: 'm-alex', name: 'Alex', position: 0, retiredAt: null, createdAt: AT },
    ];
    expect(peopleToPick(members, ['A neighbour', 'sam']).map((person) => person.name)).toEqual([
      'Alex',
      'Sam',
      'Jo',
      'A neighbour',
    ]);
  });
});

describe('search over ingredients', () => {
  const entries = searchable(
    COOKS,
    new Map(),
    new Map([
      ['c-pancakes', 'flour\nbuttermilk\neggs'],
      ['c-tart', 'lemons\neggs\nbutter'],
    ]),
  );

  it('matches the current ingredients at the start of a word, and says which line', () => {
    const results = searchCooks(entries, { typed: 'butter', pickedTags: [] });
    expect(results.all.map((hit) => hit.cook.id).sort()).toEqual(['c-pancakes', 'c-tart']);
    const tart = results.all.find((hit) => hit.cook.id === 'c-tart');
    expect(tart?.ingredientLine.map((segment) => segment.text).join('')).toBe('butter');
    // "milk" is inside "buttermilk", not at the start of a word.
    expect(searchCooks(entries, { typed: 'milk', pickedTags: [] }).all).toEqual([]);
  });

  it('keeps the All then Some grouping across titles and ingredients', () => {
    const results = searchCooks(entries, { typed: 'lemon eggs', pickedTags: [] });
    expect(results.all.map((hit) => hit.cook.id)).toEqual(['c-tart']);
    expect(results.some.map((hit) => hit.cook.id)).toEqual(['c-pancakes']);
  });

  it('leaves the ingredient line empty when only the title matched', () => {
    const results = searchCooks(entries, { typed: 'stew', pickedTags: [] });
    expect(results.all.map((hit) => hit.cook.id)).toEqual(['c-stew']);
    expect(results.all[0]?.ingredientLine).toEqual([]);
  });
});
