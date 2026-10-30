import { useFonts } from 'expo-font';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FONT_FILES, FontsReadyContext } from '../theme/fonts';
import { colors } from '../theme/tokens';

/**
 * Holds the app on a plain screen until Plus Jakarta Sans has loaded from the
 * files bundled in the app, then shows it in that face (0.3.0).
 *
 * A plain screen, not a spinner: loading the bundled files takes a moment at
 * most, and a flash of the system font that then changes would look like a
 * fault. If loading fails, the app goes on in the system sans rather than
 * stopping — the face is a nicety, the notebook is not.
 */
export function FontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts(FONT_FILES);

  if (!loaded && error === null) {
    return <View style={styles.plain} testID="fonts-loading" />;
  }

  return <FontsReadyContext.Provider value={loaded && error === null}>{children}</FontsReadyContext.Provider>;
}

const styles = StyleSheet.create({
  plain: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
