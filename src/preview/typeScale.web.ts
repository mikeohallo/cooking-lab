/**
 * The preview's stand-in for Android's font scale (0.4.0, part 7). Web only.
 *
 * On a phone, Android scales every piece of text by the font size the person
 * has chosen; a browser does no such thing. So in the preview, and only there,
 * `?fontScale=` multiplies the size and line height of every row of the type
 * scale, once, as `src/theme/tokens.ts` is first loaded and before any style
 * is built from it. Spacing and drawn sizes stay as they are, as on a phone.
 */

import { currentPreviewOptions } from './options.web';

type MutableTypeRow = { fontSize?: number; lineHeight?: number; letterSpacing?: number };

/** Multiply every row's size and line height by `scale`, in place. */
export function scaleTypeInPlace(rows: object, scale: number): void {
  if (scale === 1) {
    return;
  }
  for (const row of Object.values(rows as Record<string, MutableTypeRow>)) {
    if (typeof row.fontSize === 'number') {
      row.fontSize = Math.round(row.fontSize * scale * 10) / 10;
    }
    if (typeof row.lineHeight === 'number') {
      row.lineHeight = Math.round(row.lineHeight * scale * 10) / 10;
    }
  }
}

/** Scale the type rows by the page's `?fontScale=`. */
export function applyPreviewFontScale(rows: object): void {
  scaleTypeInPlace(rows, currentPreviewOptions().fontScale);
}
