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
     the version name must be `0.1.0 (<the named commit>)`, with no `-dirty`;
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
6. **Export, and open it where it lands.** This step leaves Cooking Lab (the
   share sheet and a files app), so do it only if Mike has said the Fold is
   signed in to no personal account. Otherwise write "export: not checked, the
   Fold still has personal accounts" and go on to step 7.
   On that cook, *Export this cook*.
   In the share sheet, choose a target that saves the file to the phone's own
   storage (a files app's save option). Never a messaging, mail or cloud app,
   or anything signed in to an account; if no such target is offered, stop
   this step and say so. Then find the file (`adb shell ls -t /sdcard/Download /sdcard/Documents`),
   `adb pull` it to the PC, open it, and check it against the cook on screen:
   title, note, reading, verdict and the TEST notice. Put the file's text in
   the report.
7. **Cover display.** Ask Mike to close the Fold, launch the app and
   screenshot Home on the cover display. If he isn't there, write "cover
   display: not checked" rather than skipping it silently.

## The report

`..\runs\<date>-acceptance-<commit>.md`, in the runs folder next to the
repo, with the screenshots beside it: the commit and the read-back from step 2;
one line per step, *passed* or what happened instead; the screenshots; the
exported text. None of it is committed.
