# Acceptance run (TEST)

One record that the app, as built from one named commit, does what this
repository says it does. Run it when Mike's line asks for it, e.g.
"build cooking-lab at `<commit>`, test, and do the acceptance run". The line is the approval
(`CLAUDE.md` → "Builds"); this file only says what to check. Older reports stay
as they are, dated, as history.

Synthetic data only. Screenshots follow `CLAUDE.md` and
`build-control/slices/README.md` → "Checking evidence": Cooking Lab and nothing else,
status bar cropped if it shows other apps' notifications, no device
identifiers in the text. Never screenshot the share sheet: it shows contacts.

## Steps

1. **Build and install TEST** from the named commit, with `APP_VARIANT=test`
   for **both** prebuild and Gradle (the commands in the top-level `README.md`).
   If the variant guard stops the build, that's a finding: report it, don't
   work around it. `adb install -r` the APK.
2. **Read back what is installed**, and put the output in the report:
   - `adb shell dumpsys package com.cookinglab.personal.test | grep -E "versionName|versionCode|lastUpdateTime"`:
     the version name must be `<version> (<the named commit>)`, where `<version>`
     is the `version` in `app.config.ts` at the named commit (`git show <commit>:app.config.ts`),
     with no `-dirty`;
   - `apksigner verify --print-certs` on the APK: `CN=Android Debug`.
3. **Inner display** (the Fold open). Launch the TEST app and screenshot Home.
   The title reads *Cooking Lab Test* and the TEST badge and notice are visible.
4. **Write.** New Cook → a note → a temperature reading with a place →
   *Finish & review* → a verdict and a takeaway → *Finish review*. Use plainly
   synthetic text ("Acceptance cook", 63 °C, "centre"). Screenshot the
   reviewed cook.
5. **Relaunch.** `adb shell am force-stop com.cookinglab.personal.test`,
   launch again, open History. The cook is there, reviewed, with its note,
   reading and verdict. Screenshot.
6. **Export — checked as a file, not on the Fold.** Exporting hands the file
   to the share sheet, which leaves Cooking Lab, and nothing on the bench
   leaves Cooking Lab (`CLAUDE.md`, 0.2.2). So the export is not run on the
   Fold. The file it would hand over is checked on the PC instead: the export
   tests (`__tests__/exportService.test.ts`, `exportScreens.test.tsx`,
   `revisions.test.ts`) build the exact file from a real database and read it
   back. On the Fold, *Export this cook* is not tapped at all: the share sheet
   is another app's screen. Write "export: checked as a file by the test
   suite; not run on the Fold, left to Mike on his own phone". Up to 0.2.1
   this step saved the file through a files app on a Fold signed in to
   nothing; that route is retired.
7. **Cover display.** Ask Mike to close the Fold, launch the app and
   screenshot Home on the cover display. If he isn't there, write "cover
   display: not checked" rather than skipping it silently.

## 0.4.0 checks (test build)

For a TEST build of 0.4.0 or later, after the steps above. Synthetic data
only; each check *passed* or what happened instead, in the report. The
pictures are the approved design pack's screens 01 to 15, which sit next to
the repo and are never copied into it or the report.

1. **Schema 5 over 0.3.0 data, nothing lost.** Install 0.3.0 TEST at its
   commit, add synthetic cooks covering every 0.3.0 meal type, ingredients
   with an edit, ratings with N/A and a guest, a photo, a reading and an
   edited note; then install 0.4.0 over it without uninstalling. Every cook,
   meal type, ingredient version, rating, photo, reading and note is there
   and unchanged; no cook has a cuisine.
2. **Every screen against its picture, on both displays.** Cover display:
   01 to 09. Inner display upright: 10, 11, 12; sideways: 13, 14, 15. Each in
   light and in dark (switch the phone's setting with the app open: the app
   and its status and navigation bars follow at once). Note each difference;
   the ones left on purpose are listed in `RELEASE_0.4.0.md`.
3. **Next time stands out** on a cook made again, in both themes, on the
   cover page and in the inner side column.
4. **Side and cuisine end to end.** Set Side and a cuisine on a review, then
   Other with words of your own; change and clear them in Edit review; filter
   Home by Side and by each cuisine; search for the cuisine and for Other's
   words; Export this cook's text carries "Meal: Side · <cuisine>" (checked as
   a file by the test suite, as step 6).
5. **Backups.** A backup round trip carrying Side and cuisine (checked as a
   file by the test suite: `backupV5.test.ts`), and a format 4 file loading
   into schema 5 (the same test file).
6. **Card photos and the meal tile.** A cook with its own photo shows it on
   its card; a cook made again with none shows the earlier cook's; a cook with
   neither shows the sage tile with its meal's icon; the same on Cooking now.
7. **Folding and turning keep the place.** Mid-cook with a note half typed:
   fold, unfold, turn upright and sideways. Mid-review with notes, next time
   and a person's line half typed: the same. On Home with a cook chosen and a
   search typed: the same. Each time the same screen, the same cook, the
   scroll position and the words.
8. **The ⋯ menu** on Home shows "0.4.0 (<the named commit>) · <width> ×
   <height>", and the size changes on the cover display, inner upright and
   inner sideways.
9. **The Fold 6 bench and the Fold 8** both, where both are to hand: the
   inner layouts on each, upright and sideways.
10. **Delete note (part 4).** On an open cook with three notes, one of them
    edited: ⋯ on the edited note shows Edit note, Earlier versions and Delete
    note last, in red, as screen 09 draws it, on the cover display and on the
    inner display. Delete note: no question; the note goes at once, "Notes · 3"
    becomes "Notes · 2", Home's Cooking now says "2 notes", and "Note deleted
    · Undo" is up. Undo: the note is back in its place with its words, "edited"
    and its earlier versions. Delete it again and wait: the bar goes and the
    note stays gone after closing and reopening the app. Delete a third and
    close the app at once, before the bar goes: at the next start it is still
    there. The same on a reviewed cook's From the cook. TalkBack reads the row
    as "Delete note". Readings and photos offer no Delete note (a photo keeps
    its Remove). Export this cook and Export everything afterwards leave the
    deleted note out (checked as files by the test suite,
    `deleteNote.test.ts`).
11. **Several sizes and font scales (part 5).** Layouts adapt to the space
    they are given, so each inner screen is run at more than the bench's own
    size. Note the bench's density and font scale first (`adb shell wm
    density`, `adb shell settings get system font_scale`). Then, on the inner
    display upright and sideways, set each of these in turn with `adb shell wm
    density <dpi>` and `adb shell settings put system font_scale <scale>`,
    open Home with a cook chosen, an open cook and its review, and screenshot
    each: the bench's own density at font scales 1.0, 1.15 and 1.3, and a
    higher and a lower density (narrower and wider windows) at 1.15. Each
    time: no word breaks inside itself; Cook this again, Edit review, ‹ Home,
    Screen on and Finish & review keep their words on one line, wrapping onto
    lines of their own when they do not fit; Who ate it?'s stars, N/A and
    pencil sit beside the name or under it as one group; New Cook never covers
    the chips, the search box or a card; every card and chevron fits inside its
    pane. Then fold, unfold and fold again, and turn sideways, upright and
    sideways mid-cook: no pane keeps its old width, nothing runs off an edge,
    and the Notes card fits its column. Delete note on the cover display shows
    "Note deleted · Undo", and Undo works. Put the density and the font scale
    back as found (`adb shell wm density reset` only if it was the default)
    and say so in the report.

## The report

`..\runs\<date>-acceptance-<commit>.md`, in the runs folder next to the
repo, with the screenshots beside it: the commit and the read-back from step 2;
one line per step, *passed* or what happened instead; the screenshots; the
exported text. None of it is committed.
