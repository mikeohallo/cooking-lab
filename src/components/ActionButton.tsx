import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  PRIMARY_TOUCH_TARGET,
  colors,
  fontSize,
  radius,
  space,
} from '../theme/tokens';

type ActionButtonProps = {
  label: string;
  /** Short line of supporting text shown under the label. */
  hint?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  accessibilityHint?: string;
};

/**
 * The one interactive control the Milestone 0 shell needs.
 *
 * Sized well above the 48 dp minimum, full width so it stays reachable on a
 * cover screen, and free of fixed heights so Android font scaling grows the
 * button instead of clipping its label.
 */
export function ActionButton({
  label,
  hint,
  onPress,
  variant = 'primary',
  accessibilityHint,
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        pressed && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.label, isPrimary ? styles.primaryText : styles.secondaryText]}>
          {label}
        </Text>
        {hint ? (
          <Text style={[styles.hint, isPrimary ? styles.primaryText : styles.secondaryHint]}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: PRIMARY_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderWidth: 1,
  },
  content: {
    gap: space.xs,
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  secondaryPressed: {
    backgroundColor: colors.background,
  },
  label: {
    fontSize: fontSize.bodyLarge,
    fontWeight: '600',
  },
  hint: {
    fontSize: fontSize.caption,
  },
  primaryText: {
    color: colors.onAccent,
  },
  secondaryText: {
    color: colors.text,
  },
  secondaryHint: {
    color: colors.textMuted,
  },
});
