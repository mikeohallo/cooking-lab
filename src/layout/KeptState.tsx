/**
 * Half-typed words that survive folding, unfolding and turning (0.4.0), and a
 * live font-size or display-size change (0.4.1).
 *
 * WHY THIS EXISTS
 * ---------------
 * On the inner display some parts of a screen sit in a different pane from
 * the cover display: the review's Who ate it? moves to the right-hand pane,
 * a cook's ingredients to its side column. Moving a part to another pane
 * draws it afresh, and React's own state for it starts again — a line being
 * typed for a person, or a list of ingredients half pasted, would be lost.
 *
 * So a screen keeps one store for as long as it is open, above both panes,
 * and a part that holds words being typed keeps them there under a key of its
 * own. Drawn afresh in the other pane, it picks them up where they were.
 * Outside a store (a part rendered on its own in a test) it is plain state.
 *
 * 0.4.1: a screen's store has a name (`cook:<id>`, `review:<id>`, `home`) and
 * lives in the app's memory (`src/layout/KeptPlace.ts`), not in the screen.
 * Changing the font size or display size makes Android take the whole app's
 * screens down and draw them again; the JavaScript keeps running, so a screen
 * drawn again under the same name finds its store, words, scroll position and
 * all. A store is let go when its screen is left in the usual way.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { dropStore, keptStore, keepStore, type Store } from './KeptPlace';

const KeptStateContext = createContext<Store | null>(null);

/**
 * A store for one screen. Named, it is kept in the app's memory under that
 * name for as long as the screen is open, and through the screens being taken
 * down and drawn again (a font-size change); unnamed, for as long as this
 * screen is mounted.
 */
export function useKeptStore(name?: string): Store {
  const [store] = useState<Store>(() => (name === undefined ? new Map() : keptStore(name)));
  useEffect(() => {
    if (name === undefined) {
      return undefined;
    }
    keepStore(name, store);
    return () => dropStore(name, store);
  }, [name, store]);
  return store;
}

export function KeptStateProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <KeptStateContext.Provider value={store}>{children}</KeptStateContext.Provider>;
}

/** The store of the screen this is drawn in, or null outside one. */
export function useKeptStoreHere(): Store | null {
  return useContext(KeptStateContext);
}

/**
 * `useState`, kept in `store` under `key` when there is a store, so a part
 * drawn afresh starts from where it was.
 */
export function useStoreState<T>(
  store: Store | null,
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (store !== null && store.has(key)) {
      return store.get(key) as T;
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
        store?.set(key, resolved);
        return resolved;
      });
    },
    [store, key],
  );

  return [value, set];
}

/**
 * `useState`, kept in the screen's store under `key` when there is one, so a
 * part drawn afresh in another pane starts from where it was. Pass a key that
 * names the thing being typed (`who-line-member-1`), unique on the screen.
 */
export function useKeptState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  return useStoreState(useContext(KeptStateContext), key, initial);
}
