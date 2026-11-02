/**
 * The app's light and dark themes.
 *
 * Cooking Lab follows the phone's own light or dark setting, and changes live
 * when the phone switches: `useColorScheme` re-renders every screen that reads
 * the theme. There is no switch in the app, and Android's wallpaper colours
 * (dynamic colour) are never used — every colour comes from the tokens.
 *
 * `ThemeOverride` pins a theme for a subtree. Only the tests use it.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { fades, palettes, shadows, type Fades, type Palette, type Shadows, type ThemeName } from './tokens';

export type Theme = {
  readonly name: ThemeName;
  readonly colors: Palette;
  readonly shadows: Shadows;
  readonly fades: Fades;
};

const THEMES: Readonly<Record<ThemeName, Theme>> = {
  light: { name: 'light', colors: palettes.light, shadows: shadows.light, fades: fades.light },
  dark: { name: 'dark', colors: palettes.dark, shadows: shadows.dark, fades: fades.dark },
};

const OverrideContext = createContext<ThemeName | null>(null);

export function ThemeOverride({ scheme, children }: { scheme: ThemeName; children: ReactNode }) {
  return <OverrideContext.Provider value={scheme}>{children}</OverrideContext.Provider>;
}

/** Light or dark: the override if there is one, otherwise the phone's setting. */
export function useThemeName(): ThemeName {
  const override = useContext(OverrideContext);
  const system = useColorScheme();
  return override ?? (system === 'dark' ? 'dark' : 'light');
}

export function useTheme(): Theme {
  return THEMES[useThemeName()];
}

/** The colours of the current theme. */
export function useColors(): Palette {
  return useTheme().colors;
}

export function themeFor(name: ThemeName): Theme {
  return THEMES[name];
}

/**
 * Styles that depend on the theme, built once per theme and kept.
 *
 *   const useStyles = makeStyles((t) => StyleSheet.create({ ... }));
 *   const styles = useStyles();
 */
export function makeStyles<T>(factory: (theme: Theme) => T): () => T {
  const built: Partial<Record<ThemeName, T>> = {};
  return function useStyles(): T {
    const theme = useTheme();
    const existing = built[theme.name];
    if (existing !== undefined) {
      return existing;
    }
    const made = factory(theme);
    built[theme.name] = made;
    return made;
  };
}
