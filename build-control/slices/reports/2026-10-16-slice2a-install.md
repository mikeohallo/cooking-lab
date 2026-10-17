# Slice 2a on the Fold — export buttons are on screen

16 October 2026. TEST APK built from `main` and installed on the Fold, to see
the two new export controls on the real device. The export buttons were **not
tapped**: Mike tests the share sheet himself.

## Commit built

`820ffd1` — *feat: slice 2a — export everything as a portable backup, or one
cook as text*, the tip of `main` after a fast-forward pull. Nothing local was
carried in; the working tree was clean before and after the pull.

`npm ci` was run first, as `package.json` had gained `expo-sharing` — installed
as `expo-sharing@57.0.23`.

The first `npm ci` failed with `EBUSY` trying to unlink a lint-cache jar under
`node_modules/expo-modules-core/android/build`. Two JVMs left over from an
earlier build (a Gradle worker and the Kotlin compile daemon) still held the
file. `./gradlew --stop` released one; the other two were stopped directly, and
`npm ci` then completed. Nothing was lost — both were build daemons, and the
build spawns fresh ones.

## Checks

All four pass, as counts:

| Check | Result |
| --- | --- |
| `npm run check:secrets` | 172 files scanned, nothing key-shaped found |
| `npm run typecheck` | clean, no diagnostics |
| `npm run lint` | clean, no findings |
| `npm test` | 567 tests in 30 suites, 567 passed, 0 failed |

## Build

Built per the README, TEST variant, arm64-v8a only:

```bash
APP_VARIANT=test npx expo prebuild --platform android --clean
cd android
APP_VARIANT=test ./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Both steps succeeded; Gradle exited 0. One caveat worth recording: the Gradle
console output was captured to an empty file, so **no `BUILD SUCCESSFUL` line
was actually read**. The build was confirmed from the artefact instead — a
fresh APK, a clean exit code, and the identity checks below.

`android/app/build/outputs/apk/release/app-release.apk`, 47,729,282 bytes
(46 MB).

Identity read back from the APK itself: package
`com.cookinglab.personal.test`, label `Cooking Lab Test`, versionName `0.0.0`,
versionCode 1, minSdk 24, targetSdk 36. The TEST package, as required.

Signed with the shared Android **debug** key
(`CN=Android Debug, OU=Android, O=Unknown`) that `expo prebuild` regenerates.
It is the same well-known key the installed copy already carried, which is why
an in-place update was accepted at all — a different key would have been
rejected outright and the data could not have been kept.

## Install

Installed with `adb install -r`. No uninstall, no `pm clear` — the existing
synthetic TEST data was kept, as asked.

`Success` in **47 seconds**. The ten-minute hang recorded in the previous
rebuild did not recur, because the lesson from it was applied: the Fold was
checked as unlocked first (`deviceLocked=0`, keyguard not showing) *before*
the install was started. Worth keeping: unlock first and this is a 47-second
job, not a ten-minute mystery.

Data was preserved, and the package record proves it both ways:

* `codePath` changed to a new hash — the new APK really is installed.
* `firstInstallTime` is still `2026-09-03 14:27:44` — updated in place, not
  removed and re-added, so the synthetic cooks survived. A wipe would have
  reset it.

`lastUpdateTime` is `2026-10-16 18:50:21`.

Both synthetic cooks are present and unchanged after the install, as the
screenshots show.

## A note on capturing the screens

The Fold reports two displays, and `adb exec-out screencap -p` with no display
named wrote its *warning about that* into the PNG and corrupted it. The cover
screen (968 × 2376) was the one powered on — the Fold was closed — so both
screenshots were taken from it by naming that display explicitly and sending
the warning to `/dev/null`. Anyone capturing the Fold again should name the
display rather than trust the default.

## What the screenshots show

Launched with
`adb shell am start -n com.cookinglab.personal.test/.MainActivity`; the window
came up focused as `MainActivity`.

**Home — `screens/2026-10-16-slice2a-home-export.png`**

The title "Cooking Lab Test" with the red **TEST** badge, the pink notice that
this build holds no real cooking data, the green **New Cook** button,
**Continue cooking** with the open cook from Fri 16 Oct, 2:41 am and its *Open*
chip, and **Recent cooks** with the reviewed cook from Fri 16 Oct, 1:54 am
carrying "Great crust, needed more acid". Below **See all history** sits the
new quiet control: **Export everything**.

This is the bottom of Home. The screen was swiped up to be sure, and the
capture is identical — all of Home fits the cover display at once, with clear
space below the export button. Nothing is clipped and nothing is cut off.

**The reviewed cook — `screens/2026-10-16-slice2a-cook-export.png`**

Reached by tapping the reviewed cook on Home. The header shows *‹ Back* and the
**Reviewed** chip; then "Untitled cook", Fri 16 Oct, 1:54 am; the **Verdict**
card "Great crust, needed more acid"; the timeline note "Seared hard, 4 min a
side" at 2:05 am; and the temperature card **62.5°C centre** at 2:06 am. Below
the timeline sits the second new control: **Export this cook**.

The composer is absent, which is correct — the cook is reviewed, so the screen
is read-only, and that same read-only condition is what puts *Export this cook*
on screen at all.

Neither export button was tapped, so neither screenshot shows an "Export ready"
notice. That is the next thing to see, and it is Mike's to test.

## One loose end, not a blocker

Both export buttons define hint text in `src/content/product.ts`
(`EXPORT_EVERYTHING_HINT`, "Every cook as one file you can keep anywhere.
Nothing in the app changes."; `EXPORT_COOK_HINT`, "As a text file you can read,
send or keep.") and both pass it to `ActionButton`. Neither hint renders on the
device, and the screenshots show the bare labels.

The cause is in `ActionButton`: the hint is rendered only when
`size === 'hero'`, and the quiet export buttons do not set a size. So the hint
is dropped by the component, not by this slice — **New Cook** is a hero button,
which is why its hint does show. No test asserts the hint text either.

Nothing is broken and the buttons read clearly without it, so this was left
alone. It is a product call, not a technical one: either the two hint strings
should go, or quiet buttons should be allowed to carry a hint. Worth raising
with Mike before the share sheet work, since the hints are where the reassuring
"nothing in the app changes" line was meant to live.
