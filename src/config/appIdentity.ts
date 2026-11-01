import Constants from 'expo-constants';

import {
  DEFAULT_APP_VARIANT,
  isAppVariant,
  variantIdentity,
  type AppVariant,
  type VariantIdentity,
} from './variants';

type ExtraShape = { appVariant?: unknown; buildCommit?: unknown };

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

/**
 * The version and commit this build carries: the version in `app.config.ts`
 * and the commit it stamped into the APK's version name. `unknown` for either
 * that is missing, never a guess.
 */
export function getBuildStamp(): { readonly version: string; readonly commit: string } {
  const config = Constants.expoConfig;
  const extra = config?.extra as ExtraShape | undefined;
  const version = typeof config?.version === 'string' && config.version !== '' ? config.version : 'unknown';
  const commit =
    typeof extra?.buildCommit === 'string' && extra.buildCommit !== '' ? extra.buildCommit : 'unknown';
  return { version, commit };
}

/** "0.4.0 (abc1234) · 369 × 905": the build, and the window's size in dp, rounded. */
export function versionLine(
  stamp: { readonly version: string; readonly commit: string },
  width: number,
  height: number,
): string {
  return `${stamp.version} (${stamp.commit}) · ${Math.round(width)} × ${Math.round(height)}`;
}
