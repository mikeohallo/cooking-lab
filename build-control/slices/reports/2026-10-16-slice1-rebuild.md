# Cooking Lab — Slice 1 Rebuild, Clean-Data Launch on the Fold

**Report date:** 16 October 2026
**Capture:** 16 October 2026, 00:52, device local time
**Author:** Claude Code (implementation engineer)
**Nature:** Build and device evidence. No application code, configuration,
dependency or native module was changed by this task.

## 1. Scope

Mike asked for a TEST APK built from the current `main`, installed onto a
**cleared** app data directory so the launch would be a genuine first run, then
launched with `am start` and observed for 8 seconds with logcat filtered to
`ReactNativeJS`. The purpose was to see the startup logging that `bebf86e`
restores.

**Headline result: the build and the clean-data launch both succeeded, but the
restored startup logging did not appear, because `console.log` calls are not
present in the release bundle.** Section 7 establishes this from the shipped
bundle. The fix in `bebf86e` is therefore not observable in a TEST APK, only
under Metro.

## 2. Source

| | |
|---|---|
| Pulled | `git merge --ff-only origin/main`, fast-forward `3377cd8..bebf86e` |
| Commit built | `bebf86e6da0bdd7051f1b463de99b9893daea336` |
| Subject | `fix: keep the navigator mounted from launch; restore startup logging; own not-found screen` |
| Working tree | clean before and after |

No divergence occurred on this pull: local was behind by one and ahead by none,
so the fast-forward introduced no merge commit.

**`main` moved on while this task ran.** The artefact below was built from
`bebf86e`. By the time this report was committed the tip was
`06a006460b85f2517ba0f6a84fe5e1b09ca27cce` (`chore: prepare the repository to go
public`), reached by a second clean fast-forward. That commit adds a secrets
scan, CI and a README section, and redacts the device serial from two earlier
reports; it changes no application code, so nothing in this report is affected.
The device serial is written here as `[serial redacted]`, following that
commit's convention, because this repository is being prepared to go public.

**Dependencies were not reinstalled.** `git diff --name-only 5a5032c..HEAD --
package.json package-lock.json` is empty, so `node_modules` was already at the
state established by the `npm ci` run during the previous build. This is a
deliberate deviation from the previous build's procedure, recorded here because
it means autolinking read an unchanged `node_modules`.

## 3. Build

```
APP_VARIANT=test npx expo prebuild --platform android --clean --no-install
APP_VARIANT=test ./gradlew :app:assembleRelease --max-workers=2 -Dorg.gradle.parallel=false
```

`BUILD SUCCESSFUL in 20m 52s` — 578 actionable tasks, 550 executed, 28
up-to-date. A full `prebuild --clean` was used so this artefact is directly
comparable with the previous one.

| | |
|---|---|
| APK | `android/app/build/outputs/apk/release/app-release.apk` |
| **SHA-256** | `fea70fae9b53c3baa4420328a7c4174abfb9800bc72a627e241f55ecea8737e7` |
| Size | 122,773,207 bytes |
| Variant | `APP_VARIANT=test` |
| Package / label | `com.cookinglab.personal.test` / Cooking Lab Test |
| `versionName` / `versionCode` | `0.0.0` / `1` |
| `minSdk` / `targetSdk` | 24 / 36 |
| ABIs | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` |
| Signing | template debug keystore (`CN=Android Debug`). No production signing identity exists or was used. |
| Variant stamp in APK | `extra.appVariant: "test"` |

**Comparison with the previous TEST APK** (commit `5a5032c`, SHA-256
`fcd9c80c21f1fe9b6d60ccf86951e6dcf2e538a0936b8ea967bd59c5da3f9b7c`,
122,773,147 bytes): this build is 60 bytes larger. No production package was
built at any point.

**Merged Android permissions** — unchanged from the previous build and from the
M1 baseline:

```
uses-permission: name='android.permission.INTERNET'
permission: com.cookinglab.personal.test.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
uses-permission: name='com.cookinglab.personal.test.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
```

## 4. Device procedure

Device: Samsung SM-F956B (Galaxy Z Fold 6), serial `[serial redacted]`.

```
adb shell pm clear com.cookinglab.personal.test
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb logcat -c
adb shell am start -n com.cookinglab.personal.test/.MainActivity
sleep 8
adb logcat -d
```

**`pm clear` was authorised explicitly by Mike**, on the stated basis that this
build holds synthetic data only. It is irreversible and it destroyed whatever
the TEST package held. This was the point: the previous capture's recorded
weakness was that it was an upgrade over existing data and therefore not a first
run.

**`adb logcat -c` is an addition to the requested sequence.** It was inserted
between the install and `am start` so the captured buffer belongs to this launch
alone; without it the previous launch's lines would still have been present and
nothing in the capture could have been attributed to this run.

Device responses, verbatim:

```
###### STEP 1: pm clear ######
Success
###### STEP 2: install -r ######
Performing Streamed Install
Success
###### STEP 3: logcat -c (added, see report) ######
cleared
###### STEP 4: am start ######
Starting: Intent { cmp=com.cookinglab.personal.test/.MainActivity }
###### STEP 5: wait 8 seconds ######
waited
###### STEP 6: liveness ######
32633
```

`firstInstallTime` remained 2026-09-03 14:27:44; `lastUpdateTime` became
2026-10-16 00:52:19. The process was alive at the end of the window and remained
alive on a later check.

## 5. Captured log — `ReactNativeJS`, verbatim

The full buffer held 2,660 lines. Filtered to `ReactNativeJS` it is one line,
reproduced exactly and in its entirety:

```
10-16 00:52:20.396 32633 32660 I ReactNativeJS: Running "main"
```

That is the complete `ReactNativeJS` output. `Running "main"` is emitted by
React Native itself, not by Cooking Lab.

A second `adb logcat -d` taken several minutes later, against the same uncleared
buffer, returned the same single line — so the expected output did not arrive
late, outside the 8-second window.

No `AndroidRuntime` line, no `ExceptionsManager`, no `FATAL`, no
`ReactNoCrashSoftException`, no unhandled rejection, and no ANR appeared at any
point.

## 6. What was expected and did not happen

`bebf86e` wires the logging that M1's device evidence depended on:

- `app/_layout.tsx:10` imports `describeStartup`
- `app/_layout.tsx:19` calls `console.log(describeStartup(result))`
- `app/+not-found.tsx:24` calls `console.log()` with the unmatched route

Neither the storage line nor the router line appeared. Both are absent, and the
app did not land on the not-found screen either — or if it did, it could not say
so.

## 7. Why — the release bundle contains no `console.log`

The APK's `assets/index.android.bundle` (2,161,384 bytes) was extracted and
searched as text. Occurrence counts:

| String searched | Occurrences |
|---|---|
| `Cooking Lab storage ` | **0** |
| `schema version` | **0** |
| `Cooking Lab router` | **0** |
| `no screen for` | **0** |
| `Back to Home` | 1 |
| `Cooking Lab` | 3 |

The only literal `console.*` reference in the entire bundle is a single
`console.error`, and its surrounding bytes place it inside a packed string table
rather than at a call site.

**This is conclusive, and the discriminator is `app/+not-found.tsx`.** That one
file contains both the surviving UI string `Back to Home` and the missing log
string `Cooking Lab router: no screen for …`. The module is unquestionably in
the bundle; its `console.log` is not. The same explains the storage line:
`describeStartup` is reachable only from a `console.log`, so once that call is
removed the function is unreferenced and its template string is eliminated with
it.

**The mechanism was not identified and is not asserted here.** There is no
`metro.config.js`, `babel.config.js` carries only `babel-preset-expo` with no
options, `babel-plugin-transform-remove-console` is not installed, and no
occurrence of `transform-remove-console`, `drop_console` or `removeConsole`
exists in `babel-preset-expo`, `@react-native/babel-preset` or
`@expo/metro-config`. The observation stands on the bundle contents regardless
of cause; identifying the cause is outstanding work.

## 8. Consequence for Build Control

`bebf86e`'s restoration of startup logging does not achieve its purpose in a
TEST APK. It will work under Metro, where the bundle is unminified, and that is
presumably where it was verified. It cannot produce the `created` / `opened`
distinction from a release build, which is the only kind of build installed on
the Fold.

So the position recorded in the previous diagnostic is unchanged: **a successful
startup and a silently hung one remain indistinguishable in logcat on a TEST
APK.** Restoring that evidence requires either a logging route that survives
release bundling, or accepting that this class of evidence can only come from a
development build.

A cheap, repeatable check for any future attempt — it needs no device:

```
unzip -p app-release.apk assets/index.android.bundle | grep -ac "Cooking Lab storage "
```

A non-zero count means the line can at least be reached.

## 9. Limits of this evidence

- **Clean data, single launch.** One launch, 8-second window, observed once.
  Nothing here speaks to intermittency.
- **No UI verification.** No screenshot was taken and neither the cover nor the
  inner display was checked, so whether the navigator fix in `bebf86e` corrects
  the "Unmatched Route" symptom is **not** established by this report.
- **The filter was `ReactNativeJS` only**, as requested. The full 2,660-line
  buffer was retained for the error scan in section 5 but is not reproduced
  here.
- **No test suite was run** and no typecheck was performed under this task.
- Nothing was rebuilt after the capture; the working tree was clean throughout.

## 10. Note on this report's location

`build-control/README.md` places implementation reports in
`build-control/reports/`. This file was written to
`build-control/slices/reports/` because Mike specified that path explicitly, as
with the launch diagnostic of the same date. It is build and device evidence,
not a milestone implementation report, and it grants no acceptance.
