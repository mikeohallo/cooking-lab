import { useMemo, useRef, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { footerMaxHeight } from '../layout/footerLimit';
import { PaneOverlayHost } from '../layout/panes';
import { paneWidths, type PaneScreen, type PaneWidths } from '../layout/responsive';
import { ScreenScrollContext, type ScreenScroll } from '../layout/ScreenScroll';
import { bottomClearance, useKeyboardHeight } from '../layout/useKeyboardClearance';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { UndoSlot } from '../state/PendingDeletion';
import { makeStyles } from '../theme/theme';
import { size, space } from '../theme/tokens';

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
  /**
   * The pane is drawn on `surface` rather than the page (0.4.0): the chosen
   * cook beside Home's list, the cook page's side column, the review's right
   * pane, as the design pack draws them.
   */
  surface?: boolean;
  /**
   * The children fill the pane and scroll themselves (`EmbeddedPane`), with a
   * footer of their own: the chosen cook beside Home's list, whose Cook this
   * again and Edit review are pinned to the pane's foot.
   */
  fill?: boolean;
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
   * Whose pane rule the two panes follow (0.4.0, part 5): Home's and the
   * review's list pane, or the cook page's side column. Each is a share of
   * the window between a minimum and a maximum (`paneWidths`); the other pane
   * takes the rest.
   */
  panes?: PaneScreen;
  /**
   * Docked at the foot of the main pane, centred, on the page colour with a
   * soft fade above it: Home's New Cook (0.4.0, part 5). The scrolling area
   * ends above it, so it never covers the chips, the search box or a card. A
   * screen that docks something draws the Undo bar itself, above it
   * (`UndoSlot inline`).
   */
  dock?: ReactNode;
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
export function ScreenContainer({ children, footer, testID, side, panes: rule = 'home', dock }: ScreenContainerProps) {
  const styles = useStyles();
  const { gutter, contentMaxWidth, twoPane } = useLayoutMetrics();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const window = useWindowDimensions();
  const clearance = bottomClearance(Platform.OS, insets.bottom, keyboardHeight);
  const footerLimit = footerMaxHeight(window.height, insets.top, clearance);
  const showSide = twoPane && side !== undefined;
  // From the window as it is now, every render: never a width from before.
  const panes = paneWidths(rule, window.width, window.height);
  const sizeOf = (pane: 'main' | 'side') => paneStyle(showSide ? panes : ONE_COLUMN, pane);

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
              dock={dock}
            >
              {children}
            </Pane>
            {/* The Undo bar is drawn in the pane in front, on one column too:
                Home stays mounted under a cook's page, and a bar drawn there
                could not be seen (0.4.0, part 5). */}
            {dock === undefined ? <UndoSlot /> : null}
          </PaneOverlayHost>
        </View>
        {showSide ? (
          <View
            style={[sizeOf('side'), styles.side, side.surface && styles.surface]}
            testID="screen-side-pane"
          >
            <PaneOverlayHost enabled>
              {side.fill ? (
                <View style={styles.flex} testID={side.testID}>
                  {side.children}
                </View>
              ) : (
                <Pane
                  footer={side.footer}
                  footerLimit={footerLimit}
                  gutter={gutter}
                  maxWidth={contentMaxWidth}
                  columnTestID={side.testID}
                  scrollTestID="screen-side-scroll"
                  footerTestID="screen-side-footer"
                  surface={side.surface}
                >
                  {side.children}
                </Pane>
              )}
            </PaneOverlayHost>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/**
 * A page drawn inside another screen's pane (0.4.0): its own scrolling area
 * and its own footer pinned to the pane's foot. Home puts the chosen cook in
 * one, beside the list, with Cook this again and Edit review at its foot.
 * The pane it sits in must be a `fill` side pane.
 */
export function EmbeddedPane({
  children,
  footer,
  testID,
  surface = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
  surface?: boolean;
}) {
  const styles = useStyles();
  const { gutter, contentMaxWidth } = useLayoutMetrics();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const clearance = bottomClearance(Platform.OS, insets.bottom, keyboardHeight);
  return (
    <View style={styles.flex} testID={testID}>
      <Pane
        footer={footer}
        footerLimit={footerMaxHeight(windowHeight, insets.top, clearance)}
        gutter={gutter}
        maxWidth={contentMaxWidth}
        scrollTestID="embedded-scroll"
        footerTestID="embedded-footer"
        surface={surface}
      >
        {children}
      </Pane>
    </View>
  );
}

type PaneProps = {
  children: ReactNode;
  /** The footer on `surface`, as its pane is. */
  surface?: boolean;
  footer?: ReactNode;
  footerLimit: number;
  gutter: number;
  maxWidth: number;
  columnTestID?: string;
  scrollTestID: string;
  footerTestID: string;
  dock?: ReactNode;
};

const ONE_COLUMN: PaneWidths = { mode: 'one', main: '100%', side: null };

/**
 * A pane's size, with every key set in every state: the set pane's width, or
 * `auto` for the one that takes the rest. Leaving a key out on one layout and
 * setting it on another relied on the native side dropping the old value; on
 * the bench a fold left Home's list pane 400 wide on a 369 cover (0.4.0,
 * part 5).
 */
export function paneStyle(panes: PaneWidths, pane: 'main' | 'side'): ViewStyle {
  if (panes.mode === 'one') {
    return { width: panes.main, flexGrow: 1, flexShrink: 1, flexBasis: 'auto' };
  }
  if (panes.fixed === pane) {
    return { width: pane === 'main' ? panes.main : panes.side, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' };
  }
  return { width: 'auto', flexGrow: 1, flexShrink: 1, flexBasis: 0 };
}

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
  dock,
  surface = false,
}: PaneProps) {
  const styles = useStyles();
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
      {dock !== undefined ? (
        <View style={[styles.dock, { paddingHorizontal: gutter }]} testID="screen-dock">
          <View style={styles.fade} pointerEvents="none" testID="screen-dock-fade" />
          {dock}
        </View>
      ) : null}
      {footer ? (
        <View style={[styles.footer, surface && styles.surface, { maxHeight: footerLimit }]} testID={footerTestID}>
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

const useStyles = makeStyles(({ colors, fades }) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.page,
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
      borderLeftWidth: size.hairline,
      borderLeftColor: colors.line,
      backgroundColor: colors.page,
    },
    surface: {
      backgroundColor: colors.surface,
    },
    scrollContent: {
      flexGrow: 1,
      paddingVertical: space.ml,
    },
    // Docked under the list, never over it: the list's scrolling area ends
    // at its top edge.
    dock: {
      gap: space.sm,
      paddingTop: space.xs,
      paddingBottom: space.md,
      backgroundColor: colors.page,
    },
    // The soft fade above the dock: the page colour, clear at the top.
    fade: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: -space.lg,
      height: space.lg,
      experimental_backgroundImage: fades.page,
    },
    column: {
      width: '100%',
      alignSelf: 'center',
      flexGrow: 1,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
      backgroundColor: colors.page,
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
  }),
);
