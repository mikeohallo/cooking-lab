/**
 * Two panes on the unfolded inner display (0.3.0), and one column on the
 * cover display. Real screens and real SQLite; the window is the Fold's, as
 * measured on Android 16 at 420 dpi.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { EvidenceDecision } from '../src/domain/evidence';
import {
  COOK_SIDE_PANE_WIDTH,
  HOME_LIST_PANE_WIDTH,
  computeLayoutMetrics,
} from '../src/layout/responsive';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

const COVER: Figures = { width: 369, height: 905, scale: 2.625, fontScale: 1 };
const INNER: Figures = { width: 707, height: 823, scale: 2.625, fontScale: 1 };

/** The window, changeable mid-test the way folding changes it. */
const mockWindow: { figures: Figures; listeners: Set<() => void> } = {
  figures: INNER,
  listeners: new Set(),
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  function useWindowDimensions() {
    return useSyncExternalStore(
      (listener: () => void) => {
        mockWindow.listeners.add(listener);
        return () => mockWindow.listeners.delete(listener);
      },
      () => mockWindow.figures,
    );
  }
  return { __esModule: true, default: useWindowDimensions };
});

async function fold(figures: Figures): Promise<void> {
  await act(async () => {
    mockWindow.figures = figures;
    for (const listener of mockWindow.listeners) {
      listener();
    }
  });
}

let harness: ScreenHarness;

beforeEach(async () => {
  mockWindow.figures = INNER;
  harness = await openScreenHarness('two-panes.db');
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

async function reviewed(id: string, title: string, notes: string): Promise<void> {
  const { data } = harness.storage;
  const at = harness.tick();
  await data.capture.startCook({ id, title, startedAt: at }, 'user', at);
  await data.capture.saveReview(id, notes, 'user', harness.tick());
}

const widthOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style).width;

const SIX = ['4 eggs', '1 tin tomatoes', '1 onion', '2 peppers', '100 g feta', 'cumin'].join('\n');

describe('the breakpoint', () => {
  it('keeps the cover display one column, either way up, and gives the inner display two panes', () => {
    expect(computeLayoutMetrics(COVER.width, COVER.height).twoPane).toBe(false);
    expect(computeLayoutMetrics(COVER.height, COVER.width).twoPane).toBe(false);
    expect(computeLayoutMetrics(INNER.width, INNER.height).twoPane).toBe(true);
    expect(computeLayoutMetrics(INNER.height, INNER.width).twoPane).toBe(true);
    // Half the inner display in split screen, and the narrowest supported width.
    expect(computeLayoutMetrics(350, 823).twoPane).toBe(false);
    expect(computeLayoutMetrics(320, 640).twoPane).toBe(false);
  });

  it('leaves room on the inner display for each screen’s fixed pane and the other', () => {
    expect(INNER.width - HOME_LIST_PANE_WIDTH).toBeGreaterThanOrEqual(300);
    expect(INNER.width - COOK_SIDE_PANE_WIDTH).toBeGreaterThanOrEqual(300);
  });
});

describe('Home on the inner display', () => {
  beforeEach(async () => {
    await reviewed('cook-old', 'Lamb shoulder', 'Rested well.');
    await reviewed('cook-new', 'Brown butter pasta', 'Needed more salt.');
  });

  it('puts the list on the left and the first cook’s whole page on the right', async () => {
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} />);
    const right = await screen.findByTestId('home-cook-pane');
    expect(widthOf('screen-main-pane')).toBe(HOME_LIST_PANE_WIDTH);
    expect(within(screen.getByTestId('screen-main-pane')).getByTestId('history-search')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-main-pane')).getByTestId('history-list')).toBeOnTheScreen();
    expect(await within(right).findByTestId('cook-detail-screen')).toBeOnTheScreen();
    expect(within(right).getByTestId('cook-title')).toHaveTextContent('Brown butter pasta');
    expect(within(right).getByTestId('cook-this-again')).toBeOnTheScreen();
    expect(within(right).getByTestId('ratings-card')).toBeOnTheScreen();
    expect(within(right).getByTestId('verdict-card')).toBeOnTheScreen();
    expect(within(right).getByTestId('timeline')).toBeOnTheScreen();
    // Inside Home there is no Back to press.
    expect(within(right).queryByTestId('screen-back')).toBeNull();
    expect(screen.getByTestId('cook-card-cook-new').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('changes the right-hand pane when a card is tapped, without leaving Home', async () => {
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} />);
    await within(await screen.findByTestId('home-cook-pane')).findByTestId('cook-detail-screen');

    await fireEvent.press(screen.getByTestId('cook-card-cook-old'));

    await waitFor(() =>
      expect(within(screen.getByTestId('home-cook-pane')).getByTestId('cook-title')).toHaveTextContent(
        'Lamb shoulder',
      ),
    );
    expect(onOpenCook).not.toHaveBeenCalled();
    expect(screen.getByTestId('cook-card-cook-old').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('cook-card-cook-new').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('still opens an open cook on its own page, composer and all', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-open', startedAt: now() }, 'user', now());
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} />);
    await fireEvent.press(await screen.findByTestId('cook-card-cook-open'));
    expect(onOpenCook).toHaveBeenCalledWith('cook-open');
  });

  it('opens a cook’s actions inside the pane they belong to, and the Undo bar in the list’s', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('home-cook-pane');

    await fireEvent(screen.getByTestId('cook-card-cook-old'), 'longPress');
    const main = screen.getByTestId('screen-main-pane');
    expect(within(main).getByTestId('cook-actions-sheet')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-side-pane')).queryByTestId('cook-actions-sheet')).toBeNull();

    await fireEvent.press(within(main).getByTestId('delete-cook'));
    await fireEvent.press(within(main).getByTestId('delete-cook-confirm-button'));

    expect(await within(screen.getByTestId('screen-main-pane')).findByTestId('undo-bar')).toBeOnTheScreen();
    expect(screen.getAllByTestId('undo-bar')).toHaveLength(1);
  });

  it('opens the right-hand cook’s own sheet inside the right-hand pane', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const right = await screen.findByTestId('home-cook-pane');
    await fireEvent.press(await within(right).findByTestId('cook-more'));
    const side = screen.getByTestId('screen-side-pane');
    expect(within(side).getByTestId('cook-actions-sheet')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-main-pane')).queryByTestId('cook-actions-sheet')).toBeNull();
  });

  it('is one column on the cover display, and a tap opens the cook', async () => {
    mockWindow.figures = COVER;
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} />);
    await screen.findByTestId('history-list');
    expect(screen.queryByTestId('screen-side-pane')).toBeNull();
    await fireEvent.press(screen.getByTestId('cook-card-cook-old'));
    expect(onOpenCook).toHaveBeenCalledWith('cook-old');
  });
});

describe('an open cook on the inner display', () => {
  beforeEach(async () => {
    const { data } = harness.storage;
    await reviewed('cook-before', 'Shakshuka', 'Too much cumin.');
    granted(await data.cookRecord.saveIngredients('cook-before', SIX, { id: 'ing-1' }, 'user', harness.tick()));
    granted(await data.cookRecord.cookAgain('cook-before', { id: 'cook-again', ingredientsId: 'ing-2' }, 'user', harness.tick()));
    granted(
      await data.capture.addEvent(
        { id: 'note-1', cookId: 'cook-again', ts: harness.tick(), kind: 'user_note', body: 'Onions in.' },
        'user',
      ),
    );
  });

  it('has the timeline and composer on the left, Last time and every ingredient on the right', async () => {
    await harness.render(<CookScreen cookId="cook-again" onBack={() => {}} onReview={() => {}} />);
    const side = await screen.findByTestId('cook-side');
    const main = screen.getByTestId('screen-main-pane');

    expect(widthOf('screen-side-pane')).toBe(COOK_SIDE_PANE_WIDTH);
    expect(within(main).getByTestId('timeline')).toBeOnTheScreen();
    expect(within(main).getByTestId('screen-footer')).toBeOnTheScreen();
    expect(within(main).getByTestId('note-input')).toBeOnTheScreen();
    expect(within(main).queryByTestId('last-time')).toBeNull();
    expect(within(main).queryByTestId('ingredients')).toBeNull();

    expect(await within(side).findByTestId('last-time')).toBeOnTheScreen();
    // Never folded here, though the timeline has started.
    expect(within(side).queryByTestId('last-time-folded')).toBeNull();
    expect(within(side).getByTestId('ingredients-text')).toHaveTextContent('cumin', { exact: false });
  });

  it('keeps the cook, the half-typed note and the scroll view when folded and unfolded', async () => {
    await harness.render(<CookScreen cookId="cook-again" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('cook-side');
    await fireEvent.changeText(screen.getByTestId('note-input'), 'Half a thought about the');
    const input = screen.getByTestId('note-input');
    const scroll = screen.getByTestId('screen-scroll');

    await fold(COVER);
    expect(screen.queryByTestId('screen-side-pane')).toBeNull();
    expect(screen.getByTestId('cook-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('note-input')).toBe(input);
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('Half a thought about the');
    expect(screen.getByTestId('screen-scroll')).toBe(scroll);
    // On one column the ingredients come back above the timeline, folded.
    expect(within(screen.getByTestId('screen-main-pane')).getByTestId('ingredients')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-main-pane')).getByTestId('last-time-folded')).toBeOnTheScreen();

    await fold(INNER);
    expect(screen.getByTestId('screen-side-pane')).toBeOnTheScreen();
    expect(screen.getByTestId('note-input')).toBe(input);
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('Half a thought about the');
    expect(screen.getByTestId('screen-scroll')).toBe(scroll);
  });
});

describe('the review on the inner display', () => {
  it('puts who ate it beside your notes and next time, with Finish review under them', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-r', title: 'Tagine', startedAt: now() }, 'user', now());
    await harness.render(<ReviewScreen cookId="cook-r" onBack={() => {}} onFinished={() => {}} />);
    const side = await screen.findByTestId('review-side');
    const main = screen.getByTestId('screen-main-pane');

    expect(await within(main).findByTestId('who-ate-it')).toBeOnTheScreen();
    expect(within(main).queryByTestId('verdict-input')).toBeNull();
    expect(within(side).getByTestId('verdict-input')).toBeOnTheScreen();
    expect(within(side).getByTestId('takeaway-input')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-side-footer')).getByTestId('finish-review')).toBeOnTheScreen();
    expect(within(main).queryByTestId('finish-review')).toBeNull();
  });

  it('keeps the words typed when folded mid-review', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-r', title: 'Tagine', startedAt: now() }, 'user', now());
    await harness.render(<ReviewScreen cookId="cook-r" onBack={() => {}} onFinished={() => {}} />);
    await screen.findByTestId('review-side');
    await fireEvent.changeText(screen.getByTestId('verdict-input'), 'Apricots made it.');

    await fold(COVER);
    expect(screen.queryByTestId('review-side')).toBeNull();
    expect(screen.getByTestId('verdict-input')).toHaveDisplayValue('Apricots made it.');
    expect(within(screen.getByTestId('screen-footer')).getByTestId('finish-review')).toBeOnTheScreen();
  });
});
