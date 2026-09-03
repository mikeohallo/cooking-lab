import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, space } from '../theme/tokens';

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
      <Text style={styles.label}>{TEST_BADGE_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.testBadge,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  label: {
    color: colors.onTestBadge,
    fontSize: fontSize.caption,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
