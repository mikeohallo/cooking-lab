# Cooking Lab — M1 Native Persistence Safety Correction Report

**Date:** 6 September 2026
**Base commit:** `aef6c76ece1ce849723c0747c7823b36dd5bba5c`
**Corrects:** `f07d85e3cdcf5d859f8967927921beec9f610369` (M1 native persistence implementation)
**Milestone status:** M0 **ACCEPTED**. M1 **not complete and not accepted**. This is
a bounded safety correction within M1 and makes no acceptance claim.

---

## 1. Exact corrections made

Two, and only two. Both are fail-closed corrections to error paths; neither
changes behaviour on any path that succeeds.

| # | Correction | File |
|---|---|---|
| 1 | A rollback that itself fails now ends the connection instead of being swallowed | `src/data/sqlite/connection.ts` |
| 2 | A stored photograph can no longer be replaced, or destroyed while recovering from a failure | `src/data/files/privateFileStore.ts`, `src/data/native/expoFileSystem.ts` |

Six files changed in total: the three above, plus three test files.

## 2. Transaction poison behaviour

**What was wrong.** The previous `rollback` helper caught and discarded a failed
`ROLLBACK`. Its own comment said the connection was then in a state the
application could not reason about — and the code carried on using it anyway.
Every later statement would have been written against a connection whose
contents no longer followed from anything the code had done. That is not
fail-closed, and the comment saying so made it worse rather than better.

**What it does now.** `rollback` returns the failure instead of swallowing it,
and `withTransaction` acts on it:

1. The transaction work throws, or `COMMIT` throws.
2. `ROLLBACK` is attempted, exactly as before.
3. If the rollback **succeeds**, nothing else changes: the caller's error
   propagates and the adapter stays fully usable. Normal semantics are untouched.
4. If the rollback **fails**, the adapter is poisoned:
   - a `DatabaseUnusableError` with `reason: 'rollback_failed'` is stored, and it
     carries the rollback failure on `rollbackFailure` so the cause is not lost;
   - the native connection is closed, inside a try/catch, so a close that also
     fails cannot mask anything;
   - the caller still receives **their own** original error, because that is the
     one that explains what they were trying to do.
5. Every subsequent `execute`, `select` and `withTransaction` throws the stored
   `DatabaseUnusableError` without touching the connection.

**Nothing can slip past.** Each call is checked twice — once before it is queued,
so a caller holding a dead adapter is told immediately, and once inside the
queue, because a call that was already waiting when the poisoning happened would
otherwise reach a connection that had just been given up on. A test starts both
together and asserts the queued call is refused.

**Nothing is retried and nothing is reopened.** There is no automatic replay of
the failed transaction and no second connection is opened. The poisoned state is
deliberately one-way, with no code path that clears it. Recovery is a deliberate
application-level restart through the existing `openCookingLabDatabase`
lifecycle, which begins again from the file and the key — unchanged by this
correction.

**`close()` remains safe and idempotent.** Closing an adapter marks it unusable
with `reason: 'closed'` and closes the connection once; calling `close()` again,
or calling it on an already-poisoned adapter, returns without doing anything. The
poisoned path closes the connection itself, so `close()` afterwards has nothing
left to do.

**Naming note.** The obvious word for this state was rejected by an existing
regression test: `__tests__/controlledModel.test.ts` scans the product source for
the rejected cook-lifecycle vocabulary, and `abandoned` is one of its tokens. The
test was correct and was not touched; the wording was changed to "poisoned" and
"given up on" instead.

## 3. Existing-photo preservation behaviour

**What was wrong.** Cleanup after a failed `importFile` or `write` deleted the
destination unconditionally. That is right for a partial file the operation had
just created, and wrong for a destination that already held a valid Cooking Lab
photograph — error recovery could destroy evidence. The native `write` also
passed `overwrite: true`, so a successful write could silently replace a stored
photograph.

**What it does now.** A single gate, `claim`, sits in front of both write paths.
It checks the logical path for safety as before, and then checks that the path is
**free**. If something is already stored there, the operation is refused with a
new typed reason:

```
PrivateFileError { reason: 'already_exists' }
```

Because `claim` proves the path was empty before anything was written, anything
found at that path afterwards was put there by the failing operation — which is
what makes cleanup safe. `discard` is only ever called on such a path, and its
documentation says so explicitly. A photograph that was already stored is never
deleted as part of recovering from an error.

**The check is above the native call**, so a pre-existing destination is never
handed to an operation that could overwrite it. The native layer was hardened as
a second line of defence rather than as the protection itself: `write` now passes
`overwrite: false`, and `importFrom`'s `move`/`copy` are given no overwrite
option, so all three refuse an occupied destination. In normal operation none of
them ever comes into play, which is exactly why they are set that way — if the
first check were ever bypassed, they throw instead of quietly writing over a
photograph. A test asserts the refusal happens before the device is reached, by
checking the stored bytes are the identical object afterwards.

**This is a refusal, not a prohibition on ever changing a photo.** A logical path
is derived from the cook, the event, the instant and a sequence number, so a
different photograph always gets a different path and nothing in the product has
any reason to overwrite one. If a replacement were ever genuinely needed,
deleting first is an explicit, separate act — which is precisely the visibility a
silent overwrite removes. A test covers that route.

The logical path format is unchanged. No camera, photo or restore UI was added.

## 4. New regression tests

Nineteen new tests. No existing test was deleted, skipped, weakened or altered.

**Transaction poisoning** — `__tests__/sqliteConnection.test.ts`, ten tests
across two new blocks:

| Required proof | Test |
|---|---|
| Work throws + rollback succeeds → normal behaviour | "leaves the adapter perfectly usable when the work fails but the rollback works" — asserts the boundaries issued, then runs a further statement *and* a further transaction successfully, and that the connection was not closed |
| Work throws + rollback fails → adapter unusable | "gives up on the connection when the work fails and the rollback fails too" — asserts the caller still receives their own error, the connection was closed, and the next call throws `DatabaseUnusableError` with `reason: 'rollback_failed'` and the rollback failure attached |
| COMMIT fails + rollback fails → adapter unusable | "gives up on the connection when the commit fails and the rollback fails too" — asserts `BEGIN IMMEDIATE`, `COMMIT`, `ROLLBACK` were issued in that order and the adapter is then refused |
| COMMIT fails + rollback succeeds → still usable | "stays usable when the commit fails but the rollback works" |
| No statement executes after poisoning | "refuses execute, select and withTransaction alike"; "sends no further statement of any kind to the connection" — counts the statements the connection received and asserts the count does not move |
| No transaction is automatically retried | "does not replay the transaction or open another connection" — counts work invocations, opener calls and `BEGIN IMMEDIATE` statements; each is exactly one |
| `close()` stays safe and idempotent | "keeps close safe and idempotent afterwards"; "stays given up on even when the close that follows also fails" |
| A queued call cannot slip through | "refuses a call that was already queued when the connection was given up on" |

The failure modes are driven by options added to the existing recording
connection (`failOnCommit`, `failOnRollback`, `failOnRun`, `failOnClose`), because
a rollback failure cannot be provoked reliably on a real engine.

**Photo preservation** — `__tests__/privateFileStore.test.ts`, nine tests across
two new blocks:

| Required proof | Test |
|---|---|
| Import to a new path succeeds | "imports to a path that is free" |
| Import to an existing path is refused, original unchanged | "refuses an import onto a path that already holds a photograph" — asserts `already_exists`, that the bytes and digest are unchanged, and that the incoming file was not consumed either |
| The refusal happens before the device is touched | "refuses before it reaches the device, so no overwriting call is ever made" |
| A failed new-path import leaves no partial file | "leaves no partial file when an import to a free path fails" |
| Write to an existing path is refused, original unchanged | "refuses a write onto a path that already holds a photograph" |
| A failed new-path write leaves no partial file | "leaves no partial file when a write to a free path fails" |
| Error recovery never removes a stored photograph | "never removes a stored photograph while recovering from a failure" — two failing operations on a second path, with the first photograph's digest asserted unchanged |
| Replacement is still possible, deliberately | "still allows a replacement after the photograph is explicitly deleted" |
| No file failure touches cook, event or database evidence | "leaves the cook, the timeline and the photo event intact when the import fails" — a **real migrated SQLite database** with a cook and a `photo` event, two failing photo operations, then the cook, the timeline and the event's own `photoPath` all asserted intact |

The last of these is an end-to-end proof rather than a structural one: the
existing test that the store carries no database handle is still there, and this
one demonstrates the consequence.

## 5. Verification

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** — `tsc --noEmit`, no output, exit 0 |
| `npm run lint` | **Pass** — `eslint .`, no output, exit 0 |
| `npm test` | **Pass** — 19 suites, 475 tests, 475 passed, 0 failed, 0 skipped |

456 tests before this correction, 475 after: nineteen added, none removed and
none weakened.

One intermediate failure occurred and was fixed before committing:
`controlledModel.test.ts` flagged the word `abandoned` in the new connection
code, because it is one of the rejected cook-lifecycle tokens it scans for. The
scan was right; the wording was changed. The test was not touched.

## 6. Confirmation that no accepted decision changed

Nothing in the "do not change" list was changed. Verified by diff:

- **controlled domain vocabularies** — `src/domain/` shows no diff;
- **migration v1** — `src/data/schema/` shows no diff;
- **SQLCipher setup** — `app.config.ts` shows no diff; the keying sequence in
  `createDatabaseAdapterFactory` is untouched;
- **SecureStore key lifecycle** — `src/data/sqlite/keyProvider.ts` shows no diff;
- **missing-key recovery behaviour** — `src/data/sqlite/lifecycle.ts` shows no
  diff;
- **repository relationships** — `src/data/sqlite/repositories.ts`, `rows.ts`,
  `services.ts`, `dataLayer.ts` and `src/data/repositories.ts` show no diff;
- **evidence rules** — `src/domain/evidence.ts` shows no diff;
- **AI service boundary** — `src/data/adapters.ts` and `src/data/ai/` show no
  diff;
- **backup envelope** — `src/data/backup/` shows no diff;
- **permission decision** — `app.config.ts` shows no diff;
- **app startup initialisation** — `app/` shows no diff;
- **package dependencies** — `package.json` and `package-lock.json` show no
  diff. None were needed and none were added;
- **app screens or visual design** — `src/screens/`, `src/components/`,
  `src/theme/` show no diff.

The `DatabaseAdapter` interface itself was not changed: no method was added,
removed or re-typed. The poisoned state is reported through a thrown typed error
rather than a new interface member, so nothing above the adapter had to change.

**Native configuration and native code are unchanged.** `android/` was not
regenerated, no config plugin, Gradle property or manifest entry was touched, and
no dependency changed. Both corrections are pure TypeScript. No native rebuild or
device install was therefore required, and none was performed.

For completeness: the TEST APK recorded in the previous report
(`7918c6eb58b4cf7972536e760806b7cfeb42297fc1e8004042e2e1daeb761cfd`) predates
these two corrections and remains the build installed on the device. Its native
configuration is identical to this tree's; its bundled JavaScript is not. A
rebuild would be needed before that APK is treated as evidence for the corrected
behaviour.

## 7. Boundaries confirmed

- **Queue remains inactive.** `build-control/queue/NEXT_RUN.json` shows no diff
  against the base commit and still reads `"allow_unattended": false`,
  `"instruction_id": "none"`, `"milestone": "NONE"`. It was not modified or
  activated.
- **No Project B or other repository was touched.** Only
  `<repo>` was opened or modified. No Project B repository, no
  Project A, no cloud prototype archive, no unattended runner, dispatcher or
  cross-app automation infrastructure. `scripts/` and `build-control/runner/`
  show no diff.
- **M2 was not begun.** No UI, workflow, export, restore, real AI, cloud service
  or signing identity was added.
- **No tag, release or acceptance record** was created.

## 8. Source control

| Step | Detail |
|---|---|
| Base commit | `aef6c76ece1ce849723c0747c7823b36dd5bba5c` (confirmed clean and in sync before any change) |
| Implementation commit | `fed53aa11fb81a95ef057804603ae43f5aef5ec4` — `fix: harden M1 transaction and photo failure safety` |
| Report commit | this file, committed separately as `docs(build-control): add M1 native persistence safety correction report`. A commit cannot contain its own hash; it is the tip of `main` at the end of this run. |
| Branch | `main` |
| Push | Implementation: `aef6c76..fed53aa  main -> main`, accepted by `origin`. The report commit was pushed immediately after it. |
| `origin/main` sync | In sync; working tree clean after each push. |
| Tag / release / acceptance record | **none created** |

## 9. Assessment

Both corrections are implemented, both are fail-closed, and neither alters any
path that succeeds. A failed rollback now ends the connection rather than being
swallowed, with nothing retried, nothing reopened and nothing able to reach the
connection afterwards. A stored photograph can no longer be replaced by a write
or destroyed by error recovery, with the protection sitting above the native call
and a second refusal behind it. Nineteen regression tests cover every case the
correction instruction named, including an end-to-end proof against a real
database that a photo failure leaves the cook and its timeline untouched.
Typecheck, lint and the full suite pass, with no existing test weakened.

**M1 NATIVE PERSISTENCE SAFETY CORRECTION PASS CANDIDATE**

This is a correction within M1. It is **not** a claim of M1 acceptance, and no
acceptance record, tag or release was created.
