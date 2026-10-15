import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';

type CardProps = {
  children: ReactNode;
  /** `surface` for ordinary content, `muted` for secondary grouping, `hero` for the one big card. */
  variant?: 'surface' | 'muted' | 'hero';
  /** When set, the whole card is one tappable control. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A large rounded card with generous padding: the baseline's basic surface.
 * Borders and tonal surfaces carry the hierarchy; there are no drop shadows.
 */
export function Card({
  children,
  variant = 'surface',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: CardProps) {
  const base = [styles.card, variantStyles[variant], style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [base, styles.pressable, pressed && styles.pressed]}
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

const variantStyles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMuted,
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.hero,
    padding: space.ml,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  pressable: {
    minHeight: MIN_TOUCH_TARGET,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
