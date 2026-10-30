# Release 0.2.2 — fixes from cooking with 0.2.1

**Status:** built, tests green; no APK built, nothing installed, not yet tried on a device
**Date:** 30 October 2026
**Version:** 0.2.2 (`versionCode` 5)
**Schema:** version 3 · **Backup format:** version 3
**Builds on:** slice 3 and its 0.2.1 fix round (`SLICE_3_PHOTOS_READINGS_TAGS.md`)

Seven things from real cooking with 0.2.1, planned with Mike on 30 October.
Code, tests and docs only.

## What was built

### 1. The cook screen scrolls

A pasted recipe of about thirty lines grew the note box until the whole
composer — photo button, note box, Oven °C, Internal °C, Send, *Somewhere
else?* — sat below the bottom of the Fold's main display, and nothing scrolled.

- The note box grows to five lines at the current font scale and then scrolls
  inside itself (`TextField` `maxRows`).
- A pinned footer is capped at 60% of the space between the status bar and the
  keyboard (never below 96 dp), and scrolls inside itself if its controls need
  more — which at font scale 2.0 with the keyboard up on a narrow display they
  can. The timeline keeps the rest. `src/layout/footerLimit.ts`.
- The timeline is the page's own scroll; the composer is pinned under it and
  above the keyboard, as before.

### 2. Tags on the cover display

- The *Add a tag…* suggestions are drawn **above** the field, and while the
  field has focus the page scrolls the field and its suggestions to the top of
  the screen (`src/layout/ScreenScroll.tsx`).
- Each tag appears once: suggestions are unique by name, and a tag being
  suggested is left out of *Used before:*, which sits right below.

### 3. Delete a cook

- Long-press a card (Continue cooking, Recent cooks, History, search results),
  or ⋯ on the cook's own page — so it never depends on long-press. Both open
  **Delete cook**, which asks "Delete this cook? Its notes, readings and photos
  go too." The card's long-press is also a named screen-reader action.
- Then "Cook deleted · Undo" for five seconds over whichever screen the cook
  lands on. Undo brings it back exactly as it was. After that the cook, its
  events, edits, lessons, findings, tag links and photo files are gone, and so
  is every tag that was on that cook and on no other.
- If the app closes during the window, the deletion is finished at the next
  start, along with any photo file whose cook is no longer there.
- Rule 12 (`deleteCook`) refuses the assistant. Deletion is its own operation:
  `request` only hides the cook (one row in `cook_deletions`), `undo` removes
  that row, `purge` deletes in one transaction and hands back the photo paths,
  and the files go after the rows (`src/data/deletion/workflow.ts`).

### 4. Edit notes, the verdict, the title and tags

- Every note, open cook or reviewed, has a ⋯ (48 dp) with **Edit**; so does
  the verdict on a reviewed cook.
- An edit never overwrites. Schema 3's `revisions` table holds each edit; the
  original row stays byte for byte and the note keeps its place. The timeline
  shows the newest words with "edited"; tapping it lists every earlier version
  with its time, the original last. Review shows the newest words, read-only.
- The title can be changed on any cook, open or reviewed. Tags already could be
  on a reviewed cook; a test now pins it.
- Readings and photos are not editable; removing a photo works as before.
- *Export everything* carries every revision (backup format 3). *Export this
  cook* prints the newest words marked "(edited)".

### 5. The screen stays on during a cook

While an open cook's page is in front the screen stays on (`expo-keep-awake`
57.0.2, the window's keep-screen-on flag). It lets go when the page is left,
the app goes to the background or the phone locks. A toggle on the open cook's
page, on by default for every cook, reads "Screen stays on" / "Screen can
sleep". Reviewed cooks, Home and History are unchanged. No new permission.

### 6. Photos in the order they were taken

A photo chosen from the Gallery is placed at its own taken-time, read from its
EXIF before the re-encode strips it — `DateTimeOriginal` (or
`DateTimeDigitized`) and its offset, nothing else; the GPS directory is never
followed. If that time is no later than now and no earlier than one hour
before the cook started, the photo sits there, labelled with that time;
otherwise at the time added, labelled "Photo · added 18:42". Camera photos
behave as before. The timeline is ordered by time; nothing stored moves.
`src/data/photos/takenTime.ts`, `src/domain/photoTime.ts`.

### 7. Version and docs

`app.config.ts` 0.2.2 / 5. README: current state, permissions, the new promise
("nothing the cook writes is lost"). `CLAUDE.md`: arm64-only Gradle builds for
production too; the Fold bench answers no prompt and nothing on it leaves
Cooking Lab. `build-control/slices/ACCEPTANCE.md` step 6 follows that rule.

## The decisions

Everything the brief did not settle.

1. **One `revisions` table for notes and verdicts**, with a `field` of `note`
   or `verdict`. The title is not revisioned: it is a label the cook has always
   changed in place, and the brief asked only that it be changeable.
2. **The guards were extended, not loosened.** `updateCookEvent` now refuses
   an in-place change to a note's words for the cook too (it was an unused
   door), and `saveCookReview` refuses a second save over a reviewed cook's
   verdict. The slice 1 test "lets the cook edit their own timeline entry" pinned
   the old door; it was replaced by one that pins the refusal.
3. **Edits need words.** An edit that is empty or only spaces is refused, and
   Save stays off until the words have changed. A reviewed cook with no verdict
   shows no Edit: there is nothing there to reword.
4. **Pending deletion is a table, not memory.** `cook_deletions` is what makes
   both Undo exact and "finish at the next start" possible. A pending cook is
   hidden from every list, count, tag tally and *Export everything*; `findById`
   still finds it so Undo can.
5. **One deletion at a time.** Deleting a second cook while the first's Undo is
   up finishes the first. Two bars, or one that undoes the wrong cook, would be
   worse.
6. **"Tags used only by that cook drop out", read against 0.2.1's F1.** F1
   keeps a tag on no cook in the lists. So purge deletes exactly the tags that
   were on the deleted cook and on no other; a tag already on no cook stays.
   During the five-second window those tags are still in *Show me my tags*.
7. **The one change to another cook.** A cook whose `parentCookId` named the
   deleted one has that link cleared by the schema (`ON DELETE SET NULL`). No
   screen sets a parent today, so no real cook has one.
8. **The keep-awake toggle is remembered per cook while the app runs**, and
   starts on for every cook. It is not stored.
9. **A taken-time with no offset is the phone's local time.** The one-hour
   allowance and "no later than now" are both inclusive.
10. **The original bytes are read by the photo source** (`readOriginal`), once,
    for the date and time, and dropped. `exif: false` on the picker is
    unchanged, so JavaScript is still never handed an EXIF dictionary.
11. **Backup format 3 requires `entities.revisions`**, even empty. 1 and 2 are
    read as having none; a 1 or 2 that carries an edit is refused. A photo's
    `meta.photoTime` is not version-gated: every reader already accepts any
    JSON in `meta`.
12. **Schema version 2 is now pinned by digest**, like version 1: it has run on
    the phones.
13. **Two entries at the same instant keep the order written** (`rowid` as the
    tie-break), so a photo placed at its taken-time never jumps a note written
    in the same second.
14. **The likely cause of the doubled tag** was the same chip in the
    suggestions and in *Used before:* one line below, and possibly two rows of
    one name (a kind given before schema 2). Both are handled.
15. **The README's second "Permissions" section** said the app requests no
    device capabilities, which contradicted the first since slice 3. It was
    removed.
16. **The tagline** now says "Nothing you write is lost"; "It may have been
    removed" became "deleted".

## How it is built

New: `src/layout/footerLimit.ts`, `src/layout/ScreenScroll.tsx`,
`src/data/deletion/workflow.ts`, `src/data/photos/takenTime.ts`,
`src/domain/photoTime.ts`, `src/state/PendingDeletion.tsx`,
`src/state/useKeepScreenOn.ts`, `src/screens/CookActions.tsx`,
`src/screens/cook/EditableWords.tsx`, `src/screens/cook/VersionsSheet.tsx`.

Changed: schema (version 3), `src/domain/evidence.ts` (rules 11 and 12),
`entities`, `enums`, `invariants`, the SQLite repositories and services, the
backup contract and validation, the text export, the photo pipeline, and the
cook, Review, Home and History screens.

## Verification

At the release's last commit, on the desktop and in CI: `check:secrets`,
`typecheck`, `lint` and `npm test` pass — **57 suites, 987 tests**, up from 48
and 863 (124 added, 9 new suites). `npm audit --audit-level=critical` passes.
`npx expo prebuild` gives an app manifest with `INTERNET` and nine removals;
`CAMERA` comes from `expo-image-picker`; the merged set is `INTERNET` and
`CAMERA`.

| New test file | What it pins down |
|---|---|
| `cookScrolling.test.tsx` | A 40-line paste at 320 dp and at the inner display's width, keyboard open and closed, font scale 1 and 2: the box capped at five lines and scrolling, the footer capped, every composer control in the footer's own scroll, Send still works |
| `tagSuggestions.test.tsx` | Suggestions above the field, the reveal on focus, each tag once, none repeated in *Used before:* |
| `schemaV3.test.tsx` | 2 → 3 on a filled notebook: same counts and content, foreign keys intact, the new tables empty, rollback to 2 with nothing lost, and the failure shown rather than an empty app |
| `revisions.test.ts` | Rule 11 in the domain and in SQL, the original row unchanged, the refused overwrite, the text export |
| `backupV3.test.ts` | Round trip with edits, versions 1 and 2 still read, the version checks |
| `deleteCook.test.ts` | Undo restores everything, purge leaves no row or file, the other cook untouched, Export afterwards, finish at next start |
| `editDeleteScreens.test.tsx` | Long-press, ⋯, confirm, Undo, the timer; edit, "edited", versions; title and tags on a reviewed cook |
| `keepAwake.test.tsx` | On when in front, off on toggle, page change, background and close; never elsewhere |
| `photoTime.test.tsx` | The three fixtures through the real pipeline, the reader, the window, the labels |

Existing tests changed: `migrations` (three versions, v2 digest, v3 section),
`schemaV2` (counts the tables version 2 has), `backupV2` (writes 3),
`controlledModel` (the snapshot has `revisions`), `evidence` (the overwrite
test above), `androidPermissions` (keep-awake adds none), and the two that
build a store by hand (`routes`, `startupGate`).

## What has not been tried on a device

None of it. In particular, still to see on the Fold:

1. a 30-line paste on both displays, keyboard open and closed, and at the
   largest font: the composer reachable, the box scrolling inside itself;
2. the tag field on the cover display with the keyboard up: the suggestions
   visible above it;
3. long-press on a card, the confirm, the Undo bar's position above the
   navigation bar, Undo, and the cook gone after five seconds;
4. force-stopping the app inside the five seconds, then reopening: the cook
   gone and its photos with it;
5. editing on both displays, "edited" and the versions sheet;
6. the screen staying on through a long cook, and sleeping on a reviewed cook,
   Home and History, and after the toggle;
7. a Gallery photo from the Fold's own camera landing at its taken-time, and
   whether Samsung writes the offset tag; a photo from another phone or a
   download landing at the time added. Whether the picker hands over a file the
   app can read on every Android version is the first thing to check.

## On-device check (Mike, about 10 minutes, TEST data only)

1. Open **Cooking Lab Test**, **New Cook**. The pill under the title says
   **Screen stays on**. Leave the phone: it should not sleep.
2. Paste 30 lines into the note box. It grows to five lines and scrolls; Send
   and the reading buttons are still there. **Send**.
3. Tap ⋯ on that note → **Edit**, change a word, **Save**. It says "edited";
   tap it to see the original.
4. Take a photo with the camera at the stove; later choose one from the Gallery
   that you took at the start of cooking. It should sit at the time you took it.
5. Close the Fold, type a tag on the cover display: the suggestions show above
   the field, each once.
6. Back on Home, long-press the cook → **Delete cook** → **Delete**. Tap
   **Undo**: it comes back. Delete it again and wait: it is gone.
