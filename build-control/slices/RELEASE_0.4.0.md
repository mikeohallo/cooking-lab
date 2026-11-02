# Release 0.4.0 — the new look, and the cover and inner screens

**Status:** built, tests green on the desktop; parts 6, 7 and 8 not yet tried on a device
**Date:** 2 November 2026
**Version:** 0.4.0 (`versionCode` 7)
**Schema:** version 5 · **Backup format:** version 5
**Builds on:** 0.3.0 (`RELEASE_0.3.0.md`), at `4af5172`

Mike (product owner) approved the 0.4.0 plan and its design on 2 November
2026. The release was built in three parts, and a fourth, Delete note, was
added on 2 November at his request. A fifth, an adaptive layout and the faults
from the first test build, followed the same day, and a sixth, four small
fixes from the second test build, and a seventh, a web preview and a scale
pass to normal app sizes, and an eighth, one layout fix found in part 7's
preview. Parts 1 and 2 have records of their own, kept as they are; this is the whole release in one record, with parts 3 to 8 in
full. Code, tests and docs only.

## The release in eight parts

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
5. **An adaptive layout, and the test build's faults** (below, after part
   4). The first test build (`7511d07`) on the Fold 6 bench showed that the
   inner layouts' fixed widths broke there. Panes are now shares of the
   window between limits, and content flows to fit. Also fixed: no Undo bar
   after Delete note on the cover, Home keeping the inner width after a fold,
   the Notes card overflowing after a turn, Edit review in Home's right pane
   opening the cook page, New Cook covering controls, and "°C °C".
6. **Four small fixes from the second test build** (below, after part 5).
   N/A never breaks; Who ate it?'s stars, N/A and pencil never split; the
   cause of labels cut short after a live font-size change (inside React
   Native, left as it is); typed words never dropped without warning.
7. **A web preview, and a scale pass** (below, after part 6). The real
   screens in a browser, on a synthetic notebook, at any size, font scale and
   theme; then type and drawn sizes brought down to Material 3's, every
   control keeping a 48 dp touch area.
8. **Notes and Photos side by side only when there is room** (below, after
   part 7). Side by side only when each gets 300 dp of the main column;
   otherwise stacked, as upright.

## Part 3: what was built

### 1. The inner screen's sizes

- Two panes whenever the window is 600 dp wide (`breakpoint.medium`) and its
  shorter side is too: both inner screens, either way round. The Fold 8's
  inner screen is about 792 × 880 upright and 880 × 710 sideways above the
  taskbar; the Fold 6 bench's about 707 × 823 and 823 × 660.
- *Superseded by part 5: panes are no longer fixed widths.* Every pane width
  comes from the tokens. Home's list pane is `pane-list`
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

## Part 5: an adaptive layout, and the test build's faults

The test build of `7511d07` was run on the Fold 6 bench on 2 November
(inner 707 × 823 and 823 × 707, cover 369 × 905, font size 1.15). The
inner layouts had been built at fixed widths taken from one phone — a 400
list pane, a 344 side column, the review's left pane worked out from them —
and there they crushed the detail side to about 300, broke "Cook this again"
letter by letter, stacked "‹ Home" a letter a line and pushed things off the
edge. Mike withdrew the design pack's "fixed 400" and set a rule in its place.

### The rule

Layouts adapt to the space they are given. No fixed widths for panes,
columns, rows or buttons. The only fixed numbers are limits (touch targets,
line length, a pane's minimum and maximum) and they live in
`src/theme/tokens.ts`. Recorded in `DESIGN_BASELINE_V3.md`, section 5.

### What was built

1. **Panes.** One column under 600 dp wide, as before; two panes from 600.
   Home's list pane and the review's left pane are 45 % of the window, never
   less than 320 or more than 400 (`paneListShare`, `paneListMin`,
   `paneListMax`, replacing `paneList`). The cook page's side column is 42 %,
   280 to 380 (`paneSideShare`, `paneSideMin`, `paneSideMax`, replacing
   `paneSide`). The other pane takes the rest. `paneWidths` in
   `src/layout/responsive.ts` works them out from the live window on every
   render; `ScreenContainer` takes `panes="home" | "cook" | "review"` in place
   of a fixed width, and nothing keeps a width in state.
2. **Content flows to fit.** Buttons never shrink below their words. Cook
   this again and Edit review wrap, each onto its own line at full width,
   Cook this again first. The top bar wraps: ‹ Home whole on the first line,
   Screen on and Finish & review on the next when they do not fit beside it,
   and a line each if they do not fit beside each other. Who ate it?: the
   name, then the stars, N/A and pencil as one group, beside the name when it
   fits and under it as one block when not (only on the cover does the group
   wrap inside itself; part 6 ends that). Other button rows (title edit, the
   household prompt) wrap too.
3. **New Cook** is docked at the foot of the list (or Home's list pane), on
   the page colour with a soft fade above it; the list ends above it.
4. **Search** draws its own placeholder: one line, ending with an ellipsis.
5. **The meal chips** on the cover scroll edge to edge, running under the
   right gutter; on the inner screen they wrap onto as many rows as needed.
6. **Delete note on the cover shows the Undo bar.** Home stays mounted under
   a cook's page, and its Undo slot claimed the bar, so the cook's page on
   one column drew none. Every screen now draws the bar in its own main pane.
7. **Folding.** The main pane had `width: 400` on two panes and only `flex: 1`
   on one column, relying on the native side dropping the removed width. On
   the bench it did not: Home ran 31 dp (400 − 369) off the cover. Every pane
   style now sets the same keys in every state (`paneStyle`).
8. **Turning.** Notes and Photos switched between a style and none, so keys
   were added and removed on each turn; upright, the squashed ‹ Home also
   grew the page by several lines, which is what moved the scroll. Both
   states now set the same keys, and the top bar no longer changes height.
9. **Edit review in Home's right pane** opens Edit review (`onReview`, routed
   to `/cook/<id>/review`), not the cook page.
10. **Add a reading** has no "°C" placeholder beside its "°C" unit.

### Part 5: the decisions

What the line did not settle.

1. **The font scale does not change the panes.** Panes follow the window's
   width only; text wraps inside them. The tests check the same widths at
   1.0, 1.15 and 1.3.
2. **Marks drawn at their own size are allowed** as fixed widths: icon
   circles, photo thumbnails, the sheet's handle, dots, the rail, the filter
   count and a person's photo circle. They are never a pane, column, row or
   button. `widthTokens` lists them beside the limits, and the arithmetic that
   made some of them (`targetMin + 2`, `dot + space.xxs`) became named tokens
   at the same values.
3. **The pane that takes the rest is `auto`.** It grows into the space rather
   than being set to window minus share, so a left or right inset (a cutout
   sideways) never makes the two overflow.
4. **The two-pane rule keeps the shorter-side check** ("as now"): 600 wide and
   600 on the shorter side, so a phone turned sideways stays one column.
5. **The fade** is the page colour, clear at the top, 24 dp tall, drawn with
   React Native's background image. Dark has its own.
6. **The cook's top bar actions, when wrapped, sit to the right**, as they did
   beside ‹ Home; the other button rows go full width.
7. **The review's foot** is one full-width button already; it is never
   squeezed.
8. **The Undo bar on every screen.** A screen in front draws it in its own
   main pane, on one column too. Screens behind draw it as well, unseen; Undo
   on either does the same thing.

### Part 5: verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass — **82 suites, 1646 tests**, up from 80 and 1498 at the end of
part 4. No package added; `package-lock.json` unchanged.

| Test file | What it pins down |
|---|---|
| `noFixedWidths.test.ts` (new, 4) | No width, minWidth or maxWidth in `src/screens` or `src/components` that is not a limit token, a drawn mark's token, or a share of the window; it would catch a fixed pane, a sum and a token off the list |
| `adaptiveLayout.test.tsx` (new, 142) | The pane maths at 320, 369, 412, 600, 707, 792, 823 and 880 wide at font scales 1.0, 1.15 and 1.3; Home, an open cook, a reviewed cook and the review at each, with the button rows and top bar set to wrap; every fold and turn between cover, inner upright and inner sideways and back, with no width kept; fold, unfold, fold; sideways, upright, sideways keeping Notes in its column; the Undo bar on the cover and inner screens, open and reviewed, with Home underneath; Edit review from Home's right pane; the cover's chip row to the edge; no "°C" placeholder |
| `innerScreens.test.tsx`, `twoPanes.test.tsx` | Pane widths as shares; Who ate it?'s group; the bench sideways review |
| `coverScreens.test.tsx` | New Cook docked after the scrolling area, on the page colour, with the fade |
| `historySearchScreen.test.tsx` | The placeholder: one line, ending with an ellipsis, gone once typed |

### Part 5: not tried on a device

Everything above, on the bench and the Fold 8: `ACCEPTANCE.md` → "0.4.0
checks", step 11, runs each inner screen at several simulated sizes and font
scales (`wm density` and `font_scale` on the bench). Whether the fade shows
as drawn, and the native cause of the fold and turn faults, can only be seen
there.

## Part 6: four small fixes from the second test build

The test build of `ae0cc2f` was run on the Fold 6 bench on 2 November at
several simulated sizes and font scales (`..\runs\20261102-ae0cc2f-test.md`).
Every fault from the first build was fixed there. It found four new things.

### 1. N/A never breaks

The Last time card read "3 ratings, 1 N/" with "A" on the next line (792
and 640 upright, at font 1.15). Every N/A the app shows now comes from one
place in `src/content/product.ts`:

- `NOT_EATEN` is `N⁠/⁠A`: word joiners (U+2060) either side of the
  slash, so no line can end inside it;
- `notEatenCount(n)` holds the number to it with a no-break space (U+00A0),
  so "1 N/A" never splits between the two.

The Last time summary, the cook page's ratings, Who ate it?'s N/A buttons
and Who's eating's words all use them. The export file keeps a plain "N/A
(didn't eat it)": it is a text file for other apps, not a screen.

### 2. Who ate it?'s stars, N/A and pencil are one row

At 640 upright the pencil fell onto a line of its own under the stars and
N/A. The three are now one row that never wraps inside itself
(`flexWrap: 'nowrap'`). The row sits beside the name when it fits, and
under it when it does not. Where even the line under the name is too
narrow, the space either side of each star closes up first: a star button
goes from 38 dp (`starTarget`) down to the star's own 30 dp (`starButton`,
now on `widthTokens`' touch-target list). N/A and the pencil never shrink.

How wide the row is, worked out from the tokens. N/A's own width is an
estimate from the font (about 50 dp at font scale 1.0, 54 at 1.15 and 57 at
1.3), since Jest cannot measure text:

| Font scale | Row, stars at 38 | Row, stars closed up to 30 |
|---|---|---|
| 1.0 | about 296 dp | about 256 dp |
| 1.15 | about 300 dp | about 260 dp |
| 1.3 | about 303 dp | about 263 dp |

The line under the name is the pane less 68 dp (the gutters, the rail and
its gap). So:

- **Cover, one column:** the window less 68. 412 gives 344 and 369 gives
  301, so the row fits as drawn, or nearly. 340 gives 272, so the stars
  close up a little. It stays on one line in a window as narrow as about
  328 dp.
- **The review on two panes:** the right-hand pane is the window less the
  left pane (45 %, 320 to 400). The row fits as drawn from a window about
  688 dp wide (the bench's 707 gives 319), and closed up from about 648.
- **Below that, the row is wider than the line:** a window 640 to 647 dp
  wide upright, with two panes, like the test run's 640 upright. There the
  line is 252 dp, so at font 1.15 the row is about 8 dp wider (4 at 1.0, 11
  at 1.3). It stays whole and runs into the pane's 20 dp right gutter, not
  off the pane. Neither Fold's own sizes come near it.

### 3. Text cut off after a live font-size or density change

After the font size or density was changed with the app open, labels were
clipped ("Breakfas", "Lunch/", "Sid", "COOKING" without "NOW", "Cooking Lab"
without "Test") until a restart. **The cause is inside React Native, and the
app cannot fix it.**

- **Nothing in the app keeps either value.** No module reads the font scale
  or density once. The font scale is read only through `useWindowDimensions`,
  on every render. The styles `makeStyles` keeps are built from the theme
  alone, in dp, and Android scales the text in them itself. The one size
  worked out from the font scale (a multiline box's tallest height) follows
  a live change. `liveFontScale.test.tsx` holds all of this.
- **React Native keeps the old sizes.** React Native 0.86's text layout
  (`TextLayoutManager`, in `ReactCommon/react/renderer/textlayoutmanager`)
  keeps a cache of measured text. Its key is the words, their font, size,
  line height and letter spacing, and the space allowed
  (`TextMeasureCache.h`). The phone's font scale and density are not part of
  it: Android applies them only when it measures. After a live change, a
  label with the same words and space gets back the size measured at the old
  scale. It is then drawn at the new scale inside that box, so its end is
  cut off. On a font-scale change React Native only asks the root view to
  lay out again (`enableFontScaleChangesUpdatingLayout`). It never clears
  that cache. Only a restart does, which is what the test run saw.
- **Why the app cannot fix it.** The only way in from the app would be to
  change something in that key on every font-scale change: either nudge a
  size by a fraction, or work the sizes out in the app instead of leaving
  them to Android. The first would change every line of text the app draws
  just to get round React Native's internals. The second would lose Android
  14's non-linear font scaling, which draws large text less large. Neither
  could be checked on a device in this part. So, as the line asks, it is
  left as it is. It is React Native's to fix.

### 4. Typed words are never dropped without warning

In the acceptance run a title typed into the title box was lost when Back
closed the keyboard without Save title, and the cook was reviewed as
"Untitled cook". `src/state/useSaveOnLeave.ts` saves a one-line field's
words when the field is left: it loses focus, or the keyboard closes while
it has focus. Android's Back closes the keyboard and leaves the field
focused, so that counts as leaving too. It saves as the field's Save would,
and never twice for one leave. Only the field with focus answers the
keyboard closing.

| Edit | On leaving the field |
|---|---|
| The cook's title | **Saves**, as Save title does. Unchanged or empty saves nothing; Save title still clears a title. |
| Rename on Who's eating | **Saves**, as Save does. Unchanged or empty saves nothing. |
| Other's cuisine words | **Saves**, as Save does. Unchanged or empty saves nothing. |
| A person's own line (Who ate it?) | **Saves**, as Save line does. Unchanged or empty saves nothing; Save line still clears a line. |
| A tag | **Keeps the words**, with Add in sight. The field is also the search for existing tags, so typing part of one must not add it. **Done** on the cook page now adds words typed but not added before it closes the field. If adding fails, the field stays open with the problem. |
| A note being edited | **Keeps the words**, with Save in sight. A note spans lines and every save keeps a version. **Edit on another note**, which closes this editor, now saves its changed words as a new version instead of dropping them. |
| The Add a reading value | **Keeps the number**, with Add reading in sight. Closing the sheet is Cancel. |
| A guest's name (Who ate it?) | **Keeps the words**, with Add in sight. |
| A new person's name (Who's eating) | **Keeps the words**, with Add in sight. |

Rename and Other now mark a save as under way at once rather than after the
next render, so Return (which also blurs the field) saves once.

### Part 6: the decisions

1. **N/A is joined on screen only.** The export keeps the plain letters, so
   a search in another app still finds "N/A".
2. **The intro on Who's eating** ("Anyone can be N/A on the day") joins
   "be" to N/A as well, so N/A never starts a line on its own there.
3. **The stars close up before anything else gives.** The line asked only
   that the row never split. Closing up the space either side of each star
   (38 down to 30 dp, the star itself never smaller) keeps it on the line at
   every size the bench runs except the 640 two-pane review. N/A and the
   pencil keep their size because they are the smaller targets.
4. **The review's panes are unchanged.** Widening the right-hand pane on a
   window under about 648 dp would end the 640 case. The line asked for the
   width to be reported rather than for the panes to change.
5. **An empty title, line or name saves nothing on leaving**, as the line
   says, so leaving can never clear one. Their Save buttons still clear a
   title or a line, as before.
6. **Too many characters saves nothing on leaving.** The field stays open
   with its warning and its Save.
7. **Tags and notes keep their words rather than saving them**, for the
   reasons in the table. The two ways they could still vanish (Done, and Edit
   on another note) were closed.
8. **The multiline fields on the review** (Your notes, Next time) and the
   Ingredients box were left as they are. They are not one-line edits, and
   the review's are saved by Finish review.

### Part 6: verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass: **85 suites, 1685 tests**, up from 82 and 1646 at the end of
part 5. No package added; `package-lock.json` unchanged.

| Test file | What it pins down |
|---|---|
| `notApplicableWhole.test.tsx` (new, 9) | `NOT_EATEN` and `notEatenCount`; the Last time summary and the Who's eating words; no plain "N/A" in the code of screens, components, content or routes; every N/A drawn on a reviewed cook's ratings, the Last time card, Who ate it? and Who's eating is joined, and Last time's is held to its number |
| `innerScreens.test.tsx`, `adaptiveLayout.test.tsx` | Who ate it?'s row never wraps inside itself, on the cover and the inner screen, upright and sideways, at every size and font scale; the stars close up to 30 dp; N/A and the pencil never shrink |
| `liveFontScale.test.tsx` (new, 5) | No `PixelRatio` or `Dimensions.get`; the font scale read only from `useWindowDimensions`; kept styles built from the theme alone; a multiline box's tallest height re-derived on a live font-scale change |
| `saveOnLeave.test.tsx` (new, 22) | Each edit in the table above: the title saved on Back and on blur, once, and not when empty, unchanged or cancelled; Rename, Other and a person's line saved on leaving, once with Return; only the focused field saves; a tag, a note, a reading, a guest's name and a new person's name kept with their Save; Done adding a typed tag; Edit on another note saving the first note's changes |
| `CookScreen.test.tsx`, `update2Screens.test.tsx` | Save title still saves while typing; the ratings card and Last time show the joined N/A |

### Part 6: not tried on a device

The line said no device work. `ACCEPTANCE.md` → "0.4.0 checks" adds step 12
(a live font-scale change, which is expected to still cut labels short until
a restart, for the reason in fix 3) and step 13 (the title on Back). Whether
the word joiners hold N/A together in Android's line breaker, and how the
closed-up stars look, can only be seen there.


## Part 7: a web preview, and a scale pass to normal app sizes

Mike looked at 0.4.0 on the Fold 6 and found everything far too big: the
type, the buttons, the chips, the photos. Part 7 adds a way for the build
chat to see every screen without a phone, then brings what is drawn down to
Material 3's sizes while every control keeps its 48 dp touch area. Code,
tests and docs only. The version stays 0.4.0, `versionCode` 7.

### 1. The web preview

The app's real screens in a browser (`build-control/PREVIEW.md`).

- **Two dev dependencies:** `react-native-web` 0.21.4 and
  `@expo/metro-runtime` 57.0.17, at the versions `npx expo install` picks
  for SDK 57 (`build-control/dependency-triage.md`). Metro serves `.wasm`.
- **Preview mode, on the web only.** `src/data/runtime.web.ts` replaces the
  storage runtime in a web bundle: an unencrypted SQLite database in memory
  (expo-sqlite's web build), made by the app's own migrations and filled
  through the app's own services from `src/preview/seed.web.ts`. The
  camera and library answer "cancelled"; sharing does nothing.
- **The preview notebook:** two open cooks (the muffins a second time, with
  Last time, Next time, an Oven and an Internal reading, notes with one
  edited, two photos; a traybake the first time); twelve reviewed cooks
  across all five meals, nine with a cuisine (one Other) and three without;
  ratings from You and Guest (the household) and Guest 2 (a guest), with two
  N/As and four lines; ingredients and tags. Photos are flat colour blocks
  drawn in code.
- **URL options:** `?screen=` opens any of eleven screens in the state the
  design pack shows; `?theme=light|dark`; `?fontScale=` multiplies every
  text style. A screen's sheets and states are reached by pressing and typing
  on its own controls, so no screen has a way in for the preview.
- **`npm run preview:web`** exports to `preview-web/` (ignored);
  **`npm run preview:serve`** serves it on 127.0.0.1 with Node alone. Only
  `.wasm`'s type matters; the isolation headers are sent but not needed.
  expo-sqlite locks its browser storage, so one tab per address.
- **Nothing of it reaches the Android build.** Every preview file is
  `.web.ts` or `.web.tsx`; shared code reaches it from the root layout and
  the type scale only, each behind `Platform.OS === 'web'`, which Metro
  drops from an Android bundle. An Android export of the JavaScript before and
  after part 7 differs by 63 bytes: the root layout's one-line wrapper, and
  the tokens file loading `Platform`. No preview module, name or data is in
  it.

### 2. The scale pass

The rule, now in Design Baseline v3 section 4: **touch area 48, drawn size
per Material 3.** Every control keeps a 48 dp touch area; what is drawn
follows Material 3, and a hit area (`touchSlop`, `src/theme/touch.ts`)
makes up the rest. Before, every drawn size was made equal to its touch
target, and the type ran a size or two above Material 3 with 800 almost
everywhere.

- **Type:** the table in Design Baseline v3 section 3, before and after.
  800 stays for the app's name and titles only.
- **Drawn sizes:** buttons 40 (the main action, Finish review's bar and New
  Cook 48); chips 32; the round ⋯, filter, Back, pencil, bin and camera 40;
  the search bar's × and Send 36; icon circles 32; the cover's cook-card
  photo 80 × 68 and the inner one 64 × 56; Cooking now a compact card with a
  56 photo and one row of meta that wraps only where it must. The full table,
  before and after, is in section 4.
- **Space:** the cover gutter 16 (20 turned sideways), inner 20; cards and
  zones padded 12 to 14; gaps between sections a step tighter. Corners: card
  16, zone 18, field 12, photo 12; pills stay pills.

### Part 7: the decisions

1. **The packages are dev dependencies.** The phone never runs
   `react-native-web`; `@expo/metro-runtime` was already in the tree under
   `expo-router` and is now 57.0.17 rather than 57.0.15, the one copy.
2. **Preview mode is every web bundle,** not a flag: the web has nowhere to
   keep an encrypted notebook, and nothing ships to the web.
3. **The preview's sheets are opened by tapping, not by new props.** The
   browser clicks the screen's own controls; Jest presses them.
4. **The type scale's preview hook mutates the rows once, at load,** behind
   `Platform.OS === 'web'`. On a phone the rows are the literal values above.
5. **The two phone-bundle guards skip web files.** `fixtureSeparation`
   (no synthetic data in the bundle) and `liveFontScale` (the font scale
   read only live) now skip `.web.*` files, which never reach the phone;
   `previewNotInAndroid.test.ts` holds them to that.
6. **Tracking** on titles was scaled down with their sizes; the line gave
   only overline's.
7. **Sizes the line did not name:** the title photo 92 → 72, a person's
   circle in Who's eating 52 → 40, photos' corners 14 → 12, the search bar
   50 → 48 (a text field, so its drawn size is its touch area), links and
   Screen on 48 → 40 like buttons, icons in a 32 circle 22 → 18. Unchanged:
   text fields (48), the reading box, the star's own sizes.
8. **Stars reach 5 dp either side** to 48 wide. Neighbours share that 5; a
   tap there goes to the star on the right. Their drawn and own widths are
   as part 6 left them.
9. **Who ate it?'s row is about 8 dp narrower** (the pencil 48 → 40, N/A
   32 tall but still 48 wide). By part 6's estimate that brings the 640
   two-pane case to within the line at font 1.0 and 1.15; Jest cannot
   measure it, and it was not tried on a device.
10. **Cooking now puts the title first,** then one row of meal, cuisine and
    the started line, so the meta shares a line wherever it fits.

### Part 7: verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass: **88 suites, 1749 tests**, up from 85 and 1685 at part 6.

| Test file | What it pins down |
|---|---|
| `webPreview.test.tsx` (new, 23) | The URL options; the preview notebook made by the migrations and covering every screen in the design pack, with only You, Guest and Guest 2; photos as colour, never files; every `?screen=` drawn, its steps reaching its state, with no error |
| `previewNotInAndroid.test.ts` (new, 4) | Every preview file a web file; the browser's runtime beside the phone's; the preview reached from shared code only behind `Platform.OS === 'web'`, never by a plain import |
| `touchArea.test.tsx` (new, 37) | Every pressable on every preview screen, and on Home's menu, a cook's actions and Delete's confirm, Add a photo, the tag and title editors, earlier versions and a reviewed cook's menu, on the cover and inner screens: drawn size plus hit area at least 48 each way |
| `fonts`, `editDeleteScreens`, `innerScreens`, `photoScreens` | The new weights; ⋯, the pencil and the camera drawn 40 with a 48 touch area |
| `noFixedWidths`, `contrast`, `noHandTypedStyles` | Unchanged, and passing |

The preview was also built and served. After the scale pass every
`?screen=` opened in Chromium at 369 × 800 and reached its state with no
console error; Home, the reviewed cook at font 1.15 and the review in dark
were also looked at on 792 × 880.

### Part 7: not tried on a device

The line said no device work. How the new sizes feel in the hand, and
whether a 32 chip's hit area ever lands on its neighbour, can only be seen on
the Fold.

## Part 8: Notes and Photos side by side only when there is room

In part 7's web preview, at 823 and 880 wide sideways (`?screen=cook`), the
cook page's main column put Notes and Photos side by side at about 230 dp
each, and a note wrapped a word or two to a line. Code, tests and docs only.
The version stays 0.4.0, `versionCode` 7.

### The rule

Notes and Photos sit side by side only when the inner screen is turned
sideways **and** each would get at least 300 dp of the main column
(`size.notesPhotosMin`); otherwise they stack, Notes above Photos, as
upright. Each is half the column less half the 12 dp gap between them.

The main column is worked out from the live window on every render, the same
way as the panes: the window less the side column's share (42 %, 280 to 380),
less a 20 dp gutter each side, never wider than a column of cards (560).
`notesAndPhotosLayout` and `cookMainColumnWidth` in
`src/layout/responsive.ts`; the cook page reads them with
`useWindowDimensions`.

| Window | Side column | Main column | Each, side by side | Chosen |
|---|---|---|---|---|
| 707 × 823 (upright) | 297 | 370 | 179 | stacked |
| 792 × 880 (upright) | 333 | 419 | 203 | stacked |
| 823 × 707 (sideways) | 346 | 437 | 212 | stacked |
| 880 × 792 (sideways) | 370 | 470 | 229 | stacked |
| 1000, either way | 380 | 560 | 274 | stacked |
| 1200, either way | 380 | 560 | 274 | stacked |

### Part 8: the decisions

1. **No window puts them side by side today.** A column of cards stops at
   560, so each half gets at most 274 dp, under 300. The rule is kept as the
   line set it, and side by side comes back by itself if the column's limit
   ever grows past 612. The column's limit was not changed: the line did not
   ask for it.
2. **Stacked sideways, the photos are three to a row,** as upright on the
   inner screen; two to a row only when side by side.
3. **Readings are unchanged:** the two reading cards still widen sideways.
4. **300 is a limit, not a width,** so it lives in `src/theme/tokens.ts`
   beside the panes' limits and is never set as a style.

### Part 8: verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass: **89 suites, 1766 tests**, up from 88 and 1749 at part 7.

| Test file | What it pins down |
|---|---|
| `notesAndPhotos.test.ts` (new, 17) | At 707, 792, 823, 880, 1000 and 1200 wide, upright and sideways: the side column, the main column, what each would get side by side, and the layout chosen; the column from the window; stacked on every window from 600 to 2400 |
| `innerScreens.test.tsx` | Sideways on the Fold 8, Notes above Photos, each the whole column, photos three to a row; the bench stacked both ways |
| `adaptiveLayout.test.tsx` | Sideways, upright, sideways: the same keys set each way, stacked throughout |

In the web preview (`npm run preview:web`, `?screen=cook`) at 823 × 707 and
880 × 792: Notes and Photos stacked, each 437 and 470 dp wide, matching the
table; the side column 346 and 370. Each note fits on a line or two
("Grated both apples, and didn't squeeze / them." at 823; one line at 880),
and the photos sit three to a row.

### Part 8: not tried on a device

The line said no device work.
