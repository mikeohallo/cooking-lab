/**
 * The web preview's URL options (0.4.0, part 7). Web only.
 *
 * The preview draws the app's real screens in a browser, over a synthetic
 * notebook, so the build chat can look at any screen at any size, font scale
 * and theme without a phone. Three options, all in the query string:
 *
 * - `?screen=` opens one screen directly: one of `PREVIEW_SCREENS`. Without
 *   it the whole app runs as usual, from Home.
 * - `?theme=light` or `?theme=dark` picks the theme; without it the
 *   browser's own light or dark setting decides, as the phone's does.
 * - `?fontScale=1.15` multiplies every text style by that much, because a
 *   browser has no font scale of its own. Between 0.5 and 3; anything else
 *   is ignored.
 *
 * Nothing here is ever bundled for Android: every file in `src/preview/` ends
 * `.web.ts` or `.web.tsx`, and the only references to it from shared code sit
 * behind `Platform.OS === 'web'`, which Metro removes from an Android bundle.
 */

import type { ThemeName } from '../theme/tokens';

export const PREVIEW_SCREENS = [
  'home',
  'filters',
  'empty',
  'cook',
  'add-reading',
  'review',
  'reviewed',
  'whos-eating',
  'no-matches',
  'undo',
  'note-options',
] as const;

export type PreviewScreenName = (typeof PREVIEW_SCREENS)[number];

export type PreviewOptions = {
  /** The screen to open, or null for the whole app from Home. */
  readonly screen: PreviewScreenName | null;
  /** The theme asked for, or null to follow the browser. */
  readonly theme: ThemeName | null;
  /** What every text style is multiplied by. 1 when not asked for. */
  readonly fontScale: number;
};

export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 3;

function isScreen(value: string | null): value is PreviewScreenName {
  return value !== null && (PREVIEW_SCREENS as readonly string[]).includes(value);
}

/** Read the options from a query string such as `?screen=cook&theme=dark`. */
export function parsePreviewOptions(search: string): PreviewOptions {
  const params = new URLSearchParams(search);
  const screen = params.get('screen');
  const theme = params.get('theme');
  const scale = Number(params.get('fontScale') ?? '1');
  return {
    screen: isScreen(screen) ? screen : null,
    theme: theme === 'light' || theme === 'dark' ? theme : null,
    fontScale:
      Number.isFinite(scale) && scale >= FONT_SCALE_MIN && scale <= FONT_SCALE_MAX ? scale : 1,
  };
}

/** The options of the page this is running in; none outside a browser. */
export function currentPreviewOptions(): PreviewOptions {
  const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
  return parsePreviewOptions(search);
}

/**
 * The query string to carry to another page of the preview: the theme and font
 * scale stay, the screen does not (the app's own routes take over).
 */
export function carriedQuery(options: PreviewOptions): string {
  const params = new URLSearchParams();
  if (options.theme !== null) {
    params.set('theme', options.theme);
  }
  if (options.fontScale !== 1) {
    params.set('fontScale', String(options.fontScale));
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
