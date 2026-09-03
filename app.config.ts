import type { ConfigContext, ExpoConfig } from 'expo/config';

// The reserved Android identities. Also read at runtime by src/config/variants.ts.
// Required as JSON because Expo's config loader compiles this file on its own and
// cannot resolve a nested TypeScript import.
import variantTable from './app.variants.json';

/**
 * Dynamic Expo configuration for Cooking Lab.
 *
 * The application variant is selected explicitly through the APP_VARIANT
 * environment variable:
 *
 *   APP_VARIANT=production  (default)  -> Cooking Lab       / com.cookinglab.personal
 *   APP_VARIANT=test                   -> Cooking Lab Test  / com.cookinglab.personal.test
 *
 * The two identities use different Android application ids and therefore occupy
 * separate OS sandboxes. Nothing TEST-only is reachable from the production
 * variant: the runtime reads `extra.appVariant`, which is written here.
 *
 * An unrecognised APP_VARIANT is a hard error, never a silent fall back to
 * production.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const requested = (process.env.APP_VARIANT ?? '').trim().toLowerCase() || 'production';
  const identity = (variantTable as Record<string, (typeof variantTable)['test'] | undefined>)[
    requested
  ];

  if (!identity) {
    throw new Error(
      `Unknown APP_VARIANT "${process.env.APP_VARIANT}". Expected "production" or "test".`,
    );
  }

  return {
    ...config,
    name: identity.name,
    slug: 'cooking-lab',
    scheme: 'cookinglab',
    version: '0.0.0',
    orientation: 'default',
    platforms: ['android'],
    android: {
      package: identity.androidPackage,
      versionCode: 1,
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: true,
      // Milestone 0 needs no device capabilities. These are pulled in by
      // transitive Expo/React Native tooling, not requested by Cooking Lab, so
      // they are stripped from the merged manifest. INTERNET is deliberately
      // retained: the Metro development client cannot connect without it.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
      ],
    },
    plugins: ['expo-router', 'expo-status-bar'],
    extra: {
      appVariant: requested,
    },
  };
};
