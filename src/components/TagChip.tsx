import { Pressable, StyleSheet, View } from 'react-native';

import { REMOVE_TAG } from '../content/product';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

type TagChipProps = {
  name: string;
  /**
   * How this chip behaves:
   *
   *   `removable`  a tag on this cook, with an × that takes it off.
   *   `selected`   a tag in a list that is already on this cook; tapping it
   *                takes it off again.
   *   `pick`       a tag in a list that is not on this cook; tapping adds it.
   *   `plain`      no action at all, for a line that is only showing tags.
   */
  variant: 'removable' | 'selected' | 'pick' | 'plain';
  onPress?: () => void;
  /** Dims the chip and refuses taps while a tag write is in flight. */
  disabled?: boolean;
  testID?: string;
};

/**
 * One tag, as an outlined pill.
 *
 * Outlined rather than filled, with the selected state filled: a cook's tags are
 * quiet metadata under a title and should not compete with it, while "this one
 * is on the cook" has to be obvious at a glance in a list of thirty. The
 * selected state is a fill *and* a tick, never the fill alone — nothing in this
 * app carries meaning in colour and nothing else.
 *
 * A removable chip's whole body is the control, not a small × inside it: a 16 dp
 * cross next to a word is a target nobody hits in a kitchen. The chip is at
 * least `MIN_TOUCH_TARGET` tall and its accessible name says what tapping does.
 */
export function TagChip({ name, variant, onPress, disabled = false, testID }: TagChipProps) {
  const body = (
    <View style={styles.row}>
      {variant === 'selected' ? (
        <AppText variant="label" tone="onPrimary" style={styles.mark}>
          ✓
        </AppText>
      ) : null}
      <AppText variant="label" tone={variant === 'selected' ? 'onPrimary' : 'primary'}>
        {name}
      </AppText>
      {variant === 'removable' ? (
        <AppText variant="label" tone="muted" style={styles.mark}>
          ✕
        </AppText>
      ) : null}
    </View>
  );

  if (variant === 'plain' || onPress === undefined) {
    return (
      <View style={[styles.chip, styles.outlined, disabled && styles.disabled]} testID={testID}>
        {body}
      </View>
    );
  }

  const accessibilityLabel = variant === 'removable' ? `${REMOVE_TAG} ${name}` : name;

  return (
    <Pressable
      accessibilityRole={variant === 'removable' ? 'button' : 'checkbox'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        variant === 'removable'
          ? { disabled }
          : { disabled, checked: variant === 'selected' }
      }
      accessibilityHint={
        variant === 'removable' ? 'Takes this tag off this cook' : 'Adds or removes this tag'
      }
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        variant === 'selected' ? styles.filled : styles.outlined,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  outlined: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  filled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
  mark: {
    opacity: 0.8,
  },
});
