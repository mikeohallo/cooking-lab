import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

export const TEST_BADGE_LABEL = 'TEST';
export const TEST_BADGE_TEST_ID = 'test-build-badge';

/**
 * The persistent TEST indicator. Rendered by the shell chrome on every screen of
 * the TEST variant and never rendered by the production variant.
 */
export function TestBadge() {
  return (
    <View
      style={styles.badge}
      testID={TEST_BADGE_TEST_ID}
      accessibilityRole="text"
      accessibilityLabel="Test build"
    >
      <AppText variant="caption" tone="onPrimary" style={styles.label}>
        {TEST_BADGE_LABEL}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.testBadge,
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
  },
  label: {
    color: colors.onTestBadge,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
