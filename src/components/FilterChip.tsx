import { Pressable, StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { DISABLED_OPACITY, radius, size, space, type ColorRole } from '../theme/tokens';
import { touchSlop } from '../theme/touch';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type FilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A meal's icon, drawn in the meal's colour. */
  icon?: IconName;
  iconColor?: ColorRole;
  /**
   * `filter` is Home's chip row: navy when chosen. `choice` is a choice on the
   * review or in a sheet: white with a control-line edge, teal with a tick
   * when chosen.
   */
  kind?: 'filter' | 'choice';
  /** A filter chip that also shows a tick when chosen: the Filters sheet's chips. */
  tick?: boolean;
  disabled?: boolean;
  /** A chip in a set where one is chosen is a radio; otherwise a checkbox. */
  role?: 'checkbox' | 'radio';
  accessibilityHint?: string;
  testID?: string;
};

/**
 * A chip that narrows a list or makes a choice. 40 dp drawn inside a 48 dp
 * touch area; chosen is a fill and, for a choice, a tick. Never colour alone.
 */
export function FilterChip({
  label,
  selected,
  onPress,
  icon,
  iconColor = 'ink',
  kind = 'filter',
  tick = false,
  disabled = false,
  role = 'checkbox',
  accessibilityHint,
  testID,
}: FilterChipProps) {
  const styles = useStyles();
  const choice = kind === 'choice';
  const ink: ColorRole = selected ? (choice ? 'onSecondary' : 'onSelected') : 'ink';
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={CHIP_SLOP}
      style={({ pressed }) => [styles.target, pressed && !disabled && styles.pressed, disabled && styles.off]}
    >
      <View
        style={[
          styles.chip,
          choice ? styles.choice : styles.filter,
          selected && (choice ? styles.choiceOn : styles.filterOn),
        ]}
      >
        {selected && (choice || tick) ? <Icon name="check" color={ink} size={size.iconSmall} /> : null}
        {icon ? <Icon name={icon} color={selected ? ink : iconColor} size={size.iconSmall} /> : null}
        <AppText variant="chip" tone={ink}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Drawn 32 tall (Material 3); the hit area makes the touch area 48. */
const CHIP_SLOP = touchSlop(size.chip);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    target: {
      minHeight: size.chip,
      justifyContent: 'center',
    },
    chip: {
      minHeight: size.chip,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs + 2,
      paddingHorizontal: space.sm + 2,
      borderRadius: radius.pill,
      borderWidth: size.hairline,
    },
    filter: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.surfaceRaised,
    },
    filterOn: {
      backgroundColor: colors.selected,
      borderColor: colors.selected,
    },
    choice: {
      backgroundColor: colors.surface,
      borderColor: colors.controlLine,
    },
    choiceOn: {
      backgroundColor: colors.secondary,
      borderColor: colors.secondary,
    },
    pressed: {
      opacity: 0.85,
    },
    off: {
      opacity: DISABLED_OPACITY,
    },
  }),
);
