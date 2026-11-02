/**
 * N/A never breaks (0.4.0, part 6).
 *
 * The second test build showed "3 ratings, 1 N/" with "A" on the next line on
 * the cook page's Last time card. Every N/A the app draws now comes from one
 * place, `NOT_EATEN` (word joiners, U+2060, either side of the slash) or
 * `notEatenCount` (its number held to it by a no-break space, U+00A0).
 *
 * Here: the two strings themselves; no screen, component or route types a
 * plain "N/A" of its own; and every screen that shows N/A — the cook page's
 * ratings, the Last time card, Who ate it? and Who's eating — draws the joined
 * one and never the plain one. The people are made up: You and Guest.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { NOT_EATEN, WHOS_EATING_INTRO, notEatenCount } from '../src/content/product';
import type { EvidenceDecision } from '../src/domain/evidence';
import { CookScreen } from '../src/screens/CookScreen';
import { HouseholdScreen } from '../src/screens/HouseholdScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { ratingAverage } from '../src/screens/record/LastTimeCard';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const WJ = '⁠';
const NBSP = ' ';
const JOINED = `N${WJ}/${WJ}A`;
/** "N/A" with nothing holding it together. */
const PLAIN = /N\/A/;

const ROOT = join(__dirname, '..');
/** Where shown words live. The export file is plain text and stays as it was. */
const FOLDERS = ['src/screens', 'src/components', 'src/content', 'app'];

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      return filesUnder(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Drops comments, so prose about N/A does not count. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

type JsonNode = { readonly props?: Record<string, unknown>; readonly children?: readonly (JsonNode | string)[] | null };

/** Every string drawn on the screen now, as it is, with no whitespace folded. */
function drawnStrings(): string[] {
  const texts: string[] = [];
  const walk = (node: JsonNode | string | null | undefined) => {
    if (node === null || node === undefined) {
      return;
    }
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  const tree = screen.toJSON() as JsonNode | readonly JsonNode[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) {
    walk(top as JsonNode | null);
  }
  return texts;
}

/** The screen draws N/A only joined, and at least `least` times. */
function expectOnlyJoined(least: number): void {
  const strings = drawnStrings();
  expect(strings.filter((text) => PLAIN.test(text))).toEqual([]);
  expect(strings.filter((text) => text.includes(JOINED)).length).toBeGreaterThanOrEqual(least);
}

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

describe('the N/A strings', () => {
  it('join the slash to both letters with word joiners', () => {
    expect(NOT_EATEN).toBe(JOINED);
    expect(NOT_EATEN.replace(new RegExp(WJ, 'g'), '')).toBe('N/A');
  });

  it('hold the number to N/A with a no-break space', () => {
    expect(notEatenCount(1)).toBe(`1${NBSP}${JOINED}`);
    expect(notEatenCount(12)).toBe(`12${NBSP}${JOINED}`);
  });

  it('are what the Last time summary and the Who’s eating words use', () => {
    const average = ratingAverage([
      { stars: 4, notEaten: false },
      { stars: 5, notEaten: false },
      { stars: 3, notEaten: false },
      { stars: null, notEaten: true },
    ]);
    expect(average).toEqual({ value: '4.0', summary: `· 3 ratings, 1${NBSP}${JOINED}` });
    expect(ratingAverage([{ stars: 5, notEaten: false }])?.summary).toBe('· 1 rating');
    expect(WHOS_EATING_INTRO).toContain(`be${NBSP}${JOINED} on the day`);
    expect(WHOS_EATING_INTRO).not.toMatch(PLAIN);
  });
});

describe('no screen types its own N/A', () => {
  const files = FOLDERS.flatMap((folder) => filesUnder(join(ROOT, folder)));

  it('finds the files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('has no plain "N/A" in code in screens, components, content or routes', () => {
    const offenders = files.flatMap((file) =>
      code(readFileSync(file, 'utf8'))
        .split('\n')
        .filter((line) => PLAIN.test(line))
        .map((line) => `${relative(ROOT, file)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('every N/A on screen is whole', () => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    harness = await openScreenHarness();
    const { data } = harness.storage;
    for (const name of ['You', 'Guest']) {
      granted(await data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
    }
    granted(await data.capture.startCook({ id: 'cook-1', title: 'Test lemon tart', startedAt: harness.storage.now() }, 'user', harness.storage.now()));
    granted(await data.capture.saveReview('cook-1', 'Sharp.', 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { memberId: 'm-you' }, { stars: 4, notEaten: false, line: null }, { id: 'r-1' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { memberId: 'm-guest' }, { stars: null, notEaten: true, line: null }, { id: 'r-2' }, 'user', harness.tick()));
  });

  afterEach(async () => {
    await cleanup();
    await harness.close();
  });

  it('on a reviewed cook’s ratings', async () => {
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
    const row = await screen.findByTestId('rating-r-2');
    expect(within(row).getByText(JOINED)).toBeOnTheScreen();
    expectOnlyJoined(1);
  });

  it('on the Last time card, held to its number', async () => {
    const onOpenCook = jest.fn();
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} onOpenCook={onOpenCook} />);
    await fireEvent.press(await screen.findByTestId('cook-this-again'));
    await waitFor(() => expect(onOpenCook).toHaveBeenCalled());
    const again = onOpenCook.mock.calls[0]?.[0] as string;

    await cleanup();
    await harness.render(<CookScreen cookId={again} onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('last-time-average');
    expect(drawnStrings()).toContain(` · 1 rating, 1${NBSP}${JOINED}`);
    expectOnlyJoined(1);
  });

  it('on Who ate it?’s N/A buttons', async () => {
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={() => {}} />);
    await screen.findByTestId('who-ate-it-member-m-you-na');
    expect(within(screen.getByTestId('who-ate-it-member-m-you-na')).getByText(JOINED)).toBeOnTheScreen();
    expectOnlyJoined(2);
  });

  it('on Who’s eating', async () => {
    await harness.render(<HouseholdScreen onBack={() => {}} />);
    await screen.findByText(WHOS_EATING_INTRO);
    expectOnlyJoined(1);
  });
});
