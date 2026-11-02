import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type ZoneProps = {
  children: ReactNode;
  /** `zone` sage, or `quiet` for the Ingredients bar or box. */
  tone?: 'zone' | 'quiet';
  /** A zone is a tap target only where it says so. */
  onPress?: () => void;
  /** A long-press, also offered to a screen reader as a named action. */
  onLongPress?: () => void;
  longPressLabel?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { expanded?: boolean };
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A sage area that marks a place rather than a thing to read: the Cooking now
 * card, Screen on, + Someone else, the Ingredients bar. Icons on it are
 * zone-icon. It never holds the Next time words.
 */
export function Zone({
  children,
  tone = 'zone',
  onPress,
  onLongPress,
  longPressLabel,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
  style,
}: ZoneProps) {
  const styles = useStyles();
  const base = [styles.zone, tone === 'quiet' ? styles.quiet : styles.sage, style];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityActions={
          onLongPress ? [{ name: 'longpress', label: longPressLabel ?? 'More actions' }] : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') {
            onLongPress?.();
          }
        }}
        testID={testID}
        style={({ pressed }) => [base, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={base} testID={testID}>
      {children}
    </View>
  );
}

/** COOKING NOW, with its flame: the overline on the Cooking now card. */
export function ZoneOverline({ icon, label }: { icon: IconName; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.overline}>
      <Icon name={icon} color="primary" size={size.iconSmall} />
      <AppText variant="overline">{label}</AppText>
    </View>
  );
}

type ZoneBarProps = {
  icon: IconName;
  label: string;
  /** "12 · Show". */
  detail?: string;
  /** After the detail: the chevron that says it opens or closes. */
  trailingIcon?: IconName;
  /** Open or closed, for a bar that shows more in place. */
  expanded?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
};

/** The Ingredients bar: quiet sage, field corners, target-main tall. */
export function ZoneBar({
  icon,
  label,
  detail,
  trailingIcon,
  expanded,
  onPress,
  accessibilityHint,
  testID,
}: ZoneBarProps) {
  const styles = useStyles();
  return (
    <Zone
      tone="quiet"
      onPress={onPress}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      testID={testID}
      style={styles.bar}
    >
      <Icon name={icon} color="zoneIcon" size={size.icon - 2} />
      <AppText variant="bodyStrong" style={styles.barLabel}>
        {label}
      </AppText>
      {detail ? (
        <AppText variant="secondary" tone="inkMuted">
          {detail}
        </AppText>
      ) : null}
      {trailingIcon ? <Icon name={trailingIcon} color="inkMuted" size={size.iconSmall + 2} /> : null}
    </Zone>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    zone: {
      borderRadius: radius.card,
      padding: space.sm + 2,
      gap: space.sm,
    },
    sage: {
      backgroundColor: colors.zone,
    },
    quiet: {
      backgroundColor: colors.zoneQuiet,
    },
    pressed: {
      opacity: 0.85,
    },
    overline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    bar: {
      minHeight: size.targetMain,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.field,
      paddingVertical: space.xs,
      paddingHorizontal: space.md,
    },
    barLabel: {
      flex: 1,
    },
  }),
);
