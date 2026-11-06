/**
 * A scroll view's offset, kept through a live font-size or display-size
 * change (0.4.1 for a screen's own scrolling area; 0.5.0 for every scroll
 * view: a pane's footer, a sheet's body, a list of versions).
 *
 * The offset is noted in the screen's store (`src/layout/KeptState.tsx`)
 * under `scroll:<key>` as it scrolls. Drawn again after the activity is
 * recreated, the view starts there, and scrolls back to it once its content
 * is tall enough, unless the person has started scrolling first. Outside a
 * screen's store it is an ordinary scroll view.
 *
 * The caller owns the scroll view's ref and spreads what this returns onto
 * the scroll view.
 */
import { useRef, useState, type RefObject } from 'react';
import type { LayoutChangeEvent, ScrollView, ScrollViewProps } from 'react-native';

import { useKeptStoreHere } from './KeptState';

/** How often a scroll position is noted, at most. */
export const SCROLL_THROTTLE_MS = 100;

/** What a scroll view's `onScroll` is handed. */
type ScrollEvent = Parameters<NonNullable<ScrollViewProps['onScroll']>>[0];

export type KeptScrollProps = {
  readonly contentOffset: { x: number; y: number } | undefined;
  readonly scrollEventThrottle: number;
  readonly onScroll: (event: ScrollEvent) => void;
  readonly onScrollBeginDrag: () => void;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onContentSizeChange: (width: number, height: number) => void;
};

export function useKeptScroll(key: string, scrollRef: RefObject<ScrollView | null>): KeptScrollProps {
  const store = useKeptStoreHere();
  const storeKey = `scroll:${key}`;
  const [startAt] = useState(() => {
    const y = store?.get(storeKey);
    return typeof y === 'number' && y > 0 ? y : null;
  });
  const restoreTo = useRef<number | null>(startAt);
  const viewport = useRef(0);
  return {
    contentOffset: startAt === null ? undefined : { x: 0, y: startAt },
    scrollEventThrottle: SCROLL_THROTTLE_MS,
    onScroll: (event) => {
      store?.set(storeKey, event.nativeEvent.contentOffset.y);
    },
    onScrollBeginDrag: () => {
      restoreTo.current = null;
    },
    onLayout: (event) => {
      viewport.current = event.nativeEvent.layout.height;
    },
    onContentSizeChange: (_width, height) => {
      const y = restoreTo.current;
      if (y !== null && height - viewport.current >= y) {
        restoreTo.current = null;
        scrollRef.current?.scrollTo({ y, animated: false });
      }
    },
  };
}
