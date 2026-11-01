import { Pressable, StyleSheet, View } from 'react-native';

import { REMOVE_TAG } from '../content/product';
import { makeStyles } from '../theme/theme';
import { DISABLED_OPACITY, radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

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
   *   `add`        the "+ Tag" chip, in link teal.
   */
  variant: 'removable' | 'selected' | 'pick' | 'plain' | 'add';
  onPress?: () => void;
  /** Dims the chip and refuses taps while a tag write is in flight. */
  disabled?: boolean;
  testID?: string;
};

/**
 * One tag: a quiet pill on surface-raised, 34 dp drawn inside a 48 dp touch
 * area. A tag that is on the cook, in a list to pick from, is teal with a
 * tick — never the fill alone. A removable chip's whole body is the control,
 * and its name says what tapping does ("Remove tag apple").
 */
export function TagChip({ name, variant, onPress, disabled = false, testID }: TagChipProps) {
  const styles = useStyles();
  const chosen = variant === 'selected';
  const body = (
    <View
      style={[
        styles.chip,
        chosen && styles.chosen,
        variant === 'add' && styles.add,
        disabled && styles.disabled,
      ]}
    >
      {chosen ? <Icon name="check" color="onSecondary" size={size.iconTiny + 2} /> : null}
      <AppText variant="label" tone={chosen ? 'onSecondary' : variant === 'add' ? 'link' : 'ink'}>
        {name}
      </AppText>
      {variant === 'removable' ? <Icon name="close" color="inkMuted" size={size.iconTiny + 2} /> : null}
    </View>
  );

  if (variant === 'plain' || onPress === undefined) {
    return (
      <View style={styles.target} testID={testID}>
        {body}
      </View>
    );
  }

  const accessibilityLabel = variant === 'removable' ? `${REMOVE_TAG} ${name}` : name;
  const isButton = variant === 'removable' || variant === 'add';

  return (
    <Pressable
      accessibilityRole={isButton ? 'button' : 'checkbox'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={isButton ? { disabled } : { disabled, checked: chosen }}
      accessibilityHint={
        variant === 'removable'
          ? 'Takes this tag off this cook'
          : variant === 'add'
            ? undefined
            : 'Adds or removes this tag'
      }
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.target, pressed && !disabled && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    target: {
      minHeight: size.targetMin,
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    chip: {
      minHeight: size.tagChip,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
    },
    chosen: {
      backgroundColor: colors.secondary,
    },
    add: {
      backgroundColor: 'transparent',
      borderWidth: size.hairline,
      borderStyle: 'dashed',
      borderColor: colors.link,
    },
    pressed: {
      opacity: 0.8,
    },
    disabled: {
      opacity: DISABLED_OPACITY,
    },
  }),
);
