# Release 0.4.0, part 1 of 3 — the foundation and the data

**Status:** built, tests green on the desktop; no APK built, nothing installed, not yet tried on a device
**Date:** 2 November 2026
**Version:** unchanged at 0.3.0 (`versionCode` 6) — part 3 sets 0.4.0
**Schema:** version 5 · **Backup format:** version 5
**Builds on:** 0.3.0 (`RELEASE_0.3.0.md`), at `4af5172`

Mike (product owner) approved the 0.4.0 plan and its design on 2 November
2026. Part 1 lays the foundation: the new design system's colours, type and
shapes, in light and dark; the shared parts rebuilt on them; and the data the
new screens need — Side, cuisine and card photos. Parts 2 and 3 redraw the
screens' layouts on these parts. Code, tests and docs only.

## What was built

### 1. The design system's tokens, light and dark

- `src/theme/tokens.ts` is rebuilt from the design system's `tokens.json`:
  every colour role with its light and dark value, the type styles, corners,
  shadows, spacing, sizes and breakpoints, under the JSON's names in camelCase.
  Scheme A (v2) is gone, every name of it.
- `src/theme/theme.tsx`: the app follows the phone's light or dark setting
  (`useColorScheme`) and changes live when it switches. Styles that use colour
  are built once per theme (`makeStyles`), so a switch re-renders with the
  other set. `app.config.ts` has `userInterfaceStyle: 'automatic'`; the status
  and navigation bars turn with the theme (`app/_layout.tsx`). No switch in the
  app, and Android's dynamic colour is never used.
- Every use in `src/` is on the new roles. No colour, font size, line height
  or corner radius is typed into `src/screens` or `src/components`, and a test
  fails if one is.
- The contrast test is rebuilt from the token notes, in both themes.
- Plus Jakarta Sans is unchanged.
- Recorded as [`DESIGN_BASELINE_V3.md`](../design/DESIGN_BASELINE_V3.md); v2 is
  marked replaced.

### 2. The shared parts

In `src/components/`, each from its design-system note: `Button` (main,
secondary, peach, outlined, text, danger; replaces `ActionButton`), `Card`,
`CookCard` (photo, or the meal tile), `MealLabel` (five meals, icon and word,
never a fill; replaces `MealTypeLabel`), `CuisinePill` (new), `FilterChip`,
`SearchBar` with the round filter button, `Zone` (with `ZoneOverline` and
`ZoneBar`), `NextTimeCard` (new), `LastTimeCard` (new), `SectionGroup` (new,
with `RatingBadge`), `ReadingCard`, `Composer` (`ComposerBar`, `ReadingChip`,
`SendButton`), `NewCookButton` (a centred pill), `StarRating` (`StarButtons`,
`NotApplicableToggle`, `RatingRow`), `StatusChip`, `TagChip`, `TextField`,
`TopBar` (with `IconButton`), `Pager`, `BottomSheet`, `Notice` (replaces
`StateNotice`), `UndoBar` and `TestBadge`; and `Icon`, the app's own icons.

The screens build, run and pass their tests on these parts. Where a part is a
drop-in for what a screen had, the screen uses it now: Home's cards, ⋯, New
Cook and pager; the meal chips; the review's stars and N/A; Last time; Next
time on a reviewed cook; the reading chips; the Undo bar; the headers; every
notice. Their layouts are redrawn in parts 2 and 3.

### 3. Side, a fifth meal type

Stored meal types are breakfast, lunch_dinner, dessert, snack, side. "Side",
`mealSide`, and a small bowl with leaves; the nearest Material Symbols Rounded
icon is **`rice_bowl`** (there is no bowl with leaves in Material Symbols, so
the app draws its own and adds the leaves). Schema 5 rebuilds `cook_meal_types`
in one transaction so its CHECK allows `side`. Side works in the filters,
search, the review's services, the text export and backups.

### 4. Cuisine

Optional, one per cook: ten named cuisines, or Other with the cook's own words
(trimmed, 1 to 40 characters). Schema 5 adds `cook_cuisines`, following
`cook_meal_types`: one row per cook, deleted with the cook and restored by
Undo. Set, change and clear on any cook (rule 13). Search matches a cuisine's
label or Other's words; `CookFilters.cuisines` matches any chosen, with the
options the ten plus Other words in use. Export this cook prints it on the
meal type's line: "Meal: Lunch/Dinner · Greek".

### 5. Backup format 5

Carries Side and cuisine. Formats 1 to 4 still read; a format 4 file loads
into schema 5; an unknown cuisine key or meal type is a clear issue, not a
crash; round trip tested.

### 6. Card photos

`data.cardPhotos.forCooks(ids)`: a cook's own first photo; otherwise the first
photo of the nearest earlier cook along its Cook this again chain; otherwise
none, and the card shows its meal tile. Three statements per page whatever its
length. `useCardPhotos` serves it to the screens (wired up in part 2).

### 7. The screen size in the menu

Home's ⋯ menu ends with "0.3.0 (<commit>) · <width> × <height>" in the
secondary style: the window in dp, rounded, changing when the phone folds,
unfolds or turns. The commit is the one `app.config.ts` stamps into the APK's
version name, now also carried in `extra.buildCommit`.

### 8. npm test in a dot-folder

`jest.config.js` names its suites by `roots` plus a relative glob. Jest put
the absolute folder into the glob, and on Windows a `\` before a `.` stays an
escape, so a checkout under a folder starting with a dot found no suites.

## The decisions

What the brief did not settle.

1. **Icons need `react-native-svg`.** The design's icons are line drawings
   (a flame, an apple, leaves) that views cannot draw. It is added at Expo
   SDK 57's pinned 15.15.4. The app draws its own icons to Material Symbols
   Rounded's rules and names the nearest symbol for each (`MATERIAL_SYMBOL`).
2. **`expo-system-ui` and `expo-navigation-bar` are added.** The first makes
   `userInterfaceStyle` work on Android; the second turns the navigation
   bar's buttons live. Both are first-party at their SDK 57 versions, with no
   permissions. All three are in `dependency-triage.md`.
3. **The status bar's icons are dark on light and light on dark**, set from
   the app's own theme rather than `auto`, so they always match the page.
4. **Screens draw from the phone's setting with no provider.** `useTheme`
   reads `useColorScheme` directly; `ThemeOverride` pins a theme, and only the
   tests use it.
5. **Observed and Approved wear Reviewed's teal tint.** The design system has
   no pair for them; each is the cook's own settled record. Needs a review is
   a status (peach).
6. **Old button weights map to the new ones:** the near-black primary is the
   orange main, old secondary buttons are outlined, quiet ones are text, and
   danger is its own weight. Parts 2 and 3 choose per screen.
7. **The hand-typed-style test covers colours (hex, rgb, named), font sizes,
   line heights and corner radii.** Widths and gaps are not tested; they come
   from `space` and `size` throughout.
8. **Control pairs at 3:1** are control-line, link (focus ring, also on next),
   primary, secondary, selected, zone-icon, star, each meal's icon on
   surface-raised and zone, the reading inks, and ink on note-icon.
   `ink on peach` in dark (1.47:1) is not a pair the design uses (peach takes
   `onPeach`), so it is not listed.
9. **"Remove tag apple"**: a removable tag's name now says "Remove tag",
   as the design note does (was "Remove").
10. **The selected tag shows its tick as an icon**, so the old test that read
    a ✓ character checks for the tick icon instead.
11. **Screen on** is a sage pill with a sun when on, outlined when off.
12. **The version line** reads the version from the app's config and the
    commit from `extra.buildCommit`; either missing shows `unknown`, never a
    guess. The window figures are `useWindowDimensions`, rounded.
13. **Names in tests** are "You", "Guest" and, where a third person is needed,
    "Guest 2". Ids follow them (`m-you`, `m-guest`).
14. **Cuisine data** (from the data work): `cook_cuisines(cook_id, cuisine,
    other_words, set_at)` with a CHECK over the eleven keys and Other's words
    trimmed, 1–40, present exactly for Other; an index on `cuisine`. Other
    words that match a label ignoring case are stored as that cuisine, so
    nothing is offered twice. Clearing deletes the row, unversioned, as for
    meal type. Cook this again copies the cuisine, as it does the meal type.
15. **Migration 5** builds `cook_meal_types_v5`, copies every row with its
    rowid, drops the old table and renames the new one, with foreign keys left
    on so every copied row is checked against `cooks`. Nothing references
    `cook_meal_types`, so neither the drop nor the rename touches another
    table. It had no index but its primary key's. Version 4 is now pinned by
    digest.
16. **Backup format 5** refuses an earlier-format file carrying cuisines or a
    `side` meal type, as wrong about itself (part 1 of 0.3.0's decision 17).
17. **Export** with a cuisine and no meal type prints "Cuisine: Greek" on its
    own line; Other prints the cook's words.
18. **Search** matches cuisine words but adds nothing to a result's lines.
19. **Cuisine filter picks** are a named cuisine or Other's words (compared
    ignoring case and outer spaces). The options are the ten in order, then
    Other words in use, alphabetically.
20. **The card photo** is the first by the timeline's order (time, then
    entry order). A cook waiting on Undo ends the chain as if deleted; loops
    stop the walk. A photo whose file is missing resolves to no picture.

## How it is built

New: `src/theme/theme.tsx`; in `src/components/` `Button`, `BottomSheet`,
`Composer`, `CookCard`, `CuisinePill`, `FilterChip`, `Icon`, `LastTimeCard`,
`MealLabel`, `NewCookButton`, `NextTimeCard`, `Notice`, `Pager`,
`ReadingCard`, `SearchBar`, `SectionGroup`, `StarRating`, `TopBar`,
`UndoBar`, `Zone`; `src/data/sqlite/cardPhotos.ts`, `src/state/useCardPhotos.ts`.

Removed: `ActionButton`, `MealTypeLabel`, `StateNotice`.

Changed: the tokens, every component and screen that drew a colour, the root
layout, `app.config.ts`, `src/config/appIdentity.ts`, the schema (version 5),
domain, repositories, rows, services, data layer, backup contract and
validation, the text export, search, filters, the record and list hooks,
`content/product.ts` and `jest.config.js`.

## Verification

On the desktop: `check:secrets`, `typecheck`, `lint` (no warnings) and the
suite pass — **75 suites, 1404 tests**, up from 67 and 1141 at the end of
0.3.0. `npx jest --listTests` lists 75 suites in a folder under a dot-named
parent, in a plain copy, and in a dot-named copy alike. `npm audit
--audit-level=critical` exits 0, with the same advisories as at `4af5172`.
The merged-manifest test (`androidPermissions`) still gives `INTERNET` and
`CAMERA` and nothing else. CI has not run on these commits: they had not been
pushed when this was written.

| Test file | Tests | What it pins down |
|---|---:|---|
| `contrast.test.ts` (rebuilt) | 190 | Every text pair at 4.5:1 (3:1 large), every control pair at 3:1, in light and dark; every meal, status and reading listed; the same roles in both themes; the approved values; no scheme A name left |
| `noHandTypedStyles.test.ts` (new) | 8 | No hex, rgb or named colour, font size, line height or corner radius in `src/screens` or `src/components` |
| `theme.test.tsx` (new) | 9 | Light, dark, a live switch and back, light when the phone says nothing, the card's shadow in light and line in dark; `userInterfaceStyle`, the bars, no dynamic colour |
| `components.test.tsx` (new) | 33 | Each part in light and dark; Side's label and the `rice_bowl` mapping |
| `versionLine.test.tsx` (new) | 4 | The line's form, the build's version and commit, and the line following fold, unfold and turn |
| `schemaV5.test.ts` (new) | 10 | 4 → 5 with every row and foreign key intact, Side allowed, the cuisine rules in SQL, a failed migration leaving version 4 and the notice |
| `backupV5.test.ts` (new) | 18 | Round trip with Side and cuisine; 1–4 still read; a format 4 file into schema 5; unknown keys as issues |
| `cuisine.test.ts` (new) | 24 | Rule 13, the repository, delete and Undo, search and the filter |
| `cardPhotos.test.ts` (new) | 10 | Own first photo, the parent chain's, none, and a deleted parent |

Changed: `migrations`, `schemaV2`–`schemaV4`, `backupV2`–`backupV4`,
`controlledModel`, `historySearch`, `historyFilters` (Side, cuisine, version
5); `fonts`, `photoScreens`, `readingComposer`, `tagScreens` (the new tokens
and tick); and the tests and fixtures that used invented names.

## What has not been tried on a device

None of it. Still to see on the Fold, mostly once parts 2 and 3 have drawn the
screens:

1. The schema 5 migration on a phone holding real 0.3.0 data: every cook and
   meal type unchanged, no cuisines.
2. Light and dark on both displays, switching the phone's setting with the app
   open; the status and navigation bars following; no white flash at launch in
   dark.
3. The icons at their sizes, in both themes.
4. The version line in the ⋯ menu on the cover and inner displays, upright and
   sideways, and after folding.
5. Contrast in a kitchen, in daylight and in dark.
6. The part 1 look in passing: Home's cards, the pill, the pager, the star
   buttons, Last time and Next time.
