# Cooking Lab — Milestone 1 Acceptance

**Milestone:** M1 — Local data foundation  
**Decision:** ACCEPTED  
**Accepted through source/report baseline:** `8a23a365aa8e6f1173ece257be270fe5e3bf0964`  
**Acceptance authority:** Cooking Lab Architecture & Build Control  
**Date:** 7 September 2026

## Accepted implementation chain

- M1 foundation correction implementation: `dd1d1f2d8cc087091d8ffe2e3e4794a76afd40cc`
- M1 foundation correction report: `51993b07a3b758805907177ee149574bbd273599`
- M1 encrypted native persistence: `f07d85e3cdcf5d859f8967927921beec9f610369`
- M1 native persistence report: `aef6c76ece1ce849723c0747c7823b36dd5bba5c`
- M1 transaction/photo failure safety correction: `fed53aa11fb81a95ef057804603ae43f5aef5ec4`
- M1 safety correction report: `22520e4edb92ae041dd6f3f87d91ad67d7575128`
- M1 photo concurrency safety correction: `ce88286c38033de34b5d6f67936106b3d1257aa6`
- M1 photo concurrency report: `8a23a365aa8e6f1173ece257be270fe5e3bf0964`

## What is accepted

M1 establishes the controlled local-first data and storage foundation for Cooking Lab:

- corrected controlled domain/data model and migration v1;
- Expo SQLite backed by SQLCipher;
- 256-bit CSPRNG database key held in SecureStore;
- fail-closed database/key lifecycle, including `recovery_required` when an existing encrypted database has no key;
- deterministic transactional migrations and future-schema refusal;
- SQLite-backed repositories/services for all controlled local entities and relationships;
- evidence-protection boundaries that keep raw evidence and approved history outside AI mutation paths;
- app-private durable photo/file storage with deterministic logical paths and SHA-256 integrity metadata;
- fail-closed transaction poisoning after rollback failure;
- no-overwrite photo semantics and concurrency-safe per-path write/import reservation;
- versioned portable backup envelope/snapshot foundation independent of the SQLCipher key;
- four-operation application AI service boundary with production `UnavailableAiService` and no real AI/network implementation;
- TEST/production package separation preserved.

## Verification accepted

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: **19 suites / 487 tests / 487 passed / 0 failed / 0 skipped**
- TEST native SQLCipher build previously verified on Samsung SM-F956B / Android 16:
  - package `com.cookinglab.personal.test`;
  - encrypted store created at schema v1 from cleared state;
  - force-stop/relaunch reopened the same store at schema v1;
  - no crash;
  - shipped native library contained SQLCipher capability;
  - merged permissions remained equivalent to the accepted M0 permission surface.

The last two M1 safety corrections changed TypeScript behaviour/tests only and did not change dependencies, Expo config, native configuration or native modules. The TEST APK currently installed on the device predates those JavaScript corrections and is therefore **not the canonical final M1 runtime artifact**. A fresh TEST build from the accepted baseline must be produced before relying on device-runtime evidence for subsequent milestone work.

## Accepted judgement calls

- unused biometric permissions introduced transitively by SecureStore remain blocked;
- the app may initialise/open the encrypted store at root-layout startup without this constituting M2 UI/workflow work;
- transactions use `BEGIN IMMEDIATE` / `COMMIT` on the single keyed connection rather than opening an unkeyed second SQLCipher connection;
- the assistant may append a new `assistant_msg` event through the controlled path but may not alter existing timeline evidence;
- `delete()` in the private file store is an explicit destructive operation and is not part of the write/import reservation mechanism. No concurrent delete product path is authorised by M1. Any future destructive photo workflow must be explicitly designed and controlled before use.

## Boundaries preserved

M1 acceptance does **not** authorise or imply:

- M2 implementation;
- live Cooking Lab data;
- production signing;
- portable export/restore user workflow;
- camera/photo capture UI;
- Review/History/Cook Again UI;
- real AI or an AI gateway;
- cloud services, accounts, sync, analytics or telemetry;
- Play Store/public distribution;
- Project B or cross-app orchestration work.

The unattended Cooking Lab queue remains inactive. Any later work requires a new explicit Cooking Lab Build Control instruction.

## Decision

**MILESTONE 1 — ACCEPTED**

M2 has not started.