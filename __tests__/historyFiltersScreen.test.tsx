/**
 * History's search and filters on screen (0.3.0, redrawn in 0.4.0): the search
 * matches the current ingredients, the meal chips pick one meal or All, and
 * the Filters sheet holds who and stars (N/A never), cuisine and tags — all
 * combined with the search. Real screens, real SQLite, made-up people.
 */

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';

import type { EvidenceDecision } from '../src/domain/evidence';
import { HomeScreen } from '../src/screens/HomeScreen';
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
    await household('You', 'Guest');
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
    granted(await data.cookRecord.rate('cook-pancakes', { memberId: 'm-you' }, { stars: 5, notEaten: false, line: null }, { id: 'r1' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-tart', { memberId: 'm-you' }, { stars: 3, notEaten: false, line: null }, { id: 'r2' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-stew', { memberId: 'm-you' }, { stars: null, notEaten: true, line: null }, { id: 'r3' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-stew', { guestName: 'Guest 2' }, { stars: 4, notEaten: false, line: null }, { id: 'r4' }, 'user', harness.tick()));
  });

  const listed = () =>
    inOrder()
      .testIDs.filter((id) => /^cook-card-/.test(id))
      .map((id) => id.replace('cook-card-', ''))
      .filter((id, index, all) => all.indexOf(id) === index);

  it('finds a cook by its ingredients, showing the matched line', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');
    await fireEvent.changeText(screen.getByTestId('history-search'), 'buttermilk');
    expect(await screen.findByTestId('cook-ingredients-line-cook-pancakes')).toHaveTextContent('buttermilk');
    expect(listed()).toEqual(['cook-pancakes']);

    await fireEvent.changeText(screen.getByTestId('history-search'), 'eggs lemons');
    await waitFor(() => expect(listed()).toEqual(['cook-tart', 'cook-pancakes']));
    expect(within(screen.getByTestId('history-group-all')).getByTestId('cook-card-cook-tart')).toBeOnTheScreen();
    expect(within(screen.getByTestId('history-group-some')).getByTestId('cook-card-cook-pancakes')).toBeOnTheScreen();
  });

  it('filters by one meal at a time, with All to go back, and labels each card', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');
    expect(screen.getByTestId('cook-meal-cook-tart')).toHaveTextContent('Dessert');
    expect(screen.getByTestId('history-meal-all').props.accessibilityState).toMatchObject({ checked: true });

    await fireEvent.press(screen.getByTestId('history-meal-dessert'));
    await waitFor(() => expect(listed()).toEqual(['cook-tart']));
    expect(screen.getByTestId('history-meal-all').props.accessibilityState).toMatchObject({ checked: false });
    // The chips are a row of choices: picking Breakfast replaces Dessert.
    await fireEvent.press(screen.getByTestId('history-meal-breakfast'));
    await waitFor(() => expect(listed()).toEqual(['cook-pancakes']));
    await fireEvent.press(screen.getByTestId('history-meal-all'));
    await waitFor(() => expect(listed()).toHaveLength(3));
  });

  it('filters by who and stars in the Filters sheet: at least that many, N/A never, guests too, combined with search', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');

    await fireEvent.press(screen.getByTestId('search-filters'));
    await fireEvent.press(await screen.findByTestId('filters-who-member-m-you'));
    await fireEvent.press(screen.getByTestId('filters-stars-3'));
    // The count is live, before anything is applied.
    expect(screen.getByTestId('filters-show')).toHaveTextContent('Show 2 cooks');
    expect(listed()).toHaveLength(3);
    await fireEvent.press(screen.getByTestId('filters-show'));
    await waitFor(() => expect(listed().sort()).toEqual(['cook-pancakes', 'cook-tart']));
    // The round button counts the filters on.
    expect(screen.getByTestId('search-filters').props.accessibilityLabel).toBe('Filters, 1 on');
    expect(screen.getByTestId('home-count')).toHaveTextContent('2 of 3');

    // Combined with a search.
    await fireEvent.changeText(screen.getByTestId('history-search'), 'lemons');
    await waitFor(() => expect(listed()).toEqual(['cook-tart']));
    await fireEvent.changeText(screen.getByTestId('history-search'), '');

    // A guest used before can be picked too; the sheet opens with what is on.
    await fireEvent.press(screen.getByTestId('search-filters'));
    expect(
      (await screen.findByTestId('filters-who-member-m-you')).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByTestId('filters-who-guest-guest 2'));
    await fireEvent.press(screen.getByTestId('filters-stars-1'));
    expect(screen.getByTestId('filters-show')).toHaveTextContent('Show 1 cook');
    await fireEvent.press(screen.getByTestId('filters-show'));
    await waitFor(() => expect(listed()).toEqual(['cook-stew']));

    // Clear empties the sheet; Show puts that on Home.
    await fireEvent.press(screen.getByTestId('search-filters'));
    await fireEvent.press(await screen.findByTestId('filters-clear'));
    expect(screen.getByTestId('filters-show')).toHaveTextContent('Show 3 cooks');
    await fireEvent.press(screen.getByTestId('filters-show'));
    await waitFor(() => expect(listed()).toHaveLength(3));
    expect(screen.getByTestId('search-filters').props.accessibilityLabel).toBe('Filters');
  });

  it('filters by cuisine and by tags in the sheet, and closing it any other way changes nothing', async () => {
    const { data } = harness.storage;
    granted(await data.cookRecord.setCuisine('cook-tart', 'french', null, 'user', harness.tick()));
    granted(await data.cookRecord.setCuisine('cook-stew', 'other', 'Home baking', 'user', harness.tick()));
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');

    await fireEvent.press(screen.getByTestId('search-filters'));
    // The ten in order, then Other words in use.
    expect(await screen.findByTestId('filters-cuisine-american')).toBeOnTheScreen();
    expect(screen.getByTestId('filters-cuisine-other-home baking')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('filters-cuisine-french'));
    // The scrim closes it without applying.
    await fireEvent.press(screen.getByTestId('filters-scrim'));
    await waitFor(() => expect(screen.queryByTestId('filters')).toBeNull());
    expect(listed()).toHaveLength(3);

    await fireEvent.press(screen.getByTestId('search-filters'));
    await fireEvent.press(await screen.findByTestId('filters-cuisine-french'));
    await fireEvent.press(screen.getByTestId('filters-cuisine-other-home baking'));
    await fireEvent.press(screen.getByTestId('filters-show'));
    await waitFor(() => expect(listed().sort()).toEqual(['cook-stew', 'cook-tart']));
    expect(screen.getByTestId('search-filters').props.accessibilityLabel).toBe('Filters, 2 on');
  });

  it('says when nothing matches, and Clear filters brings everything back', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');
    await fireEvent.press(screen.getByTestId('history-meal-dessert'));
    await fireEvent.changeText(screen.getByTestId('history-search'), 'pavlova');
    expect(await screen.findByTestId('home-no-matches')).toHaveTextContent(/No cooks match/);
    expect(screen.getByTestId('home-count')).toHaveTextContent('0 of 3');

    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(listed()).toHaveLength(3));
    expect(screen.getByTestId('history-search').props.value).toBe('');
    expect(screen.queryByTestId('home-no-matches')).toBeNull();
  });
});
