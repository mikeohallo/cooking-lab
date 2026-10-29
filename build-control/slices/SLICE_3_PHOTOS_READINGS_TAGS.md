# Slice 3 — Photos, oven and internal readings, tags and tag search

**Status:** built, tests green, ready for a TEST build on the Fold
**Date:** 22 October 2026
**Version:** 0.2.0 (`versionCode` 3, unchanged)
**Builds on:** slice 1 (`SLICE_1_CORE_LOOP.md`), slice 2a (`SLICE_2_EXPORT.md`),
slice 2b (`reports/2026-10-16-slice2b-production-signing.md`)

Slice 3 was planned as "photos in the timeline". Readings and tags came with
it, because all three are the same question — what else is worth writing down
while the pan is on, and how is it found again afterwards.

## What it does

### Readings say what they were taken of

The composer's single **Temperature** button is now two, **Oven °C** and
**Internal °C**, beside Send. Each opens a field for one number and nothing
else: two taps and a reading is down, with no form to fill in and nothing to
choose from first. A quiet **Somewhere else?** link under them opens the older
form — a number plus the cook's own words for where it was taken — for a
reading that is neither.

An oven reading gets a muted grey card with an oven mark and the word **Oven**;
an internal reading gets an amber card with a probe mark and the word
**Internal**. Both print the word, always: the colour tells them apart at a
glance and carries none of the meaning on its own. The word is "Internal" and
never "Inside".

A reading that does not say what it was taken of keeps exactly the card this
app has always drawn.

### Photographs

A camera button sits beside the *What's happening?* field — 48 dp square,
labelled *Add photo* for a screen reader — and offers **Take photo** or
**Choose from photos**. The camera asks Android for access once, the first
time. Choosing a picture asks for nothing at all: on Android 13 and later that
goes through the system photo picker, which runs outside the app and hands over
the one file the person chose, so there is no photo library for Cooking Lab to
be given access to.

Each photograph is re-encoded as a JPEG with its long edge capped at 2048 px
and every metadata segment removed, and the result is written into the app's own
private directory. It is a copy: deleting the original from the Gallery leaves
the cook intact, and nothing is ever written back to the Gallery.

A photograph appears in the timeline at the time it was added, full width, with
the photo corner radius. Tapping it opens it full screen, and from there one
added by mistake can be removed after a confirm — the entry and the file.

### Tags

Tags have no kind. Schema version 2 makes `tags.kind` nullable, keeps the four
existing kinds valid, and gives a tag with no kind a uniqueness rule of its own:
unique by name, ignoring case. Names are trimmed, lower-cased and have their
inner runs of whitespace collapsed, so " Brown  Butter " and "brown butter" are
one tag; several words are allowed and up to forty characters may be typed.

Every cook's page, open or reviewed, and Review, carry the same control: the
cook's tags as outlined chips, each removable; an **Add a tag…** field that
suggests his matching tags as he types; a **Used before:** line of the tags he
reaches for most that are not on this cook yet, one tap each; and a **Show me
my tags** button that opens all of them in one alphabet as chips, the ones on
this cook ticked, a tap adding or removing. Taking a tag off one cook leaves it
on every other, and never deletes the tag.

### Finding a cook again

History has a search box, *Search tags or titles*, above the All / Open /
Reviewed filters, and the filters keep working alongside it — searching inside
*Open* searches the open cooks. Typed words match title words and tag names;
results come in two groups, everything that matched every word first and
everything that matched part of it after, each ordered by how many words
matched and then newest first. Matches are picked out in the title and in a
line showing the cook's tags. The same **Show me my tags** button is here, and
a tapped tag joins the search as one whole term, so "brown butter" stays the
thing the kitchen named.

### Export

*Export everything* now carries photographs in its manifest, reading kinds and
untyped tags. The backup format is at version 2; this build writes 2 and reads
1 as well, because every backup the kitchen already has is a version 1 file.
*Export this cook* lists the tags, labels each reading **Oven** or
**Internal**, and lists the photographs by time, since a text file cannot show
them.

## The decisions

Everything the brief did not settle, and why it went the way it did.

1. **A reading that does not say carries nothing, rather than `"none"`.**
   The three kinds are oven, internal and none, but only two are ever written
   down: `none` is the *absence* of `meta.readingKind`. Writing `"none"` would
   have meant that a reading taken before this version and a reading taken
   "somewhere else" — the same fact about the same kind of reading — differed in
   the file. Every reading already on the phone is therefore byte for byte what
   it was, with no migration for readings at all.

2. **Removing a photograph is a new rule, not a relaxed one.** The brief said
   to stop if the domain rules forbade removing an event. They did not: rule 1
   protects raw evidence from *the assistant*, and rule 7's "nothing here
   deletes anything" is about rejected proposals keeping their rows. What
   existed was an ungated `delete` on the repository with no rule in front of
   it. So slice 3 adds `removeCookEvent`, which refuses the assistant outright
   and refuses every kind but `photo` — a note or a reading the cook wishes they
   had not written is still what they observed. The protections are stronger
   after this slice than before it, not weaker.

3. **Two tag-name limits, deliberately.** The cook may type forty characters
   (`MAX_TAG_ENTRY_LENGTH`); the store still accepts sixty
   (`MAX_TAG_NAME_LENGTH`). Lowering the stored limit to match would make a
   name written by an earlier build, or restored from a backup, invalid — which
   is not validation, it is data loss.

4. **The search group headings are "All your words" and "Some of your words",
   not "All" and "Some".** The brief's words were "All" and "Some", and "All"
   is already on that screen: it is the first of the All / Open / Reviewed
   filters, a few millimetres above. One word meaning two different things in
   one eyeful is how a person comes to think the search changed their filter.

5. **"Somewhere else?" sits under the two buttons in the composer's ordinary
   state**, not inside an open reading panel. The brief said "under them",
   which reads as under the two buttons; it also means the free-text form is
   reachable without opening a kind first and then backing out of it.

6. **Metadata stripping is the app's own code, not the encoder's side effect.**
   `expo-image-manipulator` re-encodes from a decoded bitmap, which normally
   drops EXIF. "Normally" is a property of a native module on a particular
   Android version, stated in no contract, and nothing in the app would notice
   the day it changed. So the bytes are walked and cleaned by
   `src/data/photos/jpeg.ts` after the device has had its turn and before
   anything is stored — every `APPn` segment and every comment, with the
   quantisation tables, frame header, Huffman tables and entropy-coded scan
   copied across byte for byte.

7. **The encoder port hands back bytes, not a file.** That is what makes the
   check above unavoidable: there is no path by which a file reaches the photo
   store without passing through it. The temporary file the platform wrote is
   deleted by the same code that read it.

8. **A photo event's row is deleted before its file.** The other order would
   leave a `photo` event pointing at nothing — a cook with a hole in it, and a
   backup that reports a missing photograph. This order leaves at most an
   unreferenced file, which `PrivateFileStore.list` can find and nothing on
   screen is the worse for.

9. **`PrivateFileStore` gained `displayUri`.** A photograph has to be drawn,
   and the only way to draw one is to hand the view layer something it can
   load. It is the one place a device path crosses that line, it crosses it for
   rendering only, and it cannot end up in a record: `photoPath` is the only
   column a photograph is referenced from, and `isSafePhotoLogicalPath` — which
   `validateCookEvent` and the backup validator both apply — refuses any string
   carrying a scheme.

10. **Backup format 2 refuses a version 1 file that carries an untyped tag.**
    The envelope's *shape* did not change in version 2; what changed is the set
    of values a record may take. A build that reads version 1 is entitled to
    assume every tag has one of the four kinds, so a file claiming to be
    version 1 while carrying a tag without one is wrong about itself, and is
    reported rather than read anyway. A version that is not checked is
    decorative.

11. **Tag suggestions match the start of a word, like the search does.**
    Typing "b" offers "brown butter" and not "aubergine". The first version
    matched anywhere in the name, which turns one letter into a list of
    everything — and meant the same letters meant different things in the add
    field and in the search box.

12. **Version 1's migration text is now pinned by digest.** It has run on a
    device, so it is history and cannot be edited. The test does not make that
    impossible — nothing can — but it makes it impossible to do quietly.

13. **`readingTreatments.ink`, not `.value`.** A member called `value` read
    inside a JSX inline style is what a Reanimated shared value looks like, so
    Reanimated's Babel plugin rewrote every such style into
    `console.warn(require('react-native-reanimated')…)`. That pulled an entire
    animation library into a screen that does not animate — and warned about a
    mistake nobody had made. It was found by a test failing; it would otherwise
    have shipped as a console warning and a larger bundle. See *Corrections*
    below.

14. **The oven and probe marks are drawn from plain views.** No icon font and
    no SVG dependency: two small shapes are cheaper to draw than to install,
    and the baseline loads no custom font. They are hidden from the screen
    reader, because the word is beside them and a reader would otherwise say it
    twice.

## How it is built

New, and where the thinking is:

- `src/data/photos/jpeg.ts` — the metadata walk and strip. Pure, no pixels
  decoded, and the privacy promise lives here.
- `src/data/photos/capture.ts` — the capture pipeline, and the order of its six
  steps, which is the safety property.
- `src/data/native/expoImagePicker.ts` — the camera and the photo picker, and
  the comment explaining why `choosePhoto` asks for no permission and must not.
- `src/data/native/expoImageEncoder.ts` — resize, re-encode, read the bytes,
  delete the temporary file.
- `src/screens/history/search.ts` — matching, ranking, grouping and
  highlighting, all pure.
- `src/screens/tags/TagEditor.tsx` — one control for all four ways of tagging a
  cook, used on the cook's page and in Review.
- `src/screens/cook/PhotoViewer.tsx` — full screen, and the confirmed removal.
- `src/state/useCookTags.ts`, `src/state/useTagIndex.ts`,
  `src/state/usePhotoUris.ts` — the reads the screens need.
- `src/components/TagChip.tsx`, `CameraButton.tsx`, `ReadingIcon.tsx`.

Changed:

- `src/data/schema/migrations.ts` — version 2, and a long comment on why the
  rebuild carries rows by hand rather than turning foreign keys off (a migration
  runs inside one transaction, and SQLite ignores `PRAGMA foreign_keys` there,
  so the usual answer would have done nothing while looking like it had).
- `src/domain/evidence.ts` — rule 10 and `removeCookEvent`.
- `src/domain/enums.ts`, `entities.ts`, `invariants.ts` — reading kinds, the
  nullable tag kind, `parseTagName`.
- `src/data/repositories.ts` and `sqlite/repositories.ts` — `listByName`,
  `suggest`, `listForCooks`, `listUsedTags`, `listMostUsedTags`, and
  `findByNameAndKind` using `kind IS ?` so a tag with no kind can be found at
  all.
- `app.config.ts` — version 0.2.0, the `expo-image-picker` plugin with
  `microphonePermission: false`, and three more blocked permissions.

## Verification

Run against the repository at this commit:

- `npm run check:secrets` — pass (200 files scanned)
- `npm run typecheck` — pass
- `npm run lint` — pass, no warnings
- `npm test` — **46 suites / 822 tests / 822 passed** (581 retained, 241 added),
  on the desktop and on the CI runner
- `npm audit --audit-level=critical` — pass; the same five triaged packages as
  before, nothing critical
- `npx expo prebuild --platform android` resolves, and the generated app
  manifest grants `INTERNET` and removes nine permissions

New test files:

| File | What it pins down |
|---|---|
| `schemaV2.test.ts` | Version 1 to 2 against a real version 1 database holding cooks, notes, readings, tags and lessons: identical row counts and content, every tag link kept, `PRAGMA foreign_key_check` clean, only the controlled tables left, a reading unchanged byte for byte, the verdict unchanged — and a deliberately broken version 2 rolling the whole rebuild back to version 1 with nothing lost |
| `photoMetadata.test.ts` | A real JPEG with a real EXIF GPS block: the coordinates are in it, they are gone afterwards, and the stripped file is byte-identical to the same picture stripped without them |
| `photoCapture.test.ts` | The pipeline: the cap asked for, the logical path, no metadata stored even when the encoder leaves it in, cancelled/refused/failed, a non-image refused, no file left behind when the row fails, and removal |
| `photoScreens.test.tsx` | The camera button, the two sources, the timeline picture, the full-screen view, the confirm, and a photograph whose file has gone |
| `readingComposer.test.tsx` | Both buttons, the number-only panels, the two cards and their words, *Somewhere else?* writing no kind, and an older reading rendering exactly as before |
| `readingKinds.test.ts` | The vocabulary, what is written, what is read back, and what the store refuses |
| `tagNames.test.ts` | Trim, collapse, lower-case, several words, forty characters, and the two limits |
| `tagRepositories.test.ts` | The new reads, against real SQL, including a wildcard character treated as a character |
| `tagScreens.test.tsx` | All four ways of tagging, on the cook's page and in Review, and a tag coming off one cook staying on the others |
| `historySearch.test.ts` | Terms, word-start matching, the two groups, the ordering, and the highlighting |
| `historySearchScreen.test.tsx` | The box above the filters, the groups on screen, the tapped tag as one whole term |
| `backupV2.test.ts` | A round trip out of a real database and back, compared whole against the snapshot; a version 1 file still read; a version 1 file carrying a version 2 record refused |
| `androidPermissions.test.ts` | The merged manifest, worked out from every installed native module: `INTERNET` and `CAMERA` and nothing else |

Existing tests that had to change, and why:

- `migrations.test.ts` — asserted there was exactly one migration. Replaced
  with the two versions by name, version 1 pinned by digest, and a version 2
  section.
- `coreLoop.test.tsx`, `CookScreen.test.tsx`, `exportScreens.test.tsx` — drive
  the new composer. The loop now takes an internal reading, which is what a
  cook does; the free-text form is reached through *Somewhere else?*.
- `cookText.test.ts` — one cook as text now takes its tags.
- `databaseLifecycle.test.ts`, `sqliteRepositories.test.ts` — the schema is at
  version 2.
- `privateFileStore.test.ts` — the store has one more method.
- `fixtureSeparation.test.ts` — a tag may have no kind, and the fixture now has
  to hold one.
- `backup.test.ts` — names the reading it asserts on, since there are now
  several.

Nothing was deleted or weakened. The 30-second `coreLoop` budget is unchanged
and the test still fits in it.

## What has not been tried on a device

**The camera and the photo picker.** Both open another app, so neither can be
exercised from this environment — a test can drive the pipeline with a scripted
camera, which it does, but it cannot prove that Android's camera intent returns
what this code expects or that the system photo picker appears at all. In
particular, still to see on the Fold:

1. the camera permission dialog appearing once, and only once;
2. a photograph taken with the camera arriving in the timeline, right way up —
   EXIF orientation is applied by the image loader when the bitmap is decoded
   and the metadata is then dropped, so an upright picture is expected, but a
   picture taken sideways is the thing to check;
3. the system photo picker appearing *without* a storage permission prompt;
4. a photograph still being in the cook after the original is deleted from the
   Gallery;
5. the full-screen view and the removal, on both displays;
6. how long a 12-megapixel photograph takes to re-encode on the device, and
   whether the camera button's pending state is enough to cover it.

Everything else in this slice — the migration, the metadata stripping, the
search, the tags, the export — is exercised against real SQLite and real
services here.

Also not built, and not in this slice: restoring from a backup, AI suggestions,
Cook Again briefings, import.

## On-device check (Mike, ~10 minutes, TEST data only)

1. Open **Cooking Lab Test**, tap **New Cook**.
2. Tap the camera button beside the note field, then **Take photo**. Allow the
   camera when Android asks. Take a picture of anything. It should appear in
   the timeline, the right way up.
3. Tap the camera button again, then **Choose from photos**, and pick one.
   Android should *not* ask for permission to your photos.
4. Tap **Oven °C**, enter `180`, **Add reading**. Then **Internal °C**, enter
   `62.5`, **Add reading**. The two cards should look different and should say
   **Oven** and **Internal**.
5. Tap **Somewhere else?**, enter `4` and `the fridge`. That card should look
   like the ones you already have.
6. Under the title, type a tag — `pork chops` — and **Add tag**. Then tap
   **Show me my tags** and add another with one tap.
7. Tap a photograph. It should fill the screen. Tap **Remove photo**, then
   **Remove it**. It should go from the timeline; everything else should stay.
8. **Finish & review**, add a tag from **Used before:**, write a verdict,
   **Finish review**.
9. Open **History**. Type a word from the title, then part of a tag. Tap **Show
   me my tags** and tap one.
10. Open the reviewed cook and **Export this cook**. Read the file: it should
    list the tags, label the readings, and list the photos by time.
11. On Home, **Export everything**, and open the file. It should say
    `"formatVersion": 2` and hold your tags and readings.
12. Force-stop the app and reopen it. Everything should still be there.
13. Delete one of the pictures you used from the phone's Gallery, reopen the
    cook: the photograph should still be there.

What to report: anything that felt wrong, slow, or in the way — in your words.
Especially how long a photograph takes to appear.

## Corrections made during this slice

### A member called `value` in an inline style pulled in an animation library

**Symptom.** The `coreLoop` test failed the moment the timeline drew an oven or
internal reading: `Cannot read properties of undefined (reading
'loadUnpackersWithCode')`, from deep inside `react-native-worklets`.

**Cause.** The reading cards were painted from a token whose text colour was
called `value` — `style={{ color: treatment.value }}`. Reanimated's Babel
plugin looks for a member called `value` read inside a JSX inline style, since
that is what misusing a shared value looks like, and rewrites the style into
`console.warn(require('react-native-reanimated').getUseOfValueInStyleWarning())`.
`react-native-reanimated` is a transitive dependency of `expo-router`, so the
require resolved — and then failed, because its native side is not there under
Jest.

**Fix.** The token is `ink`, and `src/theme/tokens.ts` records why in a
comment. Confirmed by transforming the file with the real preset and checking
that `require("react-native-reanimated")` is no longer in the output.

**Worth noting** because the test caught something a test was not looking for.
On a device it would not have crashed: it would have shipped as a console
warning about a mistake nobody made, and an animation library in the bundle of
a screen that does not animate.

### Three screen tests failed on CI and passed everywhere else

**Symptom.** The suite was green on the desktop — in parallel, serially, under
three workers, and in UTC — and red on the GitHub runner, where three tests
failed: the first test of `photoScreens`, and the first two of `tagScreens`.

**Finding out why took a CI change.** Actions logs need a GitHub sign-in even
on a public repository, so the run said only "Process completed with exit code
1" to anyone looking from outside. For a project whose rule is that a finding
never lives only in a chat window, that is the wrong way round, so CI now repeats each Jest failure, with the lines that follow it, as
annotations — which anybody can read — and records which Node and which SQLite
actually ran. The failures then read: `Exceeded timeout of 5000 ms for a test`,
and `Unable to find an element with text: brown butter`.

**Cause.** Both are the same thing: budgets sized for a desktop. A screen test
here mounts a real component tree, writes through the real services to real
SQLite and reads the rows back, and the first test in a file also pays for
loading the whole module graph. That is a few hundred milliseconds here and
several seconds on the runner, with forty-odd suites at once on four cores.
Jest's default test timeout is five seconds, and — the part that is easy to
miss — a `findBy*` query has its own default of one second, which a test-level
timeout does not affect.

**Fix.** `testTimeout: 20_000` in `jest.config.js` and
`configure({ asyncUtilTimeout: 5_000 })` in `jest.setup.ts`, both with the
reasoning next to them. The end-to-end core-loop test keeps its own explicit
thirty-second budget, which it has carried since the same thing happened to it
in slice 1. Nothing was weakened: every test asserts exactly what it asserted
before, and the cost is that a genuinely hung test now takes twenty seconds to
say so rather than five.

**Worth noting** that the suite passing locally in four different
configurations was not evidence that it would pass on the machine that counts.

### The group heading "All" collided with the "All" filter

Caught by a test that could not tell the two apart — `Found multiple elements
with text: All` — which is exactly the confusion a person would have had a few
millimetres below the filter row. See decision 4.
