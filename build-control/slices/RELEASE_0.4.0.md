# Release 0.4.0 — the new look, and the cover and inner screens

**Status:** built, tests green on the desktop; no APK built, nothing installed, not yet tried on a device
**Date:** 2 November 2026
**Version:** 0.4.0 (`versionCode` 7)
**Schema:** version 5 · **Backup format:** version 5
**Builds on:** 0.3.0 (`RELEASE_0.3.0.md`), at `4af5172`

Mike (product owner) approved the 0.4.0 plan and its design on 2 November
2026. The release was built in three parts, and a fourth, Delete note, was
added on 2 November at his request. Parts 1 and 2 have records of their own,
kept as they are; this is the whole release in one record, with parts 3 and
4 in full. Code, tests and docs only.

## The release in four parts

1. **The foundation and the data** (`RELEASE_0.4.0_PART1.md`, to `13432bf`).
   The design system's tokens in light and dark, following the phone's own
   setting and changing live; the shared parts rebuilt on them, with the
   app's own icons; Side, a fifth meal type; cuisine, optional, one per cook;
   schema 5 and backup format 5 (formats 1 to 4 still read); card photos (a
   cook's own first photo, or the one from the cook it was made again from,
   or its meal tile); the version, commit and window size in Home's ⋯ menu.
   Recorded as Design Baseline v3.
2. **The cover screen** (`RELEASE_0.4.0_PART2.md`, to `515b521`). Home with
   Cooking now, the search bar and filter button, the meal chips and a
   floating New Cook; the Filters sheet; the cook page grouped by section,
   never a timeline, with the new composer; Add a reading; Finish review and
   Edit review; a reviewed cook with Cook this again and Edit review pinned;
   Who's eating with Rename; No matches, the Undo bar and Note options.
3. **The inner screen, and the wrap-up** (this record, below). The inner
   screen's own layouts for Home, the cook page and the review, upright and
   sideways; folding, unfolding and turning keeping your place; version
   0.4.0; the docs.
4. **Delete note** (below, after part 3). Mike asked for it on 2 November,
   after adding a note by mistake with no way to remove it. Note options ends
   with Delete note; Undo for the same window as a deleted cook; the note and
   its earlier versions deleted for good once it passes. No schema change.

## Part 3: what was built

### 1. The inner screen's sizes

- Two panes whenever the window is 600 dp wide (`breakpoint.medium`) and its
  shorter side is too: both inner screens, either way round. The Fold 8's
  inner screen is about 792 × 880 upright and 880 × 710 sideways above the
  taskbar; the Fold 6 bench's about 707 × 823 and 823 × 660.
- Every pane width comes from the tokens. Home's list pane is `pane-list`
  (400) in both orientations. The cook page's side column is a new token,
  `pane-side` (344), as screens 11 and 14 draw it. The review's left pane is
  `pane-list`, giving way only where the window is too narrow for the right
  pane to keep a person's stars, N/A and pencil on one line (decision 3).
- Inner panes use the `space-ml` (20) gutter. `computeLayoutMetrics` now also
  says `sideways` (two panes on a window wider than tall).
- A side pane can be drawn on `surface`, as the pictures draw the chosen
  cook, the cook's side column and the review's right pane, or be filled by a
  page that scrolls itself with its own pinned footer (`EmbeddedPane`).

### 2. Home, inner (10 upright, 13 sideways)

- **Left, 400 wide:** "Cooking Lab" a size down (`appTitleInner`) and ⋯;
  Cooking now with the inner list's smaller photo; Your cooks with its count,
  the search bar and the filter button; the meal chips **on two rows**; the
  cook cards with the inner photo size; the Pager; New Cook floating at the
  foot of this pane.
- **Right, on surface:** the chosen cook, as on the cover screen's
  reviewed-cook page — header (meal, cuisine, title a size down, date and the
  Reviewed chip, photo), tags, Next time, Who ate it? with the average, Your
  notes, the Ingredients bar and From the cook — in its own scrolling pane
  with **Cook this again** and **Edit review** pinned at its foot. The chosen
  card has the teal edge.
- The cook tapped stays chosen through paging, searching and folding to the
  cover screen and back. With nothing chosen the pane shows the most recent
  reviewed cook; with none reviewed, a quiet notice: "No reviewed cook yet".
- Tapping an open cook (Cooking now) opens its cook page full screen.

### 3. The cook page, inner (11 upright, 14 sideways)

- The cook takes the whole inner screen in two columns.
- **Main column:** the top bar (Home, Screen on, Finish & review), the
  header with the title a size down, the tags, Readings, Notes and Photos,
  with the composer pinned at the foot of this column.
- **Side column, `pane-side` wide on surface:** **Next time** at the top, its
  words a size up (`nextTimeLarge`); then **Last time**; then **Ingredients
  open as a list** — quiet sage, the fork and knife, "Ingredients · 12" and
  the lines as bullets, never folded, with Edit and "edited" as before.
- **Upright,** Notes and Photos stack and the photos are three to a row;
  **sideways,** they sit side by side and the photos are two to a row, and
  each reading puts its number beside its word.
- Note options, Add a reading, Earlier versions and the photo viewer open as
  on the cover screen, inside the pane they belong to.
- A reviewed cook opened full screen on the inner screen (from Last time's
  Open) puts Next time and the ingredients in the side column the same way.

### 4. Finish review and Edit review, inner (12 upright, 15 sideways)

- **Left:** Back to the cook and "Review" (or "Edit review"); the photo on
  the left of the title, a size down, and the date line; What was it?;
  Cuisine; Your notes (decision 4).
- **Right, on surface:** Who ate it? on its rail — each person's stars, N/A
  and pencil **on one line**, never wrapping, and N/A itself never breaking
  (the 0.3.0 note); + Someone else; Next time, "Shown before you cook this
  again."; and **Finish review** (or Save review) pinned at the foot of this
  pane.

### 5. Folding, unfolding and turning

Every change between the cover screen, inner upright and inner sideways —
six, counting each way — keeps the same screen, the same cook, the scroll
view and anything half typed:

- The parts that stay in a pane keep their views: the main pane is drawn the
  same way on one column and two (0.3.0), Notes and Photos keep the same
  views whether stacked or side by side, and Your notes stays in the
  review's left pane either way.
- The parts that move to the other pane (Who ate it?, the ingredients) keep
  what is being typed in a store the screen holds (`src/layout/KeptState.tsx`)
  and pick it up when drawn in the other pane.
- Tested for each pair, both ways: a half-typed note, a note being edited,
  half-typed ingredients, the review's notes and next time, a person's line
  half typed, and Home's search.

### 6. Small things

- Note options still has no Delete note: notes are kept, as the evidence
  rules say (part 2's decision 1). Superseded by part 4, which adds it.
- The ⋯ menu's version line now reads "0.4.0 (<commit>) · <width> × <height>".

### 7. Version and docs

`app.config.ts` is 0.4.0, `versionCode` 7. The README's "Current state",
`src/content/product.ts`'s description, this record, the slices README and
`ACCEPTANCE.md`'s 0.4.0 checks.

## Part 3: the decisions

What the brief did not settle.

1. **Two panes still need the shorter side at 600 too.** The brief says "600
   dp wide or more"; taken alone, that would give the cover screen turned
   sideways (905 × 369) the inner layouts, which neither the pictures nor the
   design system draw ("cover screen: one column"). Both inner screens pass
   either way round.
2. **Sideways means wider than tall,** not the `expanded` breakpoint (840):
   the Fold 6 bench turned sideways is 823 wide, and would otherwise get the
   upright layout. The 840 token is unchanged and unused by the layouts.
3. **The review's left pane gives way on a narrow inner screen.** On the
   Fold 6 bench upright (707 wide) a 400 dp left pane leaves 307 for the
   right, too little for a person's five star buttons, N/A and pencil on one
   line (296 dp plus the rail and gutters). There the left pane is the window
   less what the right needs (`REVIEW_RIGHT_PANE_MIN`, worked out from the
   tokens): 345 dp. On the Fold 8 it is always 400.
4. **Your notes stays on the inner review,** in the left pane under Cuisine.
   Screens 12 and 15 do not draw it, but the cover review (07) does, and
   dropping it would take away the review's own words. It is also the one
   field that stays in its pane across folding.
5. **Tags stay on the inner pages,** under the header, on the cook page and
   in Home's right pane. The pictures do not draw them, but a cook is tagged
   on its own page (part 2's decision 3) and there is nowhere else to do it.
6. **The ⋯ stays on the reviewed cook in Home's right pane,** in a top bar
   of its own. Screen 10 draws no ⋯, but it holds Export this cook, which is
   nowhere else, and Delete cook.
7. **The ingredients keep Edit and "edited" in the side column,** so they
   can still be changed with every version kept, though screen 11 draws the
   list alone.
8. **"Chosen" survives the page and the search.** The cook tapped stays in
   the right-hand pane until another is tapped or it is deleted, even when a
   search or another page hides its card; otherwise the pane would change
   under the cook at every keystroke. Kept while folded, so unfolding shows
   it again.
9. **A reviewed cook full screen on the inner screen** uses the cook page's
   two columns (Next time and the ingredients in the side column), as the
   open cook does; it is not drawn.
10. **Half-typed words that move panes are kept by key** in a store the
    screen holds for as long as it is open, not by lifting every draft into
    the screens. Keys name the thing typed (`who-ate-it-member-m-you-line-draft`,
    `ingredients-draft`); a part rendered alone, outside a store, keeps plain
    state as before.
11. **`pane-side` (344) is a new size token,** taken from screens 11 and 14,
    where the side column is 344 dp both ways round. `tokens.json` has no
    name for it.
12. **The inner Cooking now photo** uses the inner card photo size (72 × 64);
    the picture draws 64 × 64, which has no token.
13. **The empty right-hand pane** says "No reviewed cook yet" and "Once a cook
    is reviewed it shows here, with what to do next time and who ate it." It
    is not drawn.

## Differences from the pictures

Screens 10 to 15, each compared part by part with its light and dark picture
(the HTML for sizes). Light and dark use the same roles throughout, so each
difference below holds in both. Left as they are:

1. **Sizes off the scale use the nearest token** (as part 2's first
   difference): the list pane's 18 dp side margin is the inner panes' 20; the
   side column's 16 dp padding is 20; the inner title photo is
   `photo-title` (92), not 84; the Your cooks heading is `heading` (22), not
   20; the inner card text sizes (15, 12) are the cover's styles; section
   counts are `secondary`.
2. **The inner review puts each name above its stars on the Fold 8 upright.**
   The pictures' star buttons are about 24 dp; the design system's are 30
   wide in a 38 dp slot, so five stars, N/A and the pencil take 296 dp and
   leave the name too little room beside them in a 392 dp pane. Sideways, the
   name sits beside them as drawn. They never wrap among themselves.
3. **Your notes on the inner review** (decision 4): not drawn.
4. **Tags on the inner cook page and in Home's right pane** (decision 5).
5. **A top bar with ⋯ above the chosen cook** in Home's right pane
   (decision 6).
6. **Your notes on the chosen cook** is the cover screen's section — a
   heading over a card with the page icon — where screen 10 draws the icon,
   a smaller heading and the words with no card. The page is the cover
   screen's reviewed-cook page, as the brief asks.
7. **The rest of the reviewed page** (the Ingredients bar and From the cook)
   follows Your notes in Home's right pane; screen 10 is cut off before them.
8. **"2nd time cooking this"** on the cook page's date line, as on the cover
   screen; screens 11 and 14 say "2nd time".
9. **The + tile in Photos** on an open cook, as on the cover screen; screens
   11 and 14 draw three photos and no + tile. Upright it starts a second row.
10. **Edit and "edited" on the side column's ingredients** (decision 7).
11. **Readings read "180°C"**, as everywhere in the app (part 2's
    difference 8), not "180 °C".
12. **The Cooking now photo** is 72 × 64 (decision 12), not 64 × 64.
13. **The Pager** is not in the pictures (they show three cooks); it is drawn
    under the cards when there is more than a page, as the brief asks.
14. **Not drawn but kept:** the empty right-hand pane (decision 13); "Who
    usually eats?" on a first review; Edit review's own title and Save review;
    problem notices.

The hand-typed-style test (`noHandTypedStyles.test.ts`) still passes: no
colour, font size, line height or corner radius is typed into
`src/screens` or `src/components`.

## Part 3: how it is built

New: `src/layout/KeptState.tsx`; `EmbeddedPane` and the side pane's
`surface` and `fill` in `ScreenContainer`; `reviewPaneWidth` and
`REVIEW_RIGHT_PANE_MIN` in `src/layout/responsive.ts`; `size.paneSide`;
`IngredientsBox`'s side-column list (`asList`); `WhoAteIt`'s `oneLine`;
`CookingNowCard`'s and `ShellHeader`'s `compact`; `ReadingsGrid`'s `narrow`.

Changed: `CookScreen`, `HomeScreen`, `ReviewScreen`, `IngredientsSection`,
`StarRating` (N/A on one line), `app.config.ts`, `src/content/product.ts`,
the README.

Commits (not pushed when this was written): `129036b` the review and the
layout foundation; `0e90570` the cook page; `b7af9e9` Home and the fold
tests; then the version and these docs.

## Verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass — **77 suites, 1473 tests**, up from 76 and 1425 at the end of
part 2 (and 67 and 1141 at the end of 0.3.0). `npm audit --audit-level=critical`
exits 0: 56 advisories (6 low, 44 moderate, 6 high), none critical, with
`package-lock.json` unchanged since part 2. No package added in part 3, and
none across 0.4.0 but part 1's three (`react-native-svg`, `expo-system-ui`,
`expo-navigation-bar`, in `dependency-triage.md`). The merged-manifest test
(`androidPermissions`) still gives `INTERNET` and `CAMERA` and nothing else.
CI has not run on these commits: they had not been pushed when this was
written.

| Test file | What it pins down |
|---|---|
| `innerScreens.test.tsx` (new, 48) | Two panes on both inner screens either way round and one column on the cover; sideways; the 20 dp gutter; the panes from the tokens, and the review's left pane giving way on the bench; Home's 400 dp list with the chips on two rows, New Cook in the list pane, the chosen cook on surface with its buttons pinned, the most recent when nothing is chosen, the chosen cook kept through folding, the empty pane, an open cook full screen; the cook page's side column (Next time, Last time, Ingredients in that order, open as a list), Notes and Photos stacked upright and side by side sideways, photos three and two to a row, the Fold 6 bench, Note options with no Delete note; the review's two panes with Finish review at the right-hand foot and the one-line controls (and wrapping on the cover); and all six changes between the cover, upright and sideways for the cook page (note, note being edited, ingredients), the review (notes, next time, a person's line) and Home (search) |
| `twoPanes.test.tsx` | The review on two panes as drawn: what it was and your notes on the left, who ate it and next time on the right |
| `appConfig.test.ts`, `versionLine.test.tsx` | 0.4.0, `versionCode` 7, and the version line reading it |

## What has not been tried on a device

None of 0.4.0. To see on the Fold 8 and the Fold 6 bench, in light and dark,
each against its picture (`ACCEPTANCE.md` → "0.4.0 checks"):

1. The schema 5 migration over real 0.3.0 data, with nothing lost.
2. Every screen against its picture: 01 to 09 on the cover display, 10 to 15
   on the inner display upright and sideways.
3. Next time standing out in both themes, in a kitchen's light.
4. Side and cuisine end to end; a backup round trip with them, and a format
   4 file loading.
5. Card photos and the meal tile, in the list and on Cooking now.
6. Folding and turning mid-cook, mid-review and on Home: the place kept, the
   keyboard's behaviour as a field moves panes, the scroll position on a real
   device (the tests check the scroll view is the same one, not the offset).
7. The ⋯ menu's version and screen size on both displays, both ways round.
8. The status and navigation bars, and no white flash at launch in dark.
9. The Fold 6 bench's narrower review (345 dp left pane) and its sideways
   cook page (Notes and Photos side by side in 479 dp).

## Part 4: Delete note

Mike asked for it on 2 November 2026, after adding a note by mistake and
finding no way to remove it. Code, tests and docs only; the version stays
0.4.0, `versionCode` 7. No schema change (schema 5), no backup format change
(format 5), no new table, package or permission.

### What Mike gets

- **Note options ends with Delete note,** in the danger colour with the bin
  icon, as screen 09 draws it: from a note's ⋯ on any cook, open or reviewed,
  on the cover screen and on the inner screen. A screen reader reads it as
  "Delete note", a button.
- **No "are you sure?".** The note leaves the page at once, the counts follow
  ("Notes · 2" becomes "Notes · 1"; Cooking now's "3 notes" becomes "2
  notes"), and the Undo bar reads "Note deleted · Undo" for `UNDO_WINDOW_MS`,
  the same window as a deleted cook.
- **Undo** brings the note back exactly as it was: the same words, the same
  place among the notes, every earlier version and "edited".
- **When the window passes** the note is deleted for good: its row and every
  revision of it, in one transaction.
- **If the app closes during the window,** the note is simply not deleted: it
  is still there at the next start.

### The rule

Rule 14 in `src/domain/evidence.ts`, `deleteNote`: a written note is deleted
only when its owner deletes it. The cook may delete a `user_note`; every other
kind of entry is refused (`only_a_written_note_may_be_deleted`), and the
assistant is refused whatever it names (`ai_cannot_delete_a_note`). Rules 10
and 11 name it as their one exception and are otherwise unchanged: Remove
still takes back only a photograph, a note's first words still cannot be
overwritten in place, and an edit of a kept note still keeps the earlier
words. The verdict (Your notes), Next time and the ingredients are not
timeline entries and cannot reach it. The rule runs twice: when Delete note is
pressed, and again in the service before the transaction.

### What references `cook_events`

Read from the schema itself by the test (`pragma_foreign_key_list` over every
table), not from memory:

| Table | Column | When the note is deleted |
|---|---|---|
| `revisions` | `cook_event_id`, `ON DELETE CASCADE` | Every earlier version of the note goes. The transaction deletes them by name first; the cascade would too. A verdict's revisions (`cook_event_id` NULL) and other notes' are untouched. |
| `finding_sources` | `cook_event_id`, `ON DELETE CASCADE` | A finding's citation of the note goes. The finding itself belongs to the cook (`findings.cook_id`) and stays, with any other citations. No screen creates findings yet. |

Nothing else references `cook_events`. `cook_deletions`, card photos and the
backup are keyed on cooks or read the timeline afresh.

### How it is built

- `deleteNote` (rule 14) and its two denial codes.
- `CookEventRepository.deleteNote`: one transaction that reaches only a
  `user_note` row and its revisions. `CookCaptureService.requestNoteDeletion`
  (the rule, nothing written) and `deleteNote` (the rule, then the
  transaction).
- `src/data/deletion/notes.ts`: the note deletion workflow. `request` holds the
  note back in memory, `undo` lets it go, `finish` deletes it for good, and
  `pending` is what is held. Built at start-up beside the cook deletion
  workflow (`noteDeletions` on the storage).
- `PendingDeletionProvider` holds a cook or a note, one at a time, with
  "Cook deleted" or "Note deleted" on the bar and `pendingNote` beside
  `pending`.
- The cook page leaves a held note out of its sections and counts and reloads
  when the bar goes; `useNoteCounts` leaves it out of Cooking now.
- The export service takes `heldNotes`: Export everything reads the snapshot
  without the held note, its revisions and any citation of it (what the
  foreign keys will take), and Export this cook leaves it and its revisions
  out.

## Part 4: the decisions

What the brief did not settle.

1. **The undo window lives in memory.** The brief asks for no table and for
   the note to survive the app closing, so nothing is written until the
   window passes. A cook's window, by contrast, is a row in `cook_deletions`
   finished at the next start. If the provider is unmounted with a note held,
   the note is let go and kept, as if the app had closed.
2. **One Undo at a time, cook or note.** Deleting a note while a cook's Undo
   is up finishes the cook first, and the other way round, as two cooks did.
3. **A failed final delete shows the note again.** Nothing is pending to
   retry at the next start, and hiding it forever would lose it from view.
4. **A finding keeps its other citations** when a note it cites is deleted
   (the foreign key's own behaviour); a finding citing only that note stays,
   citing nothing. No finding can be made on screen yet.
5. **Export while a note is held leaves it out** without finishing the
   deletion, so Undo still works after an export.
6. **A note open for editing when deleted** closes its editor.
7. **A refused or failed request** shows "This note was not deleted" with
   the reason above the page; the note stays.
8. **On the inner cook page** the Undo bar sits in the main column, where the
   note was, as a cook's does in Home's list pane.
9. **The Undo button's hint** is "Brings the note back exactly as it was";
   the bar keeps the cook's test ids (`undo-bar`, `undo-delete`).
10. **The promise in the app's tagline** (`PRODUCT_TAGLINE`) reads "Nothing
    you write is lost unless you delete it", the README's sentence cut to fit
    beside "you choose what to export or share".

## Part 4: verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass — **80 suites, 1498 tests**, up from 77 and 1473 at the end of
part 3. No package added; `package-lock.json` unchanged.

| Test file | What it pins down |
|---|---|
| `deleteNoteRule.test.ts` (new, 4) | Rule 14: the cook's written note allowed; the assistant refused; every other kind refused; rules 10 and 11 unchanged beside it |
| `deleteNote.test.ts` (new, 12) | Against real SQLite: what references `cook_events`, read from the schema; a request writes nothing; Undo restores the note, its versions and its place; the window passing leaves no row, no revision and no citation; the other notes, the reading, the finding and the other cook untouched; closing during the window keeps it; the assistant and a reading refused at the store; both exports while held, after, and after Undo |
| `deleteNoteScreens.test.tsx` (new, 8) | The cover screen: Delete note last, a button labelled "Delete note", in the danger colour; on a reviewed cook; at once with no question; Undo in its place with "edited" and two earlier versions; deleted for good when the window passes; kept when the app goes; out of both exports while held; Cooking now's count and Notes · 3 → 2 |
| `innerScreens.test.tsx` (49, one new) | The inner sheet ends with Delete note; deleting from the inner page with the Undo bar in the main column, and Undo |

## Part 4: not tried on a device

Delete note on the Fold 8 and the Fold 6 bench, both displays, light and dark:
`ACCEPTANCE.md` → "0.4.0 checks", step 10.
