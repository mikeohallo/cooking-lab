import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { AppText } from './AppText';

export const TEST_BADGE_LABEL = 'TEST';
export const TEST_BADGE_TEST_ID = 'test-build-badge';

/**
 * Marks the Test build, beside the app name on every screen of it, so it is
 * never mistaken for the real notebook. Never in the production app.
 */
export function TestBadge() {
  const styles = useStyles();
  return (
    <View
      style={styles.badge}
      testID={TEST_BADGE_TEST_ID}
      accessibilityRole="text"
      accessibilityLabel="Test build"
    >
      <AppText variant="label" tone="onTestBadge" style={styles.label}>
        {TEST_BADGE_LABEL}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    badge: {
      alignSelf: 'center',
      backgroundColor: colors.testBadge,
      borderRadius: radius.pill,
      paddingHorizontal: space.xs,
      paddingVertical: space.xxs / 2,
    },
    label: {
      letterSpacing: 1,
    },
  }),
);
