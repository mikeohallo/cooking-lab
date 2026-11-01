import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '../theme/theme';
import { DISABLED_OPACITY, radius, size as sizes, space, type ColorRole } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ButtonVariant =
  /** Orange: the one main action on a screen. */
  | 'main'
  /** Teal: a secondary action, beside or above the main one. */
  | 'secondary'
  /** Peach: go and look (Open on Last time). */
  | 'peach'
  /** A control-line edge and ink words: a quiet choice (N/A, Previous, Cancel). */
  | 'outlined'
  /** Words in link teal: a small inline action (+ Tag, Show all). */
  | 'text'
  /** Words in danger red: an action that loses data. Always asks or offers Undo. */
  | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `main` is target-main tall, for the main button at the foot of a screen. */
  size?: 'main' | 'standard';
  /** A short line under the label, on a main-size button. */
  hint?: string;
  icon?: IconName;
  disabled?: boolean;
  /** Shows progress and disables the control while a write is in flight. */
  pending?: boolean;
  /** Stretches to the width it is given. */
  block?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const INK: Record<ButtonVariant, ColorRole> = {
  main: 'onPrimary',
  secondary: 'onSecondary',
  peach: 'onPeach',
  outlined: 'ink',
  text: 'link',
  danger: 'danger',
};

/**
 * The app's one button: a pill in one of six weights (Design Baseline v3).
 * Never fixed in height, so font scaling grows it instead of clipping the
 * label; pressed, pending and disabled each look different.
 */
export function Button({
  label,
  onPress,
  variant = 'main',
  size = 'standard',
  hint,
  icon,
  disabled = false,
  pending = false,
  block = false,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inactive = disabled || pending;
  const ink = INK[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: pending }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        size === 'main' ? styles.sizeMain : styles.sizeStandard,
        block && styles.block,
        styles[variant],
        pressed && !inactive && styles[`${variant}Pressed`],
        inactive && styles.inactive,
        style,
      ]}
    >
      <View style={styles.content}>
        {pending ? <ActivityIndicator color={colors[ink]} accessibilityLabel="Working" /> : null}
        {icon && !pending ? <Icon name={icon} color={ink} size={sizes.iconSmall + 2} /> : null}
        <View style={styles.labels}>
          <AppText variant={size === 'main' ? 'buttonMain' : 'button'} tone={ink} style={styles.label}>
            {label}
          </AppText>
          {hint && size === 'main' ? (
            <AppText variant="secondary" tone={ink} style={styles.label}>
              {hint}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    base: {
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: sizes.hairline,
      borderColor: 'transparent',
      paddingHorizontal: space.ml,
      alignSelf: 'flex-start',
    },
    sizeMain: {
      minHeight: sizes.targetMain,
      paddingVertical: space.xs,
    },
    sizeStandard: {
      minHeight: sizes.targetMin,
      paddingVertical: space.xs,
    },
    block: {
      alignSelf: 'stretch',
    },
    inactive: {
      opacity: DISABLED_OPACITY,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
    },
    labels: {
      alignItems: 'center',
      gap: space.xxs / 2,
      flexShrink: 1,
    },
    label: {
      textAlign: 'center',
    },
    main: { backgroundColor: colors.primary },
    mainPressed: { backgroundColor: colors.primaryPressed },
    secondary: { backgroundColor: colors.secondary },
    secondaryPressed: { backgroundColor: colors.secondaryPressed },
    peach: { backgroundColor: colors.peach },
    peachPressed: { backgroundColor: colors.peach, opacity: 0.85 },
    outlined: { backgroundColor: 'transparent', borderColor: colors.controlLine },
    outlinedPressed: { backgroundColor: colors.surfaceRaised },
    text: { backgroundColor: 'transparent', paddingHorizontal: space.xs },
    textPressed: { backgroundColor: colors.surfaceRaised },
    danger: { backgroundColor: 'transparent', paddingHorizontal: space.xs },
    dangerPressed: { backgroundColor: colors.dangerSoft },
  }),
);
