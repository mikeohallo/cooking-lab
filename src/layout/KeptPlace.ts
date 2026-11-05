/**
 * Your place, kept through a live font-size or display-size change (0.4.1).
 *
 * WHY THIS EXISTS
 * ---------------
 * Changing the font size or display size in Android's settings with the app
 * open makes Android recreate the app's activity. React Native then takes
 * down every screen and draws the app again from its first route (its own
 * `ReactDelegate.onHostDestroy` stops the surface; `loadApp` starts a new
 * one). Without this, the person lands on Home with their half-typed note
 * gone.
 *
 * The JavaScript itself keeps running through that: the React host lives in
 * the application, not the activity, so this module's memory survives. So the
 * place is held here, in memory, and nothing is written to storage:
 *   - the navigation state, as the router last reported it;
 *   - each open screen's store of half-typed words and scroll positions
 *     (`useKeptStore` in `src/layout/KeptState.tsx`), by the screen's name.
 *
 * When the app's screens are taken down (`holdPlace`, from the root), the
 * stores are held rather than let go as their screens unmount. When the app
 * is drawn again within `PLACE_HOLD_MS`, the root puts the navigation back
 * (`takeHeldPlace`) and each screen, drawn again under the same name, finds
 * its store. Any later than that (the app left and opened again), the place
 * is let go and the app starts from Home as usual.
 *
 * Adding `fontScale` or `density` to the activity's `configChanges` instead
 * would keep the activity, but React Native's text measurement cache does not
 * know the font scale and leaves labels clipped (0.4.0, part 6), so the
 * activity is recreated and the place is kept here.
 */

export type Store = Map<string, unknown>;

/** How soon after the screens are taken down they must be drawn again to come back to the same place. */
export const PLACE_HOLD_MS = 10_000;

type Place = {
  /** The router's state, as it last reported it. */
  navigation: object | null;
  /** Each open screen's store, by the screen's name. */
  readonly stores: Map<string, Store>;
  /** When the screens were taken down, while the place is held. */
  heldAt: number | null;
};

const place: Place = { navigation: null, stores: new Map(), heldAt: null };

let clock: () => number = () => Date.now();

/**
 * The router's state as a partial state: the routes, their names, params and
 * the screens inside them, without the keys of the screens that drew them. A
 * state put back with the old keys would name navigators that no longer
 * exist, and the router would ignore it; without them it fits the new ones.
 */
export function partialState(state: unknown): unknown {
  if (Array.isArray(state)) {
    return state.map(partialState);
  }
  if (state === null || typeof state !== 'object') {
    return state;
  }
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(state)) {
    if (name === 'key' || name === 'stale' || name === 'routeNames' || name === 'preloadedRoutes') {
      continue;
    }
    out[name] = name === 'params' ? value : partialState(value);
  }
  return out;
}

/** The router's state, each time it changes. */
export function keepNavigation(state: object | undefined): void {
  place.navigation = state === undefined ? null : (partialState(state) as object);
}

/** The app's screens are being taken down: hold the place. Called from the root as it unmounts. */
export function holdPlace(): void {
  place.heldAt = clock();
}

/** Whether the place is being held: screens unmounting now keep their stores. */
export function isPlaceHeld(): boolean {
  return place.heldAt !== null;
}

/**
 * Called by the root as it mounts. The navigation to put back, when the app is
 * being drawn again soon after its screens were taken down; otherwise null,
 * and anything held is let go. The place stays held until `releasePlace`.
 */
export function takeHeldPlace(): object | null {
  if (place.heldAt === null) {
    return null;
  }
  if (clock() - place.heldAt > PLACE_HOLD_MS) {
    place.heldAt = null;
    place.stores.clear();
    place.navigation = null;
    return null;
  }
  return place.navigation;
}

/** The place is back (or could not be put back): screens let go of their stores as usual again. */
export function releasePlace(): void {
  place.heldAt = null;
}

/** The store named `name`: the one held for it, or a new one. */
export function keptStore(name: string): Store {
  let store = place.stores.get(name);
  if (store === undefined) {
    store = new Map();
    place.stores.set(name, store);
  }
  return store;
}

/** A screen's store is in use under its name. */
export function keepStore(name: string, store: Store): void {
  place.stores.set(name, store);
}

/** A screen left in the usual way lets its store go; one taken down with the app keeps it. */
export function dropStore(name: string, store: Store): void {
  if (place.heldAt === null && place.stores.get(name) === store) {
    place.stores.delete(name);
  }
}

/** Tests only: start from nothing, with a clock of the test's own. */
export function resetKeptPlaceForTests(now: () => number = () => Date.now()): void {
  place.navigation = null;
  place.stores.clear();
  place.heldAt = null;
  clock = now;
}
