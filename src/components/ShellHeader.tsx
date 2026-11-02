import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { getAppIdentity, isTestBuild } from '../config/appIdentity';
import { TEST_BUILD_NOTICE } from '../content/product';
import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { TopBar } from './TopBar';

type ShellHeaderProps = {
  /** Optional line shown under the application name. */
  subtitle?: string;
  /** Home's ⋯ menu, on the right. */
  trailing?: ReactNode;
  /** The inner display's list pane: the app's name a size down (30 / 36). */
  compact?: boolean;
};

/**
 * Home's top: the app's name on the TopBar (with the TEST badge on the Test
 * build), and on the Test build only, the notice saying what this build is.
 * Production shows neither.
 */
export function ShellHeader({ subtitle, trailing, compact = false }: ShellHeaderProps) {
  const styles = useStyles();
  const identity = getAppIdentity();
  return (
    <View style={styles.header}>
      <TopBar appTitle={identity.name} actions={trailing} compact={compact} />
      {subtitle ? (
        <AppText variant="secondary" tone="inkMuted">
          {subtitle}
        </AppText>
      ) : null}
      {isTestBuild() ? (
        <View style={styles.testNotice}>
          <AppText variant="secondary">{TEST_BUILD_NOTICE}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    header: {
      gap: space.xs,
      marginBottom: space.md,
    },
    testNotice: {
      backgroundColor: colors.testSurface,
      borderColor: colors.testLine,
      borderWidth: size.hairline,
      borderRadius: radius.field,
      padding: space.sm,
    },
  }),
);
