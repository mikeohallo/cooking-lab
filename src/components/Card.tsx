import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';

type CardProps = {
  children: ReactNode;
  /**
   * `surface` for ordinary content, `muted` for secondary grouping, `hero` for
   * the one big card, `panel` for the Last time and Next time panel.
   */
  variant?: 'surface' | 'muted' | 'hero' | 'panel';
  /** When set, the whole card is one tappable control. */
  onPress?: () => void;
  /**
   * A long-press, for a card that has more to offer than opening. Also given
   * to a screen reader as a named action, so it never depends on the gesture.
   */
  onLongPress?: () => void;
  /** What the long-press does, for the screen reader's action list. */
  longPressLabel?: string;
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
  onLongPress,
  longPressLabel,
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
  panel: {
    backgroundColor: colors.lastTimeSurface,
    borderColor: colors.lastTimeBorder,
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
