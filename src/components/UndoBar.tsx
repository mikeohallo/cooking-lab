import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';

type UndoBarProps = {
  message: string;
  undoLabel: string;
  onUndo: () => void;
  undoHint?: string;
  testID?: string;
  undoTestID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The bar after a delete, so nothing is lost by a slip: navy, the message,
 * and Undo in its own warm colour. It floats above the bottom edge; the
 * caller places it.
 */
export function UndoBar({ message, undoLabel, onUndo, undoHint, testID, undoTestID, style }: UndoBarProps) {
  const styles = useStyles();
  return (
    <View style={[styles.bar, style]} accessibilityLiveRegion="polite" testID={testID}>
      <AppText variant="body" tone="onInverse" style={styles.message}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={undoLabel}
        accessibilityHint={undoHint}
        onPress={onUndo}
        testID={undoTestID}
        style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
      >
        <AppText variant="button" tone="inverseAction">
          {undoLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
      paddingVertical: space.xxs,
      paddingLeft: space.md,
      paddingRight: space.xxs,
      borderRadius: radius.field,
      backgroundColor: colors.inverse,
    },
    message: {
      flexShrink: 1,
    },
    undo: {
      minHeight: size.targetMin,
      minWidth: size.targetMin,
      paddingHorizontal: space.sm,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.field,
    },
    pressed: {
      opacity: 0.7,
    },
  }),
);
