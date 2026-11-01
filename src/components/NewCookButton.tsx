import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { makeStyles, useColors } from '../theme/theme';
import { DISABLED_OPACITY, radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type NewCookButtonProps = {
  label: string;
  onPress: () => void;
  pending?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * New Cook: an orange pill, centred, in thumb reach, with a plus and the
 * words. The only orange button on Home, and never a full-width dark block.
 * The caller floats it above the bottom edge.
 */
export function NewCookButton({ label, onPress, pending = false, disabled = false, accessibilityHint, testID }: NewCookButtonProps) {
  const styles = useStyles();
  const colors = useColors();
  const inactive = pending || disabled;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: pending }}
        disabled={inactive}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [styles.pill, pressed && !inactive && styles.pressed, inactive && styles.off]}
      >
        {pending ? (
          <ActivityIndicator color={colors.onPrimary} accessibilityLabel="Working" />
        ) : (
          <Icon name="plus" color="onPrimary" size={size.icon - 2} />
        )}
        <AppText variant="buttonMain" tone="onPrimary">
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadows }) =>
  StyleSheet.create({
    wrap: {
      alignItems: 'center',
    },
    pill: {
      minHeight: size.targetMain,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      paddingHorizontal: space.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      boxShadow: shadows.fab,
    },
    pressed: {
      backgroundColor: colors.primaryPressed,
    },
    off: {
      opacity: DISABLED_OPACITY,
    },
  }),
);
