/**
 * Asking the screen's scrolling area to bring a view into sight.
 *
 * WHY THIS EXISTS (0.2.2)
 * -----------------------
 * On the cover display the *Add a tag…* suggestions sat behind the keyboard:
 * the field is near the top of the cook's page, but the page did not scroll
 * when it was focused, and the suggestions under it were exactly where the
 * keyboard came up. Android's own "scroll the focused field into view" does
 * not happen reliably once the app is drawn edge to edge, which is the same
 * reason `useKeyboardClearance` exists.
 *
 * So a control that needs to stay visible while typing asks for it. The screen
 * container provides `reveal`, which scrolls the page until the view's top edge
 * sits a little below the top of the scrolling area; a view placed there is as
 * far from the keyboard as the screen allows.
 */

import { createContext, useContext } from 'react';
import type { View } from 'react-native';

export type ScreenScroll = {
  /** Scroll the page so this view's top edge is near the top of the screen. */
  reveal(target: View | null): void;
};

const NO_SCROLL: ScreenScroll = { reveal: () => {} };

export const ScreenScrollContext = createContext<ScreenScroll>(NO_SCROLL);

/** The nearest screen's scroll, or a no-op outside one. */
export function useScreenScroll(): ScreenScroll {
  return useContext(ScreenScrollContext);
}
