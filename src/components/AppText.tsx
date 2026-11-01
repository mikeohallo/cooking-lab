import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { fontStyleFor, useFontsReady } from '../theme/fonts';
import { useColors } from '../theme/theme';
import { type, type ColorRole, type TypeStyle } from '../theme/tokens';

type AppTextProps = Omit<TextProps, 'style'> & {
  children: ReactNode;
  variant?: TypeStyle;
  /** The colour role of the words. Ink unless it says otherwise. */
  tone?: ColorRole;
  style?: StyleProp<TextStyle>;
};

/**
 * Every piece of text in the app. The variant picks a row of the type scale,
 * so size, line height, weight and tracking always travel together, and font
 * scaling is respected because nothing here fixes a height. The colour comes
 * from the current theme, so it changes when the phone goes light or dark.
 */
export function AppText({ children, variant = 'body', tone = 'ink', style, ...rest }: AppTextProps) {
  const fontsReady = useFontsReady();
  const colors = useColors();
  const drawn: StyleProp<TextStyle>[] = [styles.base, type[variant], { color: colors[tone] }, style];
  // Plus Jakarta Sans once it has loaded, at the weight the style asks for;
  // otherwise the system sans at that weight. Font scaling applies either way.
  const face = fontsReady ? fontStyleFor(StyleSheet.flatten(drawn).fontWeight) : null;
  return (
    <Text {...rest} style={[...drawn, face]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
