# Cooking Lab — M1 Foundation Unattended Trial

## Authority
This is the first real product-development trial of the accepted unattended runner. It begins a bounded portion of Milestone 1 only. M0 remains accepted; M1 is not yet complete or accepted.

## Objective
Implement the dependency-free TypeScript/local-data foundation for M1. Do not cross dependency-install, native-build, device, signing, cloud, live-data, or M2 boundaries.

## Hard boundaries
Do not modify package.json, package-lock.json, node_modules, generated native files, signing, external services, telemetry, real AI, live Cooking Lab data, or Project A. Do not run npm install/ci, npx, Expo CLI, Gradle, adb, emulator, or native tooling. Do not tag or release. If a required item needs one of those boundaries, document it as deferred.

## Required implementation
1. Create strict-TypeScript domain models for cooks, cook_events, findings, finding_sources, lessons, tags, cook_tags, briefings, briefing_sources, import_batches and schema_meta. Preserve controlled enums/status/provenance/evidence semantics. No user_id/auth/RLS/cloud-sync concepts.
2. Create versioned SQLite migration definitions as pure TypeScript/SQL text only. Use junction tables for finding_sources and briefing_sources, explicit foreign keys/cascades, unique tag name+kind semantics, schema version metadata and sensible indexes. No Expo SQLite import yet.
3. Create repository/service interfaces for cooks, events, findings/source links, lessons, tags/cook_tags, briefings/source links, import batches and schema state so later SQLite adapters can plug in without changing screen/domain code.
4. Implement pure application/domain evidence protections: AI candidates can only create proposed findings/lessons through controlled proposal application; AI cannot mutate raw verdict/timeline evidence or update approved findings/lessons; explicit user edits remain distinguishable; reject retains rows; approval is explicit; thin records remain valid.
5. Define interfaces only for deferred native persistence pieces: database/transaction adapter, secure DB-key provider, app-private file/photo store and portable backup writer/reader. Do not fake production security/storage.
6. Create test-only synthetic fixtures only; no real user cooking history and no production-runtime import path.
7. Define a versioned portable backup data contract covering schema metadata, all structured entities/relationships and a photo/file manifest. Implement deterministic validation/serialization helpers where useful; no device file I/O yet.
8. Implement pure photo logical-path/reference policy helpers: app-private, cook/event-derived, deterministic, sanitised, no cloud URLs or temp/cache assumptions.
9. Add meaningful automated tests for domain constraints, migration ordering/content, evidence protections, user edit/reject/approve semantics, fixture separation, backup validation and photo-path safety.

## Quality
Run:
- npm run typecheck
- npm run lint
- npm test

Do not alter existing tests merely to make failures disappear unless genuinely required by this authorised foundation; explain any such change.

## Source control
After checks pass:
1. commit implementation with a bounded message such as `feat: establish M1 local data foundation`;
2. create `build-control/reports/M1_FOUNDATION_TRIAL_REPORT.md`;
3. commit the report separately;
4. push both commits to origin/main.

## Report
Use these sections:
1. Scope completed
2. Domain and schema
3. Evidence protections
4. Repository/service boundaries
5. Security/storage boundaries
6. Backup foundation
7. Synthetic fixtures
8. Automated evidence
9. Source control / GitHub evidence
10. Deferred M1 work
11. Product/runtime impact
12. Blockers/deviations
13. Assessment

Assessment must be exactly `M1 FOUNDATION TRIAL PASS CANDIDATE` or `M1 FOUNDATION TRIAL NOT READY`.

Expected deferred work includes dependency installation where required, real Expo SQLite/SQLCipher adapter, SecureStore DB-key lifecycle, app-private FileSystem implementation, actual export/restore I/O and recovery proof, and any native build/device verification required by the M1 gate.

Do not claim M1 accepted/complete. Do not continue into another M1 step or M2.
