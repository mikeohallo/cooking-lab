/**
 * Notes and Photos on a cook's page (0.4.0, part 8).
 *
 * In part 7's web preview, at 823 and 880 wide sideways, Notes and Photos sat
 * side by side at about 230 dp each, and a note wrapped a word or two to a
 * line. The rule now: side by side only when each would get at least 300 dp
 * of the main column; otherwise stacked, Notes above Photos, as upright.
 *
 * The main column is the cook's main pane (the window less the side column's
 * share) less a 20 dp gutter each side, and never wider than a column of
 * cards grows (560). So side by side each half gets at most 274 dp, and no
 * window reaches 300 today: the rule stacks them on every window.
 */
import {
  cookMainColumnWidth,
  cookSidePaneWidth,
  notesAndPhotosLayout,
  NOTES_PHOTOS_GAP,
} from '../src/layout/responsive';
import { size } from '../src/theme/tokens';

type Row = readonly [
  label: string,
  width: number,
  height: number,
  side: number,
  column: number,
  besideEach: number,
  layout: 'beside' | 'stacked',
];

/** Each width the line names, upright and sideways. */
const ROWS: readonly Row[] = [
  ['707 upright (the bench)', 707, 823, 297, 370, 179, 'stacked'],
  ['707 sideways', 707, 620, 297, 370, 179, 'stacked'],
  ['792 upright (the Fold 8)', 792, 880, 333, 419, 203, 'stacked'],
  ['792 sideways', 792, 700, 333, 419, 203, 'stacked'],
  ['823 upright', 823, 1000, 346, 437, 212, 'stacked'],
  ['823 sideways (the bench)', 823, 707, 346, 437, 212, 'stacked'],
  ['880 upright', 880, 1000, 370, 470, 229, 'stacked'],
  ['880 sideways (the Fold 8)', 880, 792, 370, 470, 229, 'stacked'],
  ['880 sideways above the taskbar', 880, 710, 370, 470, 229, 'stacked'],
  ['1000 upright', 1000, 1200, 380, 560, 274, 'stacked'],
  ['1000 sideways', 1000, 800, 380, 560, 274, 'stacked'],
  ['1200 upright', 1200, 1600, 380, 560, 274, 'stacked'],
  ['1200 sideways', 1200, 1000, 380, 560, 274, 'stacked'],
];

describe('Notes and Photos side by side only with 300 dp each (0.4.0, part 8)', () => {
  it.each(ROWS)('%s: side %i, main column %i, %i each beside → %s', (_l, width, height, side, column, each, layout) => {
    expect(cookSidePaneWidth(width)).toBe(side);
    expect(cookMainColumnWidth(width, height)).toBe(column);
    const chosen = notesAndPhotosLayout(width, height);
    expect(chosen).toEqual({
      layout,
      column,
      besideEach: each,
      notes: layout === 'beside' ? each : column,
      photos: layout === 'beside' ? each : column,
    });
    // Stacked, each takes the whole main column.
    expect(chosen.notes).toBe(column);
    expect(chosen.photos).toBe(column);
  });

  it('works the column out from the live window: the main pane less a gutter each side, up to 560', () => {
    // 823 sideways: 823 - 346 = 477 for the main pane, less 20 each side.
    expect(cookMainColumnWidth(823, 707)).toBe(823 - 346 - 40);
    // 1200 sideways: 820 for the main pane, held to a column of cards.
    expect(cookMainColumnWidth(1200, 1000)).toBe(size.column);
  });

  it('wants 300 each, so a column of 612 with its 12 dp gap', () => {
    expect(size.notesPhotosMin).toBe(300);
    expect(NOTES_PHOTOS_GAP).toBe(12);
    expect(2 * size.notesPhotosMin + NOTES_PHOTOS_GAP).toBeGreaterThan(size.column);
  });

  it('stacks them on every window today, since a column of cards stops at 560 (274 each)', () => {
    for (let width = 600; width <= 2400; width += 1) {
      for (const height of [Math.round(width * 0.75), Math.round(width * 1.3)]) {
        const chosen = notesAndPhotosLayout(width, height);
        expect(chosen.besideEach).toBeLessThan(size.notesPhotosMin);
        expect(chosen.layout).toBe('stacked');
      }
    }
  });

  it('stacks them on one column and on the cover screen', () => {
    expect(notesAndPhotosLayout(369, 905).layout).toBe('stacked');
    expect(notesAndPhotosLayout(905, 369).layout).toBe('stacked');
    expect(notesAndPhotosLayout(369, 905).column).toBe(369 - 2 * 16);
  });
});
