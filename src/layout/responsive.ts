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
 * Two panes side by side (0.3.0) from this width up — and only when the
 * display's shorter side is at least as long, so a phone or the Fold's cover
 * display turned sideways stays one column.
 *
 * Measured on the Fold (Android 16, 420 dpi): the cover display is about
 * 369 x 905 dp and the inner display about 707 x 823 dp. 600 sits well clear
 * of both: the cover display is one column either way up, and the inner
 * display is two panes either way up. A split-screen half of the inner display
 * (about 350 dp) is one column.
 */
export const TWO_PANE_MIN_WIDTH = 600;
export const TWO_PANE_MIN_SHORT_SIDE = 600;

/** Home's list pane on the inner display: search, filters, a page of ten. */
export const HOME_LIST_PANE_WIDTH = 380;

/** An open cook's side pane on the inner display: Last time and the ingredients. */
export const COOK_SIDE_PANE_WIDTH = 340;

/** The review's ratings pane on the inner display, beside the notes. */
export const REVIEW_RATINGS_PANE_WIDTH = 360;

/** Horizontal gutters from Design Baseline v1: 20 dp on a cover screen, 24 dp wider. */
const NARROW_GUTTER = 20;
const WIDE_GUTTER = 24;

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
    gutter: isNarrow ? NARROW_GUTTER : WIDE_GUTTER,
    contentMaxWidth: CONTENT_MAX_WIDTH,
    allowsInlineLoop: safeWidth >= NARROW_BREAKPOINT,
    twoPane,
  };
}
