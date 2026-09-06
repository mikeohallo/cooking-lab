# Cooking Lab — M1 Native Persistence Report

**Date:** 6 September 2026
**Base commit:** `f831adf6c60a201068dbb640f2e13ec94b649177`
**Builds on:** `dd1d1f2d8cc087091d8ffe2e3e4794a76afd40cc` (accepted M1 foundation correction)
**Milestone status:** M0 **ACCEPTED**. M1 **not complete and not accepted**. This run
implements the native persistence step of M1. It is not an acceptance step and
makes no acceptance claim.

---

## 1. Scope completed

| # | Required | Where |
|---|---|---|
| 1 | Dependencies | `package.json`, `package-lock.json` |
| 2 | SQLCipher configuration | `app.config.ts` (config plugin), `android/gradle.properties` (generated) |
| 3 | SecureStore key lifecycle | `src/data/sqlite/keyProvider.ts`, `src/data/native/expoSecureStore.ts` |
| 4 | SQLite adapter | `src/data/sqlite/connection.ts`, `src/data/native/expoSqlite.ts` |
| 5 | Migration execution | `src/data/sqlite/migrationRunner.ts`, `src/data/sqlite/lifecycle.ts` |
| 6 | Repositories | `src/data/sqlite/repositories.ts`, `rows.ts`, `services.ts`, `dataLayer.ts` |
| 7 | App-private file storage | `src/data/files/privateFileStore.ts`, `src/data/native/expoFileSystem.ts` |
| 8 | AI-service boundary | `src/data/adapters.ts`, `src/data/ai/unavailable.ts`, `src/data/ai/selection.ts` |
| 9 | Backup-format integration | `src/data/backup/assemble.ts` |
| 10 | Composition root and startup | `src/data/runtime.ts`, `src/data/startup.ts`, `app/_layout.tsx` |

The accepted domain, schema and repository boundaries were preserved. No
vocabulary was added, removed or renamed; migration v1 was not edited; no
rejected M1-trial concept was reintroduced. `__tests__/controlledModel.test.ts`,
which scans every `.ts`/`.tsx` file under `src/` and `app/` for those concepts,
still passes against the new code.

**Architecture note — why there are ports.** Every module that carries a rule
worth testing (keying order, key lifecycle, migration ordering, path safety,
digest, transaction semantics, repository mapping) takes the device as a small
injected interface, and the Expo modules are four thin files under
`src/data/native/` that contain no logic. That is what allows the SQLite layer
to be exercised against a **real SQLite engine** (`node:sqlite`, shipped with
Node) in the test suite rather than against a hand-written imitation of one:
the CHECK constraints, the unique index, the cascades and the transaction
rollbacks asserted below are SQLite's own behaviour, not a stand-in's.

## 2. Dependencies and configuration

Installed with `npx expo install`, so every version is the one Expo resolves for
this SDK.

| Package | Range in `package.json` | Resolved |
|---|---|---|
| `expo-sqlite` | `~57.0.2` | 57.0.2 |
| `expo-secure-store` | `~57.0.3` | 57.0.3 |
| `expo-file-system` | `~57.0.6` | 57.0.6 |
| `expo-crypto` | `~57.0.2` | 57.0.2 |

Unchanged and already present: `expo` 57.0.19, `react-native` 0.86.3, `react`
19.2.3, `expo-router` 57.0.18, `expo-constants` 57.0.17. Expo SDK 57.

Nothing else was added. No ORM, no state library, no networking, no cloud SDK,
no analytics, no camera or image package, no archive package.

**Config plugins (`app.config.ts`).** The dynamic variant configuration is
unchanged; both identities are preserved exactly:

| Variant | Name | Android package |
|---|---|---|
| production | Cooking Lab | `com.cookinglab.personal` |
| test | Cooking Lab Test | `com.cookinglab.personal.test` |

Two plugins were added to the existing list:

```
['expo-sqlite', { android: { useSQLCipher: true } }],
'expo-secure-store',
```

Verified through Expo's own config resolution (`APP_VARIANT=test npx expo config
--type public`) and through the generated project. The plugin writes:

```
android/gradle.properties:  expo.sqlite.useSQLCipher=true
```

**Android backup handling.** `expo-secure-store` is left at its default
`configureAndroidBackup: true`, which is the module's normal behaviour and not a
new architecture decision. It adds two attributes to the application element:

```
android:fullBackupContent="@xml/secure_store_backup_rules"
android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
```

Both resources come from the module and both allow only `sharedpref` while
excluding the `SecureStore` preferences file, for cloud backup and for device
transfer. `android:allowBackup="true"` is unchanged from M0.

`app.config.ts` also gained two entries in its existing `blockedPermissions`
list, because `expo-secure-store` brings two biometric permissions this app does
not use. That is the M0 permission policy applied to a new instance rather than a
new decision; section 10 records what appeared, why, and what the shipped APK
carries.

The practical consequence of the backup rules, stated plainly: Android Auto
Backup does not carry the database key, and — because those rules are an allow-list naming only
`sharedpref` — it does not carry the encrypted database file or the photo
directory either. Auto Backup is therefore not a recovery mechanism for Cooking
Lab data and is not treated as one. The portable Cooking Lab backup is the
recovery mechanism, it is independent of the key, and completing it is M2.

## 3. Encryption and key lifecycle

**Generation.** 32 bytes (256 bits) from `expo-crypto`'s
`getRandomBytesAsync`, which is the platform's own secure random source, encoded
as 64 lowercase hex characters. Not derived from a device identifier, an install
id, a timestamp or anything else reproducible. `src/data/sqlite/keyProvider.ts`
refuses a random source that returns fewer bytes than it asked for rather than
padding or retrying.

**Where it is held.** `expo-secure-store`, under one alias:

```
cooking-lab.database-key
```

One entry, one alias, and deliberately no variant suffix: the TEST and
production builds have different Android application ids and therefore different
OS sandboxes, so neither can see the other's store. A suffix would imply they
shared one. `requireAuthentication` is not set — the store is opened before the
first frame, and the protection required is that another application cannot read
the key, which the Android keystore already provides.

**How it is applied.** SQLCipher takes the key as the first statement on each
connection:

```
PRAGMA key = "x'<64 hex characters>'"
```

The `x'…'` blob form hands SQLCipher the 32 bytes as they are, with no key
derivation in between. The material is already 256 bits of CSPRNG output, and
running a passphrase KDF over it would add a step without adding entropy.

**First run.** No database file and no key: a key is generated, stored, and the
database is created and migrated. Reported as `keyCreated: true`.

**Subsequent runs.** The stored key is read and reused. No second key is
written; the test suite asserts that no `set` reaches the store on a second
launch.

**Missing key against an existing database.** This is the case the whole
lifecycle module exists for, and it is handled in `src/data/sqlite/lifecycle.ts`
in this order: the file is checked **before** a key is asked for; if the file
exists and the key does not, startup stops and returns
`{ ok: false, reason: 'recovery_required' }`. No key is created, nothing is
deleted, and the encrypted file is not touched. The reason it matters: a missing
key looks exactly like a first run, and a first run creates a key that opens
nothing — after which the app would be entitled to conclude the database is
unusable and start again over a kitchen's entire history. Recoverable loss would
have become silent loss.

A stored value that is not 64 hex characters is also refused rather than
replaced, on the same reasoning: whatever it is, it may be the only thing that
opens the file.

**Confirmation that no key value appears anywhere.**

- No key value appears in this report. The alias is named; the key is not.
- The key is never logged. `describeStartup` in `src/data/startup.ts` is built
  from the outcome, the schema version and a boolean; the key is not one of its
  inputs and is not reachable from any of them.
- The key never appears in an error. When `PRAGMA key` fails, the adapter
  discards the underlying cause deliberately — a binding that echoes the failing
  statement back would put the key in its message — and raises
  `the database key could not be applied`. A test plants exactly that leaky
  binding and asserts the key and the string `PRAGMA key` are both absent from
  what a caller receives.
- The key never appears in a backup. See section 7.
- The key is in no source file. A test walks every `.ts`/`.tsx` under `src/` and
  `app/` and asserts none contains a quoted 64-character hex string.
- The key is never written to AsyncStorage, app config or the database. None of
  the three is imported by, or reachable from, the key provider.

`destroyKey` exists on the provider because the accepted interface has it. It is
called by nothing and is exposed by no screen in this milestone.

## 4. Database and migrations

**File name.** `cooking-lab.db`, in the app-private database directory the
binding owns. A file name, never a path: nothing above the native layer learns
where it is.

**Open sequence**, in `src/data/sqlite/connection.ts`, in this order and proven
in this order by `__tests__/sqliteConnection.test.ts`:

1. Reject a key that is not 64 lowercase hex characters, before opening
   anything.
2. Open the connection.
3. `PRAGMA key = "x'…'"` — the first statement sent, before anything else.
4. `SELECT count(*) FROM sqlite_master` — the readability probe. Applying a key
   always succeeds; reading with the wrong one does not, so the key is proved
   rather than assumed. A failure here closes the connection and refuses to
   open.
5. `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`, the accepted
   `CONNECTION_PRAGMAS`, unchanged from the accepted schema module.

**PRAGMAs.** Both come from `CONNECTION_PRAGMAS` in
`src/data/schema/migrations.ts` and were not modified. Foreign keys are per
connection and off by default in SQLite; every cascade in the accepted schema is
inert without that line, which is why a test asserts it is issued.

**Transactions.** `withTransaction` issues `BEGIN IMMEDIATE`, runs the callback,
and commits on return or rolls back on throw. There is no third outcome and no
way for a caller to forget to commit.

`expo-sqlite`'s `withExclusiveTransactionAsync` is deliberately **not** used: it
opens a second connection to the same file, and a second connection to a
SQLCipher database has not been keyed. This is recorded here because it is the
kind of choice that looks arbitrary later.

Every call on the adapter — reads, writes and transactions alike — passes
through a queue, so a stray statement can never land between a `BEGIN` and its
`COMMIT` and be committed or rolled back with a transaction it never belonged
to. A test starts a doomed transaction and an unrelated insert together and
asserts the insert survives the rollback.

**Version handling.** `src/data/sqlite/migrationRunner.ts`:

- `findMigrationDefects` runs before any transaction is opened, so a list that
  skips, repeats or reorders a version is refused rather than partly applied;
- each migration runs inside one transaction, so a failure takes its version
  stamp with it and leaves no half-schema;
- a database reporting a version higher than this build knows is refused with
  `schema_from_a_later_build`. It does not read what it recognises and ignore
  the rest;
- after migrating, `openCookingLabDatabase` verifies every table in
  `SCHEMA_TABLES` is present and refuses `schema_incomplete` if not — a
  migration that reported success without leaving the tables behind would make
  the app show an empty kitchen rather than a broken one.

Migration v1 was not edited. No second schema was introduced, and no
compatibility with the rejected earlier trial schema was invented.

## 5. Repository implementations

All eleven tables and the schema bookkeeping are implemented in
`src/data/sqlite/repositories.ts`, with row mapping in `src/data/sqlite/rows.ts`
and the evidence composition in `src/data/sqlite/services.ts`.

| Repository | Tables |
|---|---|
| `CookRepository` | `cooks` |
| `CookEventRepository` | `cook_events` |
| `FindingRepository` | `findings`, `finding_sources` |
| `LessonRepository` | `lessons` |
| `TagRepository` | `tags` |
| `CookTagRepository` | `cook_tags` |
| `BriefingRepository` | `briefings`, `briefing_sources` |
| `ImportBatchRepository` | `import_batches` |
| `SchemaStateRepository` | `schema_meta` |

Accepted relationship semantics preserved: `finding_sources` links findings to
cook events only; `briefing_sources` links briefings to source cooks only;
`(name, kind)` uniqueness on tags, enforced by the schema's `NOCASE` index and
by normalising on the way in; `parent_cook_id` self-reference, with a child cook
surviving its parent's deletion; UUID-shaped application identifiers, generated
by `expo-crypto`'s `randomUUID` on the device; UTC ISO-8601 timestamps, stored
and read as text with no conversion.

**Atomic operations.**

- `FindingRepository.createWithSources` — the finding and every citation in one
  transaction. There is no method that writes a finding on its own.
- `BriefingRepository.createWithSources` — the briefing and every source cook in
  one transaction.
- `CookRepository.delete` — the cascade, in one transaction.
- `SchemaStateRepository.recordVersion` — both `schema_meta` rows together.
- Each migration — one transaction per version.

**Row mapping refuses rather than coerces.** A `status` that is not a status, a
`meta` that is not JSON, a `useful` that is neither 0, 1 nor NULL: each throws,
naming the table and column. Reading a bad value as the common case would put an
invented record in front of the cook and it would look exactly like a real one.

**Every value is bound.** No data is interpolated into SQL anywhere in the data
layer. The only text concatenated into a statement is a column name or a sort
direction chosen by the module itself from a fixed set.

**Evidence-boundary enforcement.** The repositories store; they do not decide.
Whether a write is permitted is settled first by the pure functions in
`src/domain/evidence.ts` and composed with the write in
`src/data/sqlite/services.ts`, which is the only door `DataLayer` hands out. A
refusal comes back as the same `EvidenceDecision` the pure function produced, so
a screen handles it identically whether it was refused in memory or on disk.
Nothing in the persistence layer consults an actor, and nothing in it can be
talked into skipping a rule because it never knew about one.

The pure evidence services are not bypassed anywhere. The repositories remain
exported — a repository is not a secret — but `DataLayer` is what the app is
given, and `src/data/runtime.ts` does not hand out the `DatabaseAdapter` at all.

## 6. File/photo storage

`src/data/files/privateFileStore.ts`, over `expo-file-system`'s modern API
(`Paths.document`, `Directory`, `File`).

**Durable root.**

```
<document directory>/cooking-lab/media/<logical path>
```

The documents directory is the one the operating system does not empty behind
the app's back. `Paths.cache` appears nowhere in the implementation: the camera
hands over a file in a cache directory and the system may reclaim it at any
moment. A named subdirectory rather than the document root, so the store lists
what this app put there and not whatever else is in the documents directory.

**Logical to physical.** The accepted cook- and event-derived path policy in
`src/data/photos/photoPaths.ts` is unchanged and is the interface to the rest of
the app. The absolute location never leaves `src/data/native/expoFileSystem.ts`;
every layer above it works in paths relative to the store root, which is what
keeps device paths out of domain records as a property of the code rather than a
habit.

**Path safety, twice.** `isSafePhotoLogicalPath` first — refusing `..`,
absolute paths, URLs of every scheme, backslashes, whitespace and cache/temp
roots — and then `staysInsideRoot` on the resolved path. The second check is
redundant while the first is perfect, which is exactly why it is there; it is
tested on its own so it is known to work rather than merely known to be
unreachable today.

**SHA-256.** Computed by `expo-crypto` over the file's bytes, returned as
lowercase hex. There is no way to hash bytes without reading them, and a
size-and-date "digest" would match two different photographs — the case a
manifest exists to catch. Contents are hashed and discarded; nothing logs,
returns or retains them.

**Failure behaviour.** A failed import or write removes the partial destination
and raises a typed `PrivateFileError` naming the logical path and never a device
path. Crucially, the store has no database handle: it holds two ports and
nothing else, so a photograph that failed to save has nothing to delete but the
file it was writing. A failed photo import cannot take a cook or an event with
it. A test asserts the store's entire property list is the seven interface
methods.

`list()` reports every file under the root, including one whose path is not a
valid logical path. Such a file cannot be read, written or deleted through the
store — every other method refuses it — but hiding it would make a
reconciliation report a tidy store with an unexplained file sitting in it.

**Not implemented, on purpose:** camera UI, image picker, photo permissions,
resizing, capture flow. Those are the M2 capture workflow. This milestone
supplies the durable storage foundation only.

## 7. Backup foundation

The accepted portable envelope, its validation and its deterministic
serialisation are unchanged. `src/data/backup/assemble.ts` is the new step
between the live database and them.

**Synthetic snapshot proof.** `__tests__/nativePersistenceBackup.test.ts` seeds a
real, migrated SQLite database through the ordinary application path — start a
cook, add a note, add a photo event, propose a finding with a citation, reject
it, propose a lesson, tag the cook, create a briefing, record an import batch,
save a verdict — then reads it back through `SnapshotService`, assembles an
envelope and validates it. It asserts:

- validation returns no issues;
- every collection is populated, junctions included;
- the verdict survives serialise → deserialise byte for byte, leading and
  trailing spaces and embedded quotation marks intact;
- a finding keeps its class, its rationale, its confidence and its `rejected`
  status — a rejected proposal is part of the record and travels with it;
- two assemblies of an unchanged database serialise to identical text.

**Photo manifest relationships.** The manifest is driven by the `photo` events in
the snapshot rather than by whatever is in the file store: the database is the
record of what was taken. Each entry carries the logical path, the cook, the
event, the capture time, the byte length and the digest read back from the store.
A photograph the timeline names that is not on the device is **reported**, in
`missingPhotos`, and validation independently fails the envelope with
`photo_manifest_mismatch` rather than quietly producing a backup that restores a
cook whose pictures are gone.

**No key material in an export.** Asserted directly: a real key is generated,
the envelope is serialised, and the text is checked to contain neither that key
nor the SecureStore alias nor any of `encryption`, `sqlcipher`, `passphrase`,
`secret`, `keychain`. The envelope does contain 64-character hex strings — they
are the photo digests, which are what make a restore verifiable — so the test
accounts for each one explicitly and then asserts that with the digests removed
nothing key-shaped remains anywhere in the file. A second test round-trips the
text with no key, no store and no device present at all, which is the only
situation a backup exists for.

**Deliberately not built:** Settings → Export UI, user-triggered bundle
creation, save/share, restore, destructive apply, and any device-loss recovery
claim. Those are M2 and this report makes no claim about them.

## 8. AI service boundary

**The seam.** `AiService` in `src/data/adapters.ts` replaces the previous
single-operation `AiAdapter` with the four required operations:

```
extractCook(context)        -> AiOutcome<AiCandidateSet>
createBriefing(request)     -> AiOutcome<AiBriefingDraft>
chat(request)               -> AiOutcome<AiChatReply>
importCandidates(request)   -> AiOutcome<AiImportResult>
```

Every one returns an `AiOutcome`, which is either a result or an explicit
unavailability with a reason. That distinction is load-bearing: "not connected"
and "looked and found nothing" are different facts and a screen must be able to
tell them apart, which an empty result would prevent.

The request and result types use existing vocabulary only. An import candidate
deliberately cannot carry a verdict, a status or a finding: a verdict is the
cook's own words about their own cooking, and an assistant reading a document is
not the cook.

**`UnavailableAiService`** (`src/data/ai/unavailable.ts`) is the production
implementation. All four operations return `ai_not_connected` with one fixed
message and no `result` property at all. It fabricates no findings, no lessons,
no briefings, no chat replies and no import candidates. It is a plain object of
four functions with no captured state, so there is nothing in it that could be a
handle.

**`FixtureAiService`** (`__tests__/support/fixtureAi.ts`) exists and is
**test-only**. It lives in the test tree rather than under `src/` because that is
the placement that makes "production cannot select it" a fact rather than a
promise. Everything it returns is prefixed `test-only assistant:`.

**Proof that no assistant holds a database handle.** `findDatabaseHandles` was
**strengthened**, not merely preserved:

1. it now walks the prototype chain, so a service written as a class — whose
   methods are not own properties — can no longer hide a handle from it;
2. it now recognises storage by **shape** as well as by name: a database
   connection, a whole `DataLayer`, a single repository, the photo store or a
   snapshot service is detected whatever the property holding it is called.

The second change was made because a test found a real gap: a leaked `DataLayer`
under an innocuous name passed the old check. It does not now. Tests assert the
check finds nothing on either assistant, finds a planted handle under each of
the shapes above, and fires on a leaky class.

**Proof that production cannot select a stand-in.** Three independent things,
each tested:

1. nothing under `src/` or `app/` contains a fabricating assistant, and a scan
   asserts neither `createFixtureAiService` nor its marker appears in any
   bundled file;
2. nothing the bundler compiles imports anything from the test tree —
   `__tests__/fixtureSeparation.test.ts` walks every bundled file and proves it;
3. `selectAiService` **throws** `ProductionAiSubstitutionError` if a stand-in is
   offered in the production variant, rather than quietly ignoring it. A caller
   that reached for one in production has misunderstood something, and the
   failure should be loud enough to notice.

`src/data/runtime.ts` constructs the assistant alongside the data layer and
gives it none of it. No `RemoteAiService`, HTTP transport, API key, model id,
gateway or provider name was added anywhere; real AI begins at M3.

## 9. Automated verification

Run from the repository root, on the implemented tree.

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** — `tsc --noEmit`, no output, exit 0. `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters` all on. |
| `npm run lint` | **Pass** — `eslint .`, no output, exit 0. |
| `npm test` | **Pass** — 19 suites, 456 tests, 456 passed, 0 failed, 0 skipped. |

For comparison, the accepted M1 foundation correction reported 13 suites and 343
tests. The increase is six new suites and 113 additional assertions; no existing
test was deleted, skipped, weakened or loosened.

**Suites, all passing.** Existing: `controlledModel`, `domainInvariants`,
`evidence`, `migrations`, `backup`, `fixtureSeparation`, `photoPaths`,
`appConfig`, `variants`, `responsive`, `testIdentity`, `HomeScreen`,
`PlaceholderScreen`. New: `sqliteConnection` (13), `databaseLifecycle` (18),
`sqliteRepositories` (34), `privateFileStore` (24), `nativePersistenceBackup`
(8), `aiBoundary` (15).

**What each required proof is proven by.**

| Required proof | Where |
|---|---|
| New database + no key securely creates one | `databaseLifecycle` — "creates a key on a fresh installation", "makes a key that is 256 bits of random material, not a constant" |
| An existing key is reused | `databaseLifecycle` — "reuses the key it already has, and does not write a second one"; "opens normally when the key is there and the database is too" |
| The key value is never logged | `databaseLifecycle` — "keeps the key out of every startup result a caller could log", "keeps the key out of the source of every module"; `sqliteConnection` — "closes the connection and says nothing about the key when keying fails" |
| Existing database + missing key gives a recovery-required, fail-closed result | `databaseLifecycle` — "refuses to open and makes no replacement key", "says so in words a screen can show" |
| Schema migration ordering is deterministic | `databaseLifecycle` — "takes a new database to the latest version", "applies nothing the second time", "refuses a list that skips, repeats or reorders a version", "rolls a failing migration back" |
| A schema version this build does not know fails closed | `databaseLifecycle` — "fails closed on a database written by a later build", "does not guess at a schema it does not know" |
| CRUD mapping is consistent with the accepted records | `sqliteRepositories` — round-trip cases for cooks, events, findings, lessons, tags, cook tags, briefings, import batches and schema state, including a thin cook and a verbatim verdict |
| Junction writes are atomic | `sqliteRepositories` — "writes the finding and both citations in one go", "writes neither when a citation names an event that is not there", "writes neither when a source names a cook that is not there" |
| Tag uniqueness behaves correctly | `sqliteRepositories` — "creates a tag once and finds it again however it is typed", "keeps the same word in two namespaces as two tags", "refuses a duplicate at the database itself, whatever the case", "normalises a rename" |
| Raw evidence cannot be bypassed through repository methods | `sqliteRepositories` — "refuses the assistant a cook, a verdict and a timeline entry, and writes nothing", "refuses the assistant an edit to the cook timeline", "lets the assistant add its own message and then never touch it again" |
| Approved findings and lessons remain protected | `sqliteRepositories` — "refuses the assistant an approved finding, and the stored row is unchanged", "refuses the assistant the decision itself", "makes an edited finding the cook own words" |
| Rejected proposals remain retained | `sqliteRepositories` — "keeps a rejected finding, with its text, its class and its citations", "keeps a rejected lesson too"; `nativePersistenceBackup` — a rejected finding travels in the export |
| Physical paths stay inside app document storage | `privateFileStore` — "has a root check that would catch an escape the grammar let through", "creates the store root before the first write, and never a cache directory" |
| Traversal is rejected | `privateFileStore` — ten refusal cases across every method, plus a Windows-separator case |
| Import, read, write, list and delete behave consistently | `privateFileStore` — "writes, reads and describes a file", "moves the file out of wherever it was", "deletes what is there and shrugs at what is not", "lists everything it holds, in a stable order" |
| The digest is deterministic | `privateFileStore` — "computes the same digest every time, and a different one for different bytes" |
| The logical-path contract is intact | `privateFileStore` — paths are built by the accepted `buildPhotoLogicalPath` and no device path appears in any error |
| A native-shaped snapshot validates and serialises | `nativePersistenceBackup` — "reads every table out and validates", "carries the verdict, the class, the confidence and the rejection through unchanged", "is deterministic" |
| No key or SecureStore material appears in export data | `nativePersistenceBackup` — "contains no key, no key alias and nothing that looks like key material", "is readable without the key" |
| `UnavailableAiService` never returns fabricated content | `aiBoundary` — "refuses to extract findings, and returns no candidates at all", "refuses to write a briefing, a reply or an import candidate" |
| A fixture assistant is test-only | `aiBoundary` — "keeps the only stand-in that exists outside everything the bundler compiles"; `fixtureSeparation` — nothing bundled imports the test tree |
| No assistant holds a database or repository handle | `aiBoundary` — "finds no handle on the shipped assistant", "finds one the moment a data layer is attached", "holds nothing at all"; `evidence` — "finds one hidden on a prototype" |
| Production cannot silently select fixture AI | `aiBoundary` — "gives production the unavailable assistant", "throws rather than quietly ignoring a stand-in offered to production" |

**One test was changed and it was strengthened, not weakened.** The rule-2 block
in `__tests__/evidence.test.ts` was built on the `AiAdapter` type, which this
step replaces with the four-operation `AiService`. Its compliant fixture was
rewritten to the new interface; every existing assertion was kept, and one case
was added — a leaky assistant written as a class, which the previous
own-property check would have passed. Nothing was removed.

**Two intermediate failures occurred and both were fixed before committing.**
Both were found by tests written for this step:

1. `findDatabaseHandles` did not detect a leaked `DataLayer`. The name was not on
   its list and the object has no `execute`/`select` at the top level. The
   **check** was wrong, not the test, and it was strengthened as described in
   section 8.
2. A first draft of the export test asserted that no 64-character hex string
   appears anywhere in a backup. That is false and should be: the photo digests
   are exactly that, and they belong there. The **test** was wrong and was
   corrected to account for each digest explicitly and then assert nothing
   key-shaped remains.

## 10. Native Android evidence

**Variant.** `APP_VARIANT=test`. No production package was built.

| | |
|---|---|
| Package | `com.cookinglab.personal.test` |
| Display name | Cooking Lab Test |
| `versionName` / `versionCode` | `0.0.0` / `1` |
| `minSdk` / `targetSdk` | 24 / 36 |
| Signing | template debug keystore, as at M0. No production signing identity exists or was created. |

**Commands.**

```
APP_VARIANT=test npx expo prebuild --platform android
APP_VARIANT=test ./gradlew :app:assembleRelease --max-workers=2 -Dorg.gradle.parallel=false
```

**Build result.** `BUILD SUCCESSFUL`. One Gradle build at a time throughout; a
duplicate client that was accidentally started while the first build was still
running was terminated immediately, before it could compile anything, so no two
native builds ever ran together.

| | |
|---|---|
| APK | `android/app/build/outputs/apk/release/app-release.apk` |
| Size | 123,065,255 bytes |
| SHA-256 | `7918c6eb58b4cf7972536e760806b7cfeb42297fc1e8004042e2e1daeb761cfd` |
| ABIs | `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` |

**SQLCipher is genuinely in the shipped binary**, not merely requested in
configuration. The APK's `lib/arm64-v8a/libexpo-sqlite.so` contains the
SQLCipher pragma surface — `cipher_page_size`, `cipher_kdf_algorithm`,
`cipher_hmac_algorithm`, `cipher_plaintext_header_size`, `sqlcipher_export` and
the rest — and the APK ships `libcrypto.so` alongside it. Plain SQLite has
neither. Reported SQLite base version 3.49.1.

**Device.**

| | |
|---|---|
| Model | Samsung SM-F956B (Galaxy Z Fold 6), serial `[serial redacted]` |
| Android | 16 (API 36) |

**Install and launch.**

1. `adb install -r …` → `Success`. Only `com.cookinglab.personal.test` is
   installed; there is no production package on the device.
2. App data was cleared first (`adb shell pm clear`) so the first launch was a
   genuine first run. Nothing was lost: M0 stored nothing and no live Cooking
   Lab data exists anywhere.
3. **First launch** — no crash, and the log reads:

   ```
   I ReactNativeJS: Cooking Lab storage created at schema version 1
   ```

   The key was generated and stored, the encrypted database was created, and
   migration v1 was applied.
4. **Force-stop and relaunch** — no crash, and the log reads:

   ```
   I ReactNativeJS: Cooking Lab storage opened at schema version 1
   ```

   `opened` rather than `created` is the evidence that matters: the key survived
   in SecureStore, the SQLCipher database file survived and was successfully
   read back **with that key**, and the migration runner correctly applied
   nothing the second time.
5. No `FATAL EXCEPTION` and no crash of any kind appears in the device log; the
   process was still running after both launches.

**What could not be checked on the device, and why.** The release build is not
debuggable, so `adb shell run-as` is refused and the database file cannot be
pulled off the phone to inspect its header directly. That is a property worth
having rather than a gap to close, but it means the on-device evidence for
encryption is the three facts above — SQLCipher compiled into the shipped
library, `expo.sqlite.useSQLCipher=true` in the generated project, and a
database that is created and then re-read across launches through the
key-then-prove open sequence — rather than a screenshot of ciphertext.

**No UI verification was performed and none was needed.** This step changed no
screen, so no cover- or inner-display QA was carried out and Mike was not asked
to do any.

**Merged Android permissions.** The final merged release manifest contains
exactly:

| Permission | Status |
|---|---|
| `android.permission.INTERNET` | Unchanged from M0. Retained for the Metro development client. |
| `com.cookinglab.personal.test.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | App-scoped signature permission generated by AndroidX for its own receiver registration. Not requested by Cooking Lab, present since M0, grants nothing to anything else. |

**Two new permissions appeared and were removed.** `expo-secure-store` declares
`android.permission.USE_BIOMETRIC` and `android.permission.USE_FINGERPRINT`,
because it can gate a stored value behind a fingerprint. Cooking Lab does not
use that: the database key is stored without `requireAuthentication`, since the
store is opened before the first frame is drawn. Both were therefore added to
the existing `blockedPermissions` list in `app.config.ts` and are stripped from
the merged manifest, which is the same rule M0 already applied to
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` and
`VIBRATE`. This is the existing restriction policy applied to a new instance,
not a new decision; an unused permission on the app's listing is a claim about
the app that is not true. Wanting a biometric gate later means removing those
two lines deliberately.

The merged manifest was inspected again after the change and the permission set
above is what the shipped APK carries.

**Android backup attributes**, unchanged in policy from M0:

```
android:allowBackup="true"
android:fullBackupContent="@xml/secure_store_backup_rules"
android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
```


## 11. Source control

| Step | Detail |
|---|---|
| Base commit | `f831adf6c60a201068dbb640f2e13ec94b649177` (confirmed before any change; working tree clean; fast-forwarded from `51993b0` to the published `f831adf`) |
| Implementation commit | `f07d85e3cdcf5d859f8967927921beec9f610369` — `feat: implement M1 encrypted native persistence` |
| Report commit | this file, committed separately as `docs(build-control): add M1 native persistence report`. A commit cannot contain its own hash; it is the tip of `main` at the end of this run. |
| Branch | `main` |
| Push | Implementation: `f831adf..f07d85e  main -> main`, accepted by `origin`. The report commit was pushed immediately after it. |
| `origin/main` sync | In sync. The working tree was clean and `main` was level with `origin/main` after each push. |
| Tag / release / acceptance record | **none created** |

The complete diff was inspected before committing. Only authorised M1 work
changed:

- `src/data/sqlite/`, `src/data/files/`, `src/data/ai/`, `src/data/native/`,
  `src/data/runtime.ts`, `src/data/startup.ts`, `src/data/backup/assemble.ts` —
  new;
- `src/data/adapters.ts` — the assistant seam and the strengthened handle check;
- `app/_layout.tsx` — the startup call, with no visual change;
- `app.config.ts` — the two config plugins, and two additions to the existing
  `blockedPermissions` list;
- `package.json`, `package-lock.json` — the four Expo dependencies;
- `__tests__/` — six new suites, a shared support directory, and the one
  strengthened block in `evidence.test.ts`.

`android/` is generated output and is gitignored, as it has been since M0; it is
not in either commit.

**The unattended queue is unchanged and remains inactive.**
`build-control/queue/NEXT_RUN.json` still reads `"allow_unattended": false`,
`"instruction_id": "none"`, `"milestone": "NONE"`, and shows no diff against the
base commit. `scripts/` and `build-control/runner/` show no diff either.

## 12. Remaining M1 work

Before Build Control could consider accepting M1:

1. **Physical-device verification of this build** — see section 10 for what was
   and was not confirmed on hardware.
2. **Confirmation of the assistant-message interpretation flagged in the
   accepted correction report** — `appendCookEvent` lets the assistant add an
   `assistant_msg` and nothing else, and lets it edit nothing afterwards. That
   interpretation is now also implemented in the persistence path. It is still
   awaiting Build Control's confirmation or reversal.
3. **Confirmation that this step's own interpretations are acceptable** — the
   two recorded in section 14.

Nothing else in this milestone's scope is outstanding. The M2 work named
throughout this report — capture UI, review UI, history, export and restore
workflows, real AI — is M2 and is deliberately not listed here as missing M1
functionality.

## 13. Boundaries confirmed

- **No live data.** Nothing was written to any real Cooking Lab database. Every
  record in this report came from a test database created and destroyed inside
  the test run, or from the app opening an empty database on the device.
- **No real AI.** No Anthropic, no HTTP transport, no API key, no model id, no
  gateway, no provider of any kind. The production assistant answers
  `ai_not_connected` to all four operations.
- **No cloud.** No cloud database, storage, sync, auth, accounts, analytics or
  telemetry. No networking library was added. The only Android permission
  remains `INTERNET`, retained since M0 for the Metro development client.
- **No production signing.** No keystore, no signing identity and no production
  package was built. The TEST release APK is signed with the template debug
  keystore, exactly as at M0.
- **No Project B work.** No Project B repository was opened, read or modified.
- **No other repository touched.** Only `C:\Projects\cooking-lab`. The cloud
  prototype archive was not accessed.
- **The unattended queue remained inactive.** `NEXT_RUN.json` was neither
  modified nor activated; the runner, dispatcher and cross-app lease protocol
  were not touched.
- **No M2 UI or workflow.** No New Cook behaviour, live timeline, temperature
  entry, photo capture, Finish and Review, verdict UI, proposal
  approve/edit/reject UI, History, Export UI or restore UI was implemented. The
  only change under `app/` is a startup call in the root layout that opens the
  store and logs one line; it renders nothing and changes no screen.

## 14. Deviations / blockers

No blocker. Two interpretations were required and are recorded here rather than
buried in the code.

1. **`withExclusiveTransactionAsync` is not used.** `expo-sqlite` implements it
   by opening a *second connection* to the same database file. A second
   connection to a SQLCipher database has not been keyed, so it would either
   fail or, worse, behave inconsistently. Transactions are therefore
   `BEGIN IMMEDIATE`/`COMMIT` on the single keyed connection, with every call on
   the adapter queued so nothing can slip inside a transaction. This is not a
   deviation from anything the prompt required — it required the accepted
   transaction semantics, which are implemented — but it is a real constraint of
   SDK 57 and is recorded so it is not rediscovered later.

2. **The app opens the store at launch and logs one line.** Section 13 of the
   prompt requires confirming on the device that database initialisation and
   migration succeed, and that they succeed again after a relaunch. Nothing
   could be confirmed unless the app actually opened its own database, so
   `app/_layout.tsx` now calls `initialiseStorage()` in an effect and logs the
   outcome. It renders nothing, changes no screen and is not an M2 workflow. If
   Build Control would rather M1 shipped with no startup call at all, that is a
   nine-line reversal and this report is the place to say so.

Two implementation defects were found by the new tests and fixed before
committing; both are described in section 9. Neither survived into the commit.

For the record, the native project was regenerated twice.
`npx expo prebuild --platform android` cleared and recreated `android/` each
time, because the plugin configuration had changed — once for the two config
plugins, and once more after the two biometric permissions were added to
`blockedPermissions`. `--clean` was not passed either time; Expo cleared the
directory of its own accord. `android/` has been gitignored generated output
since M0 and contained no hand-written native state — the project has used Expo
CNG throughout — so nothing authoritative was lost, and the differences from the
M0 project were inspected line by line: `expo.sqlite.useSQLCipher=true`, the two
SecureStore backup attributes, and the two extra blocked permissions. Nothing
else changed.

Before the second regeneration the compiled native output (`android/app/.cxx`,
`android/app/build`, `android/.gradle`) was moved aside and put back afterwards,
so the final build reused the already-compiled C++ instead of recompiling every
ABI a second time. That is generated build output being preserved across a
regeneration of generated configuration; Gradle re-ran every task whose inputs
had actually changed, and the manifest and packaging tasks did re-run, which is
how the permission change reached the APK that was hashed and installed.

The first build attempt was interrupted by the session's own background-task
handling rather than by anything in the project; the Gradle daemon carried on
and completed it, and the APK that was shipped is from a later, fully
instrumented run of the same command.

## 15. Assessment

The native persistence layer required by M1 is implemented against the accepted
domain, schema and repository boundaries, without altering any of them. The
database is opened through SQLCipher with a 256-bit key generated on the device
and held in the platform secure store; the key is applied before any other
statement and proved by a read; a database with no key is reported as requiring
recovery rather than silently replaced; migrations run transactionally, in
order, once, and refuse a schema from a later build; every accepted repository
is implemented with atomic junction writes and every evidence protection intact;
photographs have a durable app-private home with a checked path policy and a
real digest; the portable backup format is fed from the live database and
carries nothing derived from the key; and the four-operation assistant seam
exists with a production implementation that fabricates nothing and cannot be
substituted in production.

Typecheck, lint and the full suite pass — 19 suites, 456 tests, none skipped or
weakened — and the suite is 113 assertions larger than the accepted foundation.
Two real defects were found by those tests and fixed, one of them a genuine hole
in an existing protection, which is the suite doing its job.

A TEST-variant release APK was built from this tree, installed on a Samsung
SM-F956B running Android 16, launched from a cleared state and relaunched. It
created its encrypted database and key on the first launch and re-opened them on
the second, without a crash, under the correct TEST identity, and the shipped
binary demonstrably contains SQLCipher. The merged permission set is what it was
at M0.

What remains before Build Control could accept M1 is listed in section 12: the
assistant-message interpretation carried over from the accepted correction
report, and the two interpretations recorded in section 14.

**M1 NATIVE PERSISTENCE PASS CANDIDATE**

This is an implementation step within M1. It is **not** a claim of M1
acceptance, and no acceptance record, tag or release was created.
