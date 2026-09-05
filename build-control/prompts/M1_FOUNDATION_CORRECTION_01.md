# Cooking Lab — M1 Foundation Correction 01

Purpose: correct the unaccepted M1 foundation so it matches the controlled Cooking Lab product model exactly. This is a correction within M1, not full M1 acceptance.

Hard boundaries:
- Do not begin M2.
- Do not install/change dependencies or modify package.json, package-lock.json, node_modules.
- Do not run Expo, Gradle, adb, emulator, native build/device operations.
- Do not create signing material, cloud services/accounts, real AI, or live data.
- Do not touch another repository.
- Do not create acceptance records, tags, or releases.

Controlled model to implement exactly:

cooks:
- id
- title optional
- status exactly open | reviewed
- provenance exactly live | imported
- parent_cook_id optional
- started_at
- review_opened_at optional
- review_saved_at optional
- verdict optional free-text stored verbatim
- created_at
No planned/in_progress/complete/abandoned lifecycle, no finished_at, no verdict rating enum.

cook_events:
- id, cook_id, ts
- kind exactly user_note | assistant_msg | temp | photo | plan
- body optional
- meta optional JSON-compatible value
- photo_path optional
No extra event kinds. Product temperature is metric/°C only.

findings:
- id, cook_id
- class exactly observed | inference | knowledge
- text
- rationale optional
- confidence optional low | medium | high
- status exactly proposed | approved | rejected
- created_by exactly ai | user
- provenance exactly live | imported
- created_at
- updated_at optional
- source events via finding_sources
No evidence-strength/source-relation replacement model.

finding_sources:
- links a finding to supporting cook_event rows only.

lessons:
- id, cook_id, text
- status exactly proposed | approved | rejected
- provenance exactly live | imported
- created_at, updated_at optional
No required finding relationship.

tags:
- id, name
- kind exactly dish | ingredient | technique | equipment
- unique name+kind
No outcome/free kinds.

cook_tags:
- cook_id, tag_id

briefings:
- id
- cook_id = new cook being briefed
- content structured JSON-compatible value
- useful nullable boolean
- created_at
No briefing lifecycle enum.

briefing_sources:
- links briefing to source cooks only.

import_batches:
- id
- filename optional
- status exactly processing | ready | done | failed
- candidates_total optional
- candidates_resolved optional
- created_at
No production import-origin enum.

schema_meta:
- minimal schema/version metadata only.

Evidence rules:
1. AI must never modify raw verdict or timeline events.
2. AI adapters return candidates only and receive no database write handle.
3. AI proposals enter only as proposed findings/lessons through controlled application services.
4. Findings preserve class observed/inference/knowledge.
5. Inferences may carry rationale and confidence low/medium/high.
6. AI may never modify an approved finding or lesson.
7. Reject sets rejected and retains the row.
8. User edit of a finding must set created_by=user and updated_at.
9. Lessons keep the controlled fields; user edit updates text/updated_at without inventing a creator field.
10. provenance means live/imported, never user/ai.
11. Do not introduce hidden-memory concepts.
12. Remove rejected trial concepts such as evidenceStrength, supports/contradicts, reinstatement lifecycle, userEdited-as-substitute.

Implementation requirements:
- Correct TypeScript domain types, validators, invariants, repository/service interfaces, backup contract, synthetic fixtures, and photo path helper.
- Rewrite unaccepted migration v1 in place to the controlled model. Do not add a compatibility v2. No device DB exists.
- finding_sources must reference cook_events.
- briefing_sources must reference cooks.
- Preserve unique tag name+kind and schema_meta.
- Keep storage abstraction; no UI integration.
- Backup format must serialize/validate corrected model and remain independent of SQLCipher key.
- Fixtures stay test-only and use controlled production vocabularies; obvious synthetic IDs are fine, but no synthetic production enum.

Regression tests must explicitly prove:
- exact cook status, provenance, event kinds, finding class, confidence, proposal status, created_by, tag kinds, import status
- verdict is free text, not rating enum
- user edit of AI finding produces created_by=user + updated_at
- AI cannot edit approved finding/lesson
- rejected proposals remain
- briefing sources point to cooks and useful is nullable boolean
- no briefing lifecycle enum
- no import-origin production enum
- no evidence-strength/source-relation/reinstatement model
- schema v1 has correct columns/checks and rejected trial concepts are absent
- backup round-trip uses corrected model
- fixtures cannot enter production runtime import graph

Run:
- npm run typecheck
- npm run lint
- npm test

Source control:
1. Commit implementation: fix: align M1 foundation with controlled data model
2. Create build-control/reports/M1_FOUNDATION_CORRECTION_REPORT.md
3. Commit report separately
4. Push both to origin/main
No tag/release/acceptance record.

Report must include:
- scope corrected
- exact final vocabularies
- entity/schema corrections
- evidence-rule corrections
- repository/service corrections
- backup/fixture corrections
- regression evidence
- typecheck/lint/test results and counts
- implementation/report commit hashes and push state
- deferred native M1 work
- product/runtime impact
- blockers/deviations
- assessment exactly one of:
  M1 FOUNDATION CORRECTION PASS CANDIDATE
  M1 FOUNDATION CORRECTION NOT READY

Do not claim full M1 acceptance and do not continue into native/dependency work.