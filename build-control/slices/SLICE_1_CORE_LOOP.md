# Slice 1 — Core loop, text only

**Status:** built, tests green, ready for a TEST build on the Fold  
**Date:** 15 October 2026  
**Builds on:** accepted M1 (`build-control/acceptance/M1_ACCEPTED.md`), Design Baseline v1, M2 spec §3

## What it does

You can now cook dinner with Cooking Lab and keep the record:

- **Home** — one-tap **New Cook** (no form; title optional, added later or never), *Continue cooking* cards for open cooks, *Recent cooks* newest first, a link to History. First use shows a calm empty state and the loop.
- **Active Cook** — a chronological timeline with a composer at the bottom: one line and Send. A **Temperature** button folds out a Celsius reading with an optional *where*. The title can be edited in place. **Finish & review** in the header.
- **Review** — *How was it?* as one large field, stored exactly as typed (no trimming, no rewriting). One optional line, *One thing to change next time*, stored as a user-authored, approved lesson. A calm *AI suggestions aren't connected yet* notice; the cook is complete with a verdict alone, or with no verdict at all. The raw evidence sits underneath. `reviewOpenedAt` is recorded on entry, `reviewSavedAt` on finish.
- **History** — every cook newest first, with All / Open / Reviewed filters; open cooks resume, reviewed cooks open read-only with their verdict and lessons at the top.
- **Safe states** — a locked notebook (`recovery_required`) and every other startup failure are explained on screen instead of showing an empty Home; a failed write keeps the typed text on screen with the reason; a missing cook says nothing was changed.

## What it deliberately does not do

Photos, export/restore, production signing, real AI, simulated AI, tags, Cook Again, in-cook chat, import. The "Simulated AI" fixture stage from the M2 spec is dropped: slice 4 connects real AI directly.

## Deviations from the M2 spec, recorded

1. **No `FixtureAiService` / simulated proposals.** Building a fake to prove a UI that slice 4 rebuilds with the real thing is wasted effort. The approve/edit/reject UI is built with slice 4.
2. **Photos moved to slice 3** so the loop can be used on a phone sooner.
3. **Process:** slices replace the milestone/queue/runner process (see `README.md` in this folder).

## How it is built

- Design Baseline v1 implemented as tokens (`src/theme/tokens.ts`) and primitives (`AppText`, `ActionButton`, `Card`, `StatusChip`, `ScreenHeader`, `ScreenContainer` with a keyboard-safe footer, `StateNotice`, `TextField`). Gutters 20/24 dp, 48/64 dp targets, no custom font, no UI framework.
- Composition: `StorageProvider` opens the accepted M1 store once and publishes it; `StartupGate` renders the safe states. Screens receive the `DataLayer` and the `AiService` through context, never a database handle, and execute no SQL. Every write goes through `useWrite`, which exposes pending / failed state; nothing is shown as saved until the store returns it.
- Routes: `/` Home, `/history`, `/cook/[id]`, `/cook/[id]/review`. Routes reload their screens on focus.
- All writes use the accepted capture service as `user`: `startCook`, `addEvent`, `updateCook`, `openReview`, `saveReview`. The takeaway uses `createUserLesson` + `lessons.create`.

## Verification

Run in a clean Linux environment against the repository at this commit:

- `npm run typecheck` — pass
- `npm run lint` — pass, no warnings
- `npm test` — **24 suites / 520 tests / 520 passed** (M1's 487 retained; 33 added)
- `expo config --type public` resolves for production and TEST variants

New tests, all against the real Node SQLite harness and the real services:

- `HomeScreen` — empty state, one-tap creation of an open/live/untitled cook, open vs recent lists, failed creation creates nothing
- `CookScreen` — note persisted verbatim and shown only once stored; blank note refused without clearing; Celsius reading with *where*; invalid reading rejected; failed write keeps text on screen; inline title edit; timeline oldest-first; reviewed cook read-only with verdict and approved (not proposed) lessons; missing cook
- `ReviewScreen` — `reviewOpenedAt` set once; verdict verbatim incl. leading/trailing whitespace and newlines; cook reviewed with no verdict; takeaway stored as approved user lesson; failed save keeps the verdict and the cook open
- `HistoryScreen` — empty state, newest-first order, filters, navigation
- `StartupGate` — starting state, locked notebook, thrown error
- `coreLoop` — Home → Cook → Review → History → read-only detail, then rows read back through a fresh data layer in the stored order
- Pure helpers — temperature parsing (no invented range), date formatting, verdict excerpts

## What was not verified here

A native TEST build and the Fold have not been exercised from this environment; that is the next step on Mike's PC. In particular the keyboard-open behaviour of the composer and the cover-screen layout need eyes on the device.

## On-device check (Mike, ~5 minutes, synthetic data only)

1. Open **Cooking Lab Test** on the cover screen. Tap **New Cook**.
2. Type a note, Send. Tap **Temperature**, enter `62.5` and `centre`, **Add reading**.
3. Tap the title, name the cook, **Save title**.
4. **Finish & review**. Type a verdict and a takeaway. **Finish review**.
5. Confirm the cook reopens read-only with verdict, takeaway and timeline; Back goes Home.
6. Force-stop the app, relaunch: the cook is still in History.
7. Unfold: same screens, centred, nothing clipped.

What to report: anything that felt wrong, slow, or in the way — in your words.

## Correction — 16 October 2026: the first TEST build had no Home screen

**Symptom.** The first slice-1 TEST build opened on expo-router's default
"Unmatched Route" page (`cookinglab:///`), and its Sitemap link closed the app
(`reports/2026-10-16-launch-screen.md`, screenshot in `reports/screens/`).

**Cause.** Slice 1 put the app's composition code (storage provider, startup
gate, data hooks) in `src/app/`. Expo picks the routes folder at bundle time and
silently prefers `src/app` over `app` whenever `src/app` exists. The release
bundle was therefore built with hooks and providers as its "routes" — no index,
no layout — so `/` matched nothing, and Sitemap crashed trying to render a hook
as a page. Every automated test passed because the screen and route tests name
`app/` explicitly; none asked the question the bundler asks.

**Fix.**
- `src/app/` renamed to `src/state/`.
- `extra.router.root = 'app'` pinned in `app.config.ts`, so detection is no
  longer involved.
- `__tests__/routerRoot.test.ts` calls Expo CLI's own resolver against the real
  config and fails if it resolves anywhere but `app/`, or if `src/app` exists.
  Proven against both failure modes before commit: with a `src/app` folder
  present it fails; with the pin also removed, Expo's resolver returns
  `src/app` — the shipped bug, reproduced — and it fails.
- `CLAUDE.md` records the rule.

The earlier fix (`bebf86e`: navigator mounted from the first frame, own
not-found screen) was a reasonable change but not the cause, and stays.
