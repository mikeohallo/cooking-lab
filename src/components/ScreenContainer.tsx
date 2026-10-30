import { useMemo, useRef, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { footerMaxHeight } from '../layout/footerLimit';
import { ScreenScrollContext, type ScreenScroll } from '../layout/ScreenScroll';
import { bottomClearance, useKeyboardHeight } from '../layout/useKeyboardClearance';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { colors, space } from '../theme/tokens';

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
 *    above the system navigation area (three-button or gesture) always.
 *
 * The footer is a sibling of the scrolling area, never inside it: the
 * scrolling content ends at the footer's top edge, so nothing can scroll
 * underneath a pinned bar such as Review's *Finish review*.
 *
 * The footer is also capped (fix round 0.2.2): it never takes more than a
 * share of the space between the status bar and the keyboard, and if its
 * contents need more it scrolls inside itself. A footer that grew past the
 * screen — a thirty-line paste in the cook's note box did exactly that —
 * pushed its own buttons out of reach and left the timeline no room at all.
 * See `src/layout/footerLimit.ts`.
 *
 * The bottom edge is handled here rather than by SafeAreaView, because with
 * the keyboard open it must clear the navigation bar *and* the keyboard; see
 * `src/layout/useKeyboardClearance.ts`.
 *
 * It never scrolls horizontally, which is what keeps the primary workflow free
 * of horizontal overflow at ~320 dp.
 */
export function ScreenContainer({ children, footer, testID }: ScreenContainerProps) {
  const { gutter, contentMaxWidth } = useLayoutMetrics();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const clearance = bottomClearance(Platform.OS, insets.bottom, keyboardHeight);
  const footerLimit = footerMaxHeight(windowHeight, insets.top, clearance);
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={[styles.flex, { paddingBottom: clearance }]} testID="screen-body">
        <ScrollView
          ref={scrollRef}
          testID="screen-scroll"
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: gutter }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          alwaysBounceHorizontal={false}
          showsHorizontalScrollIndicator={false}
        >
          <View ref={columnRef} style={[styles.column, { maxWidth: contentMaxWidth }]} testID={testID}>
            <ScreenScrollContext.Provider value={screenScroll}>{children}</ScreenScrollContext.Provider>
          </View>
        </ScrollView>
        {footer ? (
          <View style={[styles.footer, { maxHeight: footerLimit }]} testID="screen-footer">
            <ScrollView
              testID="screen-footer-scroll"
              style={styles.footerScroll}
              contentContainerStyle={[styles.footerContent, { paddingHorizontal: gutter }]}
              keyboardShouldPersistTaps="handled"
              alwaysBounceHorizontal={false}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
            >
              <View style={[styles.footerColumn, { maxWidth: contentMaxWidth }]}>{footer}</View>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
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
