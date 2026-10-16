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
2. Mike asks Claude Code on his PC to build and install from `main`.
3. Mike uses it, and tells Claude what to change.

## Plan

| Slice | What | Status |
|---|---|---|
| 1 | Core loop, text only: Home, one-tap New Cook, timeline (notes, temperatures, title), Review with verdict and optional takeaway, History | **Built** — `SLICE_1_CORE_LOOP.md` |
| 2a | Portable export: *Export everything* (the validated backup file) and *Export this cook* (plain text), via the share sheet | **Built** — `SLICE_2_EXPORT.md` |
| 2b | Production signing identity, then first live cooks | Next — Mike's one-time step once 2a is proven on the Fold |
| 3 | Photos in the timeline | Planned |
| 4 | Real AI: extraction and proposals via the Anthropic API from the device, API key in the secure store | Planned |
| 5 | Cook Again briefings | Planned |

The unattended runner, the queue (`build-control/queue/`) and the runner scripts
are retired. They are kept in the tree as history and are not used; the queue
stays inactive.
