import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
 *  - an optional footer that stays reachable with the keyboard open.
 *
 * It never scrolls horizontally, which is what keeps the primary workflow free
 * of horizontal overflow at ~320 dp.
 */
export function ScreenContainer({ children, footer, testID }: ScreenContainerProps) {
  const { gutter, contentMaxWidth } = useLayoutMetrics();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: gutter }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          alwaysBounceHorizontal={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={[styles.column, { maxWidth: contentMaxWidth }]} testID={testID}>
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View style={[styles.footer, { paddingHorizontal: gutter }]}>
            <View style={[styles.footerColumn, { maxWidth: contentMaxWidth }]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
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
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  footerColumn: {
    width: '100%',
    alignSelf: 'center',
  },
});
