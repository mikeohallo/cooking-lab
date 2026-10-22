# Slices

From October 2026 Cooking Lab is built in **slices** rather than the earlier
milestone/queue/runner process. The product brief, the design baseline and the
M2 specification remain the source of what to build; this folder records what
was built, in what order, and what was verified.

## Roles

| Role | Responsibility |
|---|---|
| Mike | Product owner. Decides what the app does, tests it on the Fold, says what feels wrong. Performs the few steps only he can: signing identity, API key, device installs. |
| Claude (chat) | Coordinator and engineer. Decides architecture and infrastructure, writes the code and tests, reviews, keeps these records. |
| Claude Code (on Mike's PC) | Native build and device steps only: builds the TEST/production APK from `main` and installs it on the Fold. |

## The loop

1. Claude pushes a slice to `main` with its tests green and a record in this folder.
2. Mike gives Claude Code on his PC a build line naming that commit
   ("build test at `<commit>`"); it builds only that commit (see `CLAUDE.md` → "Builds").
3. Mike uses it, and tells Claude what to change.

When a build needs a full record — package, commit stamp, write, relaunch,
export, both displays — Mike's line asks for the acceptance run as well:
[`ACCEPTANCE.md`](./ACCEPTANCE.md).

## Before evidence is committed

The repo is public, and nothing automatic looks at what an image shows. Before
a report or screenshot is committed, whoever commits it checks:

1. **Every image has been opened and looked at, all of it.** It shows Cooking
   Lab and nothing else: no app drawer or launcher, home screen, recent apps,
   notification shade, share sheet, other app, account or contact.
2. **The status bar shows no other app's notification icons.** If it does,
   crop the status bar off (or recapture).
3. **Synthetic data only**, and a TEST capture shows the TEST badge.
4. **No device identifiers in the text:** no serial, IMEI, display id or
   account name. Say "the Fold", "the cover display", "the inner display".
5. **The report names the commit built** and the version name read back from
   the installed app.
6. **The checks pass:** `npm run check:secrets` (the pre-commit hook runs it
   too). It reads text only, so steps 1–3 are the only check on pictures.

## Plan

| Slice | What | Status |
|---|---|---|
| 1 | Core loop, text only: Home, one-tap New Cook, timeline (notes, temperatures, title), Review with verdict and optional takeaway, History | **Built** — `SLICE_1_CORE_LOOP.md` |
| 2a | Portable export: *Export everything* (the validated backup file) and *Export this cook* (plain text), via the share sheet | **Built** — `SLICE_2_EXPORT.md` |
| 2b | Production signing: Cooking Lab's own release key, the production build signed with it and installed on the Fold beside the TEST app | **Done** 16 Oct — `reports/2026-10-16-slice2b-production-signing.md`; first live cooks are next |
| 3 | Photos in the timeline — and, with them, oven/internal readings, tags and tag search, which turned out to be the same question: what else is worth writing down while the pan is on, and how is it found again | **Built** — `SLICE_3_PHOTOS_READINGS_TAGS.md` |
| 4 | Real AI: extraction and proposals via the Anthropic API from the device, API key in the secure store | Planned |
| 5 | Cook Again briefings | Planned |

The unattended runner, the queue (`build-control/queue/`) and the runner scripts
are retired. They are kept in the tree as history and are not used; the queue
stays inactive.
