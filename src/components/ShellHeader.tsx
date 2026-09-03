import { StyleSheet, Text, View } from 'react-native';

import { getAppIdentity, isTestBuild } from '../config/appIdentity';
import { TEST_BUILD_NOTICE } from '../content/product';
import { colors, fontSize, radius, space } from '../theme/tokens';
import { TestBadge } from './TestBadge';

type ShellHeaderProps = {
  /** Optional screen title shown under the application name. */
  subtitle?: string;
};

/**
 * Application chrome. Shows the variant display name and, on the TEST variant
 * only, an unmistakable TEST badge plus a short explanation of what this build
 * is. Production renders neither.
 */
export function ShellHeader({ subtitle }: ShellHeaderProps) {
  const identity = getAppIdentity();
  const showTestAffordances = isTestBuild();

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.appName} accessibilityRole="header">
          {identity.name}
        </Text>
        {showTestAffordances ? <TestBadge /> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {showTestAffordances ? (
        <View style={styles.testNotice}>
          <Text style={styles.testNoticeText}>{TEST_BUILD_NOTICE}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.sm,
    marginBottom: space.lg,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  appName: {
    color: colors.text,
    fontSize: fontSize.display,
    fontWeight: '700',
    flexShrink: 1,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.bodyLarge,
  },
  testNotice: {
    backgroundColor: colors.testSurface,
    borderColor: colors.testBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  testNoticeText: {
    color: colors.text,
    fontSize: fontSize.caption,
  },
});
