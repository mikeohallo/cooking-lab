/**
 * The cover screen as drawn for 0.4.0 (part 2): the Cooking now card, New
 * Cook floating with the Undo bar above it, the Filters sheet's chips, the
 * cook page's photo and its Next time first, Who's eating's rename rule, the
 * "Today" line, and every redrawn screen in light and in dark. Real screens on
 * real SQLite; the people are You, Guest and Guest 2.
 */

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { COOKING_NOW_OVERLINE, NEW_COOK_TITLE } from '../src/content/product';
import { renameMember } from '../src/domain/household';
import type { EvidenceDecision } from '../src/domain/evidence';
import { formatDayAndTime } from '../src/format/dateTime';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { HouseholdScreen } from '../src/screens/HouseholdScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { ThemeOverride } from '../src/theme/theme';
import { palettes, type ThemeName } from '../src/theme/tokens';
import { sageSquareJpeg } from './fixtures/photoBytes';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness();
});

afterEach(async () => {
  await cleanup();
  await harness.close();
});

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

/** A reviewed cook and an open "2nd time" of it, with a note and a photo. */
async function seed(): Promise<void> {
  const { data } = harness.storage;
  const at = harness.tick();
  granted(await data.capture.startCook({ id: 'cook-old', title: 'Apple muffins', startedAt: at }, 'user', at));
  granted(await data.cookRecord.setMealType('cook-old', 'breakfast', 'user', harness.tick()));
  granted(await data.cookRecord.setCuisine('cook-old', 'american', null, 'user', harness.tick()));
  granted(await data.capture.saveReview('cook-old', 'Moist.', 'user', harness.tick()));
  granted(await data.cookRecord.addNextTime('cook-old', 'Don’t squeeze the apples.', { id: 'lesson-1' }, 'user', harness.tick()));
  granted(await data.cookRecord.cookAgain('cook-old', { id: 'cook-new', ingredientsId: 'ing-new' }, 'user', harness.tick()));
  granted(
    await data.capture.addEvent(
      { id: 'note-1', cookId: 'cook-new', ts: harness.tick(), kind: 'user_note', body: 'Grated both apples.' },
      'user',
    ),
  );
  const path = 'cooks/cook-new/events/photo-1/20261015t083100-00.jpg';
  await harness.storage.photos.write(path, sageSquareJpeg());
  granted(
    await data.capture.addEvent(
      { id: 'photo-1', cookId: 'cook-new', ts: harness.tick(), kind: 'photo', photoPath: path },
      'user',
    ),
  );
}

describe('Home', () => {
  it('draws a Cooking now card per open cook: overline, photo, title and labels, just the dish (0.4.1)', async () => {
    await seed();
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const card = await screen.findByTestId('cook-card-cook-new');
    expect(within(screen.getByTestId('cooking-now')).getByText(COOKING_NOW_OVERLINE)).toBeOnTheScreen();
    expect(within(card).getByText('Apple muffins')).toBeOnTheScreen();
    expect(within(card).getByTestId('cook-meal-cook-new')).toHaveTextContent('Breakfast');
    expect(within(card).getByLabelText('Cuisine: American')).toBeOnTheScreen();
    // No visible started line, note count or "2nd time" (0.4.1): TalkBack still reads all of it.
    await waitFor(() =>
      expect(card.props.accessibilityLabel).toMatch(
        /^Cooking now: Apple muffins\. Started \d{1,2}:\d\d (am|pm) · 1 note · 2nd time$/,
      ),
    );
    expect(within(card).queryByText(/Started/)).toBeNull();
    expect(within(card).queryByText(/note/)).toBeNull();
    expect(within(card).queryByText(/2nd time/)).toBeNull();
    // The meal and cuisine are a line of their own, wrapping inside the text
    // column, never under the chevron; the column may shrink below its words.
    const labels = within(card).getByTestId('cook-labels-cook-new');
    expect(StyleSheet.flatten(labels.props.style)).toMatchObject({ flexBasis: '100%', flexWrap: 'wrap' });
    expect(StyleSheet.flatten(labels.parent!.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
    // Its own photo, as the card's picture.
    await waitFor(() => expect(within(card).getByTestId('cook-cook-new-photo')).toBeOnTheScreen());
  });

  it('docks New Cook under the list, never over it, and puts the Undo bar just above it (0.4.0, part 5)', async () => {
    await seed();
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const floating = await screen.findByTestId('screen-dock');
    expect(within(floating).getByRole('button', { name: NEW_COOK_TITLE })).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-scroll')).queryByRole('button', { name: NEW_COOK_TITLE })).toBeNull();
    // In the flow after the scrolling area, so the list ends above it.
    const dock = StyleSheet.flatten(floating.props.style);
    expect(dock.position).toBeUndefined();
    expect(dock.backgroundColor).toBe(palettes.light.page);
    expect(within(floating).getByTestId('screen-dock-fade')).toBeOnTheScreen();
    const body = screen.getByTestId('screen-main-pane');
    const order = within(body)
      .getAllByTestId(/^(screen-scroll|screen-dock)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual(['screen-scroll', 'screen-dock']);

    await fireEvent(await screen.findByTestId('cook-card-cook-old'), 'longPress');
    await fireEvent.press(await screen.findByTestId('delete-cook'));
    await fireEvent.press(screen.getByTestId('delete-cook-confirm-button'));

    const bar = await within(floating).findByTestId('undo-bar');
    const ids = within(floating)
      .getAllByTestId(/^(undo-bar|new-cook)$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual(['undo-bar', 'new-cook']);
    expect(bar).toBeOnTheScreen();
  });

  it('draws the chosen filter chips navy with a tick in the sheet', async () => {
    await seed();
    granted(await harness.storage.data.householdWorkflow.add('You', { id: 'm-you' }, harness.tick()));
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await fireEvent.press(await screen.findByTestId('search-filters'));
    await fireEvent.press(await screen.findByTestId('filters-cuisine-greek'));
    const chip = screen.getByTestId('filters-cuisine-greek');
    expect(within(chip).getByTestId('icon-check', { includeHiddenElements: true })).toBeTruthy();
    const drawn = chip.children[0] as unknown as { props: { style: unknown } };
    expect(StyleSheet.flatten(drawn.props.style as StyleProp<ViewStyle>).backgroundColor).toBe(palettes.light.selected);
  });
});

describe('the cook page', () => {
  it('puts the photo beside the title and Next time first, from the last time', async () => {
    await seed();
    await harness.render(<CookScreen cookId="cook-new" onBack={() => {}} onReview={() => {}} />);
    expect(await screen.findByTestId('cook-title-photo')).toBeOnTheScreen();
    const nextTime = await screen.findByTestId('next-time-card');
    expect(within(nextTime).getByText('Don’t squeeze the apples.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Notes, 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Photos, 1')).toBeOnTheScreen();
    expect(screen.getByTestId('times-cooked')).toHaveTextContent(/ · 2nd time cooking this$/);
  });
});

describe('the rules under the screens', () => {
  const member = { id: 'm-1', name: 'You', position: 0, retiredAt: null, createdAt: '2026-10-15T08:30:00.000Z' };
  const other = { ...member, id: 'm-2', name: 'Guest', position: 1 };

  it('renames someone, trimmed, unless the name is taken or empty', () => {
    expect(renameMember(member, '  Guest 2 ', [member, other])).toEqual({
      allowed: true,
      record: { ...member, name: 'Guest 2' },
    });
    expect(renameMember(member, 'guest', [member, other]).allowed).toBe(false);
    expect(renameMember(member, '   ', [member, other]).allowed).toBe(false);
    // A name taken only by someone who no longer eats here is free.
    expect(renameMember(member, 'Guest', [member, { ...other, retiredAt: '2026-10-16T08:30:00.000Z' }]).allowed).toBe(true);
  });

  it('writes "Today · 9:02 am", or the day for any other date', () => {
    const today = new Date(2026, 10, 2, 12, 0);
    expect(formatDayAndTime(new Date(2026, 10, 2, 9, 2).toISOString(), today)).toBe('Today · 9:02 am');
    expect(formatDayAndTime(new Date(2026, 9, 30, 9, 16).toISOString(), today)).toBe('Fri 30 Oct · 9:16 am');
    expect(formatDayAndTime('not a date', today)).toBe('');
  });
});

describe('light and dark', () => {
  const screens: readonly [string, () => ReactElement, string][] = [
    ['Home', () => <HomeScreen onOpenCook={() => {}} />, 'home-screen'],
    ['an open cook', () => <CookScreen cookId="cook-new" onBack={() => {}} onReview={() => {}} />, 'cook-screen'],
    ['a reviewed cook', () => <CookScreen cookId="cook-old" onBack={() => {}} onReview={() => {}} />, 'cook-detail-screen'],
    ['the review', () => <ReviewScreen cookId="cook-new" onBack={() => {}} onFinished={() => {}} />, 'review-screen'],
    ['Edit review', () => <ReviewScreen cookId="cook-old" onBack={() => {}} onFinished={() => {}} />, 'review-screen'],
    ['Who’s eating', () => <HouseholdScreen onBack={() => {}} />, 'household-screen'],
  ];

  it.each(screens.flatMap(([name, make, id]) => (['light', 'dark'] as ThemeName[]).map((theme) => [name, theme, make, id] as const)))(
    'draws %s in %s on the page colour',
    async (_name, theme, make, id) => {
      await seed();
      await harness.render(<ThemeOverride scheme={theme}>{make()}</ThemeOverride>);
      await screen.findByTestId(id);
      // The safe area under the body carries the page colour of the theme.
      const backgrounds: unknown[] = [];
      for (let node = screen.getByTestId('screen-body').parent; node; node = node.parent) {
        backgrounds.push(StyleSheet.flatten((node.props as { style?: StyleProp<ViewStyle> }).style)?.backgroundColor);
      }
      expect(backgrounds).toContain(palettes[theme].page);
      expect(backgrounds).not.toContain(palettes[theme === 'light' ? 'dark' : 'light'].page);
    },
  );
});
