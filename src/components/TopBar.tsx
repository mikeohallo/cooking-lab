import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isTestBuild } from '../config/appIdentity';
import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { TestBadge } from './TestBadge';

type TopBarProps = {
  /** Home: the app's name in the app-title style, with the TEST badge on the Test build. */
  appTitle?: string;
  /** The inner screen draws the app's name a little smaller. */
  compact?: boolean;
  /** Elsewhere: a back control, "‹ Home" or "‹ Back to the cook". */
  back?: { label: string; onPress: () => void; accessibilityLabel?: string; testID?: string };
  /** A quiet word after the back control ("Review"). */
  context?: string;
  /** At most two actions on the right. */
  actions?: ReactNode;
};

/**
 * The top of every screen: the app's name or a back control on the left, at
 * most two actions on the right. No fill; it sits on the page. The screen's
 * own title goes below the bar, never squeezed into it.
 */
export function TopBar({ appTitle, compact = false, back, context, actions }: TopBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.bar}>
      <View style={styles.leading}>
        {appTitle ? (
          <>
            <AppText variant={compact ? 'appTitleInner' : 'appTitle'} accessibilityRole="header">
              {appTitle}
            </AppText>
            {isTestBuild() ? <TestBadge /> : null}
          </>
        ) : null}
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={back.accessibilityLabel ?? back.label}
            onPress={back.onPress}
            testID={back.testID ?? 'screen-back'}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="chevronLeft" color="ink" size={size.icon - 2} />
            <AppText variant="bodyStrong">{back.label}</AppText>
          </Pressable>
        ) : null}
        {context ? (
          <AppText variant="bodyStrong" tone="inkMuted">
            {context}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityState?: { expanded?: boolean };
  testID?: string;
};

/** A round icon control on surface-raised, with its accessibility label: ⋯, the filter button. */
export function IconButton({ icon, accessibilityLabel, onPress, accessibilityState, testID }: IconButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Icon name={icon} color="ink" size={size.icon - 4} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.xs,
      minHeight: size.targetMin,
    },
    leading: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
    },
    back: {
      minHeight: size.targetMin,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs / 2,
      paddingRight: space.sm,
      borderRadius: radius.pill,
    },
    pressed: {
      opacity: 0.7,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: space.xs,
      flexShrink: 1,
    },
    iconButton: {
      width: size.targetMin,
      height: size.targetMin,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
