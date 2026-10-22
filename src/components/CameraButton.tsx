import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';

type CameraButtonProps = {
  /** Spoken by the screen reader and the only name this control has. */
  label: string;
  onPress: () => void;
  /** Shows progress and refuses a second tap while the camera is open. */
  pending?: boolean;
  testID?: string;
};

/**
 * The camera control beside the note field.
 *
 * An icon rather than a word, because the composer's one line and Send is the
 * thing that must stay obvious and a third labelled button beside them would
 * crowd it. It is the only unlabelled control in the app, so two things make up
 * for that: it is a camera, which is the most recognisable glyph there is, and
 * it carries its name for the screen reader.
 *
 * `MIN_TOUCH_TARGET` square, which is the Android minimum and what the baseline
 * requires of every interactive control — a shutter pressed with a wet thumb
 * needs the whole of it.
 */
export function CameraButton({ label, onPress, pending = false, testID }: CameraButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Offers the camera or a picture you already have"
      accessibilityState={{ disabled: pending, busy: pending }}
      disabled={pending}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, pending && styles.pending]}
    >
      {pending ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Working" />
      ) : (
        <View style={styles.camera}>
          <View style={styles.bump} />
          <View style={styles.body}>
            <View style={styles.lens} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
  pending: {
    opacity: 0.55,
  },
  camera: {
    alignItems: 'center',
  },
  // The viewfinder hump on the top edge, which is what makes the shape read as
  // a camera rather than as a rectangle with a circle in it.
  bump: {
    width: 10,
    height: 4,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: colors.primary,
    marginBottom: -1,
    marginRight: space.xs,
  },
  body: {
    width: 26,
    height: 19,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.primary,
  },
});
