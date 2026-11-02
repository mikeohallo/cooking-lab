import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';

type CardProps = {
  children: ReactNode;
  /** When set, the whole card is one tappable control. */
  onPress?: () => void;
  /**
   * A long-press, for a card that has more to offer than opening. Also given
   * to a screen reader as a named action, so it never depends on the gesture.
   */
  onLongPress?: () => void;
  /** What the long-press does, for the screen reader's action list. */
  longPressLabel?: string;
  /** The cook shown beside the list on the inner screen: a 2 px teal ring. */
  selected?: boolean;
  /** Tighter padding, for a card that is mostly a photo. */
  compact?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A white container that marks one thing as an object: a cook, a reading, a
 * set of notes, the people who ate. A line edge, card corners, and a soft
 * shadow in light (the line alone in dark). Never nested in another card.
 */
export function Card({
  children,
  onPress,
  onLongPress,
  longPressLabel,
  selected,
  compact = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: CardProps) {
  const styles = useStyles();
  const base = [styles.card, compact && styles.compact, selected && styles.selected, style];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={selected === undefined ? undefined : { selected }}
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

const useStyles = makeStyles(({ colors, shadows }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderWidth: size.hairline,
      borderRadius: radius.card,
      padding: space.sm + space.xxs / 2,
      gap: space.xs,
      boxShadow: shadows.card,
    },
    compact: {
      padding: space.xs + space.xxs / 2,
    },
    pressable: {
      minHeight: size.targetMin,
    },
    pressed: {
      backgroundColor: colors.surfaceRaised,
    },
    selected: {
      borderColor: colors.secondary,
      borderWidth: size.ring,
    },
  }),
);
