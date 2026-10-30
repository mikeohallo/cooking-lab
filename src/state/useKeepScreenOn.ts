/**
 * Keeping the screen on while an open cook is in front (0.2.2).
 *
 * Hands in dough or on a hot pan, the cook should not have to wake the phone
 * to see the timeline. So while an open cook's page is in front, the screen
 * stays on, and it lets go the moment any of these stops being true:
 *
 *   * the page is the one in front (another page pushed, or this one left);
 *   * the app is in the foreground (it goes to the background, or the phone
 *     is locked, which Android reports the same way);
 *   * the cook is open, and the toggle on its page says "Screen stays on".
 *
 * Reviewed cooks, Home and History never ask for it.
 *
 * It uses `expo-keep-awake`, which sets the window's keep-screen-on flag. That
 * flag needs no permission — it is a property of the app's own window, unlike a
 * wake lock — and it only applies while the window is showing.
 *
 * The toggle's state is remembered per cook for as long as the app is running,
 * and starts on for every cook (`screenStaysOnFor`).
 */

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { CookId } from '../domain/entities';

/** The tag this app's one keep-awake request is held under. */
export const KEEP_AWAKE_TAG = 'cooking-lab-open-cook';

const choices = new Map<CookId, boolean>();

/** Whether the screen should stay on for this cook: on, unless the cook turned it off. */
export function screenStaysOnFor(cookId: CookId): boolean {
  return choices.get(cookId) ?? true;
}

/** The toggle on an open cook's page, remembered while the app runs. */
export function useScreenStaysOn(cookId: CookId): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => screenStaysOnFor(cookId));
  const set = (next: boolean) => {
    choices.set(cookId, next);
    setOn(next);
  };
  return [on, set];
}

/** Holds the screen on while `wanted` is true and the app is in the foreground. */
export function useKeepScreenOn(wanted: boolean): void {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState ?? 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  // Anything but the background (or iOS's in-between `inactive`) counts as in
  // front: at launch React Native can still report `unknown` for a moment.
  const active = wanted && appState !== 'background' && appState !== 'inactive';

  useEffect(() => {
    if (!active) {
      return;
    }
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {
      // A phone that will not keep its screen on still cooks. Nothing to say.
    });
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [active]);
}
