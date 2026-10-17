import { execSync } from 'child_process';
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
/**
 * The commit this config is being read at, for stamping into the APK's
 * version name (`plugins/withBuildCommit.js`). `-dirty` when the working tree
 * has changes, so a build that is not exactly a commit says so on the
 * artefact. `unknown` outside a git checkout, never a guess.
 */
function buildCommit(): string {
  const run = (command: string) =>
    execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    const commit = run('git rev-parse --short=7 HEAD');
    return run('git status --porcelain') === '' ? commit : `${commit}-dirty`;
  } catch {
    return 'unknown';
  }
}

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

  // One drawing, two icons: the TEST app carries a red TEST tag inside the
  // launcher-safe zone so the two apps are told apart on the home screen.
  // Sources and the rendered layers live in assets/icon/.
  const icon = `./assets/icon/${requested}-icon.png`;
  const adaptiveForeground = `./assets/icon/${requested}-adaptive-foreground.png`;

  return {
    ...config,
    name: identity.name,
    slug: 'cooking-lab',
    scheme: 'cookinglab',
    icon,
    // The first version a real kitchen installs. Bump `versionCode` with every
    // production build that follows; Android will not update an installed app
    // to the same code.
    version: '0.1.0',
    orientation: 'default',
    platforms: ['android'],
    android: {
      package: identity.androidPackage,
      versionCode: 2,
      adaptiveIcon: {
        foregroundImage: adaptiveForeground,
        // The app's sage, from src/theme/tokens.ts.
        backgroundColor: '#526A55',
      },
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: true,
      // Cooking Lab needs no device capabilities yet. These are pulled in by
      // transitive Expo/React Native tooling, not requested by Cooking Lab, so
      // they are stripped from the merged manifest. INTERNET is deliberately
      // retained: the Metro development client cannot connect without it.
      //
      // The two biometric entries arrived with `expo-secure-store`, which
      // declares them because it *can* gate a value behind a fingerprint. This
      // app does not: the database key is stored without `requireAuthentication`
      // (see `src/data/native/expoSecureStore.ts`), because the store is opened
      // before the first frame is drawn. An unused permission on the app's
      // listing is a claim about the app that is not true, so it is stripped by
      // the same rule as the rest. Wanting a biometric gate later means removing
      // these two lines deliberately, which is the point.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.VIBRATE',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      ],
    },
    plugins: [
      'expo-router',
      'expo-status-bar',
      // The local database is encrypted at rest. `useSQLCipher` swaps the
      // bundled SQLite for SQLCipher in the native build; the key is applied to
      // each connection by `src/data/sqlite/connection.ts` and is generated and
      // held by `src/data/sqlite/keyProvider.ts`. It never appears here, and it
      // never appears in a backup.
      ['expo-sqlite', { android: { useSQLCipher: true } }],
      // Left at its default `configureAndroidBackup: true`, which is the
      // module's normal behaviour: the key is excluded from Android Auto
      // Backup, because a key copied off the device is a key that is no longer
      // only on the device. This is not the recovery strategy — the portable
      // Cooking Lab backup is, and it is deliberately independent of this key.
      'expo-secure-store',
      // Production builds are signed with Cooking Lab's own key, read from
      // the building machine's ~/.gradle/gradle.properties — never from this
      // tree. A production build without it fails; it never uses the debug
      // key. TEST builds are left on the debug key. See the plugin's header.
      ['./plugins/withReleaseSigning', { variant: requested }],
      // Both variants: the APK's version name carries the commit it was
      // built from, e.g. `0.1.0 (e24bfd6)`. See CLAUDE.md, "Builds".
      ['./plugins/withBuildCommit', { commit: buildCommit() }],
    ],
    extra: {
      appVariant: requested,
      // The routes live in `app/`, and that is pinned rather than left to
      // detection: Expo silently prefers a `src/app` folder over `app` when one
      // exists, which is exactly how the first slice-1 TEST build shipped with
      // no Home screen. `__tests__/routerRoot.test.ts` holds this in place.
      router: { root: 'app' },
    },
  };
};
