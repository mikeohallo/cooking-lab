/**
 * History's search and filters on screen (0.3.0): the search matches the
 * current ingredients, meal-type chips filter by any of the ones picked, and
 * "Who & stars" keeps the cooks a person gave at least that many — N/A never
 * — all combined with the search. Real screens, real SQLite, made-up people.
 */

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';

import type { EvidenceDecision } from '../src/domain/evidence';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

type JsonNode = { readonly props?: Record<string, unknown>; readonly children?: readonly (JsonNode | string)[] | null };

/** Everything rendered, depth first, in screen order: strings and testIDs. */
function inOrder(): { readonly texts: readonly string[]; readonly testIDs: readonly string[] } {
  const texts: string[] = [];
  const testIDs: string[] = [];
  const walk = (node: JsonNode | string | null | undefined) => {
    if (node === null || node === undefined) {
      return;
    }
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    const id = node.props?.testID;
    if (typeof id === 'string') {
      testIDs.push(id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  const tree = screen.toJSON() as JsonNode | readonly JsonNode[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) {
    walk(top as JsonNode | null);
  }
  return { texts, testIDs };
}

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

async function startCook(id: string, title: string): Promise<void> {
  const { data, now } = harness.storage;
  granted(await data.capture.startCook({ id, title, startedAt: now() }, 'user', now()));
}

async function household(...names: string[]): Promise<void> {
  for (const name of names) {
    granted(await harness.storage.data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
  }
}

beforeEach(async () => {
  harness = await openScreenHarness();
});

afterEach(async () => {
  await cleanup();
  await harness.close();
});

describe('History: search and filters', () => {
  beforeEach(async () => {
    await household('Alex', 'Sam');
    const { data } = harness.storage;
    const cook = async (id: string, title: string, meal: 'breakfast' | 'dessert' | null, ingredients: string | null) => {
      await startCook(id, title);
      if (meal !== null) {
        granted(await data.cookRecord.setMealType(id, meal, 'user', harness.tick()));
      }
      if (ingredients !== null) {
        granted(await data.cookRecord.saveIngredients(id, ingredients, { id: `${id}-ing` }, 'user', harness.tick()));
      }
      granted(await data.capture.saveReview(id, null, 'user', harness.tick()));
    };
    await cook('cook-pancakes', 'Pancakes', 'breakfast', 'flour\nbuttermilk\neggs');
    await cook('cook-tart', 'Lemon tart', 'dessert', 'lemons\neggs\nbutter');
    await cook('cook-stew', 'Stew', null, 'beef\ncarrots');
    granted(await data.cookRecord.rate('cook-pancakes', { memberId: 'm-alex' }, { stars: 5, notEaten: false, line: null }, { id: 'r1' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-tart', { memberId: 'm-alex' }, { stars: 3, notEaten: false, line: null }, { id: 'r2' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-stew', { memberId: 'm-alex' }, { stars: null, notEaten: true, line: null }, { id: 'r3' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-stew', { guestName: 'Jo' }, { stars: 4, notEaten: false, line: null }, { id: 'r4' }, 'user', harness.tick()));
  });

  const listed = () =>
    inOrder()
      .testIDs.filter((id) => /^cook-card-/.test(id))
      .map((id) => id.replace('cook-card-', ''))
      .filter((id, index, all) => all.indexOf(id) === index);

  it('finds a cook by its ingredients, showing the matched line', async () => {
    await harness.render(<HistoryScreen onOpenCook={() => {}} onBack={() => {}} />);
    await screen.findByTestId('history-list');
    await fireEvent.changeText(screen.getByTestId('history-search'), 'buttermilk');
    expect(await screen.findByTestId('cook-ingredients-line-cook-pancakes')).toHaveTextContent('buttermilk');
    expect(listed()).toEqual(['cook-pancakes']);

    await fireEvent.changeText(screen.getByTestId('history-search'), 'eggs lemons');
    await waitFor(() => expect(listed()).toEqual(['cook-tart', 'cook-pancakes']));
    expect(within(screen.getByTestId('history-group-all')).getByTestId('cook-card-cook-tart')).toBeOnTheScreen();
    expect(within(screen.getByTestId('history-group-some')).getByTestId('cook-card-cook-pancakes')).toBeOnTheScreen();
  });

  it('filters by meal type, any of the ones picked, and labels each card', async () => {
    await harness.render(<HistoryScreen onOpenCook={() => {}} onBack={() => {}} />);
    await screen.findByTestId('history-list');
    expect(screen.getByTestId('cook-meal-cook-tart')).toHaveTextContent('Dessert');

    await fireEvent.press(screen.getByTestId('history-meal-dessert'));
    await waitFor(() => expect(listed()).toEqual(['cook-tart']));
    await fireEvent.press(screen.getByTestId('history-meal-breakfast'));
    await waitFor(() => expect(listed().sort()).toEqual(['cook-pancakes', 'cook-tart']));
  });

  it('filters by who and stars: at least that many, N/A never, guests too, combined with search', async () => {
    await harness.render(<HistoryScreen onOpenCook={() => {}} onBack={() => {}} />);
    await screen.findByTestId('history-list');

    await fireEvent.press(screen.getByTestId('history-who-toggle'));
    await fireEvent.press(await screen.findByTestId('history-who-member-m-alex'));
    await fireEvent.press(screen.getByTestId('history-who-stars-3'));
    await waitFor(() => expect(listed().sort()).toEqual(['cook-pancakes', 'cook-tart']));
    expect(screen.getByTestId('history-who-active')).toBeOnTheScreen();

    // Combined with a search.
    await fireEvent.changeText(screen.getByTestId('history-search'), 'lemons');
    await waitFor(() => expect(listed()).toEqual(['cook-tart']));
    await fireEvent.changeText(screen.getByTestId('history-search'), '');

    // A guest used before can be picked too.
    await fireEvent.press(screen.getByTestId('history-who-toggle'));
    await fireEvent.press(await screen.findByTestId('history-who-guest-jo'));
    await fireEvent.press(screen.getByTestId('history-who-stars-1'));
    await waitFor(() => expect(listed()).toEqual(['cook-stew']));

    await fireEvent.press(screen.getByTestId('history-clear-filters'));
    await waitFor(() => expect(listed()).toHaveLength(3));
  });
});

