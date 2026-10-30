# Release 0.3.0, part 1 of 2 — the data and behaviour for update 2

**Status:** built, tests green on the desktop; no APK built, nothing installed, not yet tried on a device
**Date:** 30 October 2026
**Version:** unchanged at 0.2.2 (`versionCode` 5) — part 2 sets 0.3.0, `versionCode` 6
**Schema:** version 4 · **Backup format:** version 4
**Builds on:** 0.2.2 (`RELEASE_0.2.2_FIXES.md`), at `e0f7de1`

Part 1 of update 2, planned and designed with Mike on 30 October: what a cook
records and how it behaves. Part 2 is the new look — Home as History with
pages, two panes on the inner display, the meal-type colours — on top of this.
Code, tests and docs only.

## What was built

### 1. Schema 4

One new migration; versions 1 to 3 are frozen, and version 3 is now pinned by
digest like 1 and 2. Six new tables and nothing else — no existing table is
altered, rebuilt or written to, so every row already on a phone is unchanged.

| Table | Holds |
|---|---|
| `cook_meal_types` | A cook's meal type: breakfast, lunch_dinner, dessert or snack. A cook with none has no row. |
| `ingredient_versions` | Every saved version of a cook's ingredients, plain text. Append-only; the newest is current. |
| `household_members` | Who usually eats: a name, an order, and when they were retired, if they were. |
| `ratings` | Per cook, per person (a member, or a guest named on the rating): 1–5 stars or N/A, and an optional line. |
| `lesson_revisions` | Edits of a next-time line, so its first words are kept. |
| `app_settings` | The app's own memory: whether "Who usually eats?" has been asked. Not in a backup. |

Every cook starts with no meal type, no ingredients and no ratings; nothing is
guessed. The migration is one transaction: if it fails, the notebook stays at
version 3 with nothing lost, and the app says the notebook could not be updated
rather than opening an empty one (0.2.2's startup path, unchanged).

The schema holds the rules too: whole stars 1–5 only; N/A has no stars; a
rating is from exactly one person; a rating always says something; one rating
per person per cook (guests compared ignoring case); two people who eat here
now cannot share a name; and a member a rating points at cannot be deleted.

Deleting a cook (0.2.2) takes its meal type, ingredients, ratings and
next-time edits with it — they cascade from `cooks` — and Undo, which touches
nothing, restores them exactly. *Export everything* leaves them out during the
undo window, as it leaves out the cook.

### 2. Meal type

Four chips — Breakfast, Lunch/Dinner, Dessert, Snack — under the title of every
cook's page, open or reviewed, and on the review. One tap sets it; a tap on the
chosen one clears it. A small neutral label with the name sits above the title
wherever a cook is shown: Home, History, search results, the cook's page, the
review and the *Last time* card. Part 2 gives the labels their colours.

### 3. Ingredients

An Ingredients box at the top of every cook, above the timeline. On an open
cook with an empty timeline it is a field to type or paste into, with **Save
ingredients**; after that it is the list with **Edit**. An edit is a new
version: "edited" opens the earlier ones, as for a note. Once the timeline has
an entry, a list longer than four lines folds to its first four and "Show all
N". The box is in the page's scroll; the composer stays pinned under it, as
0.2.2 made it.

### 4. The review

In this order: **Who ate it?** — a row per household member, in their order,
with five star buttons (48 dp, named "1 star" to "5 stars" for TalkBack), an
N/A toggle and "+ Add a line"; "+ Someone else" adds a guest row for this cook
only — then the **meal type** chips, then **Your notes** (the verdict field,
stored where the verdict is, with 0.2.2's edit history), then **Next time**
(the takeaway field, still stored as the user lesson, hint "Shown before you
cook this again"), then tags, suggestions and the raw evidence.

Nothing is required. Ratings and the meal type save at the tap, as tags do.
The first time a review opens with nobody on the list it asks **Who usually
eats?** — add names, reorder, Done — or Skip; either way it is not asked again.
**Who's eating** on Home opens the same list any time.

On a reviewed cook's page the notes are headed **Your notes** (old verdicts
word for word, no stars invented), followed by **Next time** — every line
editable, its first words kept, and "+ Add a next-time line" — and a **Who ate
it?** card with the same rows, so ratings can be added or changed later.

### 5. Cook this again

A **Cook this again** button on every reviewed cook's page. It starts a new
open cook with the same title, tags and meal type, a copy of the current
ingredients as its own first version, and `parent_cook_id` set to the cook it
came from — all in one transaction. Nothing on the earlier cook changes.

The new cook shows a **Last time** card above the ingredients: the earlier
cook's date and meal type, its ratings (N/A shown as such), and its next-time
lines — or, with none, the first lines of its notes. **Open** goes to the
earlier cook. The card stays for the whole cook, folded to one line once the
timeline has entries (tap to unfold). Under the title: "2nd time cooking
this", "3rd time…", counted along the parent chain.

### 6. Search and filters (History; part 2 moves them to Home)

- Search matches titles, tags and the current ingredients, keeping the "All
  your words" then "Some of your words" grouping. A result shows the
  ingredient line that matched.
- Meal-type chips filter: any of the ones picked.
- **Who & stars**: pick a person — someone in the household or a guest name
  used before — then "1★+" to "5★+". It keeps cooks that person gave at least
  that many stars; N/A never matches. The filter shows as a chip with ✕.
- Filters and search combine.

### 7. Small fixes from the 0.2.2 test run

- **N3:** the note editor's Save and Cancel now sit above the field, and
  opening the editor scrolls it to the top of the screen, so the keyboard on
  the cover display cannot cover them. The same for the Ingredients editor.
- A note's ⋯ sits at the top right of the note, and the menu it opens comes up
  at the top, so a long note needs no scroll to edit.
- `ACCEPTANCE.md` step 2 expects the version in `app.config.ts` at the named
  commit, not "0.1.0".

### 8. Export

*Export this cook* adds `Meal:` under the title, **Ingredients** as they now
stand (marked "(edited)" when there were earlier versions), **Who ate it**
("Alex: 4 stars — “Creamy.”", "Sam: N/A (didn't eat it)", "Jo (guest): 5
stars") and the next-time lines as they now read. The verdict is printed under
**Your notes**. *Export everything* writes backup format 4: the five new
collections (meal types, ingredient versions, the household with retired
people, ratings, next-time edits), and still reads formats 1, 2 and 3.

## The decisions

Everything the brief did not settle.

1. **`none` is the absence of a row**, as a reading's kind is: clearing a meal
   type deletes its row. A meal type is a label, not words, so its changes are
   not versioned.
2. **Ingredients need words.** A save that is blank, or the same as the list
   already there, is refused (0.2.2's decision 3, for the same reason). So a
   list cannot be cleared back to nothing; it can be edited.
3. **A rating is a current answer, changed in place.** Changing someone's stars
   updates their row, which keeps its id. A rating that ends up saying nothing
   — no stars, not N/A, no line — is removed. A line with no stars is allowed.
   Lines and guest names are trimmed of the spaces around them; a line is at
   most 200 characters and a name 40.
4. **A guest is per cook, by name, ignoring case.** "+ Someone else" adds a row
   on screen; it is stored once something is said for them. Guest names used
   before are offered in the History filter, not as household rows.
5. **Retire, never delete.** A member who no longer eats here leaves the
   review's rows but keeps every rating; a reviewed cook they rated still shows
   their row. They can be brought back. There is no rename. Reordering is Move
   up / Move down (48 dp, named for TalkBack), never a drag.
6. **"Who usually eats?" is asked once.** Done and Skip both record that it was
   asked, in `app_settings`, which is not in a backup: it is the app's memory,
   not the cook's record.
7. **Next-time edits get their own table.** `revisions.field` is frozen in
   version 3 with `note` and `verdict`, so `lesson_revisions` holds them, under
   rule 11's terms: the lesson's row keeps its first words. Only an approved
   lesson can be edited; a line added on a reviewed cook's page is an approved
   user lesson, like the review's.
8. **Rule 13** in `src/domain/evidence.ts` decides every new write, and refuses
   the assistant all of them.
9. **Ratings and meal type save at the tap,** on the review too, as tags do;
   only the notes and the next-time line wait for *Finish review*.
10. **The ingredients fold on any cook with timeline entries,** open or
    reviewed, by non-blank lines. The review screen does not show the box.
11. **Cook this again** starts the new cook now, with the earlier title (an
    untitled cook stays untitled), its tags, meal type and current ingredients
    — not its ratings, notes or next-time lines, which stay on the earlier cook
    and are shown on *Last time*. The button sits under the meal-type chips.
12. **"Nth time" follows the parent chain** as it now stands. If an earlier
    cook in the chain is deleted the schema clears the link (0.2.2's decision
    7), and the count starts again from there.
13. **The *Last time* card** lists ratings in household order, then guests; it
    shows up to three non-blank lines of the notes when there is no next-time
    line; folded, its one line is the first next-time line (or notes, or
    rating).
14. **"Verdict" is "Your notes" everywhere,** the text export included; the
    words stored are unchanged. "No verdict was written" became "No notes were
    written".
15. **Search** treats ingredients like titles and tags — a word must start the
    match — and a result shows up to three matching ingredient lines.
16. **Who & stars is one person at a time.** Picking another replaces it; the
    people list is the household (current, then retired) then guest names not
    already a current member's name.
17. **Backup format 4 requires the five collections,** even empty; an earlier
    file that carries any of them is refused as wrong about itself. The
    household goes out whole, retired people included.
18. **The note editor's field grows to six lines** before it scrolls (was
    eight), so Save, Cancel and the words fit above the keyboard together.

## How it is built

New: `src/domain/cookRecord.ts`, `src/domain/household.ts`,
`src/data/sqlite/cookRecord.ts`, `src/state/useCookRecord.ts`,
`src/state/useHistoryIndex.ts`, `src/screens/history/filters.ts`,
`src/screens/HouseholdScreen.tsx`, `app/household.tsx`,
`src/components/MealTypeLabel.tsx` and `src/screens/record/` (meal-type chips,
the Ingredients box, Who ate it, Next time, Last time, the household editor).

Changed: the schema (version 4), `entities`, `enums`, `evidence` (rule 13),
`invariants`, the repositories, rows, data layer and snapshot, the backup
contract and validation, the text export, search, the cook, Review, Home and
History screens, `ScreenHeader` (a line above the title and one under it),
`EditableWords` and `content/product.ts`.

No new packages. No change to `app.config.ts`, the plugins or permissions.

## Verification

On the desktop, at the last code commit: `check:secrets`, `typecheck`, `lint`
and the test suite pass — **65 suites, 1061 tests**, up from 57 and 987 (74
added, 8 new suites). The merged-manifest test (`androidPermissions`) still
gives `INTERNET` and `CAMERA` and nothing else. CI has not run on these commits
yet: they had not been pushed when this was written.

| New test file | Tests | What it pins down |
|---|---|---|
| `schemaV4.test.ts` | 8 | 3 → 4 on a notebook with cooks, notes, readings, photos, tags, lessons, edits and a pending deletion: same counts and rows, foreign keys intact, six empty tables, the new rules in SQL, rollback to 3 with nothing lost |
| `cookRecord.test.ts` | 19 | Rule 13 in the domain; meal type, ingredient versions, ratings, the household, next-time edits and Cook this again on real SQLite; delete and Undo with all of it |
| `backupV4.test.ts` | 14 | Round trip with all five collections; 1, 2 and 3 still read; the version checks; dangling people and lessons, stars on N/A, duplicates |
| `update2Screens.test.tsx` | 14 | Chips and labels, the Ingredients box, its folding and an unsaved list kept, the review's order, the household prompt, star buttons, N/A, lines, guests, a reviewed cook's ratings and next time, Cook this again and *Last time*, Who's eating |
| `historyFilters.test.ts` | 10 | Meal type, Who & stars (N/A never), the people offered, search over ingredients |
| `historyFiltersScreen.test.tsx` | 3 | The same on History: ingredients found, meal-type chips, Who & stars with search |
| `exportUpdate2.test.tsx` | 1 | The text export's meal type, ingredients, ratings (N/A, guest) and next time |
| `noteEditorLayout.test.tsx` | 3 | N3 and the ⋯: menu above a long note, Save and Cancel above the field, the editor scrolled into view |

Existing tests changed: `migrations` (four versions, version 3's digest,
version 4 only creates), `schemaV2` and `schemaV3` (the tables later versions
add), `backupV2` and `backupV3` (format 4; older files built without the new
collections), `controlledModel` (the snapshot's keys), `historySearch` (a
searchable cook has ingredients), `ReviewScreen` ("Your notes"), and the four
that read the text export's "Verdict" heading (`cookText`, `exportService`,
`exportScreens`, `revisions`).

## What has not been tried on a device

None of it. In particular, still to see on the Fold:

1. The schema 4 migration on a phone holding real 0.2.2 data: the app opens,
   every cook is there unchanged, none has a meal type, ingredients or ratings.
2. The meal-type chips and labels on both displays, and at font scale 2.
3. The Ingredients box: a 30-line paste before cooking, the fold after the
   first note, "Show all", Edit with the keyboard up on the cover display.
4. The review's star buttons with TalkBack ("4 stars"), the N/A toggle, a line,
   a guest, and five stars plus N/A fitting on the cover display.
5. "Who usually eats?" the first time, and not again; Who's eating from Home.
6. Cook this again: the new cook, *Last time*, the fold, Open, "2nd time
   cooking this".
7. History's filters with the keyboard up, and the search finding an
   ingredient.
8. N3 on the cover display: the note editor's Save and Cancel above the
   keyboard; the ⋯ menu on a long note.
9. Export this cook into another app (Mike, on his own phone).
