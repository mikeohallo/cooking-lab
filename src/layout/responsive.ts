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
};

export function computeLayoutMetrics(width: number): LayoutMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : MIN_SUPPORTED_WIDTH;
  const isNarrow = safeWidth < NARROW_BREAKPOINT;
  const isWide = safeWidth >= WIDE_BREAKPOINT;

  return {
    width: safeWidth,
    isNarrow,
    isWide,
    gutter: isNarrow ? NARROW_GUTTER : WIDE_GUTTER,
    contentMaxWidth: CONTENT_MAX_WIDTH,
    allowsInlineLoop: safeWidth >= NARROW_BREAKPOINT,
  };
}
