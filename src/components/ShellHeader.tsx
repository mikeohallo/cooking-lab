import { StyleSheet, View } from 'react-native';

import { getAppIdentity, isTestBuild } from '../config/appIdentity';
import { TEST_BUILD_NOTICE } from '../content/product';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';
import { TestBadge } from './TestBadge';

type ShellHeaderProps = {
  /** Optional screen title shown under the application name. */
  subtitle?: string;
};

/**
 * Home's compact brand row. Shows the variant display name and, on the TEST
 * variant only, an unmistakable TEST badge plus a short explanation of what
 * this build is. Production renders neither.
 */
export function ShellHeader({ subtitle }: ShellHeaderProps) {
  const identity = getAppIdentity();
  const showTestAffordances = isTestBuild();

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="display" accessibilityRole="header" style={styles.appName}>
          {identity.name}
        </AppText>
        {showTestAffordances ? <TestBadge /> : null}
      </View>
      {subtitle ? (
        <AppText variant="secondary" tone="muted">
          {subtitle}
        </AppText>
      ) : null}
      {showTestAffordances ? (
        <View style={styles.testNotice}>
          <AppText variant="caption">{TEST_BUILD_NOTICE}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.xs,
    marginBottom: space.lg,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  appName: {
    flexShrink: 1,
  },
  testNotice: {
    backgroundColor: colors.testSurface,
    borderColor: colors.testBorder,
    borderWidth: 1,
    borderRadius: radius.control,
    padding: space.xs,
  },
});
