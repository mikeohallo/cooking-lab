/**
 * How tall a photograph is drawn in the timeline.
 *
 * A photograph is shown whole, at its own shape: never cropped. It takes the
 * full width of the timeline, and its height follows from its own proportions,
 * up to a cap of `PHOTO_HEIGHT_SHARE` of the window. A picture taller than that
 * (a portrait shot on a wide display, say) is drawn at the cap and letterboxed
 * inside the frame rather than cut down to fit.
 *
 * Pure, so the arithmetic is tested without a device.
 */

/** The most of the window's height one photograph may take. */
export const PHOTO_HEIGHT_SHARE = 0.7;

/** The shape assumed until the picture has loaded and said its own size. */
export const PLACEHOLDER_RATIO = 3 / 4;

export type PixelSize = { readonly width: number; readonly height: number };

export type PhotoFrame = {
  /** The frame's height, in dp. */
  readonly height: number;
  /** True when the picture is taller than the cap and is letterboxed. */
  readonly letterboxed: boolean;
};

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function photoFrame(
  frameWidth: number,
  natural: PixelSize | null,
  windowHeight: number,
): PhotoFrame | null {
  if (!positive(frameWidth)) {
    return null;
  }
  const ratio =
    natural !== null && positive(natural.width) && positive(natural.height)
      ? natural.height / natural.width
      : PLACEHOLDER_RATIO;
  const own = frameWidth * ratio;
  const cap = positive(windowHeight) ? windowHeight * PHOTO_HEIGHT_SHARE : own;
  return own > cap
    ? { height: Math.round(cap), letterboxed: true }
    : { height: Math.round(own), letterboxed: false };
}
