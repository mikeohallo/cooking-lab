# Release 0.4.1 — a step smaller, every meal in sight, and your place kept

**Status:** built, tests green on the desktop; not yet tried on a device
**Date:** 3 November 2026 (brief approved by Mike at 11:17 Sydney time); built 5 November 2026
**Version:** 0.4.1 (`versionCode` 8)
**Schema:** version 5 · **Backup format:** version 5 (unchanged)
**Builds on:** 0.4.0 (`RELEASE_0.4.0.md`), at `594af80`

Seven changes from Mike's 0.4.1 brief, in one development run. Code, tests
and docs only: no new packages, no new permissions, no schema or backup
change, no images. Design Baseline v3 is updated to match.

## What's in

1. **The type one step smaller, app-wide** (`src/theme/tokens.ts`). Every
   style a step down (`body` 16 / 22 → 15 / 21, `heading` 18 / 24 → 16 / 22,
   `appTitle` 26 / 32 → 24 / 30, and so on; the full table with the old
   values is in Design Baseline v3, section 3). Weights, letter spacing, drawn
   sizes, spacing, photos and the 48 dp touch area are unchanged; the contrast
   test passes in both themes. Notes on the cook page are now 15, by Mike's
   call on 3 November, replacing "never under 16".
2. **Every meal button in sight, on both displays.** Home's meal filter always
   wraps; the sideways-scrolling row on the cover is gone. Filter chips have
   12 either side of their words (was 14). Rows of wrapped controls sit 16
   apart (`space.md`) so two rows' 48 dp touch areas never overlap; the same
   was found and fixed in the Filters sheet, the review's meal and cuisine
   choices, tags (on the cook page and in Tags used before), the composer's
   reading chips and Add a reading. Some stacked controls were closer than
   their hit areas too, and now have room: the tag editor (8 → 12), the
   composer (8 → 12 above the field), the meal row under the search bar (+4),
   Who ate it?'s controls and the line under them (4 → 8 each).
3. **Cooking now shows just the dish:** photo, title, meal label and cuisine
   pill, chevron. The started time, note count and "2nd time" are no longer
   drawn but are all still in the card's accessibility label. The meal and
   cuisine are their own line in the text column (`flexBasis: '100%'`), which
   has `minWidth: 0`, so they wrap there, never under the chevron.
4. **A heading's trailing word never clips** ("Optional" beside Cuisine;
   "12 reviewed" and "0 of 12" beside Your cooks; the average badge beside
   Who ate it?). A new `HeadingRow`: the heading gives way first, the
   trailing word never shrinks, and when the two do not fit it wraps under the
   heading. Nothing is cut.
5. **A live font-size or display-size change keeps your place.** After Android
   recreates the activity, the app comes back to the same screen and cook,
   the same scroll position, and any half-typed words: a note (new, or one
   being edited), a title, a rating line, Next time, Your notes, and Home's
   search, meal filter and page. `fontScale` and `density` are **not** in
   `configChanges`.
   **Built: held in memory**, not saved to storage. React Native's own
   Android code shows why that works: on the activity's destroy,
   `ReactDelegate.onHostDestroy` stops the React surface (so every screen
   unmounts), but `ReactHostImpl.onHostDestroy` only moves the host's
   lifecycle state; the JavaScript instance lives in the application and is
   kept. The recreated activity starts a new surface in the same JavaScript,
   so module memory survives while React's state does not. So
   `src/layout/KeptPlace.ts` holds the router's state (keys stripped, so it
   fits the new navigators) and each open screen's store of words and scroll
   positions by the screen's name; `src/layout/KeepPlace.tsx`, at the root,
   holds the place as the screens are taken down and puts the app's stack
   back when they are drawn again within 10 seconds. Later than that (the
   app left and opened again) the place is let go and the app opens on Home
   as before. A screen left in the usual way lets its words go, as before.
   Not tried on a device in this run.
6. **Who ate it? picks one layout per list.** Every row's stars, N/A and
   pencil sit beside the name when every row fits, and under the name on
   every row when any one does not. Each row measures its name at its own
   width (an unseen, unread copy on one line), N/A and its room; the choice
   is worked out from the latest measurements every time
   (`whoAteItLayout` in `src/layout/responsive.ts`), so it switches back
   when the window widens. The web preview has a third, made-up person,
   "Guest with a longer name" (`src/preview/seed.web.ts` only).
7. **Home's lists end clear of the dock's fade.** With a dock, the scroll
   content ends with `space.ml` plus the fade's height (`DOCK_FADE_HEIGHT`,
   24), so No matches' Clear filters is never under the fade.

## The commits

On `594af80`, oldest first, all by Claude <noreply@anthropic.com>:

- `6ccea29` ui: the type one step smaller, app-wide (0.4.1)
- `6760e0a` ui: a heading's trailing word never clips; it moves under the heading
- `8811346` ui: every meal button in sight, wrapped rows 16 apart, no overlapping touch areas
- `e44a9d9` ui: Cooking now shows just the dish; the rest stays in its label
- `ad1b5d4` ui: Who ate it? picks one layout per list, measured live; a third preview person
- `4000747` ui: Home's lists end clear of the dock's fade
- `5b61e23` feat: a live font-size or display-size change keeps your place, held in memory
- `b7e8722` chore: version 0.4.1, versionCode 8
- this record, with Design Baseline v3 and the slices table: `docs: …` (the last commit)

## Tests

- New: `typeScale.test.ts` (the table, exactly), `mealFilter.test.tsx`
  (every window 320 to 1200 wide, every 4 dp, upright and sideways, at font
  scales 1.0, 1.15 and 1.3: every meal button fits, measured in the app's own
  font file by `support/fontMetrics.ts`; Home's real row wraps with 16
  between rows at a spread of windows), `touchOverlap.test.tsx` (no two
  controls' 48 dp touch areas overlap, every screen and sheet of the web
  preview, cover and inner), `headingRow.test.tsx`, `keepPlace.test.tsx`
  (the real router unmounted and mounted again: a simulated activity
  recreation), `whoAteItLayout.test.tsx`, `dockFade.test.tsx`.
- Changed, because they pinned the old behaviour: `adaptiveLayout` (cover
  meal chips scrolled; Home at 320, 369 and 412), `coverScreens` (Cooking
  now's started line, now checked in the accessibility label),
  `deleteNoteScreens` (the "3 notes" count, now checked in the accessibility
  label), `webPreview` (the type-scale guard; the third preview person),
  `innerScreens` (Who ate it?'s row no longer wraps on its own),
  `appConfig` (0.4.1, 8). None deleted.
- `jest.setup.ts` lets go of any held place after each test, so one test's
  unmount does not bring the next back to its screen.

## Decisions

- **The one overlap kept: a rating's five stars.** Each star is 38 wide with
  5 either side, so neighbours share 10 dp (0.4.0, part 6). Five stars 48
  apart, with N/A and the pencil, need about 340 dp, more than a cover-screen
  row has under a name. The overlap test names this one exception. Mike's
  call if he wants it otherwise.
- **The trailing word wraps under as soon as the heading and it do not fit
  on one line.** The heading then has the whole line and wraps there if it
  must. It does not first wrap beside the trailing word.
- **Who ate it? starts beside** and moves under once its rows are measured
  (one frame, on a narrow window).

## Not tried on a device

All of it: the brief said no APK, no device work. In particular, item 5 rests
on React Native's source and the simulated recreation in Jest, not on a real
font-size change on the Fold.
