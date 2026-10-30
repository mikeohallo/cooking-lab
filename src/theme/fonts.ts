/**
 * Plus Jakarta Sans, the app's typeface (Design Baseline v2, 30 October 2026).
 *
 * Five weights — 400, 500, 600, 700 and 800 — taken from
 * `@expo-google-fonts/plus-jakarta-sans` one file at a time, so only those five
 * go into the app. Each is a `require` of a font file in the package, which
 * Metro bundles into the APK as an asset: the fonts are never fetched over the
 * network, and the app makes no network calls for them or for anything else.
 * The font is under the SIL Open Font License 1.1 (see the README).
 *
 * Android does not pick a weight out of a family the way the web does, so
 * each weight is its own family name, and `AppText` asks for the right one by
 * the weight in the type scale. If the fonts could not be loaded, nothing asks
 * for them and the system sans is used with the same weights.
 */

import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { createContext, useContext } from 'react';
import type { TextStyle } from 'react-native';

export const FONT_FILES = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} as const;

export type FontFamily = keyof typeof FONT_FILES;

type Weight = 400 | 500 | 600 | 700 | 800;

const FAMILY_BY_WEIGHT: Readonly<Record<Weight, FontFamily>> = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
};

/** The nearest of the five bundled weights to a style's `fontWeight`. */
export function bundledWeight(weight: TextStyle['fontWeight']): Weight {
  const numeric =
    weight === undefined || weight === 'normal'
      ? 400
      : weight === 'bold'
        ? 700
        : typeof weight === 'number'
          ? weight
          : Number.parseInt(weight, 10);
  if (!Number.isFinite(numeric) || numeric <= 450) {
    return 400;
  }
  if (numeric <= 550) {
    return 500;
  }
  if (numeric <= 650) {
    return 600;
  }
  if (numeric <= 750) {
    return 700;
  }
  return 800;
}

/**
 * The style that draws text in Plus Jakarta Sans at a weight: the family for
 * that weight, and `fontWeight: 'normal'` so Android does not thicken an
 * already-bold file a second time.
 */
export function fontStyleFor(weight: TextStyle['fontWeight']): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  return { fontFamily: FAMILY_BY_WEIGHT[bundledWeight(weight)], fontWeight: 'normal' };
}

/** Whether Plus Jakarta Sans has loaded. False until it has, and if it failed. */
export const FontsReadyContext = createContext(false);

export function useFontsReady(): boolean {
  return useContext(FontsReadyContext);
}
