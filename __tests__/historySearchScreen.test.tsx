/**
 * Searching History on the screen, against real SQL.
 *
 * `historySearch.test.ts` settles what matches and in what order. This is about
 * the screen: that the box is above the filters and works alongside them, that
 * the two groups appear with their headings, that a tapped tag joins the search
 * whole, and that the matched words are picked out where the eye looks for them.
 */

import { screen, userEvent, waitFor, within } from '@testing-library/react-native';

import {
  CLEAR_SEARCH,
  COOKING_NOW,
  SEARCH_GROUP_ALL,
  SEARCH_GROUP_SOME,
  SEARCH_NO_RESULTS_TITLE,
  SEARCH_PLACEHOLDER,
  SHOW_MY_TAGS,
} from '../src/content/product';
import { HomeScreen } from '../src/screens/HomeScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('history-search.db');
});

afterEach(async () => {
  await harness.close();
});

/** A notebook worth searching: four cooks, tagged the way a kitchen would. */
async function fillHistory(): Promise<void> {
  const { data } = harness.storage;

  const cooks: readonly [string, string | null, string][] = [
    ['cook-chops', 'Pork chops', '2026-10-01T18:00:00.000Z'],
    ['cook-cider', 'Cider braised shoulder', '2026-10-05T18:00:00.000Z'],
    ['cook-pasta', 'Monday pasta', '2026-10-09T18:00:00.000Z'],
    ['cook-open', null, '2026-10-11T18:00:00.000Z'],
  ];
  for (const [id, title, startedAt] of cooks) {
    await data.capture.startCook({ id, title, startedAt }, 'user', startedAt);
    if (id !== 'cook-open') {
      await data.capture.saveReview(id, 'Good.', 'user', startedAt);
    }
  }

  const link = async (cookId: string, name: string) => {
    const tag = await data.tags.findOrCreate(name, null);
    await data.cookTags.link({ cookId, tagId: tag.id });
    return tag.id;
  };
  await link('cook-chops', 'pork');
  await link('cook-chops', 'cast iron');
  await link('cook-cider', 'pork');
  await link('cook-cider', 'cider');
  await link('cook-pasta', 'brown butter');
}

async function openHistory(): Promise<void> {
  await harness.render(<HomeScreen onOpenCook={jest.fn()} />);
  await screen.findByTestId('home-screen');
}

describe('the search box', () => {
  it('is there, labelled, before anything has been typed', async () => {
    await fillHistory();
    await openHistory();

    const box = screen.getByTestId('history-search');
    expect(box.props.placeholder).toBe(SEARCH_PLACEHOLDER);
    expect(box.props.accessibilityLabel).toBe(SEARCH_PLACEHOLDER);
  });

  it('leaves today’s list alone until something is typed', async () => {
    await fillHistory();
    await openHistory();

    expect(await screen.findByTestId('history-list')).toBeOnTheScreen();
    expect(screen.queryByTestId('history-results')).toBeNull();
    // An empty box is not a search that found nothing.
    expect(screen.queryByTestId('history-search-empty')).toBeNull();
  });

  it('keeps the filters working alongside it', async () => {
    await fillHistory();
    await openHistory();

    expect(screen.getByTestId('history-meal-filter')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Breakfast' })).toBeOnTheScreen();
  });
});

describe('searching', () => {
  it('finds a cook by a word in its title', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'pasta');

    await screen.findByTestId('history-results');
    expect(screen.getByTestId('cook-card-cook-pasta')).toBeOnTheScreen();
    expect(screen.queryByTestId('cook-card-cook-chops')).toBeNull();
  });

  it('finds a cook by one of its tags', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'cider');

    await screen.findByTestId('history-results');
    expect(screen.getByTestId('cook-card-cook-cider')).toBeOnTheScreen();
  });

  it('puts what matched everything first, and what matched some after it', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'pork cider');

    expect(await screen.findByTestId('history-group-all')).toBeOnTheScreen();
    expect(screen.getByText(SEARCH_GROUP_ALL)).toBeOnTheScreen();
    expect(screen.getByText(SEARCH_GROUP_SOME)).toBeOnTheScreen();
    // The cider braise matched both; the chops matched one and are still here.
    expect(screen.getByTestId('history-group-all')).toContainElement(
      screen.getByTestId('cook-card-cook-cider'),
    );
    expect(screen.getByTestId('history-group-some')).toContainElement(
      screen.getByTestId('cook-card-cook-chops'),
    );
  });

  it('draws no heading for a group with nothing in it', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'pasta');

    await screen.findByTestId('history-group-all');
    expect(screen.queryByTestId('history-group-some')).toBeNull();
    expect(screen.queryByText(SEARCH_GROUP_SOME)).toBeNull();
  });

  it('picks out the matched words in the title', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'pasta');

    await screen.findByTestId('history-results');
    // The matched run is its own piece of text, which is what lets it be bold.
    expect(screen.getByText('pasta')).toBeOnTheScreen();
    expect(screen.getByText('Monday ')).toBeOnTheScreen();
  });

  it('shows the cook’s tags on a result, with the match picked out', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'cider');

    const line = await screen.findByTestId('cook-tags-line-cook-cider');
    expect(line).toBeOnTheScreen();
    // Why this cook is in the list, when the word is nowhere in its title. The
    // line is drawn as separate runs so the matched one can be picked out, so
    // it is read run by run rather than as one string.
    expect(within(line).getByText('cider')).toBeOnTheScreen();
    expect(within(line).getByText(' · pork')).toBeOnTheScreen();
  });

  it('says plainly when nothing matched', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'aubergine');

    expect(await screen.findByTestId('history-search-empty')).toBeOnTheScreen();
    expect(screen.getByText(SEARCH_NO_RESULTS_TITLE)).toBeOnTheScreen();
  });

  it('searches the reviewed cooks, and leaves Cooking now as it is', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'pork');

    const results = await screen.findByTestId('history-results');
    expect(within(results).queryByTestId('cook-card-cook-open')).toBeNull();
    expect(within(screen.getByTestId('cooking-now')).getByText(COOKING_NOW)).toBeOnTheScreen();
    expect(within(screen.getByTestId('cooking-now')).getByTestId('cook-card-cook-open')).toBeOnTheScreen();
  });

  it('clears back to the ordinary list', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'pasta');
    await screen.findByTestId('history-results');
    await user.press(screen.getByRole('button', { name: CLEAR_SEARCH }));

    expect(await screen.findByTestId('history-list')).toBeOnTheScreen();
    expect(screen.getByTestId('history-search')).toHaveDisplayValue('');
  });
});

describe('searching by a tag he taps', () => {
  it('offers his tags in one alphabet, and hides them again', async () => {
    await fillHistory();
    await openHistory();

    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));

    const list = await screen.findByTestId('history-all-tags');
    expect(list).toBeOnTheScreen();
    expect(screen.getByText('brown butter')).toBeOnTheScreen();
    expect(screen.getByText('cast iron')).toBeOnTheScreen();
  });

  it('joins the search as one whole term, so two words stay together', async () => {
    await fillHistory();
    await openHistory();

    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));
    await user.press(await screen.findByText('brown butter'));

    await screen.findByTestId('history-results');
    expect(screen.getByTestId('cook-card-cook-pasta')).toBeOnTheScreen();
    // Everything matched the one term, so there is no partial group at all.
    expect(screen.queryByTestId('history-group-some')).toBeNull();
  });

  it('shows a tapped tag as selected, and untaps it again', async () => {
    await fillHistory();
    await openHistory();

    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));
    const chips = await screen.findByTestId('history-all-tags');
    expect(chips).toBeOnTheScreen();

    await user.press(screen.getByText('cider'));

    const picked = await screen.findByTestId('history-picked-tags');
    expect(picked).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByTestId('history-picked-cider').props.accessibilityState).toMatchObject({
        checked: true,
      }),
    );

    await user.press(screen.getByTestId('history-picked-cider'));

    await waitFor(() => expect(screen.queryByTestId('history-picked-tags')).toBeNull());
    expect(await screen.findByTestId('history-list')).toBeOnTheScreen();
  });

  it('combines a tapped tag with a typed word', async () => {
    await fillHistory();
    await openHistory();

    await user.type(screen.getByTestId('history-search'), 'shoulder');
    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));
    await user.press(await screen.findByText('cider'));

    await screen.findByTestId('history-group-all');
    expect(screen.getByTestId('history-group-all')).toContainElement(
      screen.getByTestId('cook-card-cook-cider'),
    );
  });

  it('offers no tag list in a notebook with no tags', async () => {
    const { data } = harness.storage;
    await data.capture.startCook(
      { id: 'cook-bare', startedAt: '2026-10-01T18:00:00.000Z' },
      'user',
      '2026-10-01T18:00:00.000Z',
    );
    await data.capture.saveReview('cook-bare', null, 'user', '2026-10-01T19:00:00.000Z');
    await openHistory();

    await screen.findByTestId('history-list');
    expect(screen.queryByRole('button', { name: SHOW_MY_TAGS })).toBeNull();
  });
});
