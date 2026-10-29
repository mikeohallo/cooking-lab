# Cooking Lab — Core loop walkthrough on the Fold

**Report date:** 16 October 2026
**Capture:** 16 October 2026, 02:03–02:08, device local time
**Author:** Claude Code (implementation engineer)

A full pass through the slice 1 loop on the device, driven entirely by
`adb input`: note, temperature reading, verdict, History. **The loop works end
to end and every write persisted.** One real defect was found: the soft keyboard
hides the composer, which is covered in section 6.

## Subject

| | |
|---|---|
| APK | built from `29591ab`, SHA-256 `301f3678eb2eb317a64236006a4cc3946fa7931bda1fba3246a0419f1f0c7cb5` |
| Package | `com.cookinglab.personal.test` |
| Device | the Fold, serial `[serial redacted]` |
| Display | cover display, 968 × 2376 (Fold closed) |
| Starting point | the open "Untitled cook" created at 01:54 and recorded in [`2026-10-16-fix-verification.md`](2026-10-16-fix-verification.md) |

Input was `adb shell input tap`, `input text` and `input keyevent` only; no
other automation was used. Spaces had to be sent as `%s`, which `input text`
converts back to real spaces — the on-screen result was checked each time.

## 1. The note — [`screens/2026-10-16-loop-1-note.png`](screens/2026-10-16-loop-1-note.png)

Tapping the "What's happening?" field, typing `Seared hard, 4 min a side` and
tapping **Send** replaced the "Nothing noted yet" empty state with a white
timeline card reading **"Seared hard, 4 min a side"** above a grey **2:05 am**
timestamp. The composer reset to its placeholder. The header still reads
"Untitled cook / Fri 16 Oct, 1:54 am", and **Finish & review** remains top
right.

## 2. The temperature reading — [`screens/2026-10-16-loop-2-temperature.png`](screens/2026-10-16-loop-2-temperature.png)

Tapping **Temperature** opens an entry row above the composer: a narrow `°C`
field, a wider "Where? (optional)" field, and **Cancel** / **Add reading**.
Entering `62.5` and `centre` and tapping **Add reading** added a second
timeline entry, visually distinct from the note — a peach-tinted card showing
**62.5°C** in large amber type, with **centre** and **2:06 am** beside it. The
entry row collapsed back to the normal composer. The decimal and the location
both survived, and the unit is Celsius as expected.

## 3. The review — [`screens/2026-10-16-loop-3-review.png`](screens/2026-10-16-loop-3-review.png)

**Finish & review** opens a review screen headed "Untitled cook / Review · Fri
16 Oct, 1:54 am" with a large **"How was it?"** box (placeholder "Say it the way
you would tell someone at the table."), an optional **"One thing to change next
time"** box (placeholder "Pull it earlier. More acid. Keep the tray."), a
**Suggestions** panel reading **"AI suggestions aren't connected yet — Your
verdict is the record. Suggestions arrive in a later version; nothing is missing
from this cook."**, a **Raw evidence** heading below the fold, and a **Finish
review** button pinned at the bottom.

Typing `Great crust, needed more acid` and tapping **Finish review** returned to
the cook, now closed: the top-right control has changed from the
**Finish & review** button to a pale green **Reviewed** status chip, and a
**Verdict** card sits at the top of the timeline carrying "Great crust, needed
more acid", above the note and the temperature card. The composer is gone, as a
reviewed cook takes no further entries.

## 4. History — [`screens/2026-10-16-loop-4-history.png`](screens/2026-10-16-loop-4-history.png)

Going **‹ Back** reaches Home, which has changed shape now that content exists:
the "Nothing cooked yet" card and the Cook → Observe → Review → Learn → Cook
Again chip chain are both gone, replaced by a **Recent cooks** section holding
one card — "Untitled cook / Fri 16 Oct, 1:54 am / Great crust, needed more
acid" — above a **See all history** button.

**See all history** opens **History**: filter chips **All** (selected, dark
green) / **Open** / **Reviewed**, and the same single cook card showing title,
start time and the verdict as its summary line. The verdict, not the first note,
is what represents a reviewed cook in both lists.

## 5. What persisted

Every write survived and was read back by a different screen from the one that
made it:

| Written | Shown back on |
|---|---|
| note "Seared hard, 4 min a side" | cook timeline, review screen |
| reading 62.5 °C / centre | cook timeline, review screen |
| verdict "Great crust, needed more acid" | cook timeline, Home card, History card |
| status open → reviewed | **Reviewed** chip, History filters |

Timestamps advanced correctly with the device clock (01:54 cook, 02:05 note,
02:06 reading) and the cook's own start time stayed fixed at 01:54 throughout.

## 6. What went wrong — the keyboard hides the composer

**This is the one real defect, and it makes the loop awkward to drive by hand.**

When the soft keyboard opens, the composer is not resized above it — it is
pushed off-screen entirely.

- [`screens/2026-10-16-loop-issue-keyboard-covers-composer.png`](screens/2026-10-16-loop-issue-keyboard-covers-composer.png)
  shows the state straight after typing the note: the keyboard occupies the
  lower third, and the text field, **Temperature** and **Send** are all absent.
  The text had in fact been entered — the IME's own suggestion strip reads
  "side | wide | slide" — but nothing the person typed is visible, and **Send**
  cannot be reached.
- [`screens/2026-10-16-loop-issue-keyboard-covers-temperature.png`](screens/2026-10-16-loop-issue-keyboard-covers-temperature.png)
  is worse. Tapping **Temperature** auto-focuses the `°C` field, so the keyboard
  opens immediately and covers the entry row; only the top few pixels of the two
  fields are visible, and **Add reading** is not.

Both times the fix was to dismiss the keyboard with `input keyevent 4`, after
which the composer reappeared with the typed text intact. Every value in this
walkthrough was therefore entered blind and confirmed only after hiding the
keyboard — a person typing on the Fold would be doing the same.

Worth noting: `app.config.ts` sets `softwareKeyboardLayoutMode: 'resize'`, so
this is not behaving the way the configuration asks. The cover display makes it
sharper — at 968 × 2376 the keyboard takes roughly the bottom third — but
nothing here suggests it is specific to the cover screen. No cause is
established in this report.

## 7. Limits

- **Cover display only**, Fold closed; the inner display was off and untested.
- **Not a clean-data run.** This continued the cook created at 01:54; app data
  was not cleared.
- **Paths not exercised:** Cancel on the temperature row, the optional "one
  thing to change next time" field, the **Open** and **Reviewed** History
  filters, reopening the cook from a History card, the **Raw evidence** section
  below the review fold, and any second cook.
- **One pass, one device.** No repetition, so nothing here speaks to
  intermittency.
- The cook and its entries are synthetic data left in the TEST store.
