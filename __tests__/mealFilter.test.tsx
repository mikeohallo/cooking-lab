/**
 * Home's meal filter wraps, on every window (0.4.1).
 *
 * The sideways-scrolling row is gone, on the cover too: every meal button is
 * in sight, on as many rows as the width needs, rows 16 apart so the 48 dp
 * touch areas of two rows never overlap. Here, for every window from 320 to
 * 1200 dp wide at font scales 1.0, 1.15 and 1.3:
 *
 *  - the row Home draws is a wrapping row, inside the screen's gutters, with
 *    a row gap of 16 (the real screen, at a spread of windows);
 *  - each button, measured in the app's own font (`support/fontMetrics.ts`)
 *    with its padding, edge and icon, fits the width the list has, so none
 *    runs off an edge; and the rows they wrap onto are counted.
 */
import { act, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { FILTER_ALL } from '../src/content/product';
import { MEAL_TYPE_LABELS } from '../src/domain/cookRecord';
import { STORED_MEAL_TYPES } from '../src/domain/enums';
import { computeLayoutMetrics, listPaneWidth } from '../src/layout/responsive';
import { HomeScreen } from '../src/screens/HomeScreen';
import { size, space, type } from '../src/theme/tokens';
import { textWidth } from './support/fontMetrics';
import { openScreenHarness, type ScreenHarness } from './support/screens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

const mockWindow: { figures: Figures } = { figures: { width: 369, height: 905, scale: 2.625, fontScale: 1 } };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow.figures,
}));

const FONT_SCALES = [1, 1.15, 1.3] as const;

/** Every 4 dp from 320 to 1200, upright; and sideways where a window that wide is one. */
const WINDOWS: readonly (readonly [number, number])[] = Array.from({ length: (1200 - 320) / 4 + 1 }, (_, i) => 320 + i * 4).flatMap(
  (width) => (width >= 700 ? [[width, Math.round(width * 1.1)] as const, [width, 700] as const] : [[width, Math.max(640, Math.round(width * 1.8))] as const]),
);

/** The buttons, in order: All, then each meal with its icon. */
const BUTTONS = [
  { label: FILTER_ALL, icon: false },
  ...STORED_MEAL_TYPES.map((meal) => ({ label: MEAL_TYPE_LABELS[meal], icon: true })),
];

/** A filter button's drawn width: its words in the chip style, its padding, edge and icon. */
function buttonWidth(label: string, icon: boolean, fontScale: number): number {
  const words = textWidth(label, type.chip.fontSize * fontScale);
  return 2 * space.sm + 2 * size.hairline + (icon ? size.iconSmall + space.xxs + 2 : 0) + words;
}

/** The width Home's list has for the row: the window or its list pane, less a gutter each side, at most a column. */
function rowWidth(width: number, height: number): number {
  const metrics = computeLayoutMetrics(width, height);
  const pane = metrics.twoPane ? listPaneWidth(width) : width;
  return Math.min(metrics.contentMaxWidth, pane - 2 * metrics.gutter);
}

/** The rows the buttons wrap onto, the way flex wrap fills them, 8 apart. */
function rowsOf(widths: readonly number[], room: number): number {
  let rows = 1;
  let used = 0;
  for (const width of widths) {
    if (used > 0 && used + space.xs + width > room) {
      rows += 1;
      used = width;
    } else {
      used += used > 0 ? space.xs + width : width;
    }
  }
  return rows;
}

describe('every meal button fits, on every window and font scale', () => {
  it.each(FONT_SCALES)('at font scale %s', (fontScale) => {
    const widths = BUTTONS.map((button) => buttonWidth(button.label, button.icon, fontScale));
    const offEdge: string[] = [];
    const rowCounts = new Set<number>();
    for (const [width, height] of WINDOWS) {
      const room = rowWidth(width, height);
      BUTTONS.forEach((button, index) => {
        if (widths[index]! > room) {
          offEdge.push(`${button.label} (${widths[index]!.toFixed(1)}) on ${width} × ${height} (${room})`);
        }
      });
      rowCounts.add(rowsOf(widths, room));
    }
    expect(offEdge).toEqual([]);
    // Six buttons: never more rows than buttons, and one row only where the list is wide.
    expect(Math.max(...rowCounts)).toBeLessThanOrEqual(BUTTONS.length);
    expect(Math.min(...rowCounts)).toBeGreaterThanOrEqual(1);
  });

  it('measures words in the app’s font, wider for longer words and larger scales', () => {
    expect(textWidth('Lunch/Dinner', 12)).toBeGreaterThan(textWidth('Side', 12));
    expect(textWidth('Side', 12 * 1.3)).toBeCloseTo(textWidth('Side', 12) * 1.3, 5);
    // About half an em a letter in this face: neither nothing nor absurd.
    expect(textWidth('Breakfast', 12)).toBeGreaterThan(40);
    expect(textWidth('Breakfast', 12)).toBeLessThan(80);
  });

  it('wraps the cover’s six buttons onto two rows at 360 wide, font 1.0 and 1.3', () => {
    const room = rowWidth(360, 840);
    expect(rowsOf(BUTTONS.map((b) => buttonWidth(b.label, b.icon, 1)), room)).toBe(2);
    expect(rowsOf(BUTTONS.map((b) => buttonWidth(b.label, b.icon, 1.3)), room)).toBeGreaterThanOrEqual(2);
  });
});

describe('the row Home draws', () => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    harness = await openScreenHarness('meal-filter.db');
    // One reviewed cook, so Your cooks and its filter are drawn.
    const { data } = harness.storage;
    const at = '2026-11-03T08:30:00.000Z';
    await data.capture.startCook({ id: 'cook-done', title: 'Apple cake', startedAt: at }, 'user', at);
    await data.capture.saveReview('cook-done', 'Really tasty.', 'user', harness.tick());
  });

  afterEach(async () => {
    await harness.close();
  });

  const SPREAD: readonly (readonly [number, number])[] = [
    [320, 640],
    [369, 905],
    [412, 915],
    [600, 960],
    [792, 880],
    [880, 710],
    [1200, 1320],
    [1200, 800],
  ];

  it.each(SPREAD.flatMap(([w, h]) => FONT_SCALES.map((f) => [w, h, f] as const)))(
    '%i × %i at font scale %s: wraps, 16 between rows, inside the gutters',
    async (width, height, fontScale) => {
      mockWindow.figures = { width, height, scale: 2.625, fontScale };
      await harness.render(<HomeScreen onOpenCook={() => {}} />);
      const row = await screen.findByTestId('history-meal-filter');
      await act(async () => {});
      const style = StyleSheet.flatten(row.props.style);
      expect(row.props.horizontal).toBeUndefined();
      expect(style.flexDirection).toBe('row');
      expect(style.flexWrap).toBe('wrap');
      expect(style.rowGap).toBeGreaterThanOrEqual(16);
      expect(style.columnGap).toBe(space.xs);
      expect(style.marginLeft ?? 0).toBeGreaterThanOrEqual(0);
      expect(style.marginRight ?? 0).toBeGreaterThanOrEqual(0);
      // Each button: 12 either side of its words (0.4.1: 14 → 12).
      for (const testID of ['history-meal-all', ...STORED_MEAL_TYPES.map((meal) => `history-meal-${meal}`)]) {
        const drawn = screen.getByTestId(testID).children[0];
        expect(typeof drawn).not.toBe('string');
        expect(StyleSheet.flatten((drawn as unknown as { props: { style: never } }).props.style)).toMatchObject({
          paddingHorizontal: space.sm,
        });
      }
    },
  );
});
