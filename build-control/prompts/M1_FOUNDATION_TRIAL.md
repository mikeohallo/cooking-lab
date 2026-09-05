# COOKING LAB — M1 FOUNDATION UNATTENDED TRIAL

## Authority and purpose

This is the **first real product-development trial** of the accepted unattended Build Control runner.

It begins Milestone 1 in a deliberately bounded way. It is **not full M1 acceptance**.

Current controlled state:

- M0 is ACCEPTED.
- The unattended runner is approved for a controlled M1 trial.
- No live Cooking Lab data exists.
- No production signing identity exists.
- No external/cloud service is approved or required.
- The Product Build Brief remains product authority.
- The Personal Pilot Technical Baseline remains technical authority.

## Trial objective

Implement the **pure TypeScript/local-data foundation** for M1 without crossing any dependency-install, native-build, device, signing, cloud, or live-data boundary.

This trial should produce useful M1 implementation that can later be connected to Expo SQLite / SQLCipher / SecureStore / FileSystem in a separately authorised step.

Do not attempt to bypass the runner because a native dependency is not yet available.

## Hard boundaries

Do NOT:

- modify `package.json`, `package-lock.json`, or `node_modules/`;
- run `npm install`, `npm ci`, `npx`, Expo CLI, Gradle, adb, emulator, or native build tooling;
- add or change Android/iOS generated native files;
- create a signing key or signing configuration;
- use the physical phone;
- touch Project A or another repository;
- create or use external/cloud services;
- add telemetry/analytics;
- add real AI or fixture AI workflow;
- add live Cooking Lab data;
- implement M2 user-facing cooking features;
- create release tags or releases;
- write an acceptance record.

If any required work cannot be completed without one of those boundaries, leave that item clearly documented as **deferred to the next authorised M1 step** rather than attempting it.

## 1. Verify repository state

Before implementation:

- confirm active repo is `C:\Projects\cooking-lab`;
- confirm branch `main` is clean and aligned with `origin/main`;
- confirm M0 acceptance record exists;
- confirm `build-control/queue/NEXT_RUN.json` activated this exact prompt;
- confirm M1 product implementation does not already exist unexpectedly.

If repository state is unsafe or materially inconsistent, stop and report rather than guessing.

## 2. M1 domain/data model

Create a clear local data/domain layer under `src/` using strict TypeScript.

Preserve the logical entities and semantics from the controlled product/technical baseline:

- `cooks`
- `cook_events`
- `findings`
- `finding_sources`
- `lessons`
- `tags`
- `cook_tags`
- `briefings`
- `briefing_sources`
- `import_batches`
- `schema_meta`

Required domain rules:

- UUID-shaped string identifiers remain the migration-friendly identity model.
- Timestamps are stored in an unambiguous ISO/UTC machine representation and rendered locally later.
- Cook status remains `open | reviewed`.
- Provenance remains `live | imported`.
- Finding class remains `observed | inference | knowledge`.
- Finding/lesson status remains `proposed | approved | rejected`.
- Finding creator remains `ai | user`.
- Confidence remains `low | medium | high` where applicable.
- Raw verdict and timeline events remain primary evidence.
- Rejected proposals are retained rather than deleted.

Do not add `user_id`, auth ownership, RLS, cloud URLs, or multi-user concepts.

## 3. SQLite schema definition — implementation-neutral in this trial

Create versioned SQLite migration/schema definitions as pure TypeScript/SQL text without importing Expo SQLite yet.

The schema must reflect the Technical Baseline physical-model decisions:

- no `user_id`;
- `finding_sources` junction table instead of PostgreSQL UUID arrays;
- `briefing_sources` junction table instead of PostgreSQL UUID arrays;
- JSON values represented portably for SQLite where needed;
- explicit foreign keys and cascade behaviour where appropriate;
- unique tag `name + kind` semantics;
- `schema_meta` with a clearly controlled schema version;
- useful indexes for expected M1/M2 access patterns without premature optimisation.

Provide a deterministic migration ordering/API that a later Expo SQLite adapter can execute.

Do not silently invent cloud or sync columns.

## 4. Repository/service contracts

Create repository/service interfaces that keep screens isolated from storage implementation.

At minimum define clear contracts for:

- cooks;
- cook events;
- findings + source relationships;
- lessons;
- tags/cook tags;
- briefings + source relationships;
- import batches;
- schema metadata/migration state.

The contracts must be usable by a later SQLite adapter without changing screen/domain code.

Do not build screen/UI integrations in this trial.

## 5. Evidence-protection application rules

Implement pure application/domain services that enforce the controlled evidence rules independently of AI or database technology.

Mandatory protections:

- AI-originated candidate output cannot directly mutate raw verdict/timeline evidence.
- AI may create `proposed` findings/lessons only through the controlled proposal/application path.
- AI may never update an already `approved` finding or lesson.
- Explicit user edits are distinguishable and set/represent `created_by=user` and update timestamp semantics as appropriate.
- Rejection changes status to `rejected`; it does not delete the proposal.
- Approval is an explicit application action.
- Thin records remain valid; do not impose arbitrary completeness requirements inconsistent with the Build Brief.

Create tests that prove these rules fail closed.

## 6. Secure persistence adapter boundaries

Define implementation interfaces/contracts only for the native pieces that are deferred from this unattended trial:

- database connection / transaction adapter;
- secure database-key provider;
- durable app-private file/photo store;
- portable backup writer/reader.

These contracts must make the later intended implementation obvious:

- Expo SQLite with SQLCipher;
- database key held via SecureStore;
- durable app-private document storage;
- portable backup independent of the device SQLCipher key.

Do not create fake production implementations that could be mistaken for real security/storage.

## 7. Test-only synthetic fixtures

Create synthetic fixture data for automated tests only.

Requirements:

- clearly test-only location/naming;
- no import into the production runtime path;
- include enough variety to test live/imported provenance and evidence states;
- no real user cooking history.

## 8. Portable backup format foundation

Define a versioned, portable backup data contract/schema as pure TypeScript.

It must be capable of representing:

- schema/version metadata;
- cooks;
- cook events;
- findings and source links;
- lessons;
- tags and cook-tag links;
- briefings and source links;
- import batches;
- durable photo/file manifest entries.

The format must be independent of the SQLCipher database key so a later export remains recoverable after device loss/reinstall.

Implement deterministic validation/serialization helpers where useful, but do not write actual device files yet.

Document that actual export/restore I/O remains deferred until the authorised native-storage step.

## 9. Photo storage path policy foundation

Implement pure path/reference policy helpers only — no camera or filesystem access.

Requirements:

- durable logical references are app-private and cook/event-derived;
- no cloud URLs;
- no temporary camera/cache URI assumptions;
- sanitised deterministic path generation;
- tests for unsafe/path-traversal-like input.

Actual photo persistence remains deferred.

## 10. Quality requirements

Keep architecture simple and dependency-free for this trial.

Run all runner-approved quality checks:

- `npm run typecheck`
- `npm run lint`
- `npm test`

Add meaningful automated tests for:

- domain value/status constraints;
- schema/migration content and ordering;
- repository/service contract behaviour where testable;
- evidence immutability/proposal rules;
- user edit/reject/approve semantics;
- synthetic fixture separation;
- backup schema/validation;
- photo path/reference safety.

Do not change existing tests merely to make failures disappear unless the prior test is genuinely incompatible with this authorised M1 foundation; explain any such change in the report.

## 11. Source control

After implementation and checks pass:

1. create one bounded implementation commit;
2. suggested message: `feat: establish M1 local data foundation`;
3. then create the report below;
4. commit the report separately;
5. push both commits to `origin/main`.

Do not tag or release.

## 12. Required report

Create:

`build-control/reports/M1_FOUNDATION_TRIAL_REPORT.md`

Use this structure:

# Cooking Lab — M1 Foundation Trial Report

## 1. Scope completed
- implemented foundation
- deliberately deferred native/dependency work

## 2. Domain and schema
- entities/models created
- schema version/migrations
- important constraints/indexes

## 3. Evidence protections
- exact rules implemented
- tests proving AI/raw/approved-history boundaries

## 4. Repository/service boundaries
- contracts created
- how later SQLite adapters plug in

## 5. Security/storage boundaries
- database-key interface
- file/photo interface
- confirmation no fake production security implementation was introduced

## 6. Backup foundation
- portable format/versioning
- validation/serialization
- what remains for real export/restore

## 7. Synthetic fixtures
- location and separation from production runtime

## 8. Automated evidence
For typecheck, lint and tests:
- command
- outcome
- test counts

## 9. Source control / GitHub evidence
- implementation commit
- report commit
- push result
- origin/main sync state

## 10. Deferred M1 work
List exactly what still requires a separately authorised M1 step, expected to include:
- dependency installation where required;
- real Expo SQLite/SQLCipher adapter;
- SecureStore-backed database key lifecycle;
- app-private FileSystem implementation;
- actual portable export/restore I/O and recovery proof;
- any native generation/build/device verification required by the milestone gate.

## 11. Product/runtime impact
Confirm whether any user-facing behaviour changed. Expected: none.

## 12. Blockers/deviations
None if none.

## 13. Assessment
State exactly one:

`M1 FOUNDATION TRIAL PASS CANDIDATE`

or

`M1 FOUNDATION TRIAL NOT READY`

Do not claim Milestone 1 accepted or complete.

## Final rule

This prompt authorises only the bounded M1 foundation above. Do not continue into a later M1 native/dependency step and do not begin M2.