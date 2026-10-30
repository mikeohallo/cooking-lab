import { useMemo, useRef, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { footerMaxHeight } from '../layout/footerLimit';
import { PaneOverlayHost } from '../layout/panes';
import { ScreenScrollContext, type ScreenScroll } from '../layout/ScreenScroll';
import { bottomClearance, useKeyboardHeight } from '../layout/useKeyboardClearance';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { UndoSlot } from '../state/PendingDeletion';
import { colors, space } from '../theme/tokens';

/**
 * The second pane, on the unfolded inner display (0.3.0). A screen passes
 * one only when `useLayoutMetrics().twoPane` says there is room; on one
 * column it puts the same things in its main column instead. It sits to the
 * right of the main pane.
 */
export type SidePane = {
  children: ReactNode;
  /** Pinned under the side pane's own scrolling area, as `footer` is for the main one. */
  footer?: ReactNode;
  testID?: string;
};

type ScreenContainerProps = {
  children: ReactNode;
  /**
   * Content pinned below the scrolling area — a composer, a save bar. It sits
   * inside the safe area and above the keyboard, and shares the content
   * column's width so it lines up with the cards above it.
   */
  footer?: ReactNode;
  /** Optional identifier so tests can assert on the content column. */
  testID?: string;
  /** A second pane, beside the main one, on two panes only. */
  side?: SidePane;
  /**
   * Which pane has a fixed width on two panes, and how wide (dp); the other
   * takes the rest. Home's list is the fixed one; a cook's side pane is.
   */
  fixed?: { pane: 'main' | 'side'; width: number };
};

/**
 * The single layout primitive every screen sits inside.
 *
 * Responsibilities:
 *  - safe-area insets on all edges (cutouts, hinge, gesture bar);
 *  - vertical scrolling so font scaling can never clip content;
 *  - a centred content column capped at `contentMaxWidth` so text does not
 *    stretch edge to edge on an unfolded Fold or a tablet;
 *  - width-derived gutters instead of hard-coded phone padding;
 *  - an optional footer that stays above the keyboard while it is open, and
 *    above the system navigation area (three-button or gesture) always;
 *  - on the unfolded inner display, an optional second pane beside the main
 *    one, each scrolling on its own, each with its own sheets (0.3.0).
 *
 * The footer is a sibling of the scrolling area, never inside it: the
 * scrolling content ends at the footer's top edge, so nothing can scroll
 * underneath a pinned bar such as Review's *Finish review*.
 *
 * The footer is also capped (fix round 0.2.2): it never takes more than a
 * share of the space between the status bar and the keyboard, and if its
 * contents need more it scrolls inside itself. See `src/layout/footerLimit.ts`.
 *
 * The bottom edge is handled here rather than by SafeAreaView, because with
 * the keyboard open it must clear the navigation bar *and* the keyboard; see
 * `src/layout/useKeyboardClearance.ts`.
 *
 * The main pane is drawn the same way on one column and on two — the same
 * views, in the same order, with the side pane after it — so folding or
 * unfolding changes only sizes. Nothing in the main pane is remounted: the
 * cook stays open, the composer keeps its half-typed note, and the scroll
 * view keeps its offset.
 *
 * It never scrolls horizontally, which is what keeps the primary workflow free
 * of horizontal overflow at ~320 dp.
 */
export function ScreenContainer({ children, footer, testID, side, fixed }: ScreenContainerProps) {
  const { gutter, contentMaxWidth, twoPane } = useLayoutMetrics();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const clearance = bottomClearance(Platform.OS, insets.bottom, keyboardHeight);
  const footerLimit = footerMaxHeight(windowHeight, insets.top, clearance);
  const showSide = twoPane && side !== undefined;
  const sizeOf = (pane: 'main' | 'side') =>
    showSide && fixed !== undefined && fixed.pane === pane ? { width: fixed.width } : styles.flex;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View
        style={[styles.flex, styles.row, { paddingBottom: clearance }]}
        testID="screen-body"
      >
        <View style={sizeOf('main')} testID="screen-main-pane">
          <PaneOverlayHost enabled={showSide}>
            <Pane
              footer={footer}
              footerLimit={footerLimit}
              gutter={gutter}
              maxWidth={contentMaxWidth}
              columnTestID={testID}
              scrollTestID="screen-scroll"
              footerTestID="screen-footer"
            >
              {children}
            </Pane>
            {showSide ? <UndoSlot /> : null}
          </PaneOverlayHost>
        </View>
        {showSide ? (
          <View
            style={[sizeOf('side'), styles.side]}
            testID="screen-side-pane"
          >
            <PaneOverlayHost enabled>
              <Pane
                footer={side.footer}
                footerLimit={footerLimit}
                gutter={gutter}
                maxWidth={contentMaxWidth}
                columnTestID={side.testID}
                scrollTestID="screen-side-scroll"
                footerTestID="screen-side-footer"
              >
                {side.children}
              </Pane>
            </PaneOverlayHost>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

type PaneProps = {
  children: ReactNode;
  footer?: ReactNode;
  footerLimit: number;
  gutter: number;
  maxWidth: number;
  columnTestID?: string;
  scrollTestID: string;
  footerTestID: string;
};

/** One pane: its own scrolling area, its own pinned footer, its own reveal. */
function Pane({
  children,
  footer,
  footerLimit,
  gutter,
  maxWidth,
  columnTestID,
  scrollTestID,
  footerTestID,
}: PaneProps) {
  const scrollRef = useRef<ScrollView>(null);
  const columnRef = useRef<View>(null);

  // Lets a control ask for itself to be scrolled into sight while the
  // keyboard is up; see `src/layout/ScreenScroll.tsx`.
  const screenScroll = useMemo<ScreenScroll>(
    () => ({
      reveal(target) {
        const column = columnRef.current;
        if (target === null || column === null) {
          return;
        }
        try {
          target.measureLayout(
            column,
            (_x, y) => {
              scrollRef.current?.scrollTo({ y: Math.max(0, y + space.ml - space.md), animated: true });
            },
            () => {},
          );
        } catch {
          // Scrolling into view is a courtesy. A view that cannot be measured
          // is still on the page and can still be scrolled to by hand.
        }
      },
    }),
    [],
  );

  return (
    <>
      <ScrollView
        ref={scrollRef}
        testID={scrollTestID}
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        alwaysBounceHorizontal={false}
        showsHorizontalScrollIndicator={false}
      >
        <View ref={columnRef} style={[styles.column, { maxWidth }]} testID={columnTestID}>
          <ScreenScrollContext.Provider value={screenScroll}>{children}</ScreenScrollContext.Provider>
        </View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { maxHeight: footerLimit }]} testID={footerTestID}>
          <ScrollView
            testID={`${footerTestID}-scroll`}
            style={styles.footerScroll}
            contentContainerStyle={[styles.footerContent, { paddingHorizontal: gutter }]}
            keyboardShouldPersistTaps="handled"
            alwaysBounceHorizontal={false}
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={[styles.footerColumn, { maxWidth }]}>{footer}</View>
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  // The side pane is always to the right of the main one, after it in the
  // tree, so adding it never moves the main pane.
  side: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: space.ml,
  },
  column: {
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  // Takes only the height its contents need, up to the footer's cap.
  footerScroll: {
    flexGrow: 0,
  },
  footerContent: {
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  footerColumn: {
    width: '100%',
    alignSelf: 'center',
  },
});
