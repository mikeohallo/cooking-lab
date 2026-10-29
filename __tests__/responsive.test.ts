import {
  CONTENT_MAX_WIDTH,
  MIN_SUPPORTED_WIDTH,
  NARROW_BREAKPOINT,
  computeLayoutMetrics,
} from '../src/layout/responsive';

describe('computeLayoutMetrics', () => {
  it('treats the 320 dp floor as a narrow, stacked layout', () => {
    const metrics = computeLayoutMetrics(MIN_SUPPORTED_WIDTH);

    expect(metrics.isNarrow).toBe(true);
    expect(metrics.isWide).toBe(false);
    expect(metrics.allowsInlineLoop).toBe(false);
  });

  // Measured on the Fold (Android 16):
  //   cover display 968 x 2376 @ 420 dpi -> 368.8 dp wide
  //   inner display 1856 x 2160 @ 420 dpi -> 707.0 dp wide
  const FOLD_COVER_DP = 369;
  const FOLD_INNER_DP = 707;

  it('treats the Fold cover screen as narrow', () => {
    expect(computeLayoutMetrics(FOLD_COVER_DP).isNarrow).toBe(true);
    expect(computeLayoutMetrics(FOLD_COVER_DP).allowsInlineLoop).toBe(false);
  });

  it('treats the Fold inner screen as roomy but still capped', () => {
    const metrics = computeLayoutMetrics(FOLD_INNER_DP);

    expect(metrics.isNarrow).toBe(false);
    expect(metrics.allowsInlineLoop).toBe(true);
    expect(metrics.contentMaxWidth).toBe(CONTENT_MAX_WIDTH);
    // Content is centred rather than stretched across the unfolded display.
    expect(metrics.contentMaxWidth).toBeLessThan(FOLD_INNER_DP);
  });

  it('never lets the content column exceed the maximum width', () => {
    for (const width of [320, FOLD_COVER_DP, 390, FOLD_INNER_DP, 900, 1600]) {
      expect(computeLayoutMetrics(width).contentMaxWidth).toBeLessThanOrEqual(
        CONTENT_MAX_WIDTH,
      );
    }
  });

  it('leaves usable content width at the narrow floor', () => {
    const metrics = computeLayoutMetrics(MIN_SUPPORTED_WIDTH);
    const usable = MIN_SUPPORTED_WIDTH - metrics.gutter * 2;

    expect(usable).toBeGreaterThanOrEqual(280);
  });

  it('widens gutters once past the narrow breakpoint', () => {
    expect(computeLayoutMetrics(NARROW_BREAKPOINT - 1).gutter).toBeLessThan(
      computeLayoutMetrics(NARROW_BREAKPOINT).gutter,
    );
  });

  it('falls back to the supported floor for degenerate widths', () => {
    expect(computeLayoutMetrics(0).width).toBe(MIN_SUPPORTED_WIDTH);
    expect(computeLayoutMetrics(Number.NaN).width).toBe(MIN_SUPPORTED_WIDTH);
  });
});
