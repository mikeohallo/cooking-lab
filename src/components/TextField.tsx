import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

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
};

/**
 * The app's text input. Everything the person types goes through one of
 * these, so the OS keyboard — and its dictation key — is the voice interface,
 * and font scaling grows the field rather than clipping it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, invalid = false, multiline = false, rows = 3, ...input },
  ref,
) {
  const minHeight = multiline ? (type.body.lineHeight ?? 23) * rows + space.md * 2 : MIN_TOUCH_TARGET;

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
        style={[styles.input, { minHeight }, invalid && styles.inputInvalid]}
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
