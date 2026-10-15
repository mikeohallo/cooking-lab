# Cooking Lab — Fix verification on the Fold

**Report date:** 16 October 2026
**Capture:** 16 October 2026, 01:53–01:54, device local time
**Author:** Claude Code (implementation engineer)

Verification that `29591ab` ("the routes folder is `app/`, pinned — not
`src/app`") fixes the unmatched-route launch recorded in
[`2026-10-16-launch-screen.md`](2026-10-16-launch-screen.md). **It does.** The
app now opens on Home, and New Cook works.

## Subject

| | |
|---|---|
| Commit | `29591abd783d0ac976e76299d017cf9a7864f446` |
| APK | `android/app/build/outputs/apk/release/app-release.apk` |
| **SHA-256** | `301f3678eb2eb317a64236006a4cc3946fa7931bda1fba3246a0419f1f0c7cb5` |
| Size | 123,116,371 bytes |
| Build | `BUILD SUCCESSFUL in 16m 17s` (`prebuild --clean`, then `assembleRelease`) |
| Variant | `APP_VARIANT=test`, `com.cookinglab.personal.test` |
| Device | Samsung SM-F956B (Galaxy Z Fold 6), serial `[serial redacted]` |
| Display | cover display, 968 × 2376 (Fold closed; inner display off) |

The pin shipped: the APK's bundled `app.config` contains
`"router":{"root":"app"}` alongside `"appVariant":"test"`.

## Procedure

```
adb install -r app-release.apk
adb shell am force-stop com.cookinglab.personal.test
adb shell am start -n com.cookinglab.personal.test/.MainActivity
sleep 5   -> screenshot 1
adb shell input tap 483 747        # centre of the New Cook button
sleep 3   -> screenshot 2
```

This was a genuine cold start: `force-stop` left `pidof` empty, and the launch
produced a new process (6598) which was still alive and focused at both
captures. App data was **not** cleared, so the store carried over from the
previous session. Screenshots were taken with `screencap -d <display>`; without
the display argument this two-display device prepends a warning to stdout and
corrupts the PNG. Both files were verified to begin with the PNG magic bytes and
end with `IEND`.

## Screenshot 1 — launch

[`screens/2026-10-16-fix-verification-1-launch.png`](screens/2026-10-16-fix-verification-1-launch.png)
(211,974 bytes)

Home, on a warm off-white background. The title **"Cooking Lab Test"** sits at
the top beside a red **TEST** pill; under it the line "A private cooking
notebook for one kitchen. Everything stays on this device.", then a pink-bordered
notice reading "This is the Cooking Lab TEST build. It is installed alongside
the real app and holds no real cooking data." Below that is the primary dark
green **New Cook** button, captioned "Start now. Add a title later, or never."
Then a pale green empty-state card, **"Nothing cooked yet"**, explaining "A cook
can be as small as one sentence. Tap New Cook, say what happened, and come back
to it after dinner." Beneath it a vertical chain of outlined chips — **Cook →
Observe → Review → Learn → Cook Again** — separated by downward arrows, and the
top edge of a "See all history" card at the bottom cut off by the fold of the
screen. No unmatched-route page, no error.

## Screenshot 2 — after tapping New Cook

[`screens/2026-10-16-fix-verification-2-new-cook.png`](screens/2026-10-16-fix-verification-2-new-cook.png)
(120,060 bytes)

The active cook screen. A **‹ Back** link sits top left and a pale green
**Finish & review** button top right. The heading reads **"Untitled cook"** with
the timestamp **"Fri 16 Oct, 1:54 am"** under it. A pale green card says
**"Nothing noted yet"** — "Say what is happening below. One line is plenty.
Temperatures get their own card." The middle of the screen is empty, and a
composer is pinned above the keyboard line: a white text field with the
placeholder **"What's happening?"**, with a pale green **Temperature** button and
a dark green **Send** button beneath it.

## What this establishes

1. **The unmatched route is fixed.** The app opens on Home from a cold start.
   The root cause recorded in `29591ab` — Expo preferring `src/app` over `app`
   as the routes folder — matches the observed repair.
2. **Navigation works.** A single tap moved from Home to the active cook screen.
3. **A cook was genuinely created, not merely routed to.** The timestamp
   "Fri 16 Oct, 1:54 am" matches the device clock at capture, so the store
   produced a new record. This is a write reaching the SQLCipher database and
   coming back, which is the first on-device evidence of the slice 1 loop
   working.
4. **The TEST identity is correct and visible** — the red TEST pill and the
   build notice both render.

## Limits

- **Cover display only**, Fold closed; the inner display was off and is not
  covered here.
- **Two screens only.** Nothing beyond New Cook was exercised: no note was
  typed, no temperature added, and Finish & review, History and the cook detail
  route were not opened.
- **Data was not cleared** before this run, so this is not a first-run
  observation.
- The cook created at 01:54 is synthetic data left in the TEST store.
