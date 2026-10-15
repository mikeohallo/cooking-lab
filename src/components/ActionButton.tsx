import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, PRIMARY_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

export type ActionButtonVariant =
  /** The one main action on the screen: solid sage, white label. */
  | 'primary'
  /** A utility or non-primary progression: soft sage surface, primary text. */
  | 'secondary'
  /** A quiet text-only control for an uncommon or destructive-leaning action. */
  | 'quiet';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  /** Hero buttons are the full-width ~64 dp action; standard ones meet the 48 dp minimum. */
  size?: 'hero' | 'standard';
  /** Short line of supporting text under the label. Hero buttons only. */
  hint?: string;
  disabled?: boolean;
  /** Shows progress and disables the control while a write is in flight. */
  pending?: boolean;
  /** Danger tone for the quiet variant. Never a filled red button. */
  tone?: 'default' | 'danger';
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The app's one button.
 *
 * Full width when it is the main action, never fixed in height so Android font
 * scaling grows it instead of clipping the label, and with distinct pressed,
 * pending and disabled states.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  size = 'standard',
  hint,
  disabled = false,
  pending = false,
  tone = 'default',
  accessibilityHint,
  testID,
  style,
}: ActionButtonProps) {
  const inactive = disabled || pending;
  const labelTone =
    variant === 'primary' ? 'onPrimary' : tone === 'danger' ? 'danger' : 'primary';

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
        size === 'hero' ? styles.hero : styles.standard,
        variantStyles[variant].rest,
        pressed && !inactive && variantStyles[variant].pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      <View style={styles.content}>
        {pending ? (
          <ActivityIndicator
            color={variant === 'primary' ? colors.onPrimary : colors.primary}
            accessibilityLabel="Working"
          />
        ) : null}
        <View style={styles.labels}>
          <AppText variant="button" tone={labelTone} style={styles.label}>
            {label}
          </AppText>
          {hint && size === 'hero' ? (
            <AppText variant="secondary" tone={labelTone} style={styles.hint}>
              {hint}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const variantStyles = {
  primary: StyleSheet.create({
    rest: { backgroundColor: colors.primary, borderColor: colors.primary },
    pressed: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
  }),
  secondary: StyleSheet.create({
    rest: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
    pressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  }),
  quiet: StyleSheet.create({
    rest: { backgroundColor: 'transparent', borderColor: 'transparent' },
    pressed: { backgroundColor: colors.surfaceMuted, borderColor: 'transparent' },
  }),
} as const;

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space.md,
  },
  hero: {
    minHeight: PRIMARY_TOUCH_TARGET,
    paddingVertical: space.sm,
    width: '100%',
  },
  standard: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: space.xs,
  },
  inactive: {
    opacity: 0.55,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  labels: {
    alignItems: 'center',
    gap: 2,
    flexShrink: 1,
  },
  label: {
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
    opacity: 0.9,
  },
});
