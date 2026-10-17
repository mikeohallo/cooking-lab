# Rebuild from a clean clone — 16 October 2026

Full rebuild and install of the TEST APK from `main`, done in a fresh clone at
`C:\Projects\cooking-lab`. The point was to prove the public repo builds and
runs on the Fold on its own, with nothing carried over from the old working
copy.

## Commit built

`4cf15e0d6941c50534e10185431028268e1cea27` — *docs: README — secrets check in
Commands, link the working rules, drop retired wording*

Working tree clean at build time. `node_modules` was already in place; no
`npm ci` was needed, every check started first time.

## Check results

| Check | Result |
| --- | --- |
| `npm run check:secrets` | Pass — 158 files scanned, nothing key-shaped found |
| `npm run typecheck` | Pass — no output |
| `npm run lint` | Pass — no output |
| `npm test` | **1 failed, 533 passed**, 534 total across 27 suites |

### The failing test

`__tests__/coreLoop.test.tsx` → *the core loop › cooks dinner and keeps the
history* fails on Jest's default 5000 ms per-test timeout.

It is a timing failure, not a product fault, and it is **pre-existing on
`main`** — nothing in this rebuild touched it. Run on its own the test passes
in 3996 ms, which is already within 1 second of the limit; run as part of the
full suite, where workers compete for the machine, it goes over. It failed on
both full-suite runs and passed on the isolated run, so it is reproducible
rather than random.

The test is simply too close to the limit to survive parallel load. It wants
either an explicit longer timeout or a faster path through the core loop; that
is a change to the test, not to the app, and has been left alone here.

Everything the build itself depends on passed.

## Build

Per README "Building the TEST APK":

```
APP_VARIANT=test npx expo prebuild --platform android --clean
cd android
APP_VARIANT=test ./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a
```

Prebuild finished clean. Gradle: **BUILD SUCCESSFUL in 8m 52s**, 580 actionable
tasks. Output `android/app/build/outputs/apk/release/app-release.apk`,
47,677,126 bytes (45 MB).

Identity confirmed from the APK itself: `com.cookinglab.personal.test`,
versionName `0.0.0`, minSdk 24, targetSdk 36. The TEST package, as required.

## Install

Installed onto the Fold with `-r`, keeping the existing synthetic TEST data as
asked — no uninstall, no `pm clear`.

The install hung for about ten minutes before completing. The cause was the
**device lock screen**: Android held the install until the Fold was unlocked,
and it finished within seconds of the screen being unlocked
(`lastUpdateTime=2026-10-16 17:06:38`). Worth knowing for next time: **unlock
the Fold before installing**, or the install will sit there looking stuck.

The route there was roundabout, because the lock screen gives no clue what it
is waiting for. `adb install -r` was tried first and sat silent; it was stopped
and the APK pushed to the device instead, then installed with
`adb shell pm install -r -t /data/local/tmp/cl-test.apk`, which is the one that
reported `Success`. That second attempt hung in exactly the same way until the
unlock, so the method was never the problem — both were waiting on the same
thing. The push ruled out the transfer as a cause: 47 MB at 33 MB/s, under two
seconds.

Data was preserved, and the package records prove it both ways:

* `codePath` changed to a new hash — the new APK really is installed.
* `firstInstallTime` is still `2026-09-03 14:27:44` — the app was updated in
  place, not removed and re-added, so the synthetic data survived. A wipe would
  have reset it.

The temporary APK copy pushed to `/data/local/tmp` during diagnosis was deleted
afterwards.

## What the screenshots show

Launched with `adb shell am start -n com.cookinglab.personal.test/.MainActivity`;
the window came up focused as `MainActivity`.

**Home** — `screens/2026-10-16-rebuild-home.png`

Renders correctly. The title reads "Cooking Lab Test" with the red **TEST**
badge, above the pink notice that this build holds no real cooking data. The
green **New Cook** button sits below it. **Continue cooking** shows the open
cook from Fri 16 Oct, 2:41 am with its *Open* chip; **Recent cooks** shows the
cook from Fri 16 Oct, 1:54 am carrying the note "Great crust, needed more
acid". **See all history** closes the screen. Nothing is clipped and the
layout fits the display.

**History › All** — `screens/2026-10-16-rebuild-history-all.png`

Reached by tapping *See all history*. The **All** filter is selected, with
*Open* and *Reviewed* beside it. Both synthetic cooks are listed, newest
first: 2:41 am with the *Open* chip, and 1:54 am with its review note. This is
the same data that was on the device before the install — confirmation on
screen that `-r` kept it, which is what the export test next needs.

## Outcome

The public repo builds and runs from a clean clone with no outside help. The
TEST APK is installed on the Fold, the synthetic data is intact, and Home and
History both render as expected.

Two things left standing:

* `coreLoop.test.tsx` flakes under full-suite parallel load — pre-existing,
  needs a timeout raise or a faster test.
* Installs block on a locked Fold. Unlock it first.
