# Cooking Lab — Launch Screen on the Fold

**Report date:** 16 October 2026
**Capture:** 16 October 2026, 01:19, device local time
**Author:** Claude Code (implementation engineer)
**Image:** [`screens/2026-10-16-launch.png`](screens/2026-10-16-launch.png)

## Subject

| | |
|---|---|
| APK under test | built from `bebf86e`, SHA-256 `fea70fae9b53c3baa4420328a7c4174abfb9800bc72a627e241f55ecea8737e7` |
| Package | `com.cookinglab.personal.test` |
| Device | Samsung SM-F956B (Galaxy Z Fold 6), serial `[serial redacted]` |
| Display captured | cover display, 968 × 2376 |
| Image | PNG, 132,971 bytes, 968 × 2376 |

```
adb shell am start -n com.cookinglab.personal.test/.MainActivity
sleep 5
adb exec-out screencap -p -d <cover display id> > screens/2026-10-16-launch.png
```

Two procedural notes. The Fold was **closed**, so the cover display was the
active one and the inner display was powered off; nothing here describes the
inner display. And the app was already running and top-most from the launch
recorded in `2026-10-16-slice1-rebuild.md`, so `am start` reported
`Warning: Activity not started, intent has been delivered to currently running
top-most instance` — this is the resumed state of that same launch, not a cold
start. A first capture without `-d` was discarded: `screencap` prepends a
347-byte "[Warning] Multiple displays were found" message to stdout on this
two-display device, which corrupts the PNG. The committed image was verified to
begin with the PNG magic bytes and end with `IEND`.

## What is on screen

The screen shows expo-router's built-in **"Unmatched Route"** error page on a
pure black background, not any Cooking Lab screen: centred in the upper middle
is a monochrome line illustration of three overlapping sheets of paper, the
front one bearing a large grey question mark; beneath it the headline
**"Unmatched Route"** is set in large white type across two lines, followed by
the grey subtitle **"Page could not be found."**, and under that, in smaller
dim grey, the attempted route **`cookinglab:///`**; below that sit two blue
links reading **"Go back"** and **"Sitemap"** separated by a bullet. The Android
status bar across the top carries a USB icon at the left and a 100 % battery
pill with the clock reading 1:19 at the right, a thin scrollbar track is visible
at the extreme right edge about a fifth of the way down, and the system
three-button navigation bar (recents, home, back) sits on a light grey strip
along the bottom. No Cooking Lab branding, header, content, navigation or
styling appears anywhere on the display.

## What this establishes

1. **The symptom `bebf86e` set out to fix is still present.** That commit's
   message states the TEST build "opened on expo-router's 'Unmatched Route' page
   and its Sitemap link closed the app". It still does. Keeping the navigator
   mounted from the first frame did not resolve it.

2. **The custom not-found screen is not being used.** `bebf86e` added
   `app/+not-found.tsx`, which renders a `ScreenContainer`, a `ShellHeader`, a
   `StateNotice` and a **"Back to Home"** action. What is displayed instead is
   expo-router's *default* unmatched page, identifiable by its "Go back •
   Sitemap" links and the paper-stack artwork. The string `Back to Home` is
   present in the shipped bundle, so the module is in the build — but the route
   is not being resolved to it.

3. **The attempted route is `cookinglab:///`** — the app's own scheme with an
   empty path. The router is being handed that at launch and matching nothing,
   rather than resolving it to the index route at `app/index.tsx`.

4. **It is consistent with the logcat evidence, which stayed silent.** As
   `2026-10-16-slice1-rebuild.md` establishes, `console.log` calls are absent
   from the release bundle, so the `Cooking Lab router: no screen for …` line
   that `app/+not-found.tsx` would have logged could not have appeared even had
   that screen rendered. The silent log and this screen are not in conflict.

## Limits of this evidence

- **Cover display only.** The Fold was closed; the inner display was off and is
  not covered by this capture.
- **Resumed, not cold.** This is the state of the launch recorded in the
  previous report, resumed. A cold start was not performed under this task.
- **One capture, one moment.** No interaction was performed: the "Go back" and
  "Sitemap" links were not tapped, so the reported behaviour of Sitemap closing
  the app is neither confirmed nor refuted here.
- **Nothing was diagnosed beyond the image.** No root cause for the unmatched
  route is established by this report, and nothing was rebuilt, reinstalled or
  changed to produce it.
