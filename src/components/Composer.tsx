import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '../theme/theme';
import { DISABLED_OPACITY, radius, readingRoles, size, space, type ReadingTreatment } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type ComposerBarProps = {
  /** The Oven °C and Internal °C chips' row, above the field. */
  readings?: ReactNode;
  /** The rounded field: the camera, the note field, Send. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The bar pinned to the foot of the cook screen, where things get noted. On
 * the page with a bar shadow (light) or a line top edge (dark); it rises with
 * the keyboard and never hides Send.
 */
export function ComposerBar({ readings, children, style, testID }: ComposerBarProps) {
  const styles = useStyles();
  return (
    <View style={[styles.bar, style]} testID={testID}>
      {readings ? <View style={styles.readings}>{readings}</View> : null}
      <View style={styles.field}>{children}</View>
    </View>
  );
}

type ReadingChipProps = {
  kind: ReadingTreatment;
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
  testID?: string;
};

/** "Oven °C" or "Internal °C", in the reading's tint, with its icon. */
export function ReadingChip({ kind, label, onPress, accessibilityHint, disabled = false, testID }: ReadingChipProps) {
  const styles = useStyles();
  const roles = readingRoles[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.chip, styles[kind], pressed && styles.pressed, disabled && styles.off]}
    >
      <Icon name={kind === 'oven' ? 'oven' : 'probe'} color={roles.ink} size={size.iconSmall + 2} />
      <AppText variant="chip" tone={roles.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}

type SendButtonProps = {
  label: string;
  onPress: () => void;
  /** Disabled (40 %) until there is something to send. */
  disabled: boolean;
  testID?: string;
};

/** Send: an orange circle with an up arrow. */
export function SendButton({ label, onPress, disabled, testID }: SendButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.send, pressed && styles.sendPressed, disabled && styles.off]}
    >
      <Icon name="arrowUp" color="onPrimary" size={size.icon - 2} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ name, colors, shadows }) =>
  StyleSheet.create({
    bar: {
      backgroundColor: colors.page,
      paddingHorizontal: space.md,
      paddingTop: space.sm,
      paddingBottom: space.xs,
      gap: space.xs,
      boxShadow: shadows.bar,
      borderTopWidth: name === 'dark' ? size.hairline : 0,
      borderTopColor: colors.line,
    },
    readings: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    field: {
      minHeight: size.targetMain,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space.xxs,
      paddingHorizontal: space.xxs,
      paddingVertical: space.xxs,
      backgroundColor: colors.surface,
      borderColor: colors.controlLine,
      borderWidth: size.nextEdge,
      borderRadius: radius.pill,
    },
    chip: {
      minHeight: size.targetMin,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs + 2,
      paddingHorizontal: space.sm,
      borderRadius: radius.pill,
    },
    oven: {
      backgroundColor: colors.readingOven,
    },
    internal: {
      backgroundColor: colors.readingInternal,
    },
    pressed: {
      opacity: 0.85,
    },
    off: {
      opacity: DISABLED_OPACITY,
    },
    send: {
      width: size.inlineButton,
      height: size.inlineButton,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendPressed: {
      backgroundColor: colors.primaryPressed,
    },
  }),
);
