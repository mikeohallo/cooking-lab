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
  // Worked out once: stamped into the APK's version name, and carried in
  // `extra` for the version line at the foot of Home's ⋯ menu (0.4.0).
  const commit = buildCommit();
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
    // 0.4.0: the new look in light and dark, Side and cuisine, card photos
    // (part 1); the cover screen's screens (part 2); the inner screen's own
    // layouts, upright and sideways (part 3). 0.5.0: kitchen timers and
    // tabletop mode.
    // Bump `versionCode` with every production build that follows; Android will
    // not update an installed app to the same code.
    version: '0.5.0',
    orientation: 'default',
    // 0.4.0: light or dark follows the phone's own setting, and changes live
    // when the phone switches (src/theme/theme.tsx). expo-system-ui carries
    // this to Android. Android's dynamic colour (wallpaper colours) is never
    // used: every colour comes from src/theme/tokens.ts.
    userInterfaceStyle: 'automatic',
    platforms: ['android'],
    android: {
      package: identity.androidPackage,
      versionCode: 9,
      adaptiveIcon: {
        foregroundImage: adaptiveForeground,
        // The launcher icon's sage, from Design Baseline v1. The icon itself was
        // not part of 0.3.0's new look, so it keeps the colour it was drawn on.
        backgroundColor: '#526A55',
      },
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: true,
      // Cooking Lab asks for the camera, and for what kitchen timers need
      // (0.5.0, below), and strips everything else its dependencies declare. A permission on the app's
      // listing is a claim about what the app does, and a claim that is not
      // true is the kind of thing this product exists not to make.
      // `__tests__/androidPermissions.test.ts` works out what the merged
      // manifest will hold and fails if anything else appears.
      //
      // CAMERA is not listed here or in `permissions`: it arrives from
      // `expo-image-picker`'s own manifest, which is the honest place for it —
      // it is there because the module needs it, and the module is there
      // because the app takes photographs.
      //
      // INTERNET is deliberately retained: the Metro development client cannot
      // connect without it.
      //
      // The two biometric entries arrived with `expo-secure-store`, which
      // declares them because it *can* gate a value behind a fingerprint. This
      // app does not: the database key is stored without `requireAuthentication`
      // (see `src/data/native/expoSecureStore.ts`), because the store is opened
      // before the first frame is drawn. Wanting a biometric gate later means
      // removing these two lines deliberately, which is the point.
      //
      // The storage pair and RECORD_AUDIO arrived with `expo-image-picker`.
      // None of the three is needed: a picture is chosen through Android's own
      // photo picker, which runs outside this app and hands over the one file
      // the person chose, so there is no roll to be given access to; and
      // nothing in Cooking Lab records sound. RECORD_AUDIO is refused twice
      // over — `microphonePermission: false` on the plugin below stops it being
      // requested, and this list removes it if it ever is.
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.SYSTEM_ALERT_WINDOW',
        // VIBRATE was blocked here until 0.5.0; it is now asked for on
        // purpose, below, because a finished timer vibrates as it rings.
        'android.permission.RECORD_AUDIO',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      ],
      // Kitchen timers (0.5.0). Each is here because a timer has to ring on
      // time with the app closed and the phone asleep, and for nothing else.
      // `__tests__/androidPermissions.test.ts` holds the list to exactly this.
      permissions: [
        // To show a running timer's countdown and the "is done" alarm. Asked
        // for the first time a timer starts, never before.
        'android.permission.POST_NOTIFICATIONS',
        // To ring at the timer's end, to the second, with the phone asleep
        // (setExactAndAllowWhileIdle), as a clock app's timer does.
        // USE_EXACT_ALARM (0.5.0 fix, Mike's call 7 Nov): granted at install,
        // with nothing to ask and nothing to switch on. The 6 Nov and 7 Nov test
        // builds found SCHEDULE_EXACT_ALARM off out of the box on Android 14
        // and later, and a timer without it can't ring through silent or Do
        // Not Disturb. Google Play limits USE_EXACT_ALARM to clock, timer and
        // calendar apps; Cooking Lab is installed from a file, not from Play.
        'android.permission.USE_EXACT_ALARM',
        // The same for Android 12 and earlier, where USE_EXACT_ALARM doesn't
        // exist; on later versions the app already holds USE_EXACT_ALARM.
        'android.permission.SCHEDULE_EXACT_ALARM',
        // Restarting the phone clears every alarm: this puts running timers
        // back, and marks one that ended meanwhile as finished at its time.
        'android.permission.RECEIVE_BOOT_COMPLETED',
        // A finished timer vibrates while it rings, as well as sounding.
        'android.permission.VIBRATE',
        // The ring keeps sounding for up to five minutes with the app closed,
        // as a foreground service with its own notification and Stop.
        'android.permission.FOREGROUND_SERVICE',
        // That service's type: systemExempted, allowed for an app holding
        // USE_EXACT_ALARM or SCHEDULE_EXACT_ALARM that uses it to keep an
        // alarm sounding.
        'android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED',
      ],
    },
    plugins: [
      'expo-router',
      'expo-status-bar',
      'expo-system-ui',
      // The local database is encrypted at rest. `useSQLCipher` swaps the
      // bundled SQLite for SQLCipher in the native build; the key is applied to
      // each connection by `src/data/sqlite/connection.ts` and is generated and
      // held by `src/data/sqlite/keyProvider.ts`. It never appears here, and it
      // never appears in a backup.
      ['expo-sqlite', { android: { useSQLCipher: true } }],
      // The key is excluded from Android Auto Backup, because a key copied
      // off the device is a key that is no longer only on the device. This is
      // not the recovery strategy — the portable Cooking Lab backup is, and it
      // is deliberately independent of this key. Since the 0.5.0 fix the app
      // writes its own backup rules (`./plugins/withBackupRules`, below),
      // which leave out the secure store and the timers' store, so the
      // module's own rules are turned off here.
      ['expo-secure-store', { configureAndroidBackup: false }],
      // The camera and Android's photo picker. `microphonePermission: false`
      // is the whole of the configuration and it does two things: it stops the
      // plugin adding RECORD_AUDIO, which it does by default because the module
      // can also record video, and it has the plugin block that permission
      // itself. Cooking Lab records no sound. `cameraPermission` is left alone
      // on purpose — the camera is the one capability this app does want.
      ['expo-image-picker', { microphonePermission: false }],
      // Production builds are signed with Cooking Lab's own key, read from
      // the building machine's ~/.gradle/gradle.properties — never from this
      // tree. A production build without it fails; it never uses the debug
      // key. TEST builds are left on the debug key. See the plugin's header.
      ['./plugins/withReleaseSigning', { variant: requested }],
      // A native project prebuilt for one variant refuses to be built by
      // Gradle as the other, so the APK can't mix TEST's package with
      // production's screens. See the plugin's header.
      ['./plugins/withVariantGuard', { variant: requested }],
      // Both variants: the APK's version name carries the commit it was
      // built from, e.g. `0.1.0 (e24bfd6)`. See CLAUDE.md, "Builds".
      ['./plugins/withBuildCommit', { commit }],
      // Android Auto Backup: settings files as before, never the timers'
      // store or the secure store (0.5.0 fix). See the plugin's header.
      './plugins/withBackupRules',
    ],
    extra: {
      appVariant: requested,
      buildCommit: commit,
      // The routes live in `app/`, and that is pinned rather than left to
      // detection: Expo silently prefers a `src/app` folder over `app` when one
      // exists, which is exactly how the first slice-1 TEST build shipped with
      // no Home screen. `__tests__/routerRoot.test.ts` holds this in place.
      router: { root: 'app' },
    },
  };
};
