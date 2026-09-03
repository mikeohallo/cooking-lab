import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { colors, space } from '../theme/tokens';

type ScreenContainerProps = {
  children: ReactNode;
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
 *  - width-derived gutters instead of hard-coded phone padding.
 *
 * It never scrolls horizontally, which is what keeps the primary workflow free
 * of horizontal overflow at ~320 dp.
 */
export function ScreenContainer({ children, testID }: ScreenContainerProps) {
  const { gutter, contentMaxWidth } = useLayoutMetrics();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: gutter },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        alwaysBounceHorizontal={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={[styles.column, { maxWidth: contentMaxWidth }]} testID={testID}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: space.lg,
  },
  column: {
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
});
