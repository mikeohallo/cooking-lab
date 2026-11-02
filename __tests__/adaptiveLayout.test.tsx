/**
 * Layouts that adapt to the space they are given (0.4.0, part 5).
 *
 * The first inner layouts were built at fixed widths taken from one phone. On
 * the Fold 6 bench (inner 707 × 823 and 823 × 707, cover 369 × 905, font size
 * 1.15) that crushed the detail side, broke "Cook this again" letter by letter,
 * stacked "‹ Home" a letter a line, and after a fold left Home 400 wide on a
 * 369 cover. Here:
 *
 *  - the pane maths at window widths 320 to 880 and font scales 1.0, 1.15 and
 *    1.3: one column or two panes, each pane's width, and button rows that
 *    wrap rather than squeeze;
 *  - every fold and turn between the cover, inner upright and inner sideways,
 *    each way, with no pane keeping a width from before;
 *  - the faults from the test run: the Undo bar on the cover, Edit review in
 *    Home's right pane, the reading box's "°C °C", the chip row's edge.
 *
 * Real screens and real SQLite. Names are "You", "Guest" and "Guest 2".
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { paneStyle } from '../src/components/ScreenContainer';
import type { EvidenceDecision } from '../src/domain/evidence';
import { computeLayoutMetrics, paneWidths, type PaneScreen } from '../src/layout/responsive';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { size } from '../src/theme/tokens';
import { openScreenHarness, type ScreenHarness } from './support/screens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

/** The window, changeable mid-test the way folding and turning change it. */
const mockWindow: { figures: Figures; listeners: Set<() => void> } = {
  figures: { width: 707, height: 823, scale: 2.625, fontScale: 1 },
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

async function become(figures: Figures): Promise<void> {
  await act(async () => {
    mockWindow.figures = figures;
    for (const listener of mockWindow.listeners) {
      listener();
    }
  });
}

const figures = (width: number, height: number, fontScale = 1.15): Figures => ({
  width,
  height,
  scale: 2.625,
  fontScale,
});

/**
 * The widths the line names, each with a height a real window of that width
 * has: a small phone, the bench's cover, a Fold 8 cover, a 600 dp tablet
 * window, the bench inner upright, the Fold 8 inner upright, the bench inner
 * sideways, the Fold 8 inner sideways.
 */
const WINDOWS: readonly (readonly [number, number])[] = [
  [320, 640],
  [369, 905],
  [412, 915],
  [600, 960],
  [707, 823],
  [792, 880],
  [823, 707],
  [880, 710],
];
const FONT_SCALES = [1, 1.15, 1.3] as const;
const COMBOS = WINDOWS.flatMap(([width, height]) => FONT_SCALES.map((scale) => [width, height, scale] as const));

/**
 * What each window should get: one column, or the list pane (Home and the
 * review) and the cook page's side column. 45% between 320 and 400; 42%
 * between 280 and 380; the other pane takes the rest.
 */
const EXPECTED: Readonly<Record<number, null | { list: number; cookSide: number }>> = {
  320: null,
  369: null,
  412: null,
  600: { list: 320, cookSide: 280 },
  707: { list: 320, cookSide: 297 },
  792: { list: 356, cookSide: 333 },
  823: { list: 370, cookSide: 346 },
  880: { list: 396, cookSide: 370 },
};

const COVER = figures(369, 905);
const UPRIGHT = figures(707, 823);
const SIDEWAYS = figures(823, 707);
const SHAPES = { cover: COVER, upright: UPRIGHT, sideways: SIDEWAYS } as const;
type Shape = keyof typeof SHAPES;
const CHANGES: readonly (readonly [Shape, Shape])[] = [
  ['cover', 'upright'],
  ['upright', 'cover'],
  ['cover', 'sideways'],
  ['sideways', 'cover'],
  ['upright', 'sideways'],
  ['sideways', 'upright'],
];

let harness: ScreenHarness;

beforeEach(async () => {
  mockWindow.figures = UPRIGHT;
  harness = await openScreenHarness('adaptive-layout.db');
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

const styleOf = (testID: string): ViewStyle => StyleSheet.flatten(screen.getByTestId(testID).props.style);

/** You and Guest; a reviewed cook rated by both; an open cook with two notes. */
async function notebook(): Promise<void> {
  const { data } = harness.storage;
  for (const name of ['You', 'Guest']) {
    granted(await data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
  }
  const at = harness.tick();
  await data.capture.startCook({ id: 'cook-done', title: 'Easy apple-cinnamon muffins', startedAt: at }, 'user', at);
  await data.capture.addEvent(
    { id: 'n-done', cookId: 'cook-done', ts: harness.tick(), kind: 'user_note', body: 'Grated both apples.' },
    'user',
  );
  await data.capture.saveReview('cook-done', 'Really tasty.', 'user', harness.tick());
  const later = harness.tick();
  await data.capture.startCook({ id: 'cook-now', title: 'Lemon tart', startedAt: later }, 'user', later);
  for (const [id, body] of [
    ['n-1', 'Blind baked the case.'],
    ['n-2', 'Curd set at the edges.'],
  ] as const) {
    await data.capture.addEvent({ id, cookId: 'cook-now', ts: harness.tick(), kind: 'user_note', body }, 'user');
  }
}

/** A row of buttons that wraps: side by side when they fit, else a line each at full width. */
function expectWrappingRow(testID: string, buttons: readonly string[]): void {
  const row = styleOf(testID);
  expect(row.flexDirection).toBe('row');
  expect(row.flexWrap).toBe('wrap');
  const ids = within(screen.getByTestId(testID))
    .getAllByRole('button')
    .map((node) => String(node.props.testID));
  expect(ids).toEqual(buttons);
  for (const id of buttons) {
    const button = styleOf(id);
    // Grows to fill its line, never shrinks below its words.
    expect(button.flexGrow).toBe(1);
    expect(button.flexShrink).toBe(0);
    expect(button.flexBasis).toBe('auto');
    expect(button.width).toBeUndefined();
  }
}

/** The top bar: wraps, the back control at its natural width, the actions free to go onto the next line. */
function expectWrappingTopBar(): void {
  const bar = within(screen.getByTestId('screen-main-pane')).getAllByTestId('top-bar')[0]!;
  expect(StyleSheet.flatten(bar.props.style).flexWrap).toBe('wrap');
  const leading = StyleSheet.flatten(within(bar).getByTestId('top-bar-leading').props.style);
  expect(leading.flexShrink).toBe(0);
  expect(leading.flexBasis).toBe('auto');
  const actions = StyleSheet.flatten(within(bar).getByTestId('top-bar-actions').props.style);
  expect(actions.flexWrap).toBe('wrap');
  expect(actions.flexShrink).toBe(1);
  expect(actions.flexBasis).toBe('auto');
  // "Home" on one line, whole.
  const back = within(bar).getByText('Home');
  expect(back.props.numberOfLines).toBe(1);
}

describe('the pane maths', () => {
  it.each(COMBOS)('at %i × %i, font scale %s', (width, height, fontScale) => {
    const expected = EXPECTED[width]!;
    // The font scale changes how words wrap inside a pane, never the panes.
    expect(fontScale).toBeGreaterThan(0);
    const home = paneWidths('home', width, height);
    const cook = paneWidths('cook', width, height);
    const review = paneWidths('review', width, height);
    if (expected === null) {
      for (const panes of [home, cook, review]) {
        expect(panes).toEqual({ mode: 'one', main: '100%', side: null });
      }
      expect(computeLayoutMetrics(width, height).twoPane).toBe(false);
      return;
    }
    expect(home).toEqual({ mode: 'two', fixed: 'main', main: expected.list, side: width - expected.list });
    expect(review).toEqual(home);
    expect(cook).toEqual({ mode: 'two', fixed: 'side', main: width - expected.cookSide, side: expected.cookSide });
    // Within the limits, and the other pane never squeezed below a pane's minimum.
    expect(home.main).toBeGreaterThanOrEqual(size.paneListMin);
    expect(home.main).toBeLessThanOrEqual(size.paneListMax);
    expect(cook.side).toBeGreaterThanOrEqual(size.paneSideMin);
    expect(cook.side).toBeLessThanOrEqual(size.paneSideMax);
    expect(home.side).toBeGreaterThanOrEqual(size.paneSideMin);
    expect(cook.main).toBeGreaterThanOrEqual(size.paneSideMin);
  });

  it('sets every size key in every state, so nothing is left from the layout before', () => {
    const keys = (style: ViewStyle) => Object.keys(style).sort();
    const states: ViewStyle[] = (['home', 'cook'] as PaneScreen[]).flatMap((rule) =>
      [
        paneWidths(rule, 369, 905),
        paneWidths(rule, 707, 823),
        paneWidths(rule, 823, 707),
      ].flatMap((panes) => [paneStyle(panes, 'main'), paneStyle(panes, 'side')]),
    );
    for (const style of states) {
      expect(keys(style)).toEqual(['flexBasis', 'flexGrow', 'flexShrink', 'width']);
    }
  });
});

describe('the screens at each size and font scale', () => {
  beforeEach(notebook);

  it.each(COMBOS)('Home at %i × %i, font scale %s', async (width, height, fontScale) => {
    mockWindow.figures = figures(width, height, fontScale);
    const expected = EXPECTED[width]!;
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');

    expect(styleOf('screen-main-pane').width).toBe(expected === null ? '100%' : expected.list);
    if (expected === null) {
      expect(screen.queryByTestId('screen-side-pane')).toBeNull();
      // The meal chips scroll sideways, edge to edge.
      expect(screen.getByTestId('history-meal-filter').props.horizontal).toBe(true);
      return;
    }
    expect(styleOf('screen-side-pane').width).toBe('auto');
    expect(styleOf('screen-side-pane').flexGrow).toBe(1);
    expect(styleOf('history-meal-filter').flexWrap).toBe('wrap');
    // Cook this again and Edit review in the chosen cook's pane.
    await within(screen.getByTestId('home-cook-pane')).findByTestId('cook-foot-row');
    expectWrappingRow('cook-foot-row', ['cook-this-again', 'edit-review']);
  });

  it.each(COMBOS)('an open cook at %i × %i, font scale %s', async (width, height, fontScale) => {
    mockWindow.figures = figures(width, height, fontScale);
    const expected = EXPECTED[width]!;
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('notes');

    if (expected === null) {
      expect(styleOf('screen-main-pane').width).toBe('100%');
      expect(screen.queryByTestId('screen-side-pane')).toBeNull();
    } else {
      expect(styleOf('screen-main-pane').width).toBe('auto');
      expect(styleOf('screen-side-pane').width).toBe(expected.cookSide);
    }
    // ‹ Home on its own line at the start; Screen on and Finish & review on
    // the next if they do not fit beside it.
    expectWrappingTopBar();
  });

  it.each(COMBOS)('a reviewed cook at %i × %i, font scale %s', async (width, height, fontScale) => {
    mockWindow.figures = figures(width, height, fontScale);
    await harness.render(<CookScreen cookId="cook-done" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('cook-foot-row');
    expectWrappingRow('cook-foot-row', ['cook-this-again', 'edit-review']);
  });

  it.each(COMBOS)('the review at %i × %i, font scale %s', async (width, height, fontScale) => {
    mockWindow.figures = figures(width, height, fontScale);
    const expected = EXPECTED[width]!;
    await harness.render(<ReviewScreen cookId="cook-now" onBack={() => {}} onFinished={() => {}} />);
    const controls = await screen.findByTestId('who-ate-it-member-m-you-controls');

    expect(styleOf('screen-main-pane').width).toBe(expected === null ? '100%' : expected.list);
    // The name, then one row that sits beside it or goes under it whole,
    // and never wraps inside itself (part 6).
    const group = StyleSheet.flatten(controls.props.style);
    expect(group.flexBasis).toBe('auto');
    expect(group.flexGrow).toBe(0);
    expect(group.flexWrap).toBe('nowrap');
    // The foot: Finish review at full width, never squeezed.
    const finish = styleOf('finish-review');
    expect(finish.alignSelf).toBe('stretch');
    expect(finish.flexShrink).toBe(0);
  });
});

describe('folding and turning keep no width from before', () => {
  beforeEach(notebook);

  it.each(CHANGES)('Home, %s → %s → back', async (from, to) => {
    mockWindow.figures = SHAPES[from];
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('history-list');
    const at = (shape: Shape) => paneStyle(paneWidths('home', SHAPES[shape].width, SHAPES[shape].height), 'main');
    const scroll = screen.getByTestId('screen-scroll');
    expect(styleOf('screen-main-pane')).toEqual(at(from));

    await become(SHAPES[to]);
    expect(styleOf('screen-main-pane')).toEqual(at(to));
    await become(SHAPES[from]);
    expect(styleOf('screen-main-pane')).toEqual(at(from));
    // The same scrolling area throughout: nothing was drawn afresh.
    expect(screen.getByTestId('screen-scroll')).toBe(scroll);
  });

  it('Home, fold → unfold → fold: the cover gets the whole width each time, not the list pane’s', async () => {
    mockWindow.figures = UPRIGHT;
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('home-cook-pane');
    expect(styleOf('screen-main-pane').width).toBe(320);
    for (const shape of [COVER, UPRIGHT, COVER] as const) {
      await become(shape);
      const main = styleOf('screen-main-pane');
      if (shape === COVER) {
        expect(main).toEqual({ width: '100%', flexGrow: 1, flexShrink: 1, flexBasis: 'auto' });
        expect(screen.queryByTestId('screen-side-pane')).toBeNull();
      } else {
        expect(main.width).toBe(320);
      }
    }
  });

  it.each(CHANGES)('an open cook, %s → %s → back', async (from, to) => {
    mockWindow.figures = SHAPES[from];
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('notes');
    const snapshot = () => ({
      main: styleOf('screen-main-pane'),
      side: screen.queryByTestId('screen-side-pane') ? styleOf('screen-side-pane') : null,
      notesAndPhotos: styleOf('notes-and-photos'),
      notes: styleOf('notes-column'),
    });
    const first = snapshot();
    const fresh = paneWidths('cook', SHAPES[from].width, SHAPES[from].height);
    expect(first.main).toEqual(paneStyle(fresh, 'main'));

    await become(SHAPES[to]);
    const there = paneWidths('cook', SHAPES[to].width, SHAPES[to].height);
    expect(styleOf('screen-main-pane')).toEqual(paneStyle(there, 'main'));
    if (there.mode === 'two') {
      expect(styleOf('screen-side-pane')).toMatchObject(paneStyle(there, 'side'));
    }

    await become(SHAPES[from]);
    expect(snapshot()).toEqual(first);
  });

  // Part 8: Notes and Photos sit side by side only with 300 dp each. The
  // bench sideways gives each 212, so they stack there too.
  it('sideways → upright → sideways: Notes keeps the whole column, with the same keys set both ways', async () => {
    mockWindow.figures = SIDEWAYS;
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('notes');
    const sideways = styleOf('notes-column');
    expect(sideways).toMatchObject({ flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 0 });
    expect(styleOf('notes-and-photos').flexDirection).toBe('column');

    await become(UPRIGHT);
    const upright = styleOf('notes-column');
    expect(Object.keys(upright).sort()).toEqual(Object.keys(sideways).sort());
    expect(Object.keys(styleOf('notes-and-photos')).sort()).toEqual(['alignItems', 'flexDirection', 'gap']);
    expect(styleOf('notes-and-photos').flexDirection).toBe('column');

    await become(SIDEWAYS);
    expect(styleOf('notes-column')).toEqual(sideways);
    expect(styleOf('notes-and-photos').flexDirection).toBe('column');
    // The top bar no longer grows a letter a line upright, which is what moved
    // the page on the bench: the back control keeps its words whole.
    expectWrappingTopBar();
  });
});

describe('the Undo bar after Delete note (0.4.0, part 5)', () => {
  beforeEach(notebook);

  // Home stays mounted under a cook's page. Its own Undo slot used to claim
  // the bar, so on the cover the cook's page drew none and the note could not
  // be brought back.
  it.each([
    ['the cover, an open cook', COVER, 'cook-now', 'n-1'],
    ['the cover, a reviewed cook', COVER, 'cook-done', 'n-done'],
    ['the inner screen, an open cook', UPRIGHT, 'cook-now', 'n-1'],
    ['the inner screen, a reviewed cook', UPRIGHT, 'cook-done', 'n-done'],
  ] as const)('shows on the cook’s page on %s, with Home underneath', async (_label, shape, cookId, noteId) => {
    mockWindow.figures = shape;
    await harness.render(
      <>
        <View testID="under">
          <HomeScreen onOpenCook={() => {}} />
        </View>
        <View testID="in-front">
          <CookScreen cookId={cookId} onBack={() => {}} onReview={() => {}} />
        </View>
      </>,
    );
    const front = screen.getByTestId('in-front');
    await fireEvent.press(await within(front).findByTestId(`note-${noteId}-more`));
    await fireEvent.press(await screen.findByTestId(`note-${noteId}-delete`));
    await waitFor(() => expect(within(front).queryByTestId(`event-${noteId}`)).toBeNull());

    const bar = within(front).getByTestId('undo-bar');
    expect(within(bar).getByText('Note deleted')).toBeOnTheScreen();
    await fireEvent.press(within(front).getByTestId('undo-delete'));
    expect(await within(front).findByTestId(`event-${noteId}`)).toBeOnTheScreen();
    await act(async () => {});
  });
});

describe('Home’s right pane', () => {
  beforeEach(notebook);

  it('opens Edit review from Edit review, not the cook page', async () => {
    const onOpenCook = jest.fn();
    const onReview = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} onReview={onReview} />);
    const pane = await screen.findByTestId('home-cook-pane');
    await fireEvent.press(await within(pane).findByTestId('edit-review'));
    expect(onReview).toHaveBeenCalledWith('cook-done');
    expect(onOpenCook).not.toHaveBeenCalled();
  });
});

describe('the cover’s meal chips', () => {
  beforeEach(notebook);

  it('scroll sideways under the right gutter to the screen’s edge', async () => {
    mockWindow.figures = COVER;
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const row = await screen.findByTestId('history-meal-filter');
    const gutter = computeLayoutMetrics(COVER.width, COVER.height).gutter;
    expect(StyleSheet.flatten(row.props.style).marginRight).toBe(-gutter);
    expect(StyleSheet.flatten(row.props.contentContainerStyle).paddingRight).toBe(gutter);
  });
});

describe('Add a reading', () => {
  beforeEach(notebook);

  it('has no "°C" placeholder beside the °C unit', async () => {
    mockWindow.figures = COVER;
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    await fireEvent.press(await screen.findByTestId('oven-reading-toggle'));
    const box = await screen.findByTestId('temperature-celsius');
    expect(box.props.placeholder).toBeUndefined();
    expect(screen.getAllByText('°C', { includeHiddenElements: true })).toHaveLength(1);
  });
});
