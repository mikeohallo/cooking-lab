# Release 0.3.0 — update 2

**Status:** built, tests green on the desktop; no APK built, nothing installed, not yet tried on a device
**Date:** 30 October 2026
**Version:** 0.3.0 (`versionCode` 6)
**Schema:** version 4 · **Backup format:** version 4 (both from part 1, unchanged in part 2)
**Builds on:** 0.2.2 (`RELEASE_0.2.2_FIXES.md`), at `e0f7de1`

Update 2 was planned and designed with Mike on 30 October and built in two
parts. Code, tests and docs only.

- **Part 1 — what a cook records and how it behaves.** Schema 4, meal types,
  ingredients, who ate it, Cook this again and *Last time*, History's new
  search and filters, backup format 4. Its full record, with its decisions and
  tests, is [`RELEASE_0.3.0_PART1.md`](./RELEASE_0.3.0_PART1.md); it ended at
  `9afbbcb`.
- **Part 2 — the new look**, on top of part 1: colour scheme A and Plus Jakarta
  Sans, Home as History with pages, two panes on the inner display, and N2.
  This file records part 2 in full and both parts in summary.

## Part 1 in short

A cook can now carry a meal type (Breakfast, Lunch/Dinner, Dessert, Snack), an
ingredients list with every version kept, and ratings from the household and
guests (one to five stars, N/A, a line). *Cook this again* starts a new cook
from an earlier one and shows what was said last time. Search reaches the
ingredients and filters by meal type and by who gave how many stars. The text
export and the backup carry all of it. N3 (the note editor's Save and Cancel
under the keyboard) was fixed. See the part 1 record for the 18 decisions.

## Part 2: what was built

### 1. Colour scheme A, "Paprika", and Plus Jakarta Sans

Mike's pick on 30 October. Recorded as
[`DESIGN_BASELINE_V2.md`](../design/DESIGN_BASELINE_V2.md), which replaces v1.

- **The palette** in `src/theme/tokens.ts`: ground `#F4F4F2`, white cards,
  surface 2 `#EDEDEA`, ink `#17181B`, muted text `#5B5E64`, border `#E0E0DC`,
  near-black primary buttons `#1D1E22` with white text, paprika `#B83F27` for
  links and small actions, stars `#C98A00`, and the Last time and Next time
  panel `#FBEDE8` with border `#F1D3C9`.
- **Meal types** have their colours: a soft label above the title and a dot on
  the chips, always with the word.
- **Kept meanings, retuned shades:** the Oven reading's quiet grey card, the
  Internal reading's amber, the red TEST badge, and the evidence and status
  treatments with their labels.
- **Contrast test:** every text/background pair in the tokens is listed and
  held to 4.5:1 (3:1 at 24 px and up).
- **Plus Jakarta Sans** 400 to 800, bundled in the APK with `expo-font` (SDK
  57) from `@expo-google-fonts/plus-jakarta-sans`; never fetched. Each screen
  shows a plain ground until the fonts load, and the system font if they fail.
  Font scaling still applies. The OFL licence is noted in the README and
  `build-control/dependency-triage.md`.

### 2. Home becomes History

One Home, top to bottom: **Cooking Lab** with a **⋯** menu (Export everything,
Who's eating); **New Cook**, primary, as before; **Cooking now**, the open
cooks, hidden when there are none; the search box ("Search titles, tags,
ingredients") with the meal-type chips, Who & stars and *Show me my tags*
under it; then the **reviewed cooks**, newest first.

- **Ten to a page**, with Previous / "1 of 2" / Next under the list and
  "14 cooks · page 1 of 2" above it. Changing page brings the search box to
  the top of the screen. Opening a cook and coming back finds the same page
  and scroll position. A search or a filter starts at page 1 and pages the
  same way.
- **Each card:** the meal-type label above the title; the title, never cut off
  (N2); the date; the ratings in one line ("★ 5 Alex · ★ 4 Jo", from the data,
  N/A left out); then the first line or two of the notes. Old reviews show
  their notes and no stars.
- The **History screen and "See all history" are gone**; `/history` redirects
  to Home.

### 3. Two panes on the inner display

`src/layout/responsive.ts` gives two panes from **600 dp wide when the shorter
side is at least 600 dp**. The Fold's cover display (about 369 × 905 dp) is one
column either way up; the inner display (about 707 × 823 dp) is two panes
either way up; half the inner display in split screen is one column.

- **Home:** search, filters, the page of ten and the pager on the left
  (380 dp); the chosen cook's whole page on the right — Cook this again,
  ratings, notes, next time, ingredients, the timeline. The first cook on the
  page is chosen; tapping a card changes the right pane without leaving Home.
- **An open cook:** the timeline and the pinned composer on the left; Last time
  and the whole ingredients list on the right (340 dp), never folded there.
- **The review:** the who-ate-it rows (360 dp) beside your notes and next time,
  with Finish review under them.
- **Sheets, confirms and the photo viewer** open inside the pane they belong
  to, and the **Undo bar** sits inside Home's list pane.
- **Folding or unfolding mid-cook** keeps the cook, the note half-typed in the
  composer and the scroll view: the main pane is drawn with the same tree on
  one column and on two.

### 4. N2: a card dropped its title's last word

In the 0.2.2 test run, "Acceptance cook" showed as "Acceptance" on History and
on the cover display's Home card. The title was a shrinking item in a row
beside the Open chip; Android measured it at the row's width, drew it
narrower, and the wrapped last word fell on a line that was never drawn. The
title is now a block of its own, the card's full width, with no line limit;
the Open chip sits on the line above it with the meal-type label.

### 5. Version

`app.config.ts`: version **0.3.0**, `versionCode` **6**.

## The decisions

What the part 2 brief did not settle.

1. **Search and filters cover the reviewed cooks.** Open cooks stay under
   *Cooking now*, above the search, whatever is typed; they are never in the
   paged list.
2. **The All / Open / Reviewed tabs are gone** with History: open and reviewed
   cooks now have their own places on Home. Their empty-state wording went
   with them.
3. **One page needs no pager.** With ten cooks or fewer the count reads "3
   cooks" and Previous / Next are not drawn; at the ends of the pages the
   button that would go nowhere is disabled.
4. **Search results page as one list,** "All your words" first, then "Some of
   your words"; each group's heading is drawn on the pages that hold some of
   it.
5. **The ⋯ menu opens in place** under the title, not as a sheet. Export
   everything is offered there only when there is something to export, as
   before; opening Who's eating closes the menu.
6. **The chosen cook on two panes** is the one tapped while it is on the page;
   otherwise the first on the page — after a page change, a search, or a
   deletion.
7. **An open cook always opens on its own page,** on two panes too, because
   that is where its composer is. The right pane on Home shows reviewed cooks.
8. **Inside Home's right pane, the cook's page has no Back,** and deleting it
   from its ⋯ leaves Home showing the next cook; *Cook this again* and Last
   time's *Open* go to that cook's own page.
9. **The review's split:** who ate it, the meal type, tags, suggestions and the
   raw evidence on the left (360 dp); your notes and next time on the right,
   with Finish review pinned under them.
10. **Sheets are pane-local on two panes only.** On one column each is the
    full-screen sheet it was. On two, Android's Back still closes it.
11. **The Undo bar goes in Home's list pane** on two panes, where the deleted
    cook was and where a cook deleted from its own page lands.
12. **Folding keeps what is typed in the composer and the review's fields,**
    and the main pane's scroll view is the same one, so its offset is kept.
    Last time and the ingredients move between the panes when folding, so the
    content above the timeline changes height. The Ingredients editor, if it
    was open with unsaved words at that moment, is drawn afresh in its new pane
    and those words are lost.
13. **The ratings line** is household order then guests, as the review shows
    them; a rating that is N/A or only a line is left out; TalkBack reads it as
    words ("Alex 5 stars, Jo 4 stars").
14. **The stars are `#C98A00` as picked,** 2.95:1 on white. They are drawn only
    beside the number and name in ink, so they are not counted as text in the
    contrast test (the test pins that they never are).
15. **`primarySoft` is `#EAEAE6`,** the one shade the pick did not give: the
    first draft, `#E7E7E3`, put paprika at 4.48:1.
16. **Quiet buttons and links are paprika; secondary buttons are ink** on the
    soft grey; chips are ink, and filled near-black with a tick when chosen.
17. **The font gate is inside each route** with the startup gate, not around
    the navigator, which stays mounted from the first frame so the router can
    match the launch URL (0.2.1's lesson). Only five of the package's fourteen
    files are bundled, each `require`d on its own.
18. **Each weight is its own font family,** with `fontWeight` set to normal
    once the fonts have loaded, so Android does not thicken a bold file twice.
19. **Line heights grew a little** for the display, title, button and
    temperature styles, which Plus Jakarta Sans needs to keep descenders clear.
20. **The launcher icon is unchanged,** sage background included; it was not
    part of the new look and no image was made.
21. **Screen tests default to the cover display's width** (369 dp) in
    `jest.setup.ts`; React Native's own test window is 750 dp, which would now
    be two panes. The two-pane tests set the inner display's figures.
22. **Design Baseline v1 is kept, marked replaced,** and its "Approved by"
    line now gives the product owner's first name only, as the rest of the
    repository does.

## How it is built

New: `src/theme/fonts.ts`, `src/state/FontGate.tsx`, `src/layout/panes.tsx`
(pane-local sheets), `src/layout/RevealOnChange.tsx`, and `src/screens/home/`
(the card, the search panel, paging, the ratings line).

Changed: the tokens, `AppText` and `TextField` (the face), `ActionButton`,
`Card` (the panel and selected states), `MealTypeLabel` (colours and the dot),
`ShellHeader` (the ⋯ slot), `ScreenContainer` (a side pane, one tree on one
column and two), `PendingDeletion` (the Undo bar in a pane), `responsive.ts`,
Home, the cook and review screens, the three sheets, `IngredientsBox`,
`LastTimeCard`, `NextTimeList`, `MealTypeChips`, the routes and
`content/product.ts`.

Removed: `src/screens/HistoryScreen.tsx`; `app/history.tsx` now redirects.

New packages: `expo-font` `~57.0.3` (57.0.4 installed, the copy already in the
tree under `expo` moved up with it) and `@expo-google-fonts/plus-jakarta-sans`
`^0.4.2`. Neither declares an Android permission.

## Verification

On the desktop, at the last code commit: `check:secrets`, `typecheck`, `lint`
and the test suite pass — **67 suites, 1141 tests**, up from 65 and 1061 at the
end of part 1. `npm audit --audit-level=critical` exits 0. The merged-manifest
test (`androidPermissions`) still gives `INTERNET` and `CAMERA` and nothing
else. CI has not run on these commits: they had not been pushed when this was
written.

| Test file | Tests | What it pins down |
|---|---|---|
| `contrast.test.ts` (new) | 53 | Every text/background pair in the tokens at 4.5:1 (3:1 large); every status, meal type and reading treatment listed; scheme A's values as picked; the stars never counted as text |
| `fonts.test.tsx` (new) | 7 | The five weights bundled from the package, no URL; the plain screen until loaded; a family per weight; the system font on failure; font scaling kept; the OFL noted |
| `HomeScreen.test.tsx` (rewritten; History's tests folded in) | 20 | Empty state, New Cook, Cooking now, the ⋯ menu; ten to a page, the count, Previous and Next, the page kept on coming back, search and filter back to page 1, the search box revealed on a page change; the card's order and ratings line, N/A left out; N2 at 320 dp and the largest font scale |
| `twoPanes.test.tsx` (new) | 12 | The breakpoint on both displays either way up and in split screen; Home's list and the chosen cook's page, a tap changing it; an open cook's panes, ingredients never folded; the review's panes; sheets and the Undo bar inside their pane; folding and unfolding keeping the cook, the note and the scroll view |
| `appConfig.test.ts` | +1 | Version 0.3.0, `versionCode` 6 |

Changed: `exportScreens` (Export everything through the ⋯ menu; the three
History filter empty-state tests removed with the tabs), `historySearchScreen`
(the meal-type chips in place of the tabs; the search covers reviewed cooks
and leaves Cooking now alone), `update2Screens` (Who's eating through the ⋯),
`readingComposer` (the Internal card's new token), and the screen tests that
rendered History, now rendering Home. Removed: `HistoryScreen.test.tsx`.

Jest has no text layout, so N2 and the two panes are tested by structure — no
row around the title, no line limit; which views are in which pane, and that
the same views survive a fold — not by pixels.

## What has not been tried on a device

None of 0.3.0 has. Part 1's list is in its record and still stands. For part
2, still to see on the Fold:

1. Scheme A on both displays, in daylight in a kitchen: the paprika links, the
   meal-type labels and dots, the Last time panel, the Oven and Internal
   cards, the TEST badge.
2. Plus Jakarta Sans: the plain screen at start is brief and then the face is
   there; weights look right (no doubled bold); font scale 2 on the cover
   display.
3. N2: "Acceptance cook" and a long title in full on Home's cards on the cover
   display, at the default and largest font scale.
4. Home: Cooking now, the search box and chips, ten to a page, the pager,
   "page 1 of 2"; Next bringing the search box into view; the same page after
   opening a cook and pressing Back.
5. The inner display: Home's two panes, a tap changing the right pane; an open
   cook's panes with the keyboard up; the review's panes.
6. Sheets inside their pane on the inner display, Back closing them; the Undo
   bar in the list pane.
7. Folding and unfolding mid-cook with a half-typed note, and mid-review. The
   tests show the app keeps them when the window changes size; whether Android
   keeps the activity across the fold, rather than recreating it, depends on
   the generated manifest's `configChanges`, which this run did not generate
   or check.
8. Split screen and landscape on both displays.
9. Export everything from the ⋯ menu into another app (Mike, on his own phone).
