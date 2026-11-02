import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { makeStyles, useColors } from '../theme/theme';
import { DISABLED_OPACITY, radius, size } from '../theme/tokens';
import { touchSlop } from '../theme/touch';
import { Icon } from './Icon';

type CameraButtonProps = {
  /** Spoken by the screen reader and the only name this control has. */
  label: string;
  onPress: () => void;
  /** Shows progress and refuses a second tap while the camera is open. */
  pending?: boolean;
  testID?: string;
};

/**
 * The camera control inside the composer's field: "Add a photo".
 *
 * An icon rather than a word, one of the three controls the design lets go
 * without one (with ⋯ and the filter button), so it carries its name for the
 * screen reader. A full 48 dp target: a shutter pressed with a wet thumb
 * needs the whole of it.
 */
export function CameraButton({ label, onPress, pending = false, testID }: CameraButtonProps) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Offers the camera or a picture you already have"
      accessibilityState={{ disabled: pending, busy: pending }}
      disabled={pending}
      onPress={onPress}
      testID={testID}
      hitSlop={CAMERA_SLOP}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, pending && styles.pending]}
    >
      {pending ? (
        <ActivityIndicator color={colors.ink} accessibilityLabel="Working" />
      ) : (
        <Icon name="camera" color="ink" />
      )}
    </Pressable>
  );
}

/** Drawn 40 round; the hit area makes the touch area 48 each way. */
const CAMERA_SLOP = touchSlop(size.iconButton, size.iconButton);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    button: {
      width: size.iconButton,
      height: size.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    pressed: {
      backgroundColor: colors.surfaceRaised,
    },
    pending: {
      opacity: DISABLED_OPACITY,
    },
  }),
);
