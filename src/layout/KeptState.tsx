/**
 * Half-typed words that survive folding, unfolding and turning (0.4.0).
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
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

type Store = Map<string, unknown>;

const KeptStateContext = createContext<Store | null>(null);

/** A store for one screen, kept for as long as the screen is mounted. */
export function useKeptStore(): Store {
  const [store] = useState<Store>(() => new Map());
  return store;
}

export function KeptStateProvider({ store, children }: { store: Store; children: ReactNode }) {
  return <KeptStateContext.Provider value={store}>{children}</KeptStateContext.Provider>;
}

/**
 * `useState`, kept in the screen's store under `key` when there is one, so a
 * part drawn afresh in another pane starts from where it was. Pass a key that
 * names the thing being typed (`who-line-member-1`), unique on the screen.
 */
export function useKeptState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(KeptStateContext);
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
