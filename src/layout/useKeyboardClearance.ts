/**
 * How far the bottom of a screen must sit above the bottom of the display.
 *
 * WHY THIS EXISTS
 * ---------------
 * From Android 15 apps are drawn edge to edge, and the window is no longer
 * shrunk when the keyboard opens — `adjustResize` stops doing what its name
 * says. React Native's KeyboardAvoidingView did not compensate on the Fold: the
 * composer slid under the keyboard and Send could not be reached while typing
 * (`build-control/slices/reports/2026-10-16-loop-walkthrough.md`).
 *
 * So the clearance is computed here, from two facts:
 *
 *   - the safe-area bottom inset (the navigation bar), which does not change
 *     when the keyboard opens; and
 *   - the keyboard height React Native reports. On Android that figure is the
 *     IME inset *minus* the system-bar inset (ReactRootView: `imeInsets.bottom
 *     - barInsets.bottom`), so it sits on top of the navigation bar and the two
 *     add. On iOS the reported height already covers the home-indicator area,
 *     so the larger of the two wins.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

export function bottomClearance(
  platform: string,
  safeAreaBottom: number,
  keyboardHeight: number,
): number {
  const keyboard = Number.isFinite(keyboardHeight) && keyboardHeight > 0 ? keyboardHeight : 0;
  const inset = Number.isFinite(safeAreaBottom) && safeAreaBottom > 0 ? safeAreaBottom : 0;
  if (keyboard === 0) {
    return inset;
  }
  return platform === 'android' ? inset + keyboard : Math.max(inset, keyboard);
}

/** The keyboard's reported height while it is open, or 0. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}
