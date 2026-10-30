/**
 * Home, which is also History (0.3.0): New Cook, Cooking now, the search and
 * filters, and every reviewed cook ten to a page — on real SQLite, with
 * made-up people.
 */
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TEST_BADGE_TEST_ID } from '../src/components/TestBadge';
import {
  COOKING_NOW,
  CORE_LOOP_STEPS,
  EMPTY_HOME_TITLE,
  EXPORT_EVERYTHING,
  HOME_MORE,
  NEW_COOK_TITLE,
  PRODUCT_TAGLINE,
  UNTITLED_COOK,
  WHOS_EATING,
} from '../src/content/product';
import type { EvidenceDecision } from '../src/domain/evidence';
import { RevealOnChange } from '../src/layout/RevealOnChange';
import { ScreenScrollContext } from '../src/layout/ScreenScroll';
import { HomeScreen } from '../src/screens/HomeScreen';
import { CookCard } from '../src/screens/home/CookCard';
import { clampPage, pageOf, pageSummary } from '../src/screens/home/paging';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('home-screen.db');
});

afterEach(async () => {
  await harness.close();
});

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

async function renderHome(refreshToken = 0) {
  const onOpenCook = jest.fn();
  const onHousehold = jest.fn();
  await harness.render(
    <HomeScreen onOpenCook={onOpenCook} onHousehold={onHousehold} refreshToken={refreshToken} />,
  );
  return { onOpenCook, onHousehold };
}

/** `count` reviewed cooks, "Soup 1" the oldest to "Soup <count>" the newest. */
async function reviewedSoups(count: number): Promise<void> {
  const { data } = harness.storage;
  for (let n = 1; n <= count; n += 1) {
    const at = harness.tick();
    await data.capture.startCook({ id: `soup-${n}`, title: `Soup ${n}`, startedAt: at }, 'user', at);
    await data.capture.saveReview(`soup-${n}`, `Notes for soup ${n}.`, 'user', harness.tick());
  }
}

async function plainCook(id: string, title: string) {
  const at = harness.tick();
  await harness.storage.data.capture.startCook({ id, title, startedAt: at }, 'user', at);
  const cook = await harness.storage.data.cooks.findById(id);
  if (cook === null) {
    throw new Error('not stored');
  }
  return cook;
}

function listedIds(): string[] {
  return within(screen.getByTestId('history-list'))
    .getAllByTestId(/^cook-card-/)
    .map((card) => String(card.props.testID).replace('cook-card-', ''));
}

describe('HomeScreen', () => {
  it('shows a calm empty state and the loop on first use', async () => {
    await renderHome();
    expect(await screen.findByTestId('home-empty')).toBeOnTheScreen();
    expect(screen.getByText(EMPTY_HOME_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(PRODUCT_TAGLINE)).toBeOnTheScreen();
    for (const step of CORE_LOOP_STEPS) {
      expect(screen.getByText(step)).toBeOnTheScreen();
    }
    // Nothing to search yet, and nothing cooking.
    expect(screen.queryByTestId('history-search')).toBeNull();
    expect(screen.queryByTestId('cooking-now')).toBeNull();
  });

  it('creates an open, untitled, live cook in one tap and opens it', async () => {
    const { onOpenCook } = await renderHome();
    await screen.findByTestId('home-empty');

    await user.press(screen.getByRole('button', { name: NEW_COOK_TITLE }));

    await waitFor(() => expect(onOpenCook).toHaveBeenCalledTimes(1));
    const cookId = onOpenCook.mock.calls[0]?.[0] as string;
    const stored = await harness.db.data.cooks.findById(cookId);
    expect(stored).toMatchObject({
      status: 'open',
      provenance: 'live',
      title: null,
      verdict: null,
      startedAt: '2026-10-15T08:30:00.000Z',
    });
  });

  it('puts open cooks under Cooking now and the reviewed ones below the search', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'open-cook', startedAt: now() }, 'user', now());
    await data.capture.startCook(
      { id: 'done-cook', title: 'Pork chops', startedAt: harness.tick() },
      'user',
      now(),
    );
    await data.capture.saveReview('done-cook', 'Great crust. Apple needed acid.', 'user', harness.tick());

    const { onOpenCook } = await renderHome();

    const cookingNow = await screen.findByTestId('cooking-now');
    expect(within(cookingNow).getByText(COOKING_NOW)).toBeOnTheScreen();
    expect(within(cookingNow).getByText(UNTITLED_COOK)).toBeOnTheScreen();
    expect(within(cookingNow).queryByText('Pork chops')).toBeNull();
    expect(within(screen.getByTestId('history-list')).getByText('Pork chops')).toBeOnTheScreen();
    expect(screen.getByText('Great crust. Apple needed acid.')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-empty')).toBeNull();
    // The marketing line is for first use only.
    expect(screen.queryByText(PRODUCT_TAGLINE)).toBeNull();

    await user.press(screen.getByTestId('cook-card-open-cook'));
    expect(onOpenCook).toHaveBeenCalledWith('open-cook');
    await user.press(screen.getByTestId('cook-card-done-cook'));
    expect(onOpenCook).toHaveBeenCalledWith('done-cook');
  });

  it('hides Cooking now when nothing is open', async () => {
    await reviewedSoups(2);
    await renderHome();
    await screen.findByTestId('history-list');
    expect(screen.queryByTestId('cooking-now')).toBeNull();
    expect(screen.queryByText(COOKING_NOW)).toBeNull();
  });

  it('keeps Export everything and Who’s eating in the ⋯ menu', async () => {
    await reviewedSoups(1);
    const { onHousehold } = await renderHome();
    await screen.findByTestId('history-list');
    expect(screen.queryByRole('button', { name: EXPORT_EVERYTHING })).toBeNull();

    await user.press(screen.getByRole('button', { name: HOME_MORE }));
    expect(screen.getByRole('button', { name: EXPORT_EVERYTHING })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: WHOS_EATING }));
    expect(onHousehold).toHaveBeenCalledTimes(1);
    // Opening Who's eating closes the menu behind it.
    expect(screen.queryByTestId('home-menu')).toBeNull();
  });

  it('shows no TEST indicator under the default production identity', async () => {
    await renderHome();
    await screen.findByTestId('home-empty');
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
    expect(screen.getByText('Cooking Lab')).toBeOnTheScreen();
  });

  it('reports a failed New Cook without creating anything', async () => {
    const failing = {
      ...harness.storage,
      data: {
        ...harness.storage.data,
        capture: {
          ...harness.storage.data.capture,
          startCook: async () => {
            throw new Error('disk full');
          },
        },
      },
    };
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} />, failing);
    await screen.findByTestId('home-empty');

    await user.press(screen.getByRole('button', { name: NEW_COOK_TITLE }));

    expect(await screen.findByTestId('new-cook-failed')).toBeOnTheScreen();
    expect(screen.getByText('disk full')).toBeOnTheScreen();
    expect(onOpenCook).not.toHaveBeenCalled();
    expect(await harness.db.data.cooks.count()).toBe(0);
  });
});

describe('the reviewed cooks, ten to a page', () => {
  it('lists them newest first, ten on the first page, with the count above', async () => {
    await reviewedSoups(14);
    await renderHome();
    await screen.findByTestId('history-list');

    expect(listedIds()).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5].map((n) => `soup-${n}`));
    expect(screen.getByTestId('home-page-summary')).toHaveTextContent('14 cooks · page 1 of 2');
    expect(screen.getByTestId('home-page-position')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('home-page-previous')).toBeDisabled();
    expect(screen.getByTestId('home-page-next')).toBeEnabled();
  });

  it('pages on with Next and back with Previous', async () => {
    await reviewedSoups(14);
    await renderHome();
    await screen.findByTestId('history-list');

    await user.press(screen.getByTestId('home-page-next'));
    expect(listedIds()).toEqual(['soup-4', 'soup-3', 'soup-2', 'soup-1']);
    expect(screen.getByTestId('home-page-summary')).toHaveTextContent('14 cooks · page 2 of 2');
    expect(screen.getByTestId('home-page-next')).toBeDisabled();

    await user.press(screen.getByTestId('home-page-previous'));
    expect(listedIds()[0]).toBe('soup-14');
  });

  it('draws no pager when the cooks fit on one page', async () => {
    await reviewedSoups(3);
    await renderHome();
    await screen.findByTestId('history-list');
    expect(screen.queryByTestId('home-pager')).toBeNull();
    expect(screen.getByTestId('home-page-summary')).toHaveTextContent('3 cooks');
  });

  it('keeps the page after a cook is opened and the screen comes back', async () => {
    await reviewedSoups(14);
    const onOpenCook = jest.fn();
    let comeBack = () => {};
    // The route, as far as Home can tell: it stays mounted, and bumps the
    // refresh token when it is in front again.
    function Route() {
      const [token, setToken] = useState(0);
      comeBack = () => setToken((value) => value + 1);
      return <HomeScreen onOpenCook={onOpenCook} refreshToken={token} />;
    }
    await harness.render(<Route />);
    await screen.findByTestId('history-list');
    await user.press(screen.getByTestId('home-page-next'));
    await user.press(screen.getByTestId('cook-card-soup-2'));
    expect(onOpenCook).toHaveBeenCalledWith('soup-2');

    // Back on Home: the lists reload, and the page stays.
    await act(async () => {
      comeBack();
    });
    await waitFor(() => expect(listedIds()).toEqual(['soup-4', 'soup-3', 'soup-2', 'soup-1']));
    expect(screen.getByTestId('home-page-position')).toHaveTextContent('2 of 2');
  });

  it('starts a search at page 1, and pages its results the same way', async () => {
    await reviewedSoups(14);
    await renderHome();
    await screen.findByTestId('history-list');
    await user.press(screen.getByTestId('home-page-next'));

    await user.type(screen.getByTestId('history-search'), 'soup');
    const results = await screen.findByTestId('history-results');
    expect(within(results).getAllByTestId(/^cook-card-/)).toHaveLength(10);
    expect(screen.getByTestId('home-page-summary')).toHaveTextContent('14 cooks · page 1 of 2');

    await user.press(screen.getByTestId('home-page-next'));
    expect(within(screen.getByTestId('history-results')).getAllByTestId(/^cook-card-/)).toHaveLength(4);

    // Changing the search starts again at page 1.
    await user.type(screen.getByTestId('history-search'), ' 1');
    await waitFor(() => expect(screen.getByTestId('home-page-position')).toHaveTextContent('1 of 2'));
  });

  it('starts a filter at page 1', async () => {
    await reviewedSoups(14);
    for (let n = 1; n <= 12; n += 1) {
      granted(await harness.storage.data.cookRecord.setMealType(`soup-${n}`, 'snack', 'user', harness.tick()));
    }
    await renderHome();
    await screen.findByTestId('history-list');
    await user.press(screen.getByTestId('home-page-next'));

    await user.press(screen.getByTestId('history-meal-snack'));
    expect(screen.getByTestId('home-page-summary')).toHaveTextContent('12 cooks · page 1 of 2');
    expect(listedIds()[0]).toBe('soup-12');
  });

  it('works out pages, and a page that no longer exists', () => {
    const items = Array.from({ length: 14 }, (_, index) => index);
    expect(pageOf(items, 1).items).toHaveLength(10);
    expect(pageOf(items, 2).items).toEqual([10, 11, 12, 13]);
    expect(pageOf(items, 3).page).toBe(2);
    expect(pageOf([], 4)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
    expect(clampPage(0, 14)).toBe(1);
    expect(pageSummary({ page: 1, pageCount: 1, total: 1 })).toBe('1 cook');
  });

  it('scrolls the search box into view when the page changes, not before', async () => {
    const reveal = jest.fn();
    let turn = () => {};
    function Block() {
      const [token, setToken] = useState(0);
      turn = () => setToken((value) => value + 1);
      return (
        <ScreenScrollContext.Provider value={{ reveal }}>
          <RevealOnChange token={token} testID="block">
            <View />
          </RevealOnChange>
        </ScreenScrollContext.Provider>
      );
    }
    await render(<Block />);
    expect(reveal).not.toHaveBeenCalled();
    await act(async () => {
      turn();
    });
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});

describe('a cook’s card', () => {
  it('shows the meal type above the title, the date, the stars and the notes', async () => {
    const { data } = harness.storage;
    for (const [id, name] of [
      ['m-alex', 'Alex'],
      ['m-sam', 'Sam'],
    ] as const) {
      granted(await data.householdWorkflow.add(name, { id }, harness.tick()));
    }
    await reviewedSoups(1);
    granted(await data.cookRecord.setMealType('soup-1', 'lunch_dinner', 'user', harness.tick()));
    const rate = async (
      person: { memberId: string } | { guestName: string },
      stars: 1 | 2 | 3 | 4 | 5 | null,
      id: string,
    ) =>
      granted(
        await data.cookRecord.rate(
          'soup-1',
          person,
          { stars, notEaten: stars === null, line: null },
          { id },
          'user',
          harness.tick(),
        ),
      );
    await rate({ guestName: 'Jo' }, 4, 'r-jo');
    await rate({ memberId: 'm-sam' }, null, 'r-sam');
    await rate({ memberId: 'm-alex' }, 5, 'r-alex');

    await renderHome();
    const card = await screen.findByTestId('cook-card-soup-1');
    await waitFor(() => expect(screen.getByTestId('cook-ratings-soup-1')).toBeOnTheScreen());
    const ids = within(card)
      .getAllByTestId(/^cook-(meal|title|ratings|notes)-soup-1$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual(['cook-meal-soup-1', 'cook-title-soup-1', 'cook-ratings-soup-1', 'cook-notes-soup-1']);
    expect(within(card).getByText('Lunch/Dinner')).toBeOnTheScreen();
    // Household order, then the guest; Sam's N/A is left out.
    const ratings = screen.getByTestId('cook-ratings-soup-1');
    expect(ratings).toHaveTextContent('★ 5 Alex · ★ 4 Jo');
    expect(ratings.props.accessibilityLabel).toBe('Alex 5 stars, Jo 4 stars');
    expect(screen.getByTestId('cook-notes-soup-1').props.numberOfLines).toBe(2);
  });

  it('shows an old review’s notes with no stars', async () => {
    await reviewedSoups(1);
    await renderHome();
    await screen.findByTestId('cook-card-soup-1');
    expect(screen.queryByTestId('cook-ratings-soup-1')).toBeNull();
    expect(screen.getByText('Notes for soup 1.')).toBeOnTheScreen();
  });
});

describe('N2: a card never drops its title’s last word', () => {
  const long =
    'Acceptance cook of a very long slow-roasted shoulder of lamb with anchovy, rosemary and white beans';

  // Jest has no text layout, so this pins down what made the word fall off on
  // the Fold: the title shrinking in a row beside the Open chip, or a limit on
  // its lines or height. The width and font scale are the cover display's
  // narrowest and Android's largest.
  it.each([
    ['at 320 dp', 320, 1],
    ['at the largest font scale', 320, 2],
  ])('wraps the whole title %s', async (_label, width, fontScale) => {
    const cook = await plainCook('n2', long);
    await render(
      <View style={{ width }}>
        <CookCard cook={cook} mealType="snack" onPress={() => {}} />
      </View>,
    );
    const title = screen.getByTestId('cook-title-n2');
    expect(title).toHaveTextContent(long);
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.adjustsFontSizeToFit).toBeUndefined();
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    expect(title.props.allowFontScaling).not.toBe(false);
    const style = StyleSheet.flatten(title.props.style);
    expect(style.fontSize! * fontScale).toBeGreaterThan(0);
    expect(style.flexShrink).toBeUndefined();
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
    // Its own block: no ancestor between it and the card lays it out in a row.
    expect(StyleSheet.flatten(title.parent?.props.style)?.flexDirection).not.toBe('row');
  });

  it('keeps the Open chip off the title’s line', async () => {
    const cook = await plainCook('n2-open', long);
    await render(<CookCard cook={cook} onPress={() => {}} />);
    const title = screen.getByTestId('cook-title-n2-open');
    expect(StyleSheet.flatten(title.parent?.props.style)?.flexDirection).not.toBe('row');
    expect(screen.getByText('Open')).toBeOnTheScreen();
  });
});
