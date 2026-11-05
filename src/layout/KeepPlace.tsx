import { useNavigationContainerRef } from 'expo-router';
import { useEffect, useLayoutEffect } from 'react';

import { holdPlace, keepNavigation, releasePlace, takeHeldPlace } from './KeptPlace';

/** How many frames to wait for the router to be ready before giving up on putting the place back. */
const READY_TRIES = 120;
const FRAME_MS = 16;
/** How long after putting the place back the screens have to pick up their stores. */
const RELEASE_MS = 1_000;

/**
 * Keeps your place through a live font-size or display-size change (0.4.1);
 * see `src/layout/KeptPlace.ts`. Drawn once, at the root, beside the screens.
 *
 *   - Each time the router's state changes, it is noted in memory.
 *   - As the app's screens are taken down, the place is held: this runs in a
 *     layout effect's clean-up, which React runs before any screen's own
 *     effects are cleaned up, so no screen lets its store go first.
 *   - Drawn again soon after, it puts the router's state back as soon as the
 *     router is ready, and lets the place go once the screens are back.
 */
export function KeepPlace(): null {
  const navigation = useNavigationContainerRef();

  useLayoutEffect(() => () => holdPlace(), []);

  useEffect(() => {
    const held = takeHeldPlace();
    let restoring = held !== null;
    const unsubscribe = navigation.addListener('state', () => {
      keepNavigation(navigation.getRootState());
      if (restoring) {
        // This is the router reporting the place put back: the screens are drawn.
        restoring = false;
        releasePlace();
      }
    });
    if (held === null) {
      releasePlace();
      return unsubscribe;
    }

    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const letGo = () => {
      restoring = false;
      releasePlace();
    };
    const putBack = () => {
      timer = null;
      const action = navigation.isReady() ? stackReset(navigation.getRootState(), held) : 'wait';
      if (action === 'wait') {
        tries += 1;
        if (tries > READY_TRIES) {
          letGo();
          return;
        }
        timer = setTimeout(putBack, FRAME_MS);
        return;
      }
      if (action === null) {
        letGo();
        return;
      }
      navigation.dispatch(action);
      // Should the router not report the change, the place is let go anyway.
      timer = setTimeout(() => {
        timer = null;
        if (restoring) {
          letGo();
        }
      }, RELEASE_MS);
    };
    putBack();
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
    // Once, as the app is drawn: the router's container ref is the same throughout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

type RouteState = {
  readonly key?: string;
  readonly index?: number;
  readonly routes?: readonly { readonly name: string; readonly state?: RouteState }[];
};

/**
 * The app's own stack (Home, a cook, its review), reset to the held one. Only
 * that stack, never the router's root: the root's first route is the layout
 * this is drawn in, and resetting it would draw the layout, and this, afresh.
 * `'wait'` while the stack is not drawn yet; null when there is nothing to put
 * back.
 */
export function stackReset(
  now: object | undefined,
  held: object,
): { type: 'RESET'; payload: object; target: string } | 'wait' | null {
  const rootNow = now as RouteState | undefined;
  const heldRoot = held as RouteState;
  const routeNow = rootNow?.routes?.[rootNow.index ?? 0];
  const heldRoute = heldRoot.routes?.[heldRoot.index ?? 0];
  if (heldRoute?.state === undefined || (heldRoute.state.routes?.length ?? 0) === 0) {
    return null;
  }
  if (routeNow === undefined || routeNow.state?.key === undefined) {
    return 'wait';
  }
  if (routeNow.name !== heldRoute.name) {
    return null;
  }
  return { type: 'RESET', payload: heldRoute.state, target: routeNow.state.key };
}
