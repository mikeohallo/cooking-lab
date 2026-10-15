import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, type, type TypeStyle } from '../theme/tokens';

type Tone = 'text' | 'muted' | 'onPrimary' | 'danger' | 'primary';

type AppTextProps = Omit<TextProps, 'style'> & {
  children: ReactNode;
  variant?: TypeStyle;
  tone?: Tone;
  style?: StyleProp<TextStyle>;
};

const toneColor: Record<Tone, string> = {
  text: colors.text,
  muted: colors.textMuted,
  onPrimary: colors.onPrimary,
  danger: colors.danger,
  primary: colors.primary,
};

/**
 * Every piece of text in the app. The variant picks a row of the type scale,
 * so size, line height and weight always travel together, and font scaling is
 * respected because nothing here fixes a height.
 */
export function AppText({ children, variant = 'body', tone = 'text', style, ...rest }: AppTextProps) {
  return (
    <Text {...rest} style={[styles.base, type[variant], { color: toneColor[tone] }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    // The platform sans. No custom family is loaded, by design.
    includeFontPadding: false,
  },
});
