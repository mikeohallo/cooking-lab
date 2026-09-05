# Cooking Lab — M1 Foundation Unattended Trial Report

**Date:** 5 September 2026
**Prompt:** `build-control/prompts/M1_FOUNDATION_TRIAL.md`
**Implementation commit:** `a34ded91320e79eb20fd8fc58cff830453469454`
**Milestone status:** M0 **ACCEPTED**. M1 **not complete and not accepted** — this
run implemented one bounded portion of it.

---

## 1. Scope completed

The dependency-free TypeScript and local-data foundation for M1. Every item the
prompt required is implemented; nothing else was started.

| # | Required | Where |
|---|---|---|
| 1 | Strict-TypeScript domain models for all eleven tables | `src/domain/enums.ts`, `src/domain/entities.ts`, `src/domain/invariants.ts` |
| 2 | Versioned SQLite migrations as pure TypeScript/SQL text | `src/data/schema/migrations.ts` |
| 3 | Repository and service interfaces | `src/data/repositories.ts` |
| 4 | Pure evidence protections | `src/domain/evidence.ts` |
| 5 | Interfaces only for deferred native persistence | `src/data/adapters.ts` |
| 6 | Test-only synthetic fixtures | `__tests__/fixtures/syntheticData.ts` |
| 7 | Versioned portable backup contract and helpers | `src/data/backup/contract.ts`, `src/data/backup/validation.ts` |
| 8 | Photo logical-path policy helpers | `src/data/photos/photoPaths.ts` |
| 9 | Automated tests across all of the above | six new suites under `__tests__/` |

17 files, 5,149 insertions, no deletions and no modifications to any existing
file.

**Not done, deliberately:** no dependency was installed, no native module was
imported, no device or emulator was touched, no build was run, no tag or release
was created, and no further M1 step or any part of M2 was begun.

## 2. Domain and schema

**Controlled vocabularies** (`src/domain/enums.ts`) are each declared once as a
frozen tuple with the union type derived from it, so the compile-time type and
the runtime guard cannot disagree: cook status and verdict, cook event kind,
review status, provenance, evidence strength, source relation, finding and
briefing source kinds, tag kind, briefing status, and import batch status and
origin.

**Records** (`src/domain/entities.ts`) are deeply `readonly`, so a record can
only be changed by a function entitled to produce a new one. The eleven tables
are modelled as: `Cook`, `CookEvent`, `Finding`, `FindingSource`, `Lesson`,
`Tag`, `CookTag`, `Briefing`, `BriefingSource`, `ImportBatch`, `SchemaMeta`.

**Invariants** (`src/domain/invariants.ts`) restate in TypeScript what SQLite
also enforces, returning issues with a field and a code rather than throwing.
Thin records are valid throughout: a cook with a title and a start time and
nothing else passes, because that is what a real cook looks like at minute one.
Validation never repairs, defaults or truncates.

**Migrations** (`src/data/schema/migrations.ts`) are plain text. Nothing in the
module imports or executes anything. Version 1 creates all eleven tables with:

- explicit `REFERENCES ... ON DELETE CASCADE ON UPDATE CASCADE` from every child
  row to its parent, and `ON DELETE SET NULL` from a lesson to the finding it
  generalises — losing a finding must not take an approved lesson with it;
- junction tables for `finding_sources` and `briefing_sources`, each modelled
  with **one nullable foreign key per source kind** plus a `CHECK` that exactly
  the matching column is set. A single polymorphic id column would have been
  simpler and would have made the reference unenforceable;
- `CREATE UNIQUE INDEX ux_tags_name_kind ON tags (name COLLATE NOCASE, kind)`,
  with names also normalised by the domain layer;
- unique expression indexes on both junctions. A composite primary key was not
  used because SQLite permits NULLs in a non-INTEGER primary key and compares
  them as distinct, so it would not have been unique at all;
- `CHECK` constraints tying `decided_at` to review status, `finished_at` to cook
  status, `photo_path` to photo events, `issued_at` to issued briefings and
  `completed_at` to settled import batches;
- fifteen indexes on the columns the app reads by;
- `schema_meta`, stamped with the schema version and applied time by the
  migration itself.

`CONNECTION_PRAGMAS` carries `PRAGMA foreign_keys = ON`, which SQLite does not
default to and which every cascade above is inert without.

The migration SQL is written out **literally** rather than generated from the
enums, because a migration that has run on a device is history and generated SQL
would silently rewrite it the moment a vocabulary changed.
`__tests__/migrations.test.ts` cross-checks each literal `CHECK` list against
its enum, so drift fails a test instead of passing unnoticed.

The schema contains no `user_id`, owner, account, auth, RLS, policy, tenant,
sync or remote-id concept. This is asserted, not merely intended.

## 3. Evidence protections

`src/domain/evidence.ts` is pure: no storage, no network, no assistant. Four
rules, each enforced by a function that returns a decision rather than throwing,
and each denial carrying a distinct code.

**Rule 1 — raw evidence belongs to the cook.** `updateCook`, `recordCookVerdict`,
`createCookEvent` and `updateCookEvent` refuse the `ai` actor outright with
`ai_cannot_write_raw_evidence`. The gate takes no argument but the actor, because
there is no circumstance that would make an assistant write to a verdict or a
timeline acceptable. The verdict has its own function so that this is visible in
the call graph rather than buried in a patch type.

**Rule 2 — the assistant may only propose.** `applyFindingProposal` and
`applyLessonProposal` are the only paths by which an assistant candidate enters
the database. They cannot express a status: the record is always `proposed`,
always `userEdited: false`, always `decidedAt: null`. An assistant proposal that
cites no *supporting* raw evidence is refused, as is one citing anything that is
not an identified cook or cook event. `createUserFinding` / `createUserLesson`
refuse the assistant explicitly rather than silently downgrading it.

**Rule 3 — decisions are the cook's and they are explicit.** `decideFinding` and
`decideLesson` take `approve | reject | reinstate` against a closed transition
table and refuse any actor but `user`. Rejection **retains the row**: the id,
title, detail, provenance and evidence strength all survive, `finding_sources`
is untouched, and the cook may `reinstate` later. No transition deletes anything.

**Rule 4 — the cook's own words are protected.** `authoriseReviewableUpdate`
refuses the assistant a record that is approved, rejected, user-authored, or
that the user has edited — four distinct codes, because the remedies differ. A
user edit sets `userEdited: true` permanently, which is what keeps "the cook
rewrote this" distinguishable from "the cook accepted it as written" for the
rest of the record's life, while `createdBy` continues to record who raised it.

`deriveEvidenceStrength` derives strength from distinct supporting sources
rather than accepting an assertion, so a confidently worded claim cannot carry
more weight than the cooking behind it. Contradicting sources do not count
toward it, and one cook cited twice counts once.

## 4. Repository/service boundaries

`src/data/repositories.ts` is interfaces only. Repositories for cooks, cook
events, findings with their source links, lessons, tags, cook tags, briefings
with their source links, import batches and schema state; services for review,
capture and snapshot reads; and a `DataLayer` aggregate so a screen takes one
object rather than a database handle.

Three conventions make a later SQLite adapter a drop-in:

- **Records in, records out.** Column names, row shapes and SQL text stop at
  this line.
- **Repositories do not decide.** Authorisation is settled beforehand by the
  pure evidence functions; the review service returns the same
  `EvidenceDecision` those functions return, so a screen handles a refusal
  identically whether it came from memory or from disk.
- **Everything is asynchronous**, reads included, because the eventual store is
  a native module.

`FindingRepository.createWithSources` takes a finding and its citations together
— a finding that has lost its evidence is the one thing this product must never
produce. `TagRepository.findOrCreate` is one call rather than check-then-insert,
which under a unique constraint would be a race a cook would experience as a
failed save.

## 5. Security/storage boundaries

`src/data/adapters.ts` defines `DatabaseAdapter`, `Transaction`,
`DatabaseAdapterFactory`, `DatabaseKeyProvider`, `PrivateFileStore`,
`BackupWriter`, `BackupReader` and `BackupBuilder` — **and implements none of
them.**

That is the point. A plausible stand-in — an in-memory map called a database, a
constant called a key, a temp directory called app-private — would type-check,
satisfy a test suite and be indistinguishable in review from the real thing,
while providing none of the protection its name claims. Nothing in this
milestone fakes production security or storage, and the file says so where a
future reader will see it.

`withTransaction` takes a callback and the `Transaction` handle cannot commit or
roll back: returning commits, throwing rolls back, and there is no third outcome
to get wrong. `PrivateFileStore` speaks only in logical paths and accepts no
URL. `DatabaseOpenOptions.encryptionKey` may be `null` only for a synthetic
fixture database in a test.

## 6. Backup foundation

`src/data/backup/contract.ts` defines a versioned envelope carrying two distinct
versions — `formatVersion` (the shape of the file) and `schemaVersion` (the
database it came from) — plus `createdAt`, every structured entity and
relationship row via `DatabaseSnapshot`, and a photo manifest whose entries
carry the logical path, owning cook and event, capture time, byte length and a
SHA-256 digest.

`src/data/backup/validation.ts` provides `buildBackupEnvelope`,
`validateBackup`, `canonicaliseBackup`, `serialiseBackup` and
`deserialiseBackup`. Validation accepts `unknown`, because the interesting case
is a file from somewhere else, and checks format, both versions, every record
against its domain validator, duplicate natural keys, tag `(name, kind)`
uniqueness, every cross-collection reference, photo-path safety, and that every
photograph the timeline refers to is actually in the manifest.

Two properties are guaranteed deliberately:

- **Deterministic output.** Rows are sorted by natural key and object keys are
  sorted at every depth, using plain code-unit comparison rather than
  `localeCompare` — locale-aware ordering depends on the ICU data a device
  happens to ship, which would make "deterministic" mean "deterministic on this
  phone".
- **Nothing is repaired on the way in.** A dangling row is reported, never
  dropped; `deserialiseBackup` returns an envelope only when it is completely
  valid. Half a backup is not a smaller backup, it is a corrupted one.

No device file I/O is performed anywhere in this milestone.

`src/data/photos/photoPaths.ts` implements the logical-path policy:
`cooks/<cookId>[/events/<eventId>]/<compact instant>-<sequence>.<ext>`, derived
entirely from validated ids and a timestamp, deterministic, sanitised, and
matched against a whole-string pattern. Absolute paths, UNC and Windows paths,
`..` traversal, any URL scheme (`https:`, `file:`, `content:`), cache and temp
roots, doubled separators, whitespace, uppercase ids, free-text filenames and
unknown extensions are all refused. `normalisePhotoExtension` returns `null`
rather than guessing, because assuming an unknown extension is probably a JPEG
is how a file that is not an image ends up named like one.

## 7. Synthetic fixtures

`__tests__/fixtures/syntheticData.ts` holds a small, referentially complete
invented database: two cooks (one deliberately thin), three timeline events
including a photo, an assistant-proposed finding and a user-authored one with
their citations, two lessons, two tags and their links, a draft briefing with
three sources, one import batch and one photo manifest entry.

It is **outside the app source tree on purpose**. The bundle is built from
`app/` and `src/`; a fixture inside either is one accidental import away from
shipping, and shipped fixtures fabricate exactly the kind of data this app asks
a cook to trust. Two further guards travel with the data: every identifier
begins with `synthetic-`, and its import batch is recorded with origin
`synthetic_fixture`, which is not `PRODUCTION_IMPORT_ORIGIN` and which the
shipping app may never write.

`__tests__/fixtureSeparation.test.ts` proves the separation by walking every
`.ts`/`.tsx`/`.js`/`.jsx` file under `app/` and `src/` and checking that none of
them imports a test, mock, fixture or synthetic module. The walk asserts it
found files before concluding anything, and the matcher is itself tested against
a known-bad specifier, so the check cannot pass vacuously.

No real user cooking history was read, written or referenced. There is no
production-runtime import path for fixture data.

## 8. Automated evidence

All three approved quality commands were run on the working tree that became
commit `a34ded9`.

```
$ npm run typecheck
> tsc --noEmit
(no output, exit 0)

$ npm run lint
> eslint .
(no output, exit 0)

$ npm test
> jest
PASS __tests__/variants.test.ts
PASS __tests__/appConfig.test.ts
PASS __tests__/testIdentity.test.tsx
PASS __tests__/responsive.test.ts
PASS __tests__/HomeScreen.test.tsx
PASS __tests__/PlaceholderScreen.test.tsx
PASS __tests__/migrations.test.ts
PASS __tests__/evidence.test.ts
PASS __tests__/backup.test.ts
PASS __tests__/photoPaths.test.ts
PASS __tests__/fixtureSeparation.test.ts
PASS __tests__/domainInvariants.test.ts

Test Suites: 12 passed, 12 total
Tests:       191 passed, 191 total
Snapshots:   0 total
Time:        6.181 s
```

`npm run lint` initially reported two `import/no-duplicates` warnings in
`src/data/backup/contract.ts` (one module imported by two `import type`
statements). The imports were merged and the command re-run clean. That is the
only correction the checks prompted.

Six suites are new. The six pre-existing suites were **not modified** — no
existing test was changed, skipped or relaxed, and none needed to be.

What the new suites actually assert:

| Suite | Covers |
|---|---|
| `domainInvariants.test.ts` | id and timestamp shapes, thin records accepted, status/timestamp consistency, temperature and photo event rules, source-column exclusivity, tag normalisation, bookkeeping rules, and every fixture record validating |
| `migrations.test.ts` | ordering, contiguity, duplicate and gap detection, empty and semicolon-terminated statements, `pendingMigrations` including a future database, every table created, each literal `CHECK` list matching its enum, cascades, the tag unique index, junction uniqueness, indexes, and absence of any account/auth/sync concept |
| `evidence.test.ts` | all four rules, including that a refused write leaves the original untouched, that rejection preserves every field, reinstatement, invalid transitions, user-edit marking and its permanence, and evidence-strength derivation |
| `backup.test.ts` | a valid backup, an empty database, both versions, determinism under reordering and across repeated calls, key ordering, round-trip, malformed JSON, and eight distinct rejection cases including dangling references, duplicate rows, unsafe photo paths and a photo missing from the manifest |
| `photoPaths.test.ts` | derivation, determinism, extension normalisation, eight builder rejections, eighteen unsafe-path cases, and reading a cook and event back out of a path |
| `fixtureSeparation.test.ts` | that no bundled file imports fixtures, that the walk and matcher work, and the synthetic id prefix and import origin |

## 9. Source control / GitHub evidence

Two commits, in the order the Build Control protocol requires.

| Commit | Content |
|---|---|
| `a34ded91320e79eb20fd8fc58cff830453469454` | `feat: establish M1 local data foundation` — the 17 implementation and test files |
| this commit | `docs(build-control): add M1 foundation trial report` — this report only |

Starting state was verified before work began: `main` clean and aligned with
`origin/main` at `f265f76`, the queue activation commit for this trial, whose
first parent is `aeb9276` — the commit that last revised
`build-control/prompts/M1_FOUNDATION_TRIAL.md`, which is the prompt this run
executed.

At the time of writing, `main` is one commit ahead of `origin/main`. Both
commits are pushed to `origin/main` as the final action of this run; the push
result is reported to Build Control in the run log.

Nothing outside the repository was touched. No tag, no release, no branch other
than `main`.

## 10. Deferred M1 work

Deferred because it crosses a boundary this trial is not authorised to cross.
None of it is started, stubbed or faked.

| Deferred | Boundary |
|---|---|
| Installing `expo-sqlite`, `expo-secure-store`, `expo-file-system` and any encryption dependency | dependency install / `package.json` |
| The real Expo SQLite adapter and SQLCipher-equivalent encryption behind `DatabaseAdapter` | dependency + native |
| The SecureStore DB-key lifecycle behind `DatabaseKeyProvider` — generation, retrieval, rotation, destruction | dependency + native + device |
| The app-private FileSystem implementation behind `PrivateFileStore` | dependency + native |
| Actual backup export and restore I/O behind `BackupWriter` / `BackupReader`, and end-to-end recovery proof on a device | native + device |
| The migration runner that executes `MIGRATIONS` against a real database, and a first-run migration on a device | native + device |
| Repository implementations binding these interfaces to SQL | follows the adapter |
| Any native build, TEST APK and physical-device verification the M1 gate requires | native build + human/device authorisation |

## 11. Product/runtime impact

**None.** No file under `app/` was touched, no screen, component, theme, layout
or content module was changed, and nothing in this commit is imported by
anything the bundler compiles — `fixtureSeparation.test.ts` asserts the fixture
half of that, and the app entry graph reaches none of `src/domain/` or
`src/data/` because no screen imports them yet.

`package.json`, `package-lock.json`, `node_modules/`, `app.config.ts`,
`app.variants.json`, `babel.config.js`, `eslint.config.js`, `jest.config.js`,
`jest.setup.ts`, `tsconfig.json` and `android/` are all unchanged. The TEST and
production identities accepted at M0 are untouched. Building and running the app
today produces exactly the M0 shell.

The foundation is inert on purpose: it is types, text and pure functions waiting
for an adapter.

## 12. Blockers/deviations

No blockers. Nothing reached a **HUMAN ACTION REQUIRED** boundary.

Three decisions worth recording, none of which changes the authorised scope:

1. **Migration SQL is literal, not generated from the enums.** Generating it
   would have guaranteed agreement but would rewrite a shipped migration's text
   whenever a vocabulary changed. The agreement is asserted by test instead.
2. **Junction tables use one nullable foreign key per source kind** rather than a
   single polymorphic id column, so SQLite can actually enforce and cascade the
   reference. This costs an extra column and a `CHECK` on each junction.
3. **Both junctions use a unique expression index rather than a composite
   primary key**, because SQLite permits NULLs in a non-INTEGER primary key and
   treats them as distinct, which would have left the pair not unique.

No existing test was altered. The only check-driven change was merging two
duplicate `import type` statements, described in section 8.

The prompt's boundaries were not approached: no `npm install`/`ci`, no `npx`, no
Expo CLI, Gradle, adb, emulator or native tooling was run; no signing material,
external service, telemetry, real AI or live Cooking Lab data was involved; My
Recovery was not referenced.

## 13. Assessment

M1 FOUNDATION TRIAL PASS CANDIDATE
