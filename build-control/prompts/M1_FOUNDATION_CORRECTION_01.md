# COOKING LAB — M1 FOUNDATION MODEL CORRECTION 01

## Purpose

Correct the bounded M1 TypeScript/data foundation created by the previous unattended trial so that it matches the **controlled Cooking Lab product model and Personal Pilot Technical Baseline exactly**.

The previous M1 trial is **not accepted**. Its architecture quality and automation evidence were useful, but several product/data concepts were redesigned rather than preserved. Because no live Cooking Lab data exists and no SQLite database has yet been created on a device, there is no compatibility requirement with that unaccepted model.

This is a **correction within M1**, not a new milestone and not full M1 acceptance.

## Hard boundaries

Do NOT:

- begin M2;
- install or change dependencies;
- modify `package.json`, `package-lock.json`, or `node_modules/`;
- run Expo CLI, Gradle, adb, emulator, native builds, or device operations;
- create production signing material;
- create/use cloud services or accounts;
- introduce real AI or live cooking data;
- touch another repository;
- write an acceptance record, release, or tag.

The existing pure TypeScript foundation may be rewritten as needed. Do **not** preserve compatibility with the unaccepted M1 trial where that would keep incorrect concepts alive.

---

# 1. Controlled model — this section is authoritative for this correction

Use the following exact logical model and vocabularies. Do not add new lifecycle/status/category concepts unless they already exist below.

## cooks

Fields/semantics:

- `id`: UUID-shaped string primary identity
- `title`: optional text
- `status`: exactly `open | reviewed`; default/new value `open`
- `provenance`: exactly `live | imported`; default/new value `live`
- `parent_cook_id`: optional self-reference, used by Cook Again
- `started_at`: required timestamp
- `review_opened_at`: optional timestamp
- `review_saved_at`: optional timestamp
- `verdict`: optional **free-text user verdict stored verbatim**; it is NOT a rating enum
- `created_at`: required timestamp

There is no `planned`, `in_progress`, `complete`, `abandoned`, `finished_at`, or verdict rating scale.

A thin cook record is valid. The product principle remains that even a title plus free-text verdict can be useful; do not impose arbitrary completeness.

## cook_events

Fields/semantics:

- `id`
- `cook_id`
- `ts`
- `kind`: exactly `user_note | assistant_msg | temp | photo | plan`
- `body`: optional text
- `meta`: optional JSON-compatible value/text representation
- `photo_path`: optional logical app-private photo reference

Do not replace the event model with additional event kinds such as `observation`, `timing`, `step`, `adjustment`, `taste`, etc.

Temperature is represented through the event/meta model and the product is metric/°C. Do not add a Fahrenheit product vocabulary.

## findings

Fields/semantics:

- `id`
- `cook_id`
- `class`: exactly `observed | inference | knowledge`
- `text`
- `rationale`: optional; used for inferences
- `confidence`: optional `low | medium | high`; used for inferences
- `status`: exactly `proposed | approved | rejected`
- `created_by`: exactly `ai | user`
- `provenance`: exactly `live | imported`
- source event relationships through `finding_sources`
- `created_at`
- `updated_at`: optional

Do not replace `class`/`confidence` with evidence-strength, source-relation, or other invented taxonomies.

## finding_sources

This is the SQLite junction replacement for the original `source_event_ids` array.

It links a finding to the supporting `cook_event` rows it cites.

Do not make this a polymorphic source table for cooks/findings/other source kinds.

## lessons

Fields/semantics:

- `id`
- `cook_id`
- `text`
- `status`: exactly `proposed | approved | rejected`
- `provenance`: exactly `live | imported`
- `created_at`
- `updated_at`: optional

Do not add a required relationship from a lesson to a finding unless already required by the controlled model — it is not.

## tags

Fields/semantics:

- `id`
- `name`
- `kind`: exactly `dish | ingredient | technique | equipment`

`(name, kind)` must remain unique.

Do not add `outcome`, `free`, or other tag kinds.

## cook_tags

- `cook_id`
- `tag_id`
- composite uniqueness/primary relationship

## briefings

Fields/semantics:

- `id`
- `cook_id`: the NEW cook being briefed
- `content`: structured JSON-compatible briefing content
- `useful`: nullable boolean (`null` = unanswered)
- `created_at`

There is no briefing lifecycle such as `draft | issued | dismissed` in the controlled model.

## briefing_sources

This junction links a briefing to its **source cooks**.

Do not make briefing sources polymorphic findings/lessons/cooks. Retrieval may use approved rows from related cooks, but the stored source relationship required by the controlled model is source cook IDs.

## import_batches

Fields/semantics:

- `id`
- `filename`: optional
- `status`: exactly `processing | ready | done | failed`
- `candidates_total`: optional integer
- `candidates_resolved`: optional integer
- `created_at`

There is no production `origin` vocabulary such as `backup_restore | synthetic_fixture` in this table.

Synthetic test data must remain obviously synthetic through its test-only location/identifiers, not by adding a new production data-model state.

## schema_meta

Keep a minimal local schema/version metadata table sufficient to validate migrations and portable backups safely.

Do not broaden it into cloud/sync/account state.

---

# 2. Controlled evidence rules — exact behaviour

Implement and test these rules without reinterpretation:

1. **Raw verdict and timeline evidence are user evidence.** AI must never modify them.
2. AI adapters return candidates only; they never receive a database write handle.
3. AI proposals enter history only as `status='proposed'` findings/lessons through a controlled application service.
4. Findings visibly preserve the evidence class: `observed`, `inference`, or `knowledge`.
5. An inference may carry `rationale` and `confidence`; confidence is `low | medium | high`.
6. AI may never modify an `approved` finding or lesson.
7. Rejection changes status to `rejected`; rejected proposals are retained, not deleted.
8. **A user edit to any finding must set `created_by='user'` and `updated_at`.** Do not preserve `created_by='ai'` plus a separate `userEdited` flag as a substitute.
9. For lessons, preserve the controlled fields above. A user edit is represented through the user-controlled edit operation and `updated_at`; do not invent a separate creator field on lessons unless the controlled model is formally changed later.
10. `provenance` means exactly whether the record is `live` or `imported`. It does NOT mean author (`user`/`ai`).
11. Briefings and future chat may only cite/rely on retrieved approved history supplied to them; do not introduce hidden memory concepts.
12. Do not invent derived `evidenceStrength`, `supports/contradicts`, reinstatement lifecycle, or other evidence mechanics as replacements for the controlled model.

If an existing helper from the unaccepted trial conflicts with these rules, replace/delete it rather than preserving the wrong abstraction.

---

# 3. Correct the TypeScript domain model

Update the M1 domain files so their exported types, validators and invariants represent the exact controlled fields/vocabularies above.

Remove obsolete trial concepts including, where present:

- `planned | in_progress | complete | abandoned`
- verdict rating enums
- non-controlled event kinds
- Fahrenheit temperature vocabulary
- `Provenance = user | ai`
- evidence-strength taxonomy
- source-relation taxonomy
- extra finding source kinds
- extra briefing source kinds
- extra tag kinds
- briefing status lifecycle
- import origin taxonomy
- `userEdited` as a substitute for the required `created_by='user'` edit semantics

Do not keep deprecated aliases merely to make old tests compile. This foundation is unaccepted and has no live consumers.

---

# 4. Correct migration v1 rather than layering a compatibility migration

No M1 database has been installed or accepted on a device. Therefore:

- rewrite the unaccepted version-1 migration/schema so schema v1 is the correct controlled model;
- do NOT add a migration v2 whose purpose is to preserve the incorrect trial schema;
- keep deterministic migration ordering and the existing migration API where still appropriate;
- keep foreign keys/cascades appropriate to the controlled relationships;
- `finding_sources` links findings to cook events;
- `briefing_sources` links briefings to source cooks;
- keep unique `(name, kind)` tags;
- preserve `schema_meta`;
- remove columns/tables/check constraints that only support rejected trial concepts.

Add tests that explicitly assert the exact controlled vocabularies and that rejected concepts are absent.

---

# 5. Correct repository/service contracts

Keep the useful storage-abstraction principle from the trial, but align interfaces to the controlled model.

Requirements:

- screens/services should remain isolated from SQLite implementation;
- repository APIs should represent the corrected entities/relationships;
- finding-source APIs work with source event IDs only;
- briefing-source APIs work with source cook IDs only;
- review/application services enforce the exact evidence rules above;
- remove APIs whose only purpose is the rejected evidence-strength/source-relation/reinstatement design.

Do not add UI integration in this correction.

---

# 6. Backup foundation

Retain the useful portable-backup foundation, but update it to serialize/validate the **corrected controlled model**.

Backup contract must represent:

- schema/version metadata
- cooks
- cook events
- findings
- finding-source event links
- lessons
- tags
- cook-tag links
- briefings
- briefing-source cook links
- import batches
- photo/file manifest entries

Keep deterministic serialization and fail-closed validation where sound.

Remove validation rules that only exist for rejected trial concepts.

The portable backup remains independent of the SQLCipher key.

No real file I/O in this correction.

---

# 7. Synthetic fixtures

Retain test-only fixture separation, but rewrite fixtures to use only controlled production vocabularies.

Requirements:

- fixtures remain outside production runtime paths;
- synthetic IDs/names may make test data obvious;
- do not add `synthetic_fixture` as a production enum/state;
- include examples of both `live` and `imported` provenance where useful;
- include `observed`, `inference`, and `knowledge` findings;
- no real cooking history.

---

# 8. Photo path policy

Retain the pure, app-private logical photo path helper if it remains compatible with the controlled event/photo model.

Do not add filesystem/camera/native implementation yet.

---

# 9. Tests — must catch the previous failure mode

Run all approved quality checks:

- `npm run typecheck`
- `npm run lint`
- `npm test`

Update/remove the unaccepted M1 trial tests where necessary so they verify the corrected authority rather than the rejected design.

Add explicit regression tests proving at minimum:

- cook status is exactly `open | reviewed`;
- verdict is optional free text, not a rating enum;
- provenance is exactly `live | imported`;
- event kinds are exactly `user_note | assistant_msg | temp | photo | plan`;
- finding class is exactly `observed | inference | knowledge`;
- confidence is `low | medium | high` when present;
- finding/lesson statuses are exactly `proposed | approved | rejected`;
- finding `created_by` is `ai | user`;
- user edit of an AI finding returns/produces a finding with `created_by='user'` and non-null/updated `updated_at`;
- AI cannot edit approved findings or lessons;
- rejected proposals remain present;
- tag kinds are exactly `dish | ingredient | technique | equipment`;
- briefing source relationship points to cooks;
- briefing `useful` is nullable boolean and no briefing lifecycle enum exists;
- import status is exactly `processing | ready | done | failed`;
- no import-origin production enum exists;
- no evidence-strength/source-relation/reinstatement replacement model remains;
- schema v1 contains the correct columns/checks and rejected trial columns/vocabularies are absent;
- backup round-trip uses the corrected model;
- synthetic fixtures cannot enter the production runtime import graph.

Tests must not preserve an incorrect requirement merely because it was introduced in the previous trial.

---

# 10. Scope verification

Before committing, verify via diff that this correction changed only the M1 foundation/test/report files needed to repair the rejected model.

No user-facing Cooking Lab screen behaviour should change.

No dependency/native/signing/cloud/live-data boundary may be crossed.

---

# 11. Source control and report

After typecheck, lint and tests pass:

1. create one bounded implementation commit;
2. suggested message: `fix: align M1 foundation with controlled data model`;
3. create `build-control/reports/M1_FOUNDATION_CORRECTION_REPORT.md`;
4. commit the report separately;
5. push both to `origin/main`.

No tag/release/acceptance record.

## Report structure

# Cooking Lab — M1 Foundation Correction Report

## 1. Scope corrected
- incorrect concepts removed
- controlled concepts restored

## 2. Exact controlled vocabularies
List the final values for cook status, provenance, event kind, finding class, confidence, proposal status, created_by, tag kind and import status.

## 3. Entity/schema corrections
- each table corrected
- migration v1 correction
- incorrect columns/relationships removed

## 4. Evidence-rule corrections
- raw evidence rule
- proposal rule
- approved-history rule
- user edit rule
- rejection retention

## 5. Repository/service correction
- APIs retained/replaced/removed

## 6. Backup/fixture correction
- corrected portable model
- fixture separation

## 7. Regression evidence
List the tests that specifically prevent the previous redesign from recurring.

## 8. Automated evidence
- typecheck
- lint
- test suite/test counts

## 9. GitHub evidence
- implementation commit
- report commit
- push result
- origin/main sync

## 10. Deferred M1 work
Native/dependency work remains deferred and unauthorised by this correction.

## 11. Product/runtime impact
Expected: no user-facing behaviour change.

## 12. Blockers/deviations
None if none.

## 13. Assessment
State exactly one:

`M1 FOUNDATION CORRECTION PASS CANDIDATE`

or

`M1 FOUNDATION CORRECTION NOT READY`

Do not claim full Milestone 1 acceptance and do not continue into the native/dependency step.