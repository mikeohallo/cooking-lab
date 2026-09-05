# Cooking Lab — M1 Foundation Correction 01 Report

**Date:** 5 September 2026
**Prompt:** `build-control/prompts/M1_FOUNDATION_CORRECTION_01.md`
**Implementation commit:** `dd1d1f2d8cc087091d8ffe2e3e4794a76afd40cc`
**Corrects:** `a34ded91320e79eb20fd8fc58cff830453469454` (M1 foundation trial, **not accepted**)
**Milestone status:** M0 **ACCEPTED**. M1 **not complete and not accepted**. This
run corrected the unaccepted foundation; it is not an acceptance step and makes
no acceptance claim.

---

## 1. Scope corrected

The whole of the unaccepted M1 local-data foundation, brought into line with the
controlled product model. No new surface was added beyond what the correction
required, and nothing outside the foundation was touched.

| # | Required by the prompt | Where |
|---|---|---|
| 1 | Domain types | `src/domain/entities.ts` |
| 2 | Controlled vocabularies | `src/domain/enums.ts` |
| 3 | Validators and invariants | `src/domain/invariants.ts` |
| 4 | Evidence rules | `src/domain/evidence.ts` |
| 5 | Migration v1, rewritten in place | `src/data/schema/migrations.ts` |
| 6 | Repository and service interfaces | `src/data/repositories.ts` |
| 7 | Native and assistant seam interfaces | `src/data/adapters.ts` |
| 8 | Backup contract and helpers | `src/data/backup/contract.ts`, `src/data/backup/validation.ts` |
| 9 | Photo path helper | `src/data/photos/photoPaths.ts` (verified; no change needed) |
| 10 | Test-only synthetic fixtures | `__tests__/fixtures/syntheticData.ts` |
| 11 | Regression tests | six suites under `__tests__/`, one of them new |

16 files changed: 2,616 insertions, 1,480 deletions.

**Deliberately not done:** M2 was not begun; no dependency was installed or
changed and `package.json`, `package-lock.json` and `node_modules/` are
untouched; no Expo, Gradle, adb, emulator or native/device operation was run; no
signing material, cloud service, real AI or live data was created; no other
repository was touched; no tag, release or acceptance record was created; no UI
integration was attempted.

## 2. Exact final vocabularies

Each is declared once as a frozen tuple in `src/domain/enums.ts`, with the union
type derived from it, so the compile-time type and the runtime guard cannot
disagree.

| Vocabulary | Values |
|---|---|
| `COOK_STATUSES` | `open`, `reviewed` |
| `PROVENANCES` | `live`, `imported` |
| `COOK_EVENT_KINDS` | `user_note`, `assistant_msg`, `temp`, `photo`, `plan` |
| `FINDING_CLASSES` | `observed`, `inference`, `knowledge` |
| `CONFIDENCE_LEVELS` | `low`, `medium`, `high` |
| `PROPOSAL_STATUSES` | `proposed`, `approved`, `rejected` |
| `CREATED_BY_VALUES` | `ai`, `user` |
| `TAG_KINDS` | `dish`, `ingredient`, `technique`, `equipment` |
| `IMPORT_BATCH_STATUSES` | `processing`, `ready`, `done`, `failed` |
| `SCHEMA_META_KEYS` | `schema_version`, `schema_applied_at` |

Temperature is metric only. There is no unit vocabulary at all: a single
constant `TEMPERATURE_UNIT = 'celsius'` and the meta key `celsius`. A unit column
would invite a second unit, and a second unit is how two readings that look
comparable stop being comparable.

The verdict has **no vocabulary**. It is nullable free text, stored verbatim.

## 3. Entity and schema corrections

Migration v1 was rewritten **in place**. No compatibility v2 was added: no device
has ever run v1, so there is no history to preserve and nothing for a
compatibility migration to be compatible with.

| Table | Corrected to |
|---|---|
| `cooks` | `id`, `title` (nullable), `status`, `provenance`, `parent_cook_id`, `started_at`, `review_opened_at`, `review_saved_at`, `verdict` (free text, no CHECK, no default, nullable), `created_at` |
| `cook_events` | `id`, `cook_id`, `ts`, `kind`, `body`, `meta` (JSON), `photo_path` |
| `findings` | `id`, `cook_id`, `class`, `text`, `rationale`, `confidence`, `status`, `created_by`, `provenance`, `created_at`, `updated_at` |
| `finding_sources` | `finding_id`, `cook_event_id`, `PRIMARY KEY (finding_id, cook_event_id)` — cook events only |
| `lessons` | `id`, `cook_id`, `text`, `status`, `provenance`, `created_at`, `updated_at` |
| `tags` | `id`, `name`, `kind`, plus `ux_tags_name_kind` unique on `(name COLLATE NOCASE, kind)` |
| `cook_tags` | `cook_id`, `tag_id` |
| `briefings` | `id`, `cook_id`, `content` (JSON), `useful` (nullable 0/1), `created_at` |
| `briefing_sources` | `briefing_id`, `cook_id`, `PRIMARY KEY (briefing_id, cook_id)` — cooks only |
| `import_batches` | `id`, `filename`, `status`, `candidates_total`, `candidates_resolved`, `created_at` |
| `schema_meta` | `key`, `value` |

Other schema facts:

- both junctions now use genuine composite primary keys, which is safe because
  every column in them is `NOT NULL`. The previous expression indexes existed
  only to work around nullable polymorphic columns that no longer exist;
- `parent_cook_id` references `cooks(id) ON DELETE SET NULL`, so deleting an
  earlier cook does not delete the ones that followed it;
- every other child row cascades from its cook;
- `CHECK (parent_cook_id IS NULL OR parent_cook_id <> id)`;
- `CHECK` tying `status = 'reviewed'` to a non-null `review_saved_at`;
- `CHECK` keeping `photo_path` on `photo` events and nowhere else;
- `confidence` and `useful` are `NULL`-or-in-the-list, so absent is a legal state
  rather than a value to invent.

Removed from the schema entirely: `evidence_strength`, `relation`,
`source_kind`, `user_edited`, `decided_at`, `finished_at`, `verdict_note`,
`origin_finding_id`, briefing `status` / `issued_at`, import `origin`, and the
`planned` / `in_progress` / `complete` / `abandoned` cook lifecycle.

The domain records mirror this exactly and stay deeply `readonly`. `meta` and
`content` are typed `JsonValue`, and `isJsonValue` refuses anything that does not
survive a round trip — `undefined`, `NaN`, a `Date`, a `Map`, a cycle — so a
column that says it holds JSON does.

## 4. Evidence-rule corrections

`src/domain/evidence.ts` is pure: no storage, no network, no assistant. Every
operation returns a decision with a code rather than throwing.

| Rule | How it is enforced now |
|---|---|
| 1. AI never modifies the verdict or timeline events | `saveCookReview`, `openCookReview`, `createCook`, `updateCook` and `updateCookEvent` all pass through `denyIfNotUser`. The verdict has its own function so the refusal is visible in the call graph. |
| 2. Adapters return candidates and get no write handle | `AiAdapter` has one method returning `AiCandidateSet` from a value copy of one cook and its events. `findDatabaseHandles` checks the same thing at runtime, and the test proves it fires on a leaky adapter. |
| 3. Proposals enter only as proposed, through services | `applyFindingCandidate` / `applyLessonCandidate` have no status parameter and no approved path; `ReviewService` is the only door. |
| 4. Findings keep their class | The class is carried through untouched and is asserted for all three values. |
| 5. Inferences may carry rationale and confidence | Both are optional fields, carried verbatim. |
| 6. AI never modifies an approved finding or lesson | `authoriseFindingUpdate` / `authoriseLessonUpdate` refuse approved, rejected and user-authored records with distinct codes. |
| 7. Reject sets rejected and retains the row | `decideFinding` / `decideLesson` change only `status` and `updatedAt`; the transition table has no exit from `rejected`. |
| 8. A user edit sets `created_by=user` and `updated_at` | `updateFinding` does exactly that, which also makes the record permanently untouchable by the assistant under rule 6. |
| 9. A lesson keeps its fields and invents no creator | `updateLesson` writes `text` and `updatedAt` only; `Lesson` has no author column. |
| 10. `provenance` means live/imported | It is absent from every evidence decision. `Actor` is now `CreatedBy` (`ai` / `user`), not `Provenance` — the trial had conflated the two. |
| 11. No hidden-memory concept | None introduced; a scan asserts none exists. |
| 12. Rejected trial concepts removed | Evidence strength, source relations, polymorphic source kinds, reinstatement and the user-edited flag are gone from source and schema, with a scan to keep them gone. |

**One interpretation, flagged for Build Control.** `assistant_msg` is a controlled
event kind, so something must be able to write one. `appendCookEvent` therefore
lets the assistant add an `assistant_msg` and **nothing else** — not a note, a
temperature, a photo or a plan, because those are observations and the assistant
did not observe anything — and it may never edit or remove any event afterwards,
including its own. Rule 1 says the assistant must never *modify* the verdict or
timeline events, and it never does. If Build Control intends assistant messages
to be written only under a user actor, that is a one-function change and this
report is the place to say so.

## 5. Repository and service corrections

- Queries now filter on the corrected columns: `CookQuery` by status,
  provenance, parent and tags; `FindingQuery` by cook, status, class and cited
  event; `LessonQuery` by cook and status; `BriefingQuery` by cook and
  usefulness; `ImportBatchRepository.list` by status. `listByOrigin` is gone.
- `FindingRepository` gained `listSourceEvents` and `listCitingEvent`, replacing
  the cook-citation methods; a finding and its sources are still written
  together by `createWithSources`.
- `BriefingRepository` gained `listSourceCooks`; its source methods take
  `BriefingSource`, which is now a briefing and a cook.
- `CookCaptureService` replaces `recordVerdict` with `openReview` and
  `saveReview(id, verdict: string | null, …)`.
- New `BriefingService` with `createBriefing` and `recordUsefulness`.
- `ReviewService` takes candidates and identities rather than proposals carrying
  their own status.
- Storage remains an abstraction: there is still no implementation, no
  `expo-sqlite` import anywhere, and no UI integration.

## 6. Backup and fixture corrections

**Backup.** The envelope shape is unchanged — `format`, `formatVersion`,
`schemaVersion`, `createdAt`, `entities`, `photoManifest` — because it was not
what was wrong. Validation now checks the corrected relationships:
`cooks.parentCookId`, `findings.cookId`, `findingSources.cookEventId`,
`lessons.cookId` and `briefingSources.cookId`, with the natural keys of both
junctions updated. Deterministic serialisation is unchanged and still verified.
The format remains independent of the database key: it carries no key, no key
identifier and nothing derived from one, and a test asserts the serialised text
contains no `encryption`, `sqlcipher`, `passphrase`, `secret` or `keychain`.

**Fixtures.** Rebuilt on the corrected model and still test-only. They now cover
every controlled vocabulary value: both cook statuses, both provenances, all
five event kinds, all three finding classes, all three confidence levels, all
three proposal statuses, both authors, all four tag kinds and two import
statuses. Every value is a **production** value — the `synthetic_fixture` import
origin is gone along with the rest of the origin enum, and no fixture-only enum
value replaced it. What marks the data out is its identifiers: every one begins
`synthetic-`. The fixture verdict deliberately contains leading and trailing
spaces, a line break and quotation marks, so anything that starts tidying the
verdict up will fail a test.

## 7. Regression evidence

Every item the prompt required to be proven, and where it is proven.

| Required proof | Suite and case |
|---|---|
| Exact cook status, provenance, event kinds, finding class, confidence, proposal status, created_by, tag kinds, import status | `controlledModel.test.ts` — “the exact vocabularies”, value-for-value, plus each guard accepting exactly its own values and rejecting the trial ones |
| Verdict is free text, not a rating enum | `domainInvariants.test.ts` “the verdict is free text” (accepts `7/10`, an emoji, empty, and keeps whitespace); `evidence.test.ts` “stores the verdict as free text”; `migrations.test.ts` “leaves the verdict free of any vocabulary at all”; `controlledModel.test.ts` “has no verdict vocabulary” |
| User edit of an AI finding produces `created_by=user` + `updated_at` | `evidence.test.ts` “rule 8 — a cook’s edit makes the words theirs” |
| AI cannot edit an approved finding or lesson | `evidence.test.ts` “refuses the assistant an approved finding” / “an approved lesson” |
| Rejected proposals remain | `evidence.test.ts` “keeps the whole row when a finding is rejected” and the lesson equivalent; `backup.test.ts` “keeps a rejected proposal in the backup” |
| Briefing sources point to cooks; `useful` is a nullable boolean | `backup.test.ts` “links a briefing to cooks only” and “keeps a briefing answer nullable”; `domainInvariants.test.ts` `useful = true/false/null`; `migrations.test.ts` “lets useful be true, false or unanswered” |
| No briefing lifecycle enum | `controlledModel.test.ts` “has no briefing lifecycle vocabulary”; `migrations.test.ts` “gives a briefing no lifecycle column to be in” |
| No import-origin production enum | `controlledModel.test.ts` “has no import-origin vocabulary”; `migrations.test.ts` “gives an import batch a status and no origin” |
| No evidence-strength / source-relation / reinstatement model | `controlledModel.test.ts` “the rejected trial concepts are absent from the product source” — a scan of every `.ts`/`.tsx` under `src/` and `app/`, with a case proving the scan fires; `evidence.test.ts` “offers no way back out of rejected” |
| Schema v1 has the correct columns and checks, and the rejected concepts are absent | `migrations.test.ts` — per-table column lists, per-column CHECK lists cross-checked against the enums, relationship and index assertions, and a token scan of the SQL |
| Backup round-trip uses the corrected model | `backup.test.ts` “the backup carries the corrected model” — verdict, class, rationale, confidence, `meta`, `content` and both junctions through serialise → deserialise |
| Fixtures cannot enter the production runtime import graph | `fixtureSeparation.test.ts` — nothing under `app/` or `src/` imports or even names the fixture, with a case proving the check fires |

Also proven, because the correction depends on it: `provenance` refuses `user`
and `ai`; a `temp` event is rejected unless it carries `meta.celsius`, and a
Fahrenheit reading is not recognised; an assistant claim about a cook must cite
a timeline entry unless it is general `knowledge`; `findDatabaseHandles` finds a
handle when one is planted.

## 8. Checks run

All three were run from the repository root at the corrected tree, after the
implementation commit.

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass** — `tsc --noEmit`, no output, exit 0. `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` all on. |
| `npm run lint` | **Pass** — `eslint .`, no output, exit 0. |
| `npm test` | **Pass** — 13 suites, 343 tests, 343 passed, 0 failed, 0 skipped, 5.5 s. |

Test suites, all passing: `controlledModel`, `domainInvariants`, `evidence`,
`migrations`, `backup`, `fixtureSeparation`, `photoPaths`, `appConfig`,
`variants`, `responsive`, `testIdentity`, `HomeScreen`, `PlaceholderScreen`.

For comparison, the unaccepted trial reported 12 suites and 191 tests. The
increase is one new suite and substantially more assertions per rule, not a
looser bar.

One intermediate failure occurred and was fixed before the commit: a shape
assertion in `controlledModel.test.ts` omitted `id` from the expected finding
columns. The test was wrong, not the code.

## 9. Source control

| Step | Detail |
|---|---|
| Implementation commit | `dd1d1f2d8cc087091d8ffe2e3e4794a76afd40cc` — `fix: align M1 foundation with controlled data model` |
| Report commit | see the push confirmation appended below this table at push time |
| Branch | `main` |
| Push state | recorded in section 13 |
| Tag / release / acceptance record | **none created** |

## 10. Deferred native M1 work

Unchanged by this correction and still outstanding, each behind an interface in
`src/data/adapters.ts` with no implementation:

- the `expo-sqlite` adapter and database encryption (`DatabaseAdapter`,
  `DatabaseAdapterFactory`, `DatabaseOpenOptions`);
- the SecureStore key lifecycle (`DatabaseKeyProvider`);
- the app-private photo store (`PrivateFileStore`);
- real backup file I/O (`BackupWriter`, `BackupReader`);
- the assistant adapter itself (`AiAdapter`).

There is still no implementation of any of these on purpose. A stand-in — an
in-memory map called a database, a constant called a key, a stub that fabricates
plausible findings — would type-check, pass a suite and be indistinguishable in
review from the real thing while providing none of the protection its name
claims.

## 11. Product and runtime impact

**None at runtime.** Nothing under `app/` or `src/screens/`, `src/components/`,
`src/layout/`, `src/theme/`, `src/config/` or `src/content/` was touched, and no
screen imports the data layer yet. The app builds and behaves exactly as it did
after M0. The corrected foundation is types, pure functions, interfaces and SQL
text; none of it executes at startup.

**Product impact, once wired up.** The model the app will present is now the
controlled one: a cook is open until it is reviewed; the review captures the
cook’s own words rather than a rating; a finding is visibly an observation, an
inference or general knowledge, and an inference can say how sure it is; a
briefing is advice built from earlier cooks that the cook can call useful or
not; and an assistant suggestion is always a proposal awaiting a decision.

## 12. Blockers and deviations

1. **Commit message truncated by the permission gate.** The gate permits only
   `-m` messages on `git commit` — not `-F`, not a heredoc — and rejects both
   angle brackets and longer multi-part bodies. The intended body (full
   vocabulary, entity and evidence-rule summary) would not pass, so the commit
   carries a one-paragraph body and the detail lives in this report. The
   `Co-Authored-By` trailer is present but its address is unbracketed, because
   `<…>` is refused as shell redirection.
2. **A scratch file could not be deleted.** `commit-msg.local` was written at the
   repository root while trying `git commit -F`, and the gate permits no
   filesystem removal. It is ignored by the existing `*.local` rule, is not in
   the commit, and now contains only a note saying it can be deleted.
3. **One interpretation was required and is flagged in section 4** — the
   assistant may append an `assistant_msg` event and nothing else, and may never
   edit any event. Build Control may wish to confirm or reverse this.
4. **Per-suite test counts are unavailable.** The gate permits only bare
   `npm test`, not a scoped run, so the counts reported are the whole suite.
5. No other blocker. Nothing was skipped, and no boundary in the prompt was
   approached.

## 13. Push state

The implementation commit and this report commit were pushed to `origin/main`.
The exact hashes and the push confirmation are recorded in the run log; the
report commit is the tip of `main` at the end of this run. No tag, release or
acceptance record was created.

## 14. Assessment

The controlled model is implemented exactly as specified, the rejected trial
concepts are gone from both the source and the schema and are now guarded by
tests that would fire if they returned, and typecheck, lint and the full test
suite pass. What remains is the deferred native work listed in section 10, which
was out of scope, plus the one interpretation flagged in section 4.

**M1 FOUNDATION CORRECTION PASS CANDIDATE**

This is a correction within M1. It is **not** a claim of M1 acceptance, and no
acceptance record, tag or release was created.
