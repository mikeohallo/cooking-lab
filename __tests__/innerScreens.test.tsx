/**
 * The inner screen's own layouts (0.4.0, part 3), from the design pack's
 * screens 10 to 15: Home's list beside the chosen cook, the cook page in two
 * columns, and the review in two panes — upright and sideways, on the Fold 8
 * and on the Fold 6 bench — and folding, unfolding and turning between the
 * cover screen, inner upright and inner sideways, each pair both ways, keeping
 * the screen, the cook, the scroll view and anything half typed.
 *
 * Real screens and real SQLite. Names are "You" and "Guest".
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { EvidenceDecision } from '../src/domain/evidence';
import { computeLayoutMetrics, cookSidePaneWidth, listPaneWidth, notesAndPhotosLayout } from '../src/layout/responsive';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { palettes, size, space } from '../src/theme/tokens';
import { openScreenHarness, type ScreenHarness } from './support/screens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

const COVER: Figures = { width: 369, height: 905, scale: 2.625, fontScale: 1 };
/** The Fold 8's inner screen, upright and sideways (about 710 tall above the taskbar). */
const UPRIGHT: Figures = { width: 792, height: 880, scale: 2.625, fontScale: 1 };
const SIDEWAYS: Figures = { width: 880, height: 710, scale: 2.625, fontScale: 1 };
/** The Fold 6 bench's inner screen, upright and sideways. */
const BENCH_UPRIGHT: Figures = { width: 707, height: 823, scale: 2.625, fontScale: 1 };
const BENCH_SIDEWAYS: Figures = { width: 823, height: 660, scale: 2.625, fontScale: 1 };

const SHAPES = { cover: COVER, upright: UPRIGHT, sideways: SIDEWAYS } as const;
type Shape = keyof typeof SHAPES;

/** Every change between the three shapes, each way. */
const CHANGES: readonly (readonly [Shape, Shape])[] = [
  ['cover', 'upright'],
  ['upright', 'cover'],
  ['cover', 'sideways'],
  ['sideways', 'cover'],
  ['upright', 'sideways'],
  ['sideways', 'upright'],
];

/** The window, changeable mid-test the way folding and turning change it. */
const mockWindow: { figures: Figures; listeners: Set<() => void> } = {
  figures: UPRIGHT,
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

let harness: ScreenHarness;

beforeEach(async () => {
  mockWindow.figures = UPRIGHT;
  harness = await openScreenHarness('inner-screens.db');
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

/** Every test id under a node, in the order drawn. */
function idsInOrder(node: unknown): string[] {
  const out: string[] = [];
  const walk = (at: unknown) => {
    if (at === null || typeof at !== 'object') {
      return;
    }
    const element = at as { props?: { testID?: string }; children?: unknown[] };
    if (typeof element.props?.testID === 'string' && !out.includes(element.props.testID)) {
      out.push(element.props.testID);
    }
    for (const child of element.children ?? []) {
      walk(child);
    }
  };
  walk(node);
  return out;
}

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const surface = palettes.light.surface;

async function household(...names: string[]): Promise<void> {
  for (const name of names) {
    granted(await harness.storage.data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
  }
}

async function reviewed(id: string, title: string, notes: string): Promise<void> {
  const { data } = harness.storage;
  const at = harness.tick();
  await data.capture.startCook({ id, title, startedAt: at }, 'user', at);
  await data.capture.saveReview(id, notes, 'user', harness.tick());
}

const TWELVE = [
  '2 apples, grated',
  '250 g plain flour',
  '2 tsp baking powder',
  '1½ tsp cinnamon',
  '¼ tsp salt',
  '120 g brown sugar',
  '2 eggs',
  '120 g butter, melted',
  '180 g Greek yoghurt',
  '1 tsp vanilla',
  'Handful of choc chips',
  '1 pinch nutmeg',
].join('\n');

/**
 * Screen 11's cook: made again from a reviewed one with a next-time line and
 * twelve ingredients; an Oven and an Internal reading, two notes, three photos.
 */
async function muffinsAgain(): Promise<void> {
  const { data } = harness.storage;
  await household('You', 'Guest');
  await reviewed('cook-before', 'Easy apple-cinnamon muffins', 'Really tasty.');
  granted(await data.cookRecord.saveIngredients('cook-before', TWELVE, { id: 'ing-1' }, 'user', harness.tick()));
  granted(await data.cookRecord.addNextTime('cook-before', 'Don’t squeeze the apples.', { id: 'l-1' }, 'user', harness.tick()));
  granted(await data.cookRecord.cookAgain('cook-before', { id: 'cook-now', ingredientsId: 'ing-2' }, 'user', harness.tick()));
  const event = (id: string, extra: Record<string, unknown>) =>
    data.capture.addEvent({ id, cookId: 'cook-now', ts: harness.tick(), ...extra } as never, 'user');
  granted(await event('t-oven', { kind: 'temp', meta: { celsius: 180, readingKind: 'oven' } }));
  granted(await event('t-internal', { kind: 'temp', meta: { celsius: 96, readingKind: 'internal' } }));
  granted(await event('n-1', { kind: 'user_note', body: 'Grated both apples.' }));
  granted(await event('n-2', { kind: 'user_note', body: 'Choc chips into half the batter.' }));
  for (const id of ['p-1', 'p-2', 'p-3']) {
    granted(await event(id, { kind: 'photo', photoPath: `cooks/cook-now/events/${id}/20261102t090000-00.jpg` }));
  }
}

describe('the inner screen’s sizes', () => {
  it('gives both inner screens two panes either way round, and keeps the cover one column', () => {
    for (const figures of [UPRIGHT, SIDEWAYS, BENCH_UPRIGHT, BENCH_SIDEWAYS]) {
      expect(computeLayoutMetrics(figures.width, figures.height).twoPane).toBe(true);
    }
    expect(computeLayoutMetrics(COVER.width, COVER.height).twoPane).toBe(false);
    expect(computeLayoutMetrics(COVER.height, COVER.width).twoPane).toBe(false);
  });

  it('knows sideways from upright, and uses the inner panes’ 20 dp gutter', () => {
    expect(computeLayoutMetrics(UPRIGHT.width, UPRIGHT.height).sideways).toBe(false);
    expect(computeLayoutMetrics(SIDEWAYS.width, SIDEWAYS.height).sideways).toBe(true);
    expect(computeLayoutMetrics(BENCH_UPRIGHT.width, BENCH_UPRIGHT.height).sideways).toBe(false);
    expect(computeLayoutMetrics(BENCH_SIDEWAYS.width, BENCH_SIDEWAYS.height).sideways).toBe(true);
    expect(computeLayoutMetrics(COVER.height, COVER.width).sideways).toBe(false);
    expect(computeLayoutMetrics(UPRIGHT.width, UPRIGHT.height).gutter).toBe(space.ml);
  });

  it('lays the panes out as shares of the window, between the tokens’ limits (0.4.0, part 5)', () => {
    // The Fold 8: 45% of 792 is 356; of 880, 396. The bench: 318 → 320, 370.
    expect(listPaneWidth(UPRIGHT.width)).toBe(356);
    expect(listPaneWidth(SIDEWAYS.width)).toBe(396);
    expect(listPaneWidth(BENCH_UPRIGHT.width)).toBe(size.paneListMin);
    expect(listPaneWidth(BENCH_SIDEWAYS.width)).toBe(370);
    expect(cookSidePaneWidth(BENCH_UPRIGHT.width)).toBe(297);
    expect(cookSidePaneWidth(BENCH_SIDEWAYS.width)).toBe(346);
    for (const figures of [UPRIGHT, SIDEWAYS, BENCH_UPRIGHT, BENCH_SIDEWAYS]) {
      expect(figures.width - listPaneWidth(figures.width)).toBeGreaterThanOrEqual(size.paneListMin);
      expect(figures.width - cookSidePaneWidth(figures.width)).toBeGreaterThanOrEqual(size.paneSideMin);
    }
  });
});

describe('Home on the inner screen (10, 13)', () => {
  beforeEach(async () => {
    await household('You', 'Guest');
    await reviewed('cook-old', 'Lemon tart', 'Sharp.');
    await reviewed('cook-new', 'Easy apple-cinnamon muffins', 'Really tasty.');
  });

  it.each([
    ['upright', UPRIGHT],
    ['sideways', SIDEWAYS],
    ['upright on the bench', BENCH_UPRIGHT],
    ['sideways on the bench', BENCH_SIDEWAYS],
  ])('puts a list of 45%% of the window beside the chosen cook, %s', async (_label, figures) => {
    mockWindow.figures = figures;
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const right = await screen.findByTestId('home-cook-pane');
    const main = screen.getByTestId('screen-main-pane');

    expect(styleOf('screen-main-pane').width).toBe(listPaneWidth(figures.width));
    expect(within(main).getByTestId('history-search')).toBeOnTheScreen();
    // The meal chips wrapped, not one scrolling row.
    expect(styleOf('history-meal-filter').flexWrap).toBe('wrap');
    expect(screen.getByTestId('history-meal-filter').props.horizontal).toBeUndefined();
    // New Cook is docked at the foot of the list pane.
    expect(within(main).getByTestId('screen-dock')).toBeOnTheScreen();
    expect(within(main).getByTestId('new-cook')).toBeOnTheScreen();

    // The right-hand pane: the most recent cook, as on the cover screen's
    // reviewed-cook page, on surface, its two buttons pinned at its foot.
    expect(styleOf('screen-side-pane').backgroundColor).toBe(surface);
    expect(await within(right).findByTestId('cook-detail-screen')).toBeOnTheScreen();
    expect(within(right).getByTestId('cook-title')).toHaveTextContent('Easy apple-cinnamon muffins');
    const foot = within(right).getByTestId('embedded-footer');
    expect(within(foot).getByTestId('cook-this-again')).toBeOnTheScreen();
    expect(within(foot).getByTestId('edit-review')).toBeOnTheScreen();
    const page = within(right).getByTestId('embedded-scroll');
    expect(within(page).queryByTestId('cook-this-again')).toBeNull();
    expect(within(page).getByTestId('ratings-card')).toBeOnTheScreen();
    expect(within(page).getByTestId('verdict-card')).toBeOnTheScreen();
    expect(screen.getByTestId('cook-card-cook-new').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('keeps the chosen cook through paging and folding, and the teal edge on its card', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await within(await screen.findByTestId('home-cook-pane')).findByTestId('cook-detail-screen');
    await fireEvent.press(screen.getByTestId('cook-card-cook-old'));
    await waitFor(() =>
      expect(within(screen.getByTestId('home-cook-pane')).getByTestId('cook-title')).toHaveTextContent('Lemon tart'),
    );

    await become(COVER);
    expect(screen.queryByTestId('home-cook-pane')).toBeNull();
    await become(SIDEWAYS);
    await waitFor(() =>
      expect(within(screen.getByTestId('home-cook-pane')).getByTestId('cook-title')).toHaveTextContent('Lemon tart'),
    );
    expect(screen.getByTestId('cook-card-cook-old').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('opens an open cook full screen from Cooking now', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-open', startedAt: now() }, 'user', now());
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} />);
    await fireEvent.press(await screen.findByTestId('cook-card-cook-open'));
    expect(onOpenCook).toHaveBeenCalledWith('cook-open');
  });
});

describe('Home on the inner screen with nothing reviewed', () => {
  it('shows a quiet notice in the right-hand pane', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const empty = await screen.findByTestId('home-cook-pane-empty');
    expect(within(empty).getByText('No reviewed cook yet')).toBeOnTheScreen();
    expect(screen.getByTestId('home-empty')).toBeOnTheScreen();
  });
});

describe('the cook page on the inner screen (11, 14)', () => {
  beforeEach(muffinsAgain);

  it('upright: the main column and composer, and Next time, Last time and Ingredients in the side column', async () => {
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    const side = await screen.findByTestId('cook-side');
    const main = screen.getByTestId('screen-main-pane');

    expect(styleOf('screen-side-pane').width).toBe(cookSidePaneWidth(UPRIGHT.width));
    expect(styleOf('screen-side-pane').backgroundColor).toBe(surface);

    // Main: the top bar, the header, Readings, Notes and Photos, and the composer.
    expect(within(main).getByTestId('finish-and-review')).toBeOnTheScreen();
    expect(within(main).getByTestId('screen-awake-toggle')).toBeOnTheScreen();
    expect(within(main).getByTestId('readings')).toBeOnTheScreen();
    expect(within(main).getByTestId('notes')).toBeOnTheScreen();
    expect(within(main).getByTestId('photos')).toBeOnTheScreen();
    expect(within(within(main).getByTestId('screen-footer')).getByTestId('note-input')).toBeOnTheScreen();
    expect(within(main).queryByTestId('next-time-card')).toBeNull();
    expect(within(main).queryByTestId('last-time')).toBeNull();
    expect(within(main).queryByTestId('ingredients-bar')).toBeNull();

    // Side: Next time, then Last time, then the ingredients open as a list.
    const nextTime = await within(side).findByTestId('next-time-card');
    const lastTime = within(side).getByTestId('last-time');
    const ingredients = within(side).getByTestId('ingredients');
    expect(nextTime).toHaveTextContent('Don’t squeeze the apples.', { exact: false });
    expect(lastTime).toBeOnTheScreen();
    const ids = idsInOrder(side);
    expect(ids.indexOf('next-time-card')).toBeLessThan(ids.indexOf('last-time'));
    expect(ids.indexOf('last-time')).toBeLessThan(ids.indexOf('ingredients'));
    expect(within(ingredients).getByTestId('ingredients-text')).toHaveTextContent('Handful of choc chips', {
      exact: false,
    });
    expect(within(ingredients).getByLabelText('Ingredients, 12')).toBeOnTheScreen();
    expect(within(ingredients).queryByTestId('ingredients-show-all')).toBeNull();

    // Upright, Notes and Photos stack, and the photos are three to a row.
    expect(styleOf('notes-and-photos').flexDirection).not.toBe('row');
    const firstRow = screen.getByTestId('photos').children[0] as { children: unknown[] };
    expect(firstRow.children).toHaveLength(3);
  });

  // Part 8: side by side only when each gets 300 dp of the main column.
  // Sideways on the Fold 8 each would get 229, so they stack.
  it('sideways: Notes above Photos, each the whole main column, the photos three to a row', async () => {
    mockWindow.figures = SIDEWAYS;
    expect(notesAndPhotosLayout(SIDEWAYS.width, SIDEWAYS.height)).toMatchObject({ layout: 'stacked', besideEach: 229 });
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('cook-side');
    expect(styleOf('notes-and-photos').flexDirection).toBe('column');
    const both = screen.getByTestId('notes-and-photos');
    const ids = idsInOrder(both);
    expect(ids.indexOf('notes-column')).toBeLessThan(ids.indexOf('photos-column'));
    expect(styleOf('notes-column')).toMatchObject({ flexGrow: 0, alignSelf: 'stretch' });
    expect(styleOf('photos-column')).toMatchObject({ flexGrow: 0, alignSelf: 'stretch' });
    const firstRow = screen.getByTestId('photos').children[0] as { children: unknown[] };
    expect(firstRow.children).toHaveLength(3);
  });

  it('works on the Fold 6 bench, both ways round', async () => {
    for (const figures of [BENCH_UPRIGHT, BENCH_SIDEWAYS]) {
      mockWindow.figures = figures;
      await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
      expect(await screen.findByTestId('cook-side')).toBeOnTheScreen();
      expect(styleOf('screen-side-pane').width).toBe(cookSidePaneWidth(figures.width));
      // Each would get 179 upright and 212 sideways: stacked both ways (part 8).
      expect(styleOf('notes-and-photos').flexDirection).toBe('column');
    }
  });

  it('still opens Note options, Add a reading and the photo viewer', async () => {
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('cook-side');
    await fireEvent.press(screen.getByTestId('note-n-1-more'));
    const menu = await screen.findByTestId('note-n-1-menu');
    // Delete note last, in the danger colour (0.4.0, part 4).
    const rows = idsInOrder(menu).filter((id) => id.startsWith('note-n-1-'));
    expect(rows[rows.length - 1]).toBe('note-n-1-delete');
    expect(within(menu).getByLabelText('Delete note')).toBeOnTheScreen();
  });

  it('deletes a note from the inner page at once, with Undo in the main pane, and Undo brings it back', async () => {
    await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
    const side = await screen.findByTestId('cook-side');
    expect(side).toBeOnTheScreen();
    expect(screen.getByLabelText('Notes, 2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('note-n-1-more'));
    await fireEvent.press(await screen.findByTestId('note-n-1-delete'));

    await waitFor(() => expect(screen.queryByTestId('event-n-1')).toBeNull());
    expect(screen.getByLabelText('Notes, 1')).toBeOnTheScreen();
    expect(screen.getByText('Note deleted')).toBeOnTheScreen();
    expect(within(screen.getByTestId('cook-side')).queryByTestId('undo-bar')).toBeNull();

    await fireEvent.press(screen.getByTestId('undo-delete'));
    expect(await screen.findByTestId('event-n-1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Notes, 2')).toBeOnTheScreen();
    await act(async () => {});
  });
});

describe('the review on the inner screen (12, 15)', () => {
  beforeEach(async () => {
    await household('You', 'Guest');
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-r', title: 'Easy apple-cinnamon muffins', startedAt: now() }, 'user', now());
  });

  it.each([
    ['upright', UPRIGHT, 356],
    ['sideways', SIDEWAYS, 396],
    ['upright on the bench', BENCH_UPRIGHT, 320],
    ['sideways on the bench', BENCH_SIDEWAYS, 370],
  ])('has two panes, %s, with Finish review at the right-hand pane’s foot', async (_label, figures, left) => {
    mockWindow.figures = figures;
    await harness.render(<ReviewScreen cookId="cook-r" onBack={() => {}} onFinished={() => {}} />);
    const side = await screen.findByTestId('review-side');
    const main = screen.getByTestId('screen-main-pane');

    expect(styleOf('screen-main-pane').width).toBe(left);
    expect(styleOf('screen-side-pane').backgroundColor).toBe(surface);
    expect(within(main).getByTestId('screen-back')).toBeOnTheScreen();
    expect(await within(main).findByTestId('meal-type')).toBeOnTheScreen();
    expect(within(main).getByText('Cuisine')).toBeOnTheScreen();
    expect(within(main).queryByTestId('who-ate-it')).toBeNull();

    expect(await within(side).findByTestId('who-ate-it')).toBeOnTheScreen();
    expect(within(side).getByTestId('who-ate-it-someone-else')).toBeOnTheScreen();
    expect(within(side).getByTestId('takeaway-input')).toBeOnTheScreen();
    expect(within(screen.getByTestId('screen-side-footer')).getByTestId('finish-review')).toBeOnTheScreen();
    expect(within(main).queryByTestId('finish-review')).toBeNull();

    // The name, then the stars, N/A and pencil as one row, which sits
    // beside the name when it fits and goes under it, whole, when not.
    const controls = StyleSheet.flatten(within(side).getByTestId('who-ate-it-member-m-you-controls').props.style);
    expect(controls.flexBasis).toBe('auto');
    expect(controls.flexGrow).toBe(0);
  });

  it.each([
    ['the cover screen', COVER],
    ['the inner screen upright', UPRIGHT],
    ['the bench upright', BENCH_UPRIGHT],
    ['the bench sideways', BENCH_SIDEWAYS],
  ])('keeps the stars, N/A and pencil one row that never wraps inside itself, on %s (part 6)', async (_label, figures) => {
    mockWindow.figures = figures;
    await harness.render(<ReviewScreen cookId="cook-r" onBack={() => {}} onFinished={() => {}} />);
    const id = 'who-ate-it-member-m-you';
    const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
    const row = StyleSheet.flatten((await screen.findByTestId(`${id}-controls`)).props.style);

    // The person's line wraps, so the whole row can go under the name ...
    const line = StyleSheet.flatten(screen.getByTestId(`${id}-controls`).parent?.props.style);
    expect(line.flexWrap).toBe('wrap');
    // ... and the row itself never does.
    expect(row.flexDirection).toBe('row');
    expect(row.flexWrap).toBe('nowrap');
    expect(row.flexBasis).toBe('auto');

    // Too narrow even under the name: the stars close up, 38 down to 30 dp,
    // and N/A and the pencil keep their size.
    const star = StyleSheet.flatten(screen.getByTestId(`${id}-star-1`).props.style);
    expect(star.flexBasis).toBe(size.starTarget);
    expect(star.flexShrink).toBe(1);
    expect(star.minWidth).toBe(size.starButton);
    expect(star.width).toBeUndefined();
    expect(flat(`${id}-na`).flexShrink).toBe(0);
    expect(flat(`${id}-pencil`).flexShrink).toBe(0);
    // Drawn 40 round since part 7, with its hit area making the 48.
    expect(flat(`${id}-pencil`).width).toBe(size.iconButton);
    const slop = screen.getByTestId(`${id}-pencil`).props.hitSlop as { left: number; right: number };
    expect(size.iconButton + slop.left + slop.right).toBeGreaterThanOrEqual(size.targetMin);
  });
});

describe('folding, unfolding and turning', () => {
  describe.each(CHANGES)('from %s to %s', (from, to) => {
    it('keeps the cook page, the cook, the scroll view and a half-typed note', async () => {
      await muffinsAgain();
      mockWindow.figures = SHAPES[from];
      await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
      await screen.findByTestId('readings');
      await fireEvent.changeText(screen.getByTestId('note-input'), 'Half a thought about the');
      const input = screen.getByTestId('note-input');
      const scroll = screen.getByTestId('screen-scroll');

      await become(SHAPES[to]);
      expect(screen.getByTestId('cook-screen')).toBeOnTheScreen();
      expect(screen.getByTestId('cook-title')).toHaveTextContent('Easy apple-cinnamon muffins');
      expect(screen.getByTestId('note-input')).toBe(input);
      expect(screen.getByTestId('note-input')).toHaveDisplayValue('Half a thought about the');
      expect(screen.getByTestId('screen-scroll')).toBe(scroll);
      expect(screen.queryByTestId('cook-side') !== null).toBe(to !== 'cover');
    });

    it('keeps a note being edited in place', async () => {
      await muffinsAgain();
      mockWindow.figures = SHAPES[from];
      await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
      await screen.findByTestId('readings');
      await fireEvent.press(screen.getByTestId('note-n-1-more'));
      await fireEvent.press(await screen.findByTestId('note-n-1-edit'));
      await fireEvent.changeText(await screen.findByTestId('note-n-1-edit-input'), 'Grated both apples, kept the juice');
      const field = screen.getByTestId('note-n-1-edit-input');

      await become(SHAPES[to]);
      expect(screen.getByTestId('note-n-1-edit-input')).toBe(field);
      expect(screen.getByTestId('note-n-1-edit-input')).toHaveDisplayValue('Grated both apples, kept the juice');
    });

    it('keeps ingredients half typed', async () => {
      await muffinsAgain();
      mockWindow.figures = SHAPES[from];
      await harness.render(<CookScreen cookId="cook-now" onBack={() => {}} onReview={() => {}} />);
      await screen.findByTestId('readings');
      if (from === 'cover') {
        await fireEvent.press(screen.getByTestId('ingredients-bar'));
      }
      await fireEvent.press(await screen.findByTestId('ingredients-edit'));
      await fireEvent.changeText(screen.getByTestId('ingredients-input'), '2 apples\n250 g flour\nhalf');

      await become(SHAPES[to]);
      expect(await screen.findByTestId('ingredients-input')).toHaveDisplayValue('2 apples\n250 g flour\nhalf');
    });

    it('keeps the review, its words and a person’s half-typed line', async () => {
      await household('You', 'Guest');
      const { data, now } = harness.storage;
      await data.capture.startCook({ id: 'cook-r', title: 'Tagine', startedAt: now() }, 'user', now());
      mockWindow.figures = SHAPES[from];
      await harness.render(<ReviewScreen cookId="cook-r" onBack={() => {}} onFinished={() => {}} />);
      await screen.findByTestId('who-ate-it-member-m-you');
      await fireEvent.changeText(screen.getByTestId('verdict-input'), 'Apricots made it.');
      await fireEvent.changeText(screen.getByTestId('takeaway-input'), 'More harissa.');
      await fireEvent.press(screen.getByTestId('who-ate-it-member-m-you-add-line'));
      await fireEvent.changeText(screen.getByTestId('who-ate-it-member-m-you-line-input'), 'Wanted sec');
      const notes = screen.getByTestId('verdict-input');
      const scroll = screen.getByTestId('screen-scroll');

      await become(SHAPES[to]);
      expect(screen.getByTestId('review-screen')).toBeOnTheScreen();
      expect(screen.getByText('Tagine')).toBeOnTheScreen();
      expect(screen.getByTestId('verdict-input')).toBe(notes);
      expect(screen.getByTestId('verdict-input')).toHaveDisplayValue('Apricots made it.');
      expect(screen.getByTestId('takeaway-input')).toHaveDisplayValue('More harissa.');
      expect(await screen.findByTestId('who-ate-it-member-m-you-line-input')).toHaveDisplayValue('Wanted sec');
      expect(screen.getByTestId('screen-scroll')).toBe(scroll);
      expect(screen.queryByTestId('review-side') !== null).toBe(to !== 'cover');
    });

    it('keeps Home, its search, the list’s scroll view and a typed search', async () => {
      await reviewed('cook-old', 'Lemon tart', 'Sharp.');
      await reviewed('cook-new', 'Easy apple-cinnamon muffins', 'Really tasty.');
      mockWindow.figures = SHAPES[from];
      await harness.render(<HomeScreen onOpenCook={() => {}} />);
      await screen.findByTestId('history-list');
      await fireEvent.changeText(screen.getByTestId('history-search'), 'lem');
      const scroll = screen.getByTestId('screen-scroll');

      await become(SHAPES[to]);
      expect(screen.getByTestId('home-screen')).toBeOnTheScreen();
      expect(screen.getByTestId('history-search')).toHaveDisplayValue('lem');
      expect(screen.getByTestId('screen-scroll')).toBe(scroll);
      expect(screen.queryByTestId('home-cook-pane') !== null).toBe(to !== 'cover');
    });
  });
});
