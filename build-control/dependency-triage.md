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

## In CI

CI runs `npm audit --audit-level=critical` after installing. A new critical
advisory anywhere in the tree turns the build red. High and moderate ones
don't; they are triaged here, with a date. A green badge does not mean
`npm audit` is empty.
