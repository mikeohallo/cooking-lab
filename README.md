# Cooking Lab

[![CI](https://github.com/mikeohallo/cooking-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/mikeohallo/cooking-lab/actions/workflows/ci.yml)

A private, local-first cooking notebook for a single Android device.

    Cook -> Observe -> Review -> Learn -> Cook Again

## About this project

Cooking Lab is a personal product built to answer one question: does a kitchen
get better at a dish when it keeps an honest record of what actually happened?
The app records a cook as it happens — notes, temperatures, later photos —
asks one question afterwards, and stores the answer in the cook's own words.
Evidence is kept strictly separate from interpretation: an assistant may
*propose* findings and lessons, but nothing enters history until the cook
approves it, and nothing the cook wrote is ever rewritten.

It is also an experiment in how a product leader builds software with AI.
The product owner sets direction, makes product decisions and tests on the
phone; Claude acts as architect and engineer, writing the code, the tests and
the records in `build-control/`; Claude Code on the owner's PC handles native
builds and device installs. The repository history, including the earlier
milestone process and the lighter "slices" process that replaced it, is left
intact on purpose — it is part of the record. The working rules are in
[`CLAUDE.md`](./CLAUDE.md); the current process and plan are in
[`build-control/slices/README.md`](./build-control/slices/README.md).

Privacy is the architecture, not a setting: encrypted on-device storage, no
account, no cloud backend, no analytics. The only remote call the app will
ever make is to an AI model, and that arrives in a later slice.

**Current state (slices 1 and 2a):** a cook can be started in one tap,
captured as notes and Celsius readings in a timeline, reviewed with a verdict
in the cook's own words, and found again in History. All of it is stored in the
encrypted local database, and all of it can leave the phone on demand — every
cook as one portable backup file, or one cook as plain text — through the
system share sheet. There is no AI, no photos, no restore, no network backend,
no account and no cloud storage yet; those arrive in later slices (see
`build-control/slices/`).

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
npm run check:secrets    # nothing key-shaped in the tree (also runs in CI)
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
  (`android/app/debug.keystore`), which is fine for a test app and nothing else.
* Drop `-PreactNativeArchitectures` to build all ABIs instead of arm64-v8a only.

`APP_VARIANT` must be set for both the prebuild and the Gradle invocation: the
first stamps the native identity, the second embeds the resolved app config.

## Building the production APK

```bash
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Same output path. The difference is the signature: a production build is
signed with Cooking Lab's own release key, which
[`plugins/withReleaseSigning.js`](./plugins/withReleaseSigning.js) wires into
the generated project on every prebuild. The key and its password live on the
building machine only, as four lines in that machine's
`~/.gradle/gradle.properties`:

```
COOKING_LAB_STORE_FILE=<absolute path to the .jks>
COOKING_LAB_STORE_PASSWORD=<password>
COOKING_LAB_KEY_ALIAS=cooking-lab
COOKING_LAB_KEY_PASSWORD=<password>
```

Without them a production build **fails** with a message naming what is
missing. It never falls back to the debug key: an app anyone could sign an
update for is not the real app. Nothing in this repository can hold the key —
`.gitignore` refuses `*.jks`, the pre-commit hook and CI refuse anything
key-shaped — and losing the key is the one unrecoverable event in this
project, so it is backed up outside the machine that builds with it.

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
