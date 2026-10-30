import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';

import { maxTextBoxHeight } from '../layout/footerLimit';

import { fontStyleFor, useFontsReady } from '../theme/fonts';
import { MIN_TOUCH_TARGET, colors, radius, space, type } from '../theme/tokens';
import { AppText } from './AppText';

type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** A visible label above the field. Optional for a composer whose placeholder says it all. */
  label?: string;
  /** A short line under the field: a format hint, or a problem with the value. */
  helper?: string;
  /** Paints the helper as a problem the person should fix. */
  invalid?: boolean;
  /** Renders a tall field for free text such as a note or a verdict. */
  multiline?: boolean;
  /** Approximate number of visible lines for a multiline field. */
  rows?: number;
  /**
   * The most lines a multiline field grows to before it scrolls inside itself.
   * Without it, a long paste grows the field without limit (fix round 0.2.2).
   */
  maxRows?: number;
};

/**
 * The app's text input. Everything the person types goes through one of
 * these, so the OS keyboard — and its dictation key — is the voice interface,
 * and font scaling grows the field rather than clipping it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, invalid = false, multiline = false, rows = 3, maxRows, ...input },
  ref,
) {
  const { fontScale } = useWindowDimensions();
  const fontsReady = useFontsReady();
  const lineHeight = type.body.lineHeight ?? 23;
  const minHeight = multiline ? lineHeight * rows + space.md * 2 : MIN_TOUCH_TARGET;
  const capped = multiline && maxRows !== undefined;
  const maxHeight = capped
    ? Math.max(minHeight, maxTextBoxHeight(lineHeight, maxRows, fontScale, space.sm))
    : undefined;

  return (
    <View style={styles.field}>
      {label ? (
        <AppText variant="label" tone="muted">
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        {...input}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={input.accessibilityLabel ?? label ?? input.placeholder}
        // A capped field scrolls inside itself once it is full, rather than
        // growing until it pushes everything below it off the screen.
        scrollEnabled={capped ? true : input.scrollEnabled}
        style={[
          styles.input,
          fontsReady ? fontStyleFor(type.body.fontWeight) : null,
          { minHeight },
          maxHeight !== undefined ? { maxHeight } : null,
          invalid && styles.inputInvalid,
        ]}
      />
      {helper ? (
        <AppText variant="caption" tone={invalid ? 'danger' : 'muted'}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    gap: space.xxs,
  },
  input: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.text,
    // ≥16 px stops Android and iOS zooming the field on focus.
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
});
