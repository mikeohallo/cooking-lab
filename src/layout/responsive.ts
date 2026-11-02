import { breakpoint, size, space } from '../theme/tokens';

/**
 * Responsive primitives for Cooking Lab.
 *
 * The Samsung Fold cover display is a first-class target, so layout decisions
 * are derived from a single pure function rather than ad-hoc width checks
 * scattered through screens. Pure so it can be unit tested directly.
 */

/** Narrowest usable width the shell must remain workable at (dp). */
export const MIN_SUPPORTED_WIDTH = 320;

/** At or below this width we are on a cover-screen-class display. */
export const NARROW_BREAKPOINT = 400;

/** At or above this width we are on an unfolded / tablet-class display. */
export const WIDE_BREAKPOINT = 720;

/** Text and cards never stretch wider than this, however large the screen. */
export const CONTENT_MAX_WIDTH = size.column;

/**
 * Two panes side by side (0.3.0) from `breakpoint.medium` (600) up — and only
 * when the display's shorter side is at least as long, so a phone or the
 * Fold's cover display turned sideways stays one column.
 *
 * Measured on the Fold 6 bench (Android 16, 420 dpi): the cover display is
 * about 369 x 905 dp and the inner display about 707 x 823 dp. The Fold 8's
 * inner display is about 792 x 880 upright and 880 x 792 sideways (about 710
 * tall above the taskbar). 600 sits well clear of all of them: the cover
 * display is one column either way up, and both inner displays are two panes
 * either way up. A split-screen half of the inner display (about 350 dp) is
 * one column.
 */
export const TWO_PANE_MIN_WIDTH = breakpoint.medium;
export const TWO_PANE_MIN_SHORT_SIDE = breakpoint.medium;

/**
 * Pane widths (0.4.0, part 5): panes adapt to the space they are given.
 *
 * The first inner layouts were built at fixed widths taken from one phone (a
 * 400 list pane, a 344 side column). On the Fold 6 bench, at font size 1.15,
 * that crushed the detail side to about 300 and broke words letter by letter.
 * So a pane is now a share of the window's width, held between a minimum and
 * a maximum from `src/theme/tokens.ts`, and the other pane takes the rest.
 *
 * Every width here is worked out from the window as it is now, on every
 * render (`useLayoutMetrics` reads `useWindowDimensions`). Nothing keeps a
 * width in state or from an earlier layout pass, so folding, unfolding and
 * turning can never leave a pane at the width it had before.
 */

/** A share of `width`, rounded to a whole dp, held between `min` and `max`. */
export function shareOf(width: number, share: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width * share)));
}

/** Home's list pane and the review's left pane: 45% of the window, 320 to 400. */
export function listPaneWidth(windowWidth: number): number {
  return shareOf(windowWidth, size.paneListShare, size.paneListMin, size.paneListMax);
}

/** An open cook's side column on the inner screen: 42% of the window, 280 to 380. */
export function cookSidePaneWidth(windowWidth: number): number {
  return shareOf(windowWidth, size.paneSideShare, size.paneSideMin, size.paneSideMax);
}

/** Which screen's panes: Home and the review share the list rule; a cook its side rule. */
export type PaneScreen = 'home' | 'cook' | 'review';

/**
 * The panes for a window, as styles take them. On one column the main pane is
 * the whole width (`'100%'`) and there is no side pane. On two panes one of
 * them is the share and the other takes the rest; `rest` is what that is, for
 * tests and the version line, never set as a style.
 */
export type PaneWidths =
  | { readonly mode: 'one'; readonly main: '100%'; readonly side: null }
  | {
      readonly mode: 'two';
      /** The pane whose width is set: Home's list and the review's left; the cook's side. */
      readonly fixed: 'main' | 'side';
      readonly main: number;
      readonly side: number;
    };

export function paneWidths(screen: PaneScreen, width: number, height?: number): PaneWidths {
  const metrics = computeLayoutMetrics(width, height);
  if (!metrics.twoPane) {
    return { mode: 'one', main: '100%', side: null };
  }
  if (screen === 'cook') {
    const side = cookSidePaneWidth(metrics.width);
    return { mode: 'two', fixed: 'side', main: metrics.width - side, side };
  }
  const main = listPaneWidth(metrics.width);
  return { mode: 'two', fixed: 'main', main, side: metrics.width - main };
}

/** Horizontal gutters from Design Baseline v1: 20 dp on a cover screen, 24 dp wider. */
const NARROW_GUTTER = 20;
const WIDE_GUTTER = 24;
/** Inner panes use `space-ml` (Design Baseline v3). */
const PANE_GUTTER = space.ml;

export type LayoutMetrics = {
  readonly width: number;
  readonly isNarrow: boolean;
  readonly isWide: boolean;
  /** Horizontal padding between the screen edge and content. */
  readonly gutter: number;
  /** Maximum width of the centred content column. */
  readonly contentMaxWidth: number;
  /**
   * Whether the core-loop steps may sit side by side. On a cover screen they
   * stack instead, which is what keeps the shell free of horizontal overflow.
   */
  readonly allowsInlineLoop: boolean;
  /** Whether a screen may show two panes side by side (the unfolded inner display). */
  readonly twoPane: boolean;
  /**
   * Two panes on a window wider than it is tall: the inner display turned
   * sideways (0.4.0). The cook page sets Notes and Photos side by side.
   */
  readonly sideways: boolean;
};

/**
 * Layout for a window of `width` by `height` dp. Leaving the height out treats
 * the window as tall, which is how a width-only caller has always been read.
 */
export function computeLayoutMetrics(width: number, height?: number): LayoutMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : MIN_SUPPORTED_WIDTH;
  const safeHeight = height !== undefined && Number.isFinite(height) && height > 0 ? height : safeWidth;
  const isNarrow = safeWidth < NARROW_BREAKPOINT;
  const isWide = safeWidth >= WIDE_BREAKPOINT;
  const twoPane =
    safeWidth >= TWO_PANE_MIN_WIDTH && Math.min(safeWidth, safeHeight) >= TWO_PANE_MIN_SHORT_SIDE;

  return {
    width: safeWidth,
    isNarrow,
    isWide,
    gutter: twoPane ? PANE_GUTTER : isNarrow ? NARROW_GUTTER : WIDE_GUTTER,
    contentMaxWidth: CONTENT_MAX_WIDTH,
    allowsInlineLoop: safeWidth >= NARROW_BREAKPOINT,
    twoPane,
    sideways: twoPane && safeWidth > safeHeight,
  };
}
