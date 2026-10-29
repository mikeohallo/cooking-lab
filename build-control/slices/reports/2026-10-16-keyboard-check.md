# Cooking Lab — Keyboard clearance check on the Fold

**Report date:** 16 October 2026
**Capture:** 16 October 2026, 02:41–02:42, device local time
**Author:** Claude Code (implementation engineer)

Verification that `fd86937` ("keep the composer above the keyboard on Android
15+") fixes the defect recorded in section 6 of
[`2026-10-16-loop-walkthrough.md`](2026-10-16-loop-walkthrough.md).

**It does. With the keyboard open, the note field, Send and Add reading are all
visible.**

| Control | Visible above the keyboard? |
|---|---|
| Note field (`What's happening?`) | **Yes** — with its typed text readable |
| **Send** | **Yes** |
| **Temperature** | **Yes** |
| `°C` field and `Where? (optional)` | **Yes** |
| **Add reading** | **Yes** |
| **Cancel** | **Yes** |

## Subject

| | |
|---|---|
| Commit | `fd869375b02267875697d33702959bb94dcd00fb` |
| **APK SHA-256** | `ab52221f30b8151a92794594cc137dca076bab5fa584c7359b3145e99d9520df` |
| Size | 123,117,391 bytes |
| Build | `BUILD SUCCESSFUL in 15m 29s` (`prebuild --clean`, then `assembleRelease`) |
| Package | `com.cookinglab.personal.test` |
| Device | the Fold, serial `[serial redacted]` |
| Display | cover display, 968 × 2376 (Fold closed; inner display off) |

## Procedure

No open cook existed, so a new one was started. This was confirmed rather than
assumed: History's **Open** filter showed "No cooks yet", while **All** listed
the single reviewed cook from the earlier walkthrough, whose data survived the
`install -r` upgrade.

```
adb shell am start -n com.cookinglab.personal.test/.MainActivity
# History -> Open filter -> empty, so:
adb shell input tap <New Cook>                 # new cook created 2:41 am
adb shell input tap <note field>               # keyboard opens
adb shell input text 'keyboard%stest'
-> screenshot 1, keyboard still up
adb shell input keyevent 4                     # dismiss keyboard
adb shell input tap <Temperature>              # entry row opens, keyboard opens
-> screenshot 2, keyboard still up
```

Both screenshots were deliberately taken **without** dismissing the keyboard,
since the keyboard being up is the whole condition under test. Captures used
`screencap -p -d <display-id>`; the display argument is required on this
two-display device. Both files were verified to begin with the PNG magic bytes
and end with `IEND`.

## Screenshot 1 — note field with the keyboard open

[`screens/2026-10-16-keyboard-1-note.png`](screens/2026-10-16-keyboard-1-note.png)
(190,052 bytes)

The keyboard occupies the bottom third. Directly above it, fully visible and
unclipped, sit the note field containing **"Keyboard test"** with the caret at
the end, and beneath it the **Temperature** and **Send** buttons. Above those a
divider separates the content area, which still shows the "Untitled cook /
Fri 16 Oct, 2:41 am" header and the "Nothing noted yet" card. Nothing the person
types is hidden, and **Send** can be tapped without dismissing the keyboard.

Compare with the previous build's
[`screens/2026-10-16-loop-issue-keyboard-covers-composer.png`](screens/2026-10-16-loop-issue-keyboard-covers-composer.png),
where the same moment showed no field, no Temperature and no Send at all.

## Screenshot 2 — temperature entry with the keyboard open

[`screens/2026-10-16-keyboard-2-temperature.png`](screens/2026-10-16-keyboard-2-temperature.png)
(215,851 bytes)

Tapping **Temperature** opens the entry row and focuses the `°C` field, so the
keyboard opens by itself. Above the keyboard, all of it visible: the `°C` field
with its caret, the **Where? (optional)** field, **Cancel** and **Add reading**,
and below them the note field still holding "Keyboard test" with **Temperature**
and **Send**. Every control needed to complete a reading is reachable.

Compare with
[`screens/2026-10-16-loop-issue-keyboard-covers-temperature.png`](screens/2026-10-16-loop-issue-keyboard-covers-temperature.png),
where only a few pixels of the two fields showed and **Add reading** was off
screen entirely.

## Smaller things noticed

None of these blocks anything; recorded so they are not lost.

1. **The text was auto-capitalised by the keyboard.** `keyboard test` was sent,
   and the field shows **"Keyboard test"**. That is Samsung's IME applying
   sentence case, not the app, and it would happen to a person typing too.
2. **The timeline is squeezed when the temperature row is open.** In screenshot
   2 the "Nothing noted yet" card is clipped mid-word by the composer's divider.
   The content area scrolls, so nothing is unreachable, but with the keyboard
   and the entry row both open the visible timeline is about a fifth of the
   screen.
3. **History's filtered empty state reads oddly.** With **Open** selected and no
   open cooks, the panel says "No cooks yet — Every cook you record will be
   listed here, newest first." A cook does exist; it is simply reviewed. The
   copy describes an empty database rather than an empty filter.

## Limits

- **Cover display only**, Fold closed. The inner display (1856 × 2160) is a
  different shape and was not tested.
- **One keyboard.** Only the default Samsung IME at its default height was
  used; no split, floating or third-party keyboard, and no landscape.
- **Nothing was submitted.** "Keyboard test" was left unsent and no reading was
  added, so this report says nothing about writes — those were covered in the
  walkthrough.
- The cook created at 02:41 is synthetic data left open in the TEST store.
