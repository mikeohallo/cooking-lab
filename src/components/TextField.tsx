import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';

import { maxTextBoxHeight } from '../layout/footerLimit';
import { fontStyleFor, useFontsReady } from '../theme/fonts';
import { makeStyles, useColors } from '../theme/theme';
import { radius, size, space, type } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** A visible label above the field. Optional for a composer whose placeholder says it all. */
  label?: string;
  /** `heading` for a section's own field on the review; `label` otherwise. */
  labelStyle?: 'heading' | 'label';
  /** An icon in its tinted circle beside the heading (Your notes' page). */
  labelIcon?: IconName;
  /** A short line under the field: a format hint, or a problem with the value. */
  helper?: string;
  /** Paints the helper as a problem the person should fix. */
  invalid?: boolean;
  /** `next` is the Next time field: amber, a next-line edge and bold words. */
  tone?: 'plain' | 'next';
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
 * A labelled box for words. Everything the person types goes through one of
 * these, so the phone's keyboard, and its dictation key, is the voice
 * interface, and font scaling grows the field rather than clipping it. A
 * focused field has a 2 px link ring.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    labelStyle = 'label',
    labelIcon,
    helper,
    invalid = false,
    tone = 'plain',
    multiline = false,
    rows = 3,
    maxRows,
    onFocus,
    onBlur,
    ...input
  },
  ref,
) {
  const styles = useStyles();
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  const fontsReady = useFontsReady();
  const lineHeight = type.body.lineHeight;
  const minHeight = multiline ? lineHeight * rows + space.md * 2 : size.targetMin;
  const capped = multiline && maxRows !== undefined;
  const maxHeight = capped
    ? Math.max(minHeight, maxTextBoxHeight(lineHeight, maxRows, fontScale, space.sm))
    : undefined;
  const next = tone === 'next';
  const weight = next ? type.bodyStrong.fontWeight : type.body.fontWeight;

  return (
    <View style={styles.field}>
      {label ? (
        <View style={styles.labelRow}>
          {labelIcon ? (
            <View style={[styles.labelCircle, next ? styles.nextCircle : styles.noteCircle]}>
              <Icon name={labelIcon} color={next ? 'onSelected' : 'ink'} size={size.iconSmall + 2} />
            </View>
          ) : null}
          <AppText
            variant={labelStyle === 'heading' ? 'heading' : 'label'}
            tone={next ? 'nextInk' : labelStyle === 'heading' ? 'ink' : 'inkMuted'}
          >
            {label}
          </AppText>
        </View>
      ) : null}
      <TextInput
        ref={ref}
        {...input}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={input.accessibilityLabel ?? label ?? input.placeholder}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        // A capped field scrolls inside itself once it is full, rather than
        // growing until it pushes everything below it off the screen.
        scrollEnabled={capped ? true : input.scrollEnabled}
        style={[
          styles.input,
          next && styles.inputNext,
          fontsReady ? fontStyleFor(weight) : { fontWeight: weight },
          { minHeight },
          maxHeight !== undefined ? { maxHeight } : null,
          focused && styles.focused,
          invalid && styles.inputInvalid,
        ]}
      />
      {helper ? (
        <AppText variant="secondary" tone={invalid ? 'danger' : 'inkMuted'}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    field: {
      gap: space.xxs + 2,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    labelCircle: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextCircle: {
      backgroundColor: colors.primary,
    },
    noteCircle: {
      backgroundColor: colors.noteIcon,
    },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.controlLine,
      borderWidth: size.hairline,
      borderRadius: radius.field,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      color: colors.ink,
      // 16 px or more stops the field zooming on focus, and is the cook
      // screen's floor: it is read at arm's length with wet hands.
      fontSize: type.body.fontSize,
      lineHeight: type.body.lineHeight,
    },
    inputNext: {
      backgroundColor: colors.next,
      borderColor: colors.nextLine,
      borderWidth: size.nextEdge,
    },
    focused: {
      outlineColor: colors.link,
      outlineWidth: size.ring,
      outlineOffset: size.ring,
      outlineStyle: 'solid',
    },
    inputInvalid: {
      borderColor: colors.danger,
    },
  }),
);
