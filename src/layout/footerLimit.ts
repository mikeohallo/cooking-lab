/**
 * How tall a pinned footer may grow, and how tall a growing text box may get.
 *
 * WHY THIS EXISTS (0.2.2)
 * -----------------------
 * Pasting a recipe of about thirty lines into the cook's note box pushed the
 * whole composer — the photo button, the note box, Oven °C, Internal °C, Send
 * and *Somewhere else?* — off the bottom of the Fold's main display, and
 * neither the page nor the box scrolled. The note box grew with every line it
 * was given, the footer grew with it, and a footer that is taller than the
 * screen leaves no room for the timeline and no way to reach its own buttons.
 *
 * Two limits fix it, and both are needed:
 *
 *   * a multiline box grows to a number of lines and then scrolls inside
 *     itself (`maxTextBoxHeight`), so an ordinary long paste never makes the
 *     footer tall in the first place;
 *   * the footer itself never takes more than a share of the space between the
 *     top of the screen and the keyboard (`footerMaxHeight`), and scrolls inside
 *     itself if its controls need more — which, at the largest font scale with
 *     the keyboard open on the cover display, they can. Whatever happens, the
 *     timeline keeps the rest of the screen and every control in the footer can
 *     be scrolled to.
 *
 * Both are pure so the numbers can be pinned by tests; layout itself cannot be
 * measured under Jest.
 */

/** The share of the available height a pinned footer may take. */
export const FOOTER_MAX_SHARE = 0.6;

/**
 * Never squeeze the footer below this, however small the space: two touch
 * targets' worth, so at least one row of controls is always on screen and the
 * rest can be scrolled to.
 */
export const FOOTER_MIN_HEIGHT = 96;

/** How many lines the cook's note box shows before it scrolls inside itself. */
export const NOTE_MAX_LINES = 5;

/**
 * The tallest a pinned footer may be.
 *
 * `windowHeight` is the whole window; `topInset` is the status bar; `bottom` is
 * whatever the body is already padded by at the bottom — the navigation bar,
 * plus the keyboard while it is open (`bottomClearance`). What is left is the
 * screen the timeline and the footer share.
 */
export function footerMaxHeight(windowHeight: number, topInset: number, bottom: number): number {
  const height = Number.isFinite(windowHeight) && windowHeight > 0 ? windowHeight : 0;
  const top = Number.isFinite(topInset) && topInset > 0 ? topInset : 0;
  const below = Number.isFinite(bottom) && bottom > 0 ? bottom : 0;
  const available = Math.max(0, height - top - below);
  return Math.max(FOOTER_MIN_HEIGHT, Math.floor(available * FOOTER_MAX_SHARE));
}

/**
 * The tallest a multiline box may be: `lines` lines of text at the current font
 * scale, plus the box's own padding and border.
 *
 * The font scale is applied here because the text inside the box is scaled by
 * the system and a height in dp is not: without it, at the largest font scale
 * five lines would become three.
 */
export function maxTextBoxHeight(
  lineHeight: number,
  lines: number,
  fontScale: number,
  verticalPadding: number,
): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return Math.ceil(lineHeight * scale * lines + verticalPadding * 2 + 2);
}
