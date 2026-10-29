# Cooking Lab — M1 Photo Concurrency Safety Report

**Date:** 7 September 2026
**Base commit:** `22520e4edb92ae041dd6f3f87d91ad67d7575128`
**Corrects:** `fed53aa11fb81a95ef057804603ae43f5aef5ec4` (M1 photo-safety correction)
**Milestone status:** M0 **ACCEPTED**. M1 **not complete and not accepted**. This is
the final bounded safety correction within M1 and makes no acceptance claim.

---

## 1. The exact race corrected

The previous correction refused an occupied destination and configured the
native layer not to overwrite. Both were right. What it did not do was make the
refusal *exclusive*.

`claim()` validated the path and then performed an **asynchronous** existence
check. An `await` is a yield, so two operations targeting the same
previously-empty logical path could interleave inside it:

| # | Operation A | Operation B |
|---|---|---|
| 1 | checks the path — yields | |
| 2 | | checks the path — yields |
| 3 | told "empty" | |
| 4 | | told "empty" |
| 5 | writes the photograph — succeeds | |
| 6 | | reaches the native layer, correctly refused because `overwrite` is false |
| 7 | | error recovery calls `discard()` — **and deletes A's valid photograph** |

So the claim underpinning the whole cleanup design — "anything later at this
path belongs to this operation" — was not true under concurrency. The
non-overwriting native layer stopped B from *replacing* A's file and then B's
own cleanup destroyed it anyway, which is a worse outcome than either failure
alone.

This was a genuine hole and the diagnosis in the correction instruction is
exactly right.

## 2. Reservation and ownership design

**A logical destination is now reserved synchronously, before anything is
awaited.** That is the whole of the fix, and the ordering is the safety
property. `claim` does three things in this order:

1. `checked(logicalPath)` — path safety. Synchronous.
2. `reserve(logicalPath, relative)` — takes the path. **Synchronous**, so no
   other operation can run between one operation's check and its reservation.
3. `await files.exists(relative)` — only now is the device asked anything.

An asynchronous check cannot reserve anything, which is why step 2 cannot be
folded into step 3.

**The reservation set is module-level**, not per-store:

```
const RESERVED_PATHS = new Set<string>();
```

Two `PrivateFileStore` instances over the same device resolve the same logical
path to the same file, so a per-instance set would be bypassed by the simple act
of constructing a second store. One app, one sandbox, one set. The keys are
logical paths, which are already canonical: `buildPhotoLogicalPath` generates
them from validated ids and an instant, and `isSafePhotoLogicalPath` rejects
everything not in that exact form, so two spellings of one destination cannot
exist.

**A `PathReservation` is an explicit object**, not a bare boolean: it carries the
relative path, an `isHeld()` predicate and a `release()`.

**Ownership governs cleanup.** `discard` now takes the reservation rather than a
path, and returns without doing anything if the reservation is no longer held.
That is not ceremony — it is the difference between deleting the file this
operation was writing and deleting whatever happens to be at that path now.

**Release is unconditional.** Both `importFile` and `write` hold the reservation
for the whole operation and release it in a `finally`, so a failure cannot leave
a path locked for the rest of the run. `claim` releases it itself on the two
paths that never return one: an occupied destination, and a device that could
not answer.

**Ambiguity preserves evidence.** If the existence check itself fails, whether
anything is stored there is unknown. The reservation is released and the
operation is refused, and **nothing is deleted** — an unproven path is not a
path to delete.

**Behaviour deliberately not changed:**

- native `overwrite: false` and the no-overwrite `move`/`copy` are retained
  exactly as they were, as the second line of defence. `src/data/native/` shows
  no diff at all;
- nothing is silently retried;
- no alternative path is generated automatically;
- the logical photo-path format is untouched;
- an already-stored photograph is still refused with `already_exists`, as before.

**New failure reason.** `already_in_progress`, distinct from `already_exists` on
purpose: nothing is stored there yet, but something is being stored there, and a
screen that conflated the two would tell the cook the wrong thing.

**One thing deliberately left alone.** `delete()` does not participate in the
reservation scheme. Refusing a delete would be a new behaviour rather than a
safety correction, no product path deletes a photograph concurrently with
writing one, and `delete` is an explicit act rather than error recovery. Flagged
here rather than changed.

## 3. Deterministic concurrency tests

The interleaving is **forced**, not hoped for. The in-memory device gained a
`pauseExists()` gate that suspends every existence check until the test opens
it, which holds an operation at precisely the point the old code was unsafe —
after it asked whether the path was free and before it was told. A second
operation is then started while the first is provably in flight.

The same device also now **refuses an occupied destination** in `write` and
`importFrom`, mirroring the native layer, so a test cannot accidentally
demonstrate safety the real device would not provide.

**These tests were verified to fail against the unfixed code.** The reservation
was temporarily disabled and the suite re-run: all four concurrency tests failed,
the loser reporting `device_refused` — the old path, in which its cleanup then
deleted the winner's file. The fix was restored and all 45 pass.

| Required proof | Test |
|---|---|
| Two simultaneous `write()` calls: one owns, one refused, winner intact | "lets exactly one write win, and the loser never reaches the device" — exactly one fulfils, the other is `already_in_progress`, a spy proves the device's `write` was called **once**, and the winner's bytes and digest are asserted |
| Two simultaneous `importFile()` calls: one owns, one refused, winner intact | "lets exactly one import win, and does not consume the loser source file" — the refused import's source file is still where it was, proving it never reached the filesystem |
| Concurrent `write()` and `importFile()` cannot delete each other's result | "never lets a write and an import delete each other result" — the exact shape of the old race; asserts a file is still there, that it is the winner's, and that the store holds exactly one file |
| Order independence | "refuses the second operation whichever order they are started in" |
| Reservation released after success | "releases the path after a successful write"; "releases the path after a successful import" — a later attempt is refused with `already_exists`, not `already_in_progress`, which is only possible if the reservation came back |
| Reservation released after failure | "releases the path after a failed write, so a later attempt can use it"; "releases the path after a failed import, so a later attempt can use it" |
| A later legitimate operation can use a path a failed operation left empty | the same two tests: the path is asserted empty, then written successfully |
| Reservation released after an `already_exists` refusal | "releases the path when the refusal was that a photograph is already there" — refused twice, then deleted and written, so a leak would change the second refusal's reason |
| Reservation released when ownership is unprovable | "releases the path when the device could not say whether anything was there" — the existence check is made to fail; nothing is deleted and the path is usable afterwards |
| An existing photograph stays protected | the eight existing tests from the previous correction, unchanged and passing, plus "still protects a photograph that is already stored, whichever store asks" |
| A second store instance is not a way around it | "holds across a second store built over the same device" |

## 4. Verification

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** — `tsc --noEmit`, no output, exit 0 |
| `npm run lint` | **Pass** — `eslint .`, no output, exit 0 |
| `npm test` | **Pass** — 19 suites, 487 tests, 487 passed, 0 failed, 0 skipped |

475 tests before this correction, 487 after: twelve added, none removed, none
skipped and none weakened. `__tests__/privateFileStore.test.ts` went from 33
tests to 45.

## 5. Confirmation that no accepted decision changed

Three files changed, and nothing else. Verified by diff against the base commit:

```
__tests__/privateFileStore.test.ts
__tests__/support/memoryPorts.ts
src/data/files/privateFileStore.ts
```

Every other area shows **no diff**: `src/domain/`, `src/data/schema/`,
`src/data/sqlite/`, `src/data/adapters.ts`, `src/data/repositories.ts`,
`src/data/ai/`, `src/data/backup/`, `src/data/native/`, `src/data/runtime.ts`,
`src/data/startup.ts`, `src/data/photos/`, `app.config.ts`, `app.variants.json`,
`app/`, `package.json`, `package-lock.json`, `src/screens/`, `src/components/`,
`src/theme/`, `src/config/`.

So, specifically: the product model, schema and migration v1, the SQLCipher
configuration, the SecureStore key lifecycle, the missing-key recovery
behaviour, the repository relationships, the evidence rules, the AI service
boundary, the backup envelope, the Android permission decision, the app startup
initialisation, the dependency set and all visual/UI work are untouched. No
dependency was added, changed or removed.

**No native configuration or native code changed.** `src/data/native/` shows no
diff, `android/` was not regenerated, and no config plugin, Gradle property or
manifest entry was touched. No native rebuild or device install was required and
none was performed. As recorded in the previous report, the TEST APK on the
device predates these last two corrections; its native configuration is identical
to this tree's, its bundled JavaScript is not.

The `PrivateFileStore` interface itself is unchanged: no method was added,
removed or re-typed. `PathReservation` is internal to the module's own helpers,
and `FileFailureReason` gained one member.

## 6. Boundaries confirmed

- **The unattended queue remains inactive.** `build-control/queue/NEXT_RUN.json`
  shows no diff against the base commit and still reads
  `"allow_unattended": false`, `"instruction_id": "none"`, `"milestone": "NONE"`.
  It was not modified or activated.
- **No Project B or other repository work occurred.** Only
  `<repo>` was opened or modified. No Project B repository, no
  Project A, no cloud prototype archive, no unattended runner, dispatcher or
  cross-app automation infrastructure. `scripts/` and `build-control/runner/`
  show no diff.
- **M2 was not begun.** No UI, workflow, camera, export, restore, real AI, cloud
  service or signing identity was added.
- **No tag, release or acceptance record** was created.

## 7. Source control

| Step | Detail |
|---|---|
| Base commit | `22520e4edb92ae041dd6f3f87d91ad67d7575128` (confirmed clean and in sync before any change) |
| Implementation commit | `ce88286c38033de34b5d6f67936106b3d1257aa6` — `fix: make M1 photo writes concurrency safe` |
| Report commit | this file, committed separately as `docs(build-control): add M1 photo concurrency safety report`. A commit cannot contain its own hash; it is the tip of `main` at the end of this run. |
| Branch | `main` |
| Push | Implementation: `22520e4..ce88286  main -> main`, accepted by `origin`. The report commit was pushed immediately after it. |
| `origin/main` sync | In sync; working tree clean after each push. |
| Tag / release / acceptance record | **none created** |

## 8. Assessment

The race is closed at its cause rather than at its symptom. A logical photo
destination is reserved synchronously before any yield, held for the whole
operation, released in a `finally` on every path, and cleanup is gated on still
owning it — so a second operation is refused before it reaches the filesystem
and can never delete a file it did not create. Where ownership cannot be proved
the store preserves evidence instead of deleting it. The native no-overwrite
behaviour is retained untouched as the second line of defence, nothing is
retried, no path is invented, and the logical path format is unchanged.

Twelve deterministic tests force the interleaving rather than hoping for it, and
they were confirmed to fail against the unfixed code before the fix was
restored. Typecheck, lint and the full suite pass at 487 tests, with no existing
test weakened.

**M1 PHOTO CONCURRENCY SAFETY PASS CANDIDATE**

This is a correction within M1. It is **not** a claim of M1 acceptance, and no
acceptance record, tag or release was created.
