import variantTable from '../../app.variants.json';

/**
 * Cooking Lab application variants.
 *
 * The reserved Android identities live in `app.variants.json` at the repository
 * root. That file is the single source of truth: `app.config.ts` reads it at
 * build time to stamp the native identity, and this module reads it at runtime.
 * JSON rather than TypeScript because Expo's config loader compiles
 * `app.config.ts` on its own and cannot resolve a nested `.ts` import.
 *
 * This module is intentionally free of Expo/React Native imports so it can be
 * exercised by the test suite without a native environment.
 */

export type AppVariant = 'production' | 'test';

export type VariantIdentity = {
  /** Android display name. */
  readonly name: string;
  /** Android application id. Determines the OS sandbox. */
  readonly androidPackage: string;
  /** Whether the shell must show an unmistakable TEST indicator. */
  readonly showsTestIndicator: boolean;
};

export const DEFAULT_APP_VARIANT: AppVariant = 'production';

export const APP_VARIANTS: Readonly<Record<AppVariant, VariantIdentity>> = variantTable;

export function isAppVariant(value: unknown): value is AppVariant {
  return value === 'production' || value === 'test';
}

/**
 * Normalise a requested variant name.
 *
 * Kept identical to the guard in `app.config.ts`; `__tests__/appConfig.test.ts`
 * asserts the two agree for every input.
 */
export function normaliseVariantName(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) {
    return DEFAULT_APP_VARIANT;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed === '' ? DEFAULT_APP_VARIANT : trimmed;
}

/**
 * Resolve the requested variant.
 *
 * Anything unrecognised is a hard error rather than a silent fallback: a typo in
 * `APP_VARIANT` must never quietly produce a production identity, and production
 * must never quietly inherit TEST-only behaviour.
 */
export function resolveAppVariant(raw: string | undefined | null): AppVariant {
  const name = normaliseVariantName(raw);
  if (isAppVariant(name)) {
    return name;
  }
  throw new Error(`Unknown APP_VARIANT "${raw}". Expected "production" or "test".`);
}

export function variantIdentity(variant: AppVariant): VariantIdentity {
  return APP_VARIANTS[variant];
}
