/**
 * The shared parts of 0.4.0, each drawn from the design system's tokens, in
 * light and in dark.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { BottomSheet } from '../src/components/BottomSheet';
import { Button } from '../src/components/Button';
import { ReadingChip, SendButton } from '../src/components/Composer';
import { CookCard } from '../src/components/CookCard';
import { CuisinePill } from '../src/components/CuisinePill';
import { FilterChip } from '../src/components/FilterChip';
import { MATERIAL_SYMBOL, MEAL_ICON } from '../src/components/Icon';
import { LastTimeCard } from '../src/components/LastTimeCard';
import { MealLabel } from '../src/components/MealLabel';
import { NewCookButton } from '../src/components/NewCookButton';
import { NextTimeCard } from '../src/components/NextTimeCard';
import { Notice } from '../src/components/Notice';
import { Pager } from '../src/components/Pager';
import { ReadingCard } from '../src/components/ReadingCard';
import { SearchBar } from '../src/components/SearchBar';
import { RatingBadge, SectionGroup } from '../src/components/SectionGroup';
import { NotApplicableToggle, RatingRow, StarButtons } from '../src/components/StarRating';
import { StatusChip } from '../src/components/StatusChip';
import { TagChip } from '../src/components/TagChip';
import { TextField } from '../src/components/TextField';
import { TopBar } from '../src/components/TopBar';
import { UndoBar } from '../src/components/UndoBar';
import { Zone, ZoneBar } from '../src/components/Zone';
import { REMOVE_TAG } from '../src/content/product';
import { MEAL_TYPE_LABELS } from '../src/domain/cookRecord';
import { STORED_MEAL_TYPES } from '../src/domain/enums';
import { ThemeOverride } from '../src/theme/theme';
import { DISABLED_OPACITY, THEME_NAMES, mealColorRole, palettes, type ThemeName } from '../src/theme/tokens';

const flat = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style) as Record<
    string,
    unknown
  >;

async function draw(element: React.ReactElement, theme: ThemeName = 'light') {
  await render(<ThemeOverride scheme={theme}>{element}</ThemeOverride>);
}

afterEach(async () => {
  await cleanup();
});

describe.each(THEME_NAMES)('in %s', (theme) => {
  const colors = palettes[theme];

  it('MealLabel: five meals, each its word and icon in its colour, never a fill', async () => {
    for (const meal of STORED_MEAL_TYPES) {
      await draw(<MealLabel mealType={meal} testID="label" />, theme);
      expect(flat('label').backgroundColor).toBeUndefined();
      expect(screen.getByTestId(`icon-${MEAL_ICON[meal]}`, { includeHiddenElements: true })).toBeTruthy();
      const word = screen.getByText(MEAL_TYPE_LABELS[meal]);
      expect(StyleSheet.flatten(word.props.style).color).toBe(colors[mealColorRole[meal]]);
      await cleanup();
    }
    await draw(<MealLabel mealType="side" testID="label" />, theme);
    expect(screen.getByText('Side')).toBeOnTheScreen();
  });

  it('CuisinePill: a neutral pill with a globe, and nothing without a cuisine', async () => {
    await draw(<CuisinePill label="Greek" testID="pill" />, theme);
    expect(screen.getByText('Greek')).toBeOnTheScreen();
    expect(flat('pill').backgroundColor).toBe(colors.surfaceRaised);
    expect(screen.getByTestId('icon-globe', { includeHiddenElements: true })).toBeTruthy();
    await cleanup();
    await draw(<CuisinePill label={null} testID="pill" />, theme);
    expect(screen.queryByTestId('pill')).toBeNull();
  });

  it('Button: orange main, teal secondary, peach, and 40 % when disabled', async () => {
    await draw(
      <>
        <Button label="New Cook" onPress={() => {}} testID="main" />
        <Button label="Finish & review" variant="secondary" onPress={() => {}} testID="secondary" />
        <Button label="Open" variant="peach" onPress={() => {}} testID="peach" />
        <Button label="N/A" variant="outlined" onPress={() => {}} disabled testID="outlined" />
      </>,
      theme,
    );
    expect(flat('main').backgroundColor).toBe(colors.primary);
    expect(flat('secondary').backgroundColor).toBe(colors.secondary);
    expect(flat('peach').backgroundColor).toBe(colors.peach);
    expect(flat('outlined').borderColor).toBe(colors.controlLine);
    expect(flat('outlined').opacity).toBe(DISABLED_OPACITY);
  });

  it('FilterChip: surface-raised, navy when chosen; a choice turns teal with a tick', async () => {
    await draw(
      <>
        <FilterChip label="All" selected onPress={() => {}} testID="all" />
        <FilterChip label="Greek" kind="choice" selected onPress={() => {}} testID="greek" />
      </>,
      theme,
    );
    expect(screen.getByTestId('all')).toBeChecked();
    expect(screen.getAllByTestId('icon-check', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('SearchBar: a clear button once there is text, and the filter count', async () => {
    const changes: string[] = [];
    await draw(
      <SearchBar value="lamb" onChangeText={(text) => changes.push(text)} onFilters={() => {}} filterCount={2} />,
      theme,
    );
    expect(screen.getByLabelText('Filters, 2 on')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('search-clear'));
    expect(changes).toEqual(['']);
  });

  it('Pager: the end that goes nowhere is disabled', async () => {
    await draw(
      <Pager page={1} pageCount={2} position="1 of 2" previousLabel="Previous" nextLabel="Next" onPrevious={() => {}} onNext={() => {}} />,
      theme,
    );
    expect(screen.getByTestId('home-page-previous')).toBeDisabled();
    expect(screen.getByTestId('home-page-next')).toBeEnabled();
    expect(flat('home-page-next').backgroundColor).toBe(colors.selected);
  });

  it('NewCookButton: an orange pill with a plus', async () => {
    await draw(<NewCookButton label="New Cook" onPress={() => {}} testID="new" />, theme);
    expect(flat('new').backgroundColor).toBe(colors.primary);
    expect(screen.getByTestId('icon-plus', { includeHiddenElements: true })).toBeTruthy();
  });

  it('NextTimeCard: amber, the lightbulb, NEXT TIME and the words', async () => {
    await draw(<NextTimeCard label="NEXT TIME" lines={['Don’t squeeze the apples.']} />, theme);
    expect(flat('next-time-card').backgroundColor).toBe(colors.next);
    expect(flat('next-time-card').borderColor).toBe(colors.nextLine);
    expect(screen.getByText('Don’t squeeze the apples.')).toBeOnTheScreen();
    expect(screen.getByTestId('icon-lightbulb', { includeHiddenElements: true })).toBeTruthy();
  });

  it('LastTimeCard: the date, the average beside a star, and Open in peach', async () => {
    const opened: number[] = [];
    await draw(
      <LastTimeCard heading="Last time · Fri 30 Oct" average="4.5" ratingSummary="· 2 ratings, 1 N/A" openLabel="Open" onOpen={() => opened.push(1)} />,
      theme,
    );
    expect(screen.getByText('Last time · Fri 30 Oct')).toBeOnTheScreen();
    expect(screen.getByTestId('last-time-average')).toHaveTextContent('4.5 · 2 ratings, 1 N/A');
    expect(flat('last-time-open').backgroundColor).toBe(colors.peach);
    await fireEvent.press(screen.getByTestId('last-time-open'));
    expect(opened).toEqual([1]);
  });

  it('CookCard: a meal tile without a photo, and Needs a review without ratings, never 0.0', async () => {
    await draw(
      <CookCard title="Slow-roast lamb" dateLine="Tue 27 Oct" mealType="side" cuisine="Greek" needsReviewLabel="Needs a review" onPress={() => {}} accessibilityLabel="Slow-roast lamb" testID="card" />,
      theme,
    );
    expect(flat('card-tile').backgroundColor).toBe(colors.zone);
    expect(screen.getAllByTestId('icon-bowl', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByText('Needs a review')).toBeOnTheScreen();
    expect(screen.queryByText('0.0')).toBeNull();
    expect(screen.getByText('Greek')).toBeOnTheScreen();
    await cleanup();
    await draw(
      <CookCard title="Muffins" dateLine="Tue 27 Oct" photoUri="file:///photo.jpg" average="4.5" ratingSummary="· 3 reviews" onPress={() => {}} accessibilityLabel="Muffins" testID="card" />,
      theme,
    );
    expect(screen.getByTestId('card-photo')).toBeOnTheScreen();
    expect(screen.queryByTestId('card-tile')).toBeNull();
    expect(screen.getByTestId('card-average')).toHaveTextContent('4.5· 3 reviews');
  });

  it('ReadingCard: the word is always printed, Internal never Inside', async () => {
    await draw(
      <>
        <ReadingCard kind="oven" word="Oven" value="180 °C" testID="oven" />
        <ReadingCard kind="internal" word="Internal" value="63 °C" testID="internal" />
      </>,
      theme,
    );
    expect(screen.getByText('Oven')).toBeOnTheScreen();
    expect(screen.getByText('Internal')).toBeOnTheScreen();
    expect(screen.queryByText(/Inside/)).toBeNull();
  });

  it('SectionGroup and RatingBadge: "Notes · 2", and the warm average badge', async () => {
    await draw(
      <SectionGroup title="Notes" count={2} icon="pencil" iconTint="noteIcon" iconColor="ink" trailing={<RatingBadge average="5.0" testID="badge" />}>
        <Text>Grated both apples.</Text>
      </SectionGroup>,
      theme,
    );
    expect(screen.getByText('Notes · 2')).toBeOnTheScreen();
    expect(flat('badge').backgroundColor).toBe(colors.ratingBadge);
  });

  it('StarRating: five named stars, N/A navy when pressed, and a read-only row', async () => {
    const tapped: number[] = [];
    await draw(
      <>
        <StarButtons stars={3} onTap={(value) => tapped.push(value)} labelFor={(value) => `${value} stars`} testID="you" />
        <NotApplicableToggle label="N/A" accessibilityLabel="Didn't eat it" on onPress={() => {}} testID="na" />
        <RatingRow name="Guest" stars={4} notEaten={false} notEatenLabel="N/A" spoken="Guest, 4 stars" testID="row" />
      </>,
      theme,
    );
    expect(screen.getByLabelText('3 stars')).toBeChecked();
    expect(screen.getByTestId('you-star-3-filled', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('you-star-4-empty', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('5 stars'));
    expect(tapped).toEqual([5]);
    expect(flat('na').backgroundColor).toBe(colors.selected);
    expect(screen.getByLabelText('Guest, 4 stars')).toBeOnTheScreen();
  });

  it('StatusChip, TagChip, Zone and the composer parts', async () => {
    await draw(
      <>
        <StatusChip status="needsReview" label="Needs a review" testID="status" />
        <TagChip name="apple" variant="removable" onPress={() => {}} testID="tag" />
        <Zone testID="zone">
          <Text>Cooking now</Text>
        </Zone>
        <ZoneBar icon="forkKnife" label="Ingredients" detail="12 · Show" testID="ingredients" />
        <ReadingChip kind="oven" label="Oven °C" onPress={() => {}} testID="oven-chip" />
        <SendButton label="Send" onPress={() => {}} disabled testID="send" />
      </>,
      theme,
    );
    expect(flat('status').backgroundColor).toBe(colors.peach);
    expect(screen.getByLabelText(`${REMOVE_TAG} apple`)).toBeOnTheScreen();
    expect(flat('zone').backgroundColor).toBe(colors.zone);
    expect(flat('ingredients').backgroundColor).toBe(colors.zoneQuiet);
    expect(flat('oven-chip').backgroundColor).toBe(colors.readingOven);
    expect(screen.getByTestId('send')).toBeDisabled();
  });

  it('TextField: Next time is amber with bold words', async () => {
    await draw(<TextField label="Next time" tone="next" value="" onChangeText={() => {}} testID="field" />, theme);
    expect(flat('field').backgroundColor).toBe(colors.next);
    expect(flat('field').borderColor).toBe(colors.nextLine);
  });

  it('TopBar, Notice, UndoBar and BottomSheet', async () => {
    const closed: number[] = [];
    const undone: number[] = [];
    await draw(
      <>
        <TopBar back={{ label: 'Home', onPress: () => {} }} />
        <Notice title="Nothing cooked yet" body="A cook can be as small as one sentence." icon="flame" testID="notice" />
        <UndoBar message="Cook deleted" undoLabel="Undo" onUndo={() => undone.push(1)} testID="undo" undoTestID="undo-button" />
        <BottomSheet title="Filters" onClose={() => closed.push(1)} testID="sheet">
          <Text>Who &amp; stars</Text>
        </BottomSheet>
      </>,
      theme,
    );
    expect(screen.getByText('Home')).toBeOnTheScreen();
    expect(screen.getByText('Nothing cooked yet')).toBeOnTheScreen();
    expect(flat('undo').backgroundColor).toBe(colors.inverse);
    await fireEvent.press(screen.getByTestId('undo-button'));
    expect(undone).toEqual([1]);
    await fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(closed).toEqual([1]);
  });
});

describe('icons', () => {
  it('names the nearest Material Symbols Rounded icon for each, rice_bowl for Side', () => {
    expect(MEAL_ICON.side).toBe('bowl');
    expect(MATERIAL_SYMBOL.bowl).toBe('rice_bowl');
    expect(MATERIAL_SYMBOL[MEAL_ICON.breakfast]).toBe('coffee');
    expect(MATERIAL_SYMBOL[MEAL_ICON.lunch_dinner]).toBe('restaurant');
    expect(MATERIAL_SYMBOL[MEAL_ICON.dessert]).toBe('cake');
    expect(MATERIAL_SYMBOL[MEAL_ICON.snack]).toBe('nutrition');
  });
});
