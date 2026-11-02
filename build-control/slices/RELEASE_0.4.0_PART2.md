# Release 0.4.0, part 2 of 3 — the cover screen

**Status:** built, tests green on the desktop; no APK built, nothing installed, not yet tried on a device
**Date:** 2 November 2026
**Version:** unchanged at 0.3.0 (`versionCode` 6) — part 3 sets 0.4.0
**Schema:** version 5 · **Backup format:** version 5 (both unchanged)
**Builds on:** part 1 (`RELEASE_0.4.0_PART1.md`), at `13432bf`

Part 2 redraws the cover screen's screens on part 1's design system, from the
approved design pack's screens 01 to 09: Home, Filters, the empty Home, Who's
eating, the cook page grouped by section, Add a reading, Finish review and
Edit review, a reviewed cook, and the other states. The inner display keeps
its two panes from 0.3.0 with the new screens inside them; part 3 draws its
own layouts. Code, tests and docs only.

## What was built

### 1. Home (01, 03)

- The top: "Cooking Lab" in app-title and a round ⋯. The ⋯ menu holds Export
  everything, Who's eating and the version line. The old card at the top, New
  Cook in the page and the tagline are gone.
- **Cooking now:** a sage card per open cook — COOKING NOW, the cook's card
  photo (or a tile with its meal icon), meal label and cuisine pill, title,
  "Started 9:02 am · 3 notes · 2nd time", a round chevron. Long-press offers
  Delete cook. Hidden with no open cook.
- **Your cooks:** the heading with "14 reviewed" (or "2 of 14" while searching
  or filtering); the search bar with the round filter button and its count
  badge; the chips All, then the five meals, in one scrolling row.
- **Cook cards:** the card photo or meal tile, meal label and cuisine pill,
  title, "Tue 27 Oct · 3rd time", the average of the stars with how many gave
  them, or the Needs a review chip; a round chevron. Ten to a page with the
  Pager. A search result still adds its matched tags and ingredients.
- **New Cook** floats, centred, above the foot of the screen
  (`ScreenContainer`'s new `floating`), with room at the end of the list. The
  Undo bar after a delete sits just above it.
- **Before the first cook:** the book in its sage circle, "Nothing cooked
  yet", the line, and the loop as pills.

### 2. Filters (02)

The round filter button opens a sheet: WHO & STARS (a person, then "★ N and
up"), CUISINE (the ten in order, then Other words in use), TAGS. Chosen chips
are navy with a tick. Clear on the left; "Show N cooks" in orange on the
right, counted live. Closing it any other way changes nothing. It replaces
the old Who & stars panel, Show me my tags and Clear filters on Home.

### 3. The cook page, grouped (05)

- Top bar: ‹ Home, the Screen on pill (sage with a sun when on, outlined when
  off), Finish & review in teal.
- Header: meal label and cuisine pill, the title (still tap to rename),
  "Today · 9:02 am · 2nd time cooking this", and the card photo on the right.
  Then the tags as chips with "+ Tag", which opens the field, Used before and
  Show me my tags.
- In order: **Next time** (amber, from the last time, first when there is
  one); **Last time** (date, average, Open); the **Ingredients bar**
  ("12 · Show", opening the list in place, where it is edited as before);
  **Readings · N**, cards two to a row; **Notes · N**, one card, a row per
  note in the order written, each with its pencil and ⋯; **Photos · N**, a
  grid with a + tile.
- The timeline is gone from the screen; times stay in the data. A note's time
  is in its Note options, a photo's in the viewer.
- **The composer** is pinned to the foot, above the keyboard: Oven °C and
  Internal °C, then one rounded field with the camera inside on the left and
  the orange round Send on the right. The note grows to five lines and then
  scrolls inside itself; the 0.2.2 tests (40-line paste, 320 dp, largest
  font, keyboard open and closed, both displays) all pass on it.

### 4. Add a reading (06)

A sheet over the dimmed page: Oven, Internal and Somewhere else as choices;
the number in a field with its icon and °C; "Taken now, 9:40 am"; Cancel and
an orange Add reading. Somewhere else asks where, in the cook's own words, and
stores no kind, byte for byte as before.

### 5. Finish review and Edit review (07)

- ‹ Back to the cook, "Review" on the right; the title, "Today · 9:02 am ·
  2nd time cooking this" and the photo.
- **What was it?** — the five meals as choice chips, chosen teal with a tick.
- **Cuisine** (Optional) — the ten and "+ Other", which opens a short field;
  a tap on a chosen one clears it.
- **Who ate it?** — a row per person on a rail: dot, name, five stars, N/A
  and a pencil for their line; the line under it, or "+ Add a line", or, for
  N/A, "Didn't eat it this time. Counts nowhere."; then "+ Someone else".
- **Your notes**, beside its page icon; **Next time** in amber, "Shown before
  you cook this again."
- **Finish review**, orange, pinned at the foot.
- **Edit review** is the same screen on a reviewed cook, filled in, with
  **Save review**: changed notes or next-time lines become new versions beside
  the old ones; meal, cuisine and ratings save as they are tapped, as before.

### 6. A reviewed cook (08)

Header with the Reviewed chip; tags; Next time (with "edited" when a line has
been changed); **Who ate it?** with the average badge, read-only rows;
**Your notes**; the Ingredients bar; **From the cook** — the readings as
chips, the notes (each with ⋯), the photos. **Cook this again** (orange) and
**Edit review** (teal) are pinned at the foot. ⋯ in the top bar holds Export
this cook and Delete cook.

### 7. Who's eating (04) and the other states (09)

- **Who's eating:** ‹ Home, the people icon and title, the line about stars
  and N/A; numbered cards with Rename and the bin; "+ Add someone"; "Names stay
  on this phone. They are never sent anywhere." Rename is new in the data
  layer (`renameMember`, `HouseholdService.rename`): trimmed, never a name
  already on the list, and every rating stays the person's.
- **No matches:** the search icon, "No cooks match", "Try fewer filters, or
  search for an ingredient." and Clear filters, which clears the search, the
  meal chip and the sheet.
- **The Undo bar** above New Cook after a delete.
- **Note options:** a sheet with the note, its time and "edited", Edit note,
  and Earlier versions with the count.

### 8. Both displays

The inner display keeps 0.3.0's panes: Home's list with the chosen cook's page
beside it, an open cook with Last time and the ingredients in its side pane,
the review's ratings beside your notes. Each uses the new screens. Folding and
unfolding keeps the same cook, the scroll view and a half-typed note
(`twoPanes.test.tsx`, unchanged in what it asks).

## The decisions

What the brief did not settle.

1. **No Delete note.** Screen 09 draws it, but the evidence rules keep every
   note ever written (`removeCookEvent` lets only a photo go). Changing that
   is a product rule, not a layout, so Note options has Edit note and Earlier
   versions only. Mike to decide.
2. **No ⋯ on an open cook's page,** as drawn. An open cook is deleted from its
   Cooking now card on Home (long-press, as before). A reviewed cook's ⋯ holds
   Export this cook (moved from the foot of the page) and Delete cook.
3. **Tags, Suggestions and the raw evidence are off the review,** as drawn. A
   cook is tagged on its own page, open or reviewed.
4. **Meal type and cuisine are set on the review** (and Edit review), not on
   the cook page, as drawn. The cook page shows them under the title.
5. **Notes and next time are changed in Edit review** on a reviewed cook. A
   note on any cook is still changed from its ⋯ → Edit note.
6. **The meal chips on Home choose one meal or All** (they are drawn as a
   single row of choices). 0.3.0's "any of the ones picked" is gone.
7. **Tags picked in the Filters sheet join the search as whole terms,** as
   Show me my tags did, and count in the filter button's badge.
8. **Who & stars in the sheet:** the people as chips; once one is picked,
   "★ 1 and up" to "★ 5 and up". It is on only with both.
9. **The bin on Who's eating means "no longer eats here":** nobody is deleted,
   ratings are kept, and they come back from the list underneath (not drawn).
10. **Reordering on Who's eating** is not drawn. Move up and Move down sit in
    the Rename panel, and as screen-reader actions on each card.
11. **"Needs a review"** is shown on a reviewed cook nobody gave stars, as
    drawn on a reviewed list.
12. **The Ingredients bar starts open** on an open cook with nothing written
    and nothing noted, so the list can be typed or pasted before cooking, as
    the box allowed; otherwise it starts closed.
13. **Readings with no kind** show the cook's own words for where (or
    "Reading") and no icon, so a colour or mark never claims a kind.
14. **Photos are square tiles, cropped to fill;** the viewer still shows the
    whole photo, its time and, for a Gallery photo placed when added, "added".
15. **The page's photo** is the card photo (own first, or the last time's).
16. **"Who ate it?" on a reviewed cook** says "Nobody rated it." when nobody
    did, rather than disappearing.
17. **TopBar actions wrap** onto a second line rather than squeeze, at the
    largest font on the narrowest screen.
18. **Removed:** `TimelineEvent`, `NextTimeList` and `SearchPanel`. New:
    `CookingNowCard`, `FiltersSheet`, `ReadingSheet`, `PhotoSourceSheet`,
    `NoteOptionsSheet`, `Sections`, `CuisineChips`, `IngredientsSection`,
    `useNoteCounts`, `useCardPhotoUris`; icons for the bin, people, lock,
    book, history, refresh and a down chevron.

## Differences from the pictures

Each compared in light and in dark. Left as they are:

1. Text sizes the pictures draw off the type scale (the Cooking now title at
   19, its overline at 12 and line at 13; the section counts at 15 / 600) use
   the nearest token: every size comes from `tokens.ts`.
2. Cards say "· 2 ratings" throughout; the pictures mix "ratings" and
   "reviews".
3. The empty state's circle is the Notice's 48 dp, not the drawn ~88.
4. Search results keep 0.3.0's "All your words" and "Some of your words"
   groups (not drawn).
5. The Undo bar says "Cook deleted", not "Lemon tart deleted" (the bar does
   not know the title).
6. Tag chips on the cook page carry an × (tap to take off) and "+ Tag" is the
   dashed add chip; the picture draws plain chips and a filled + Tag.
7. Notes on the page show no "edited"; Note options does.
8. A reading reads "180°C", as everywhere else in the app and the export, not
   "180 °C".
9. Add a reading's choices are white choice chips; the picture tints Oven.
   Somewhere else adds a where field (not drawn).
10. Finish review is pinned at the foot (the brief); the picture shows it at
    the end of the page.
11. Edit review's top bar says "Edit review" where Finish review's says
    "Review".
12. Notes in From the cook keep their ⋯ (not drawn), so they stay editable.
13. Not drawn but kept: "Who usually eats?" on the first review, the photo
    choice sheet, the retired list on Who's eating, problem notices.
14. No Delete note (decision 1); no ⋯ on an open cook (decision 2).

## Verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass — **76 suites, 1425 tests**, up from 75 and 1404 at the end of
part 1. `npm audit --audit-level=critical` exits 0, with the same advisories
as at `13432bf` (no package added). No permission or package changed. CI has
not run on these commits: they had not been pushed when this was written.

| Test file | What it pins down now |
|---|---|
| `coverScreens.test.tsx` (new, 18) | The Cooking now card and its line and photo; New Cook floating with the Undo bar above it; the sheet's navy chip with a tick; the cook page's photo and Next time first; the rename rule; "Today · 9:02 am"; Home, both cook pages, the review, Edit review and Who's eating in light and dark |
| `historyFiltersScreen` | One meal at a time; the Filters sheet's who and stars, cuisine and tags; the live count; Clear; the badge; No matches and Clear filters |
| `historySearchScreen` | Tags picked in the sheet, as whole terms |
| `update2Screens` | Meal and cuisine on the review; the Ingredients bar; the review's order; Edit review with versions kept; Last time and Next time on a second cook; Who's eating with rename and its refusal |
| `CookScreen`, `readingComposer`, `photoScreens`, `photoTime`, `editDeleteScreens`, `noteEditorLayout`, `tagScreens`, `tagSuggestions`, `exportScreens`, `keepAwake`, `cookScrolling`, `coreLoop`, `twoPanes`, `bottomInsets`, `ReviewScreen`, `HomeScreen` | Updated to the grouped page, the reading sheet, the photo grid and viewer, Note options, + Tag, the ⋯ menu, Screen on, the review as drawn, and the new Home |

## What has not been tried on a device

None of it. To see on the Fold, on both displays, light and dark:

1. Home: the Cooking now card, the chip row scrolling sideways, New Cook
   floating over the list, the Undo bar above it, the Filters sheet.
2. The cook page with real photos: the title photo, the grid, the viewer.
3. The composer with the keyboard open on the cover display, at the largest
   font, and with a 40-line paste.
4. Add a reading with the number keyboard up: the sheet above the keyboard.
5. The review and Edit review, the rail, the Other field; Who's eating.
6. Folding and unfolding on each screen.
