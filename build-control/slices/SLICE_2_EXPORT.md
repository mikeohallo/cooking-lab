# Slice 2a — Export

**Status:** built, tests green, **verified on the Fold by Mike, 16 October 2026, 19:02–19:06**  
**Date:** 16 October 2026  
**Builds on:** slice 1 (`SLICE_1_CORE_LOOP.md`), the portable backup format
accepted in M1 (`src/data/backup/`), M2 spec §10 (portable export constraints)

Slice 2 is in two halves. This is the first: getting history *out* of the
phone. The second, production signing, is Mike's one-time step and follows
once this is proven on the device.

## What it does

- **Export everything** — a button at the bottom of Home, shown once there is
  at least one cook. It builds the portable backup (`cooking-lab.backup`
  format version 1, every record, validated before it is written), names the
  file `cooking-lab-backup-<date>.json`, and opens Android's share sheet so
  the file goes wherever the person chooses: Drive, email, a message to
  themselves. The app never learns where. The screen then says what went into
  the file — *"2 cooks in cooking-lab-backup-2026-10-16.json."*
- **Export this cook** — on a reviewed cook, below the timeline. One plain-text
  file a person would read: title, when it was started and reviewed, the
  verdict exactly as typed, the approved lessons under *Next time*, and the
  timeline oldest first with temperatures in Celsius. Same share sheet.
- **Rules kept:** an export changes nothing in the store (proved: the snapshot
  before and after a failed and a successful export is identical); nothing
  secret can be in a file because the database key is not reachable from the
  export code; a failed export says why on screen and makes no file; a TEST
  build labels every export — `cooking-lab-TEST-…` in the file name, and a
  notice line inside the text file — so it can never pass for real history.
- **Not in this slice:** restore (decided: go live once export works);
  photos in the backup (the manifest is there, and empty, until slice 3);
  choosing a fixed folder instead of the share sheet (can be added if wanted).

## Two small things from the last device report, fixed here

1. History's **Open** filter said "No cooks yet" when every cook was simply
   reviewed. Each filter now has its own empty state: *No open cooks* /
   *Nothing reviewed yet* / *No cooks yet*.
2. With the keyboard and the temperature row both open, the timeline was
   squeezed to about a fifth of the screen. The temperature row now takes the
   note field's place while it is open instead of stacking above it; the
   half-written note is kept and comes back on Cancel or after a reading is
   saved.

## How it is built

- `src/data/export/sink.ts` — the seam: an `ExportSink` is given a file name,
  a MIME type and text, and hands the file to the system share sheet. It is
  never given a database and never reports where the file went.
- `src/data/export/cookText.ts` — pure: one cook as text. Nothing is reworded.
- `src/data/export/service.ts` — `exportEverything` (assemble → validate →
  serialise → share) and `exportCook` (load → render → share). Every failure
  is a value with a message.
- `src/data/native/expoSharing.ts` — the real sink: `expo-sharing` (first
  party, SDK 57) over a temporary file in `Paths.cache/exports/`, the one
  place in the app where the cache directory is the right choice.
- The service is built in the composition root (`src/data/runtime.ts`) and
  reaches screens as `exporter` on `AppStorage`; `useExport` wraps it with
  pending / done / failed state the way `useWrite` wraps a write.
- One new dependency: `expo-sharing ~57.0.17`. No plugin, no permission, no
  network.

## Verification

Run in a clean Linux environment against the repository at this commit:

- `npm run check:secrets` — pass
- `npm run typecheck` — pass
- `npm run lint` — pass, no warnings
- `npm test` — **30 suites / 567 tests / 567 passed** (534 retained; 33 added)
- `expo config --type public` resolves for production and TEST variants

New tests, against the real Node SQLite harness and a share sheet that only
records what it was given:

- `cookText` — verdict verbatim incl. whitespace; lessons; timeline order and
  Celsius; photo/assistant/plan entries labelled; TEST notice only in TEST;
  file names safe and telling
- `exportService` — the backup reads back to the same records; empty store
  refused; TEST file name; failed hand-over reported, store unchanged; device
  with nowhere to send a file; nothing key-shaped or device-specific in the
  file; cook text verbatim; proposals excluded; missing cook
- `exportScreens` — Home offers the button only with cooks, shows the done
  and failed notices; reviewed cook offers *Export this cook*, open cook does
  not; History empty states per filter; the composer gives the note back

## Verified on the Fold (Mike, 16 October 2026, TEST build of `820ffd1`)

All five steps of the on-device check below passed, with screenshots sent in
chat (not committed — the share sheet shows personal contacts):

1. **Export everything** opened the Android share sheet with Drive, Gmail,
   WhatsApp, Quick Share and others offered; the file was named
   `cooking-lab-TEST-backup-2026-10-16.json`.
2. The backup opened on the phone and held both cooks, the verdict, the
   62.5 °C reading, and the format and version stamps. It was one unbroken
   line of JSON, which is correct but hard on the eye — fixed in the commit
   after this one: the backup is now laid out one value per line, same data,
   same determinism.
3. **Export this cook** produced the text file as designed: title, dates with
   the year, the TEST notice, the verdict verbatim, the timeline in Celsius,
   and the "exported from" line. (No *Next time* section, as that cook has
   no lesson.)
4. In flight mode the same share sheet opened — no network is involved.
5. History → **Open** listed the still-open 2:41 cook.

Nothing felt wrong, slow or in the way. Slice 2a is proven; slice 2b
(production signing) is next.

## On-device check (Mike, ~5 minutes, TEST data only)

1. Open **Cooking Lab Test**. At the bottom of Home, tap **Export everything**.
   The share sheet should open. Send the file to Drive (or email it to
   yourself).
2. Open the file in Drive. You should see your two cooks in it, in plain
   text, with no gibberish.
3. Open the reviewed cook (the one with the verdict). Tap **Export this cook**.
   Send it the same way, open it, and read it.
4. Put the phone in flight mode and repeat step 1. The sheet should still
   open and let you save the file somewhere on the phone — no network needed.
5. Open History, tap **Open**: it should say *No open cooks* if you have
   finished the test cook, or list it if not.

What to report: anything that felt wrong, slow, or in the way — in your words.
