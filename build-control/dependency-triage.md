# Dependency triage

18 October 2026, against the lockfile at this commit. Raised by an outside
review on 17 October: `npm audit` listed 11 advisories, one critical.

**How to read this.** In an Expo app almost everything is a "dependency" to
npm, including the build tools, so `npm audit --omit=dev` doesn't separate
what ships from what doesn't. The column that matters is *in the APK*: whether
the code is inside the JavaScript bundle on the phone, or only runs on the
building machine (Metro, the Expo CLI, Jest). The app makes no network calls
and runs no server, so build-time tools never see input from anyone else.

## Fixed

Updated within their existing version ranges (`npm update`; seven lockfile
entries, nothing else moved):

| Package | Was → now | Advisory | Pulled in by | In the APK |
|---|---|---|---|---|
| `shell-quote` | 1.10.0 → 1.12.0 | **critical** · command injection in `quote()` ([GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)) | `react-native` → `react-devtools-core` (the dev server's "open in editor") | No |
| `compression` | 1.8.1 → 1.8.2 | high · memory-leak DoS ([GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95)) | `expo` → `@expo/cli` (dev server) | No |
| `source-map-js` | 1.2.1 → 1.2.2 | high · event-loop DoS ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)) | `@expo/metro-config` → `postcss` | No |
| `brace-expansion` | 1.1.18 → 1.1.21, 5.0.9 → 5.0.12 | high · three DoS advisories ([GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)) | `minimatch`, in Jest and Metro | No |

## Accepted, 18 October 2026

No fix exists within the SDK 57 versions, or the only fix is a major upgrade
that isn't worth its risk for code that never sees outside input.

| Package | Advisory | Pulled in by | In the APK | Hostile input? | Why accepted, and when it goes |
|---|---|---|---|---|---|
| `decode-uri-component` 0.2.2 | moderate · slow decoding of malformed percent-encoding ([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)) | `expo-router` → `query-string` 7 | **Yes** (link parsing) | Only a crafted `cookinglab://` link that the phone's owner taps; worst case the app hangs until closed, no data touched | The patched 0.5 is ESM-only and `query-string` 7 can't load it; the fix arrives with `expo-router` 58. Take it with the SDK 58 upgrade. |
| `node-forge` 1.4.0 | high · RSA PKCS#1 v1.5 signature check too lenient ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)) | `@expo/cli`, `@expo/code-signing-certificates` | No | No: used for iOS code signing and update code signing, neither used here | No patched release yet. Recheck when one ships. |
| `braces` 3.0.3 | high · stack-exhaustion DoS on deeply nested patterns ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) | `micromatch`, in Jest and Metro | No | No: patterns come from this repo's own config | No patched release yet. |
| `sprintf-js` 1.0.3 | moderate · DoS via unbounded precision ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)) | Jest's coverage tooling (`js-yaml` 3 → `argparse` 1) | No | No | Test-only; no patched release in the range used. Goes with Jest 30. |
| `uuid` 7.0.3 | moderate · missing bounds check when a buffer is passed to v3/v5/v6 ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)) | `@expo/config-plugins` → `xcode` (iOS project editing) | No | No: this app is Android-only, and `xcode` only calls `uuid.v4()`, which the advisory doesn't affect | Fix is a forced major jump (11.x) under a tool that never runs here. |

`npm audit` also lists about 60 other package names. Those are the packages
that depend on the ones above (Expo, Jest, Metro, React Native's tooling), not
separate advisories.

## Added in slice 3, 22 October 2026

Two packages for photographs, both first-party Expo modules at their SDK 57
versions. Neither adds an advisory: `npm audit` reports the same five packages
as before (`braces`, `decode-uri-component`, `node-forge`, `sprintf-js`,
`uuid`), with nothing critical.

| Package | Version | Why | In the APK | What it brought with it |
|---|---|---|---|---|
| `expo-image-picker` | `~57.0.20` | The camera, and Android's system photo picker | **Yes** | One dependency, `expo-image-loader ~57.0.1`. Four Android permissions, three of them unwanted — see below. |
| `expo-image-manipulator` | `~57.0.21` | Re-encoding a photograph as a capped JPEG | **Yes** | The same `expo-image-loader`. Declares no permissions. |

**The permissions were the thing to check.** `expo-image-picker`'s own manifest
declares `CAMERA` (wanted) plus `READ_EXTERNAL_STORAGE` and
`WRITE_EXTERNAL_STORAGE` under `maxSdkVersion="32"`, and its config plugin adds
`RECORD_AUDIO` by default because the module can also record video. None of
those three is needed: a picture is chosen through Android's own photo picker,
which runs outside the app, and Cooking Lab records no sound. All three are
refused in `app.config.ts` — `RECORD_AUDIO` twice over, by
`microphonePermission: false` on the plugin and by `blockedPermissions` — and
`READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` are blocked ahead of a future version
asking for them. The merged manifest is `INTERNET` and `CAMERA` and nothing
else, which `__tests__/androidPermissions.test.ts` now works out from the
installed modules and holds in place.

**Metadata is not left to the module.** `expo-image-manipulator` re-encodes
from a decoded bitmap, which normally drops EXIF as a side effect — but that is
incidental behaviour, not a contract, and nothing in the app would notice the
day it changed. The bytes are therefore checked and cleaned by the app's own
code before anything is stored (`src/data/photos/jpeg.ts`), and
`__tests__/photoMetadata.test.ts` proves it against a JPEG carrying a GPS
block.

## Added in 0.2.2, 30 October 2026

One package, a first-party Expo module at its SDK 57 version. It was already in
the tree as a dependency of `expo` itself (`~57.0.1`, locked at 57.0.1); 0.2.2
makes it a direct dependency because the app now calls it. Installing it took
the newest version in that same range, 57.0.2, and the lockfile change is that
one entry and the new line in the root's dependencies. No other package was
added or moved.

| Package | Version | Why | In the APK | What it brought with it |
|---|---|---|---|---|
| `expo-keep-awake` | `~57.0.1` (57.0.2 installed) | Keeping the screen on while an open cook's page is in front | **Yes** | Nothing new: no dependencies of its own, and an empty Android manifest. It sets the window's keep-screen-on flag, which needs no permission; it takes no wake lock, so no `WAKE_LOCK`. `__tests__/androidPermissions.test.ts` now says so. |

The merged manifest is still `INTERNET` and `CAMERA` and nothing else.

`npm audit --audit-level=critical` passes (nothing critical). On this date it
lists `decode-uri-component`, `node-forge` and `uuid` as above, and two names
that are new to this file, `deepmerge` and `zod`. Neither came with
`expo-keep-awake` — the package set did not change — so they are advisories
published since 18 October against packages already in the tree. Both are
build-time (`@expo/cli` and its config tooling). `braces` and `sprintf-js` no
longer appear. A full re-triage is left for the next dependency pass.

## Added in 0.3.0, 30 October 2026

Two packages for the typeface, Plus Jakarta Sans (Design Baseline v2).

| Package | Version | Why | In the APK | What it brought with it |
|---|---|---|---|---|
| `expo-font` | `~57.0.3` (57.0.4 installed) | Loading the bundled font files before the first screen | **Yes** | Nothing new. It was already in the tree under `expo` and `expo-router` at 57.0.3; installing it directly took 57.0.4, the newest in the SDK 57 range, and every copy is now that one. Its Android manifest is empty: no permissions. |
| `@expo-google-fonts/plus-jakarta-sans` | `^0.4.2` | The font files | **Yes**, five of its fourteen files (400, 500, 600, 700 and 800), each `require`d on its own in `src/theme/fonts.ts` | Nothing: no dependencies, no install scripts, no native code. Font files and a few lines of JavaScript that `require` them. |

**Licence.** The font files are under the **SIL Open Font License 1.1**
(`LICENSE_FONT` in the package; copyright the Plus Jakarta Sans Project
Authors); the package's own JavaScript is MIT. The OFL lets the font be
bundled in an app and shipped; it may not be sold on its own, and a modified
version may not use the reserved name. Neither applies here.

**Never fetched.** Each file is a `require` of a file in the package, so
Metro bundles it into the APK as an asset and `expo-font` loads it from
there. Nothing is downloaded at run time; the app still makes no network calls.

The merged manifest is still `INTERNET` and `CAMERA` and nothing else.
`npm audit --audit-level=critical` passes. On this date it lists
`decode-uri-component`, `deepmerge`, `node-forge`, `uuid` and `zod`, as
in 0.2.2; neither new package adds one.

## In CI

CI runs `npm audit --audit-level=critical` after installing. A new critical
advisory anywhere in the tree turns the build red. High and moderate ones
don't; they are triaged here, with a date. A green badge does not mean
`npm audit` is empty.
