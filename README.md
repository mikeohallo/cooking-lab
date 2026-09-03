# Cooking Lab

A private, local-first cooking notebook for a single Android device.

    Cook -> Observe -> Review -> Learn -> Cook Again

**Milestone 0 is the application shell only.** There is no persistence, no AI, no
network backend, no account and no cloud storage. Screens beyond Home state
plainly that they are not implemented yet.

## Baseline

| | |
|---|---|
| Framework | Expo SDK 57 (React Native 0.86, React 19.2) |
| Language | TypeScript, `strict` mode |
| Navigation | Expo Router (file-based, `app/`) |
| Package manager | npm |
| Platform | Android only |
| Native projects | Continuous Native Generation — `android/` is generated build output and is **not** committed |

## Application variants

The reserved Android identities live in [`app.variants.json`](./app.variants.json),
which is the single source of truth. `app.config.ts` reads it at build time to
stamp the native identity; `src/config/variants.ts` reads it at runtime.

| `APP_VARIANT` | Display name | Android package |
|---|---|---|
| *(unset)* / `production` | Cooking Lab | `com.cookinglab.personal` |
| `test` | Cooking Lab Test | `com.cookinglab.personal.test` |

The two packages occupy separate Android sandboxes and can be installed side by
side. An unrecognised `APP_VARIANT` is a hard error, never a silent fall back to
production. Only the TEST variant renders the TEST badge and notice; production
cannot reach that behaviour.

## Commands

```bash
npm run typecheck        # tsc --noEmit (strict)
npm run lint             # eslint
npm test                 # jest (jest-expo + React Native Testing Library)
npm run doctor           # expo-doctor
npx expo install --check # dependency compatibility against the SDK

# Inspect the resolved config without building
node node_modules/expo/bin/cli config --type public
APP_VARIANT=test node node_modules/expo/bin/cli config --type public
```

## Building the TEST APK

```bash
APP_VARIANT=test npx expo prebuild --platform android --clean
cd android
APP_VARIANT=test ./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

* Standalone — the JavaScript bundle is embedded, so **Metro is not required**.
* Signed with the shared, disposable Android **debug** keystore
  (`android/app/debug.keystore`). No production signing identity exists and none
  must be created outside a Build Control decision.
* Drop `-PreactNativeArchitectures` to build all ABIs instead of arm64-v8a only.

`APP_VARIANT` must be set for both the prebuild and the Gradle invocation: the
first stamps the native identity, the second embeds the resolved app config.

## Permissions

The app requests no device capabilities. `INTERNET` is retained because the Metro
development client cannot connect without it. Permissions pulled in transitively
by Expo tooling (`READ_/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`,
`VIBRATE`) are stripped via `android.blockedPermissions` in `app.config.ts`.

## Responsive foundations

The Samsung Fold cover display is a first-class target. Layout decisions come
from one pure function, `computeLayoutMetrics` in `src/layout/responsive.ts`,
rather than ad-hoc width checks:

* usable down to 320 dp with no horizontal scrolling;
* touch targets of 48 dp minimum, 64 dp for primary actions;
* safe-area insets on all edges;
* content column centred and capped at 560 dp so text never stretches across an
  unfolded screen;
* no fixed heights, so Android font scaling grows the layout instead of clipping.
