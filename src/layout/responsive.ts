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
export const CONTENT_MAX_WIDTH = 560;

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

/** Home's list pane on the inner display (0.4.0): `pane-list`, both ways round. */
export const HOME_LIST_PANE_WIDTH = size.paneList;

/** An open cook's side column on the inner display: Next time, Last time, Ingredients. */
export const COOK_SIDE_PANE_WIDTH = size.paneSide;

/**
 * The narrowest the review's right pane may be: the rail and its gap, five
 * star buttons, N/A and the pencil, with their gaps, and the pane's gutters.
 */
export const REVIEW_RIGHT_PANE_MIN =
  size.dot +
  space.xxs +
  space.sm +
  5 * (size.starButton + space.xxs * 2) +
  2 * size.targetMin +
  2 * space.xxs +
  2 * space.ml;

/**
 * The review's left pane on the inner display (0.4.0): `pane-list`, unless the
 * window is too narrow to leave the right pane room for a person's stars, N/A
 * and pencil on one line, in which case it gives way. On the Fold 8 it is
 * always 400; on the Fold 6 bench upright (707 wide) it is 345.
 */
export function reviewPaneWidth(windowWidth: number): number {
  return Math.max(0, Math.min(size.paneList, Math.round(windowWidth - REVIEW_RIGHT_PANE_MIN)));
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
