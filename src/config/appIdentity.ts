import Constants from 'expo-constants';

import {
  DEFAULT_APP_VARIANT,
  isAppVariant,
  variantIdentity,
  type AppVariant,
  type VariantIdentity,
} from './variants';

type ExtraShape = { appVariant?: unknown };

/**
 * The variant baked into the installed build by `app.config.ts`.
 *
 * Read on demand rather than captured at module load: it keeps the value
 * observable in tests and avoids a hidden singleton. An absent or unrecognised
 * manifest value falls back to production, so a TEST-only affordance can never
 * appear by accident.
 */
export function getAppVariant(): AppVariant {
  const extra = Constants.expoConfig?.extra as ExtraShape | undefined;
  const candidate = extra?.appVariant;
  return isAppVariant(candidate) ? candidate : DEFAULT_APP_VARIANT;
}

export function getAppIdentity(): VariantIdentity {
  return variantIdentity(getAppVariant());
}

export function isTestBuild(): boolean {
  return getAppIdentity().showsTestIndicator;
}
