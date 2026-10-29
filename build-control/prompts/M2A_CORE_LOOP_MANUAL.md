# Cooking Lab — M2A Core Loop + Design Implementation

**Status:** PREPARED MANUAL CLAUDE CODE PROMPT  
**Execution model:** Manual interactive Claude Code only  
**Milestone:** M2 — slice A  
**Does not authorise:** M2B recovery, production signing, live data, real AI, Project B work

Paste this prompt into a normal interactive Claude Code session opened in:

```text
<repo>
```

---

## ROLE

You are Claude Code acting as the implementation engineer for Cooking Lab.

This is a manually authorised, bounded **Milestone 2A** implementation session.

Cooking Lab Architecture & Build Control remains authoritative.

Do not use the unattended runner.
Do not activate or modify `build-control/queue/NEXT_RUN.json`.
Do not access Project B, Project A or any other repository.
Do not perform cross-app orchestration work.
Do not begin M2B or M3.

## 1. CONTROLLED START STATE

Repository:

```text
<repo>
```

Before changing anything:

1. Confirm the repository and `origin` are exactly `mikeohallo/cooking-lab`.
2. Check out `main`.
3. Run `git status`.
4. `git fetch origin`.
5. Fast-forward only to `origin/main`.
6. Confirm the working tree is clean.
7. Confirm all of these exist and read them before implementation:
   - `build-control/acceptance/M0_ACCEPTED.md`
   - `build-control/acceptance/M1_ACCEPTED.md`
   - `build-control/design/DESIGN_BASELINE_V1.md`
   - `build-control/specs/M2_CORE_LOCAL_LOOP_SPEC.md`
   - this prompt
8. Confirm the first parent of the commit that introduced this prompt contains M2 spec commit:

```text
1816126ece49f70711385cc9998f6201916ca7e4
```

9. Confirm no runtime/product implementation commit has landed after this prompt was prepared. If current `main` contains later implementation changes not described by the accepted state above, STOP and report the discrepancy rather than guessing.

Do not reset, rebase, amend, force-push, discard unexpected work or rewrite history.

## 2. ACCEPTED BASELINE — DO NOT REDESIGN

M0 and M1 are accepted.

Preserve all accepted M1 decisions, including:

- Expo SDK 57 / React Native / TypeScript strict mode;
- Android-only personal pilot;
- production package `com.cookinglab.personal`;
- TEST package `com.cookinglab.personal.test`;
- local-first SQLCipher database;
- 256-bit SecureStore-backed DB key;
- missing-key + existing-DB => `recovery_required` fail-closed behaviour;
- migration v1 and controlled data model;
- repository/service boundaries;
- raw-evidence protections;
- transaction poisoning after failed rollback;
- durable private photo store;
- no-overwrite and concurrency-safe photo write/import rules;
- portable backup envelope foundation;
- four-operation `AiService` abstraction;
- production `UnavailableAiService`;
- no real AI/network/cloud implementation;
- unattended queue inactive.

Do not change the controlled vocabularies or reintroduce rejected M1 concepts.

Key product rules remain:

- one sentence can be a complete cook;
- capture is conversational, not a form;
- verdict and timeline are raw evidence;
- AI never rewrites raw evidence;
- AI candidates are draft until approved;
- rejected proposals remain retained;
- provenance means `live | imported`, not authorship;
- British English, metric, Celsius.

## 3. OBJECTIVE

Implement **M2A — the complete core local cooking loop in the TEST package** using the accepted local store and the locked **Calm Modern Companion** design.

The finished TEST app must let Mike perform this synthetic flow on his Fold:

```text
Home
-> New Cook
-> add conversational note
-> add temperature
-> add photo
-> Finish & Review
-> type raw verdict
-> exercise simulated TEST proposal approval/edit/reject
-> History
-> reopen/read the cook
-> force-stop/relaunch
-> history is still there
```

M2A must look materially like the approved design direction rather than like the M0 shell.

## 4. STRICT M2A SCOPE

### Build now

- shared visual tokens/primitives from `DESIGN_BASELINE_V1.md`;
- Home;
- one-tap New Cook;
- Active Cook timeline;
- optional inline cook-title edit;
- note composer;
- Celsius temperature quick entry;
- camera/photo selection and durable photo storage;
- Finish & Review;
- raw free-text verdict;
- deterministic simulated AI candidates in explicitly fixture-enabled TEST builds only;
- proposal Approve / Edit / Reject;
- basic History;
- reviewed cook read-only detail/timeline;
- production/manual fallback when AI is unavailable;
- loading/empty/error states needed for these workflows;
- automated tests;
- fresh TEST native APK;
- one final Fold cover + inner-display QA pass.

### Do not build now

- portable Export/Restore UI or restore mutation — M2B;
- production signing — M2B human gate;
- live personal Cooking Lab data;
- real Anthropic API or gateway — M3;
- search, tags or Knowledge pages — M4;
- Cook Again / briefing — M5;
- in-cook assistant/chat — M6;
- import or instrumentation — M7;
- cloud DB/storage/auth/sync;
- analytics/telemetry;
- social/community;
- recipe database/discovery;
- pantry/grocery/menu/nutrition/costing;
- gamification;
- custom voice UI;
- iOS;
- Play Store/public distribution;
- Project B work.

Do not create a Settings screen merely as a placeholder for later work.

## 5. DESIGN IMPLEMENTATION

Treat:

```text
build-control/design/DESIGN_BASELINE_V1.md
```

as the visual/interaction authority.

Refactor the minimal M0 styling into a small reusable design layer rather than styling each screen ad hoc.

At minimum implement shared primitives/tokens for:

- palette;
- typography scale;
- spacing;
- radii;
- buttons;
- cards;
- evidence/status chips;
- screen header;
- text input/composer;
- top-level Home/History navigation;
- empty/loading/error states;
- photo presentation.

Requirements:

- warm stone/off-white background;
- muted sage primary actions;
- restrained amber temperature/inference accents;
- ink text;
- generous spacing;
- rounded cards;
- minimal shadows;
- no decorative generated/stock food images inside the app;
- user photos only;
- 48 dp minimum controls, major primary actions approx. 64 dp;
- cover-screen-first, 320 dp minimum, max content width 560 dp;
- no horizontal scrolling;
- no dense form layout;
- system Android sans font; do not add a custom font package solely for style.

The four primary screens should visually match the approved concepts in spirit:

- premium but calm;
- clear hierarchy;
- practical kitchen use;
- evidence first;
- AI interpretation visually secondary.

Do not turn the UI into a lab dashboard because the product is named Cooking Lab.

## 6. APP COMPOSITION / DATA ACCESS

Add the minimum composition needed to make the accepted M1 runtime usable by screens.

Rules:

- Screens receive application/data services, never raw SQLite.
- Screens execute no SQL.
- AI receives no repository/DataLayer/DB handle.
- Prefer React context/hooks and small purpose-built state over a new global state framework.
- No Redux/Zustand/etc. unless a concrete blocking need is demonstrated; none is expected.
- Writes expose explicit pending/success/failure state.
- Do not show unsaved evidence as persisted.
- If a write fails, keep the user's typed text in memory where practical so they can retry/copy.
- Startup DB failure must render a clear safe state rather than leaving an apparently empty Home screen.

## 7. HOME

Implement the locked Home baseline.

### New Cook

The dominant action is **New Cook**.

One tap must:

1. generate a device ID through the accepted ID source;
2. use an ISO UTC timestamp;
3. call the accepted `CookCaptureService.startCook` as user;
4. create an `open`, `live` cook with no required title;
5. route straight into the Active Cook screen.

Do not open a creation form.

### Home content

Show:

- brand/header and TEST badge only when appropriate;
- New Cook;
- open cooks as Continue Cooking cards;
- a compact Recent Cooks section;
- History navigation.

When empty, explain briefly that a cook can be as small as one sentence.

No search/tags/Knowledge in M2A.

## 8. ACTIVE COOK

Create a route shape suitable for a real cook ID, for example:

```text
/cook/[id]
```

Use the accepted cook and cook-event repositories/services.

### Header

- Back;
- title or `Untitled cook`;
- optional inline title edit;
- Finish & Review.

Title remains optional and is user-authored.

### Timeline

Chronological oldest-first display.

Render at least:

- user note;
- temperature;
- photo;
- existing assistant message if legitimately present in test data;
- existing plan if legitimately present.

Do not create in-cook assistant chat controls.

### Note composer

- multiline input;
- placeholder `What’s happening?` or equivalently concise wording;
- OS keyboard dictation naturally works because this is a text input;
- send action;
- refuse blank/whitespace-only submission without clearing typed text;
- persist the user's text through the accepted capture service;
- after successful persistence, clear the composer and show the event.

Do not AI-trim/rewrite/summarise the note.

### Temperature

Provide a compact quick-entry interaction, not a full form screen.

Input:

- Celsius numeric value;
- optional `where` text.

Persist:

```text
kind = 'temp'
meta = { celsius: <finite number>, where?: <text> }
```

Do not create a Fahrenheit selector.
Do not invent a new controlled unit vocabulary.
Do not add an arbitrary product temperature range beyond finite numeric validation.

### Photos

Authorised new first-party Expo dependencies if required:

```text
expo-image-picker
expo-image-manipulator
```

Install only with:

```text
npx expo install ...
```

Use images only.

Photo action may present a small native/action-sheet choice such as:

- Take photo
- Choose photo
- Cancel

Requirements:

- camera permission requested only when camera capture is chosen;
- configure ImagePicker with microphone/record-audio permission disabled;
- do not re-enable broad legacy external-storage permissions just for convenience;
- system picker path should be preferred for existing photos;
- no video;
- no crop/editor UX;
- no filters;
- no AI image processing.

Storage copy:

- if the longest edge exceeds 1600 px, downscale to max 1600 while preserving aspect ratio;
- use evidence-preserving JPEG quality, approximately 0.9 unless the source format/SDK path makes another non-destructive choice clearly preferable;
- no aggressive compression;
- import/write the final durable copy through the accepted `PrivateFileStore`;
- use accepted logical path generation;
- temporary picker/manipulator cache output is not the durable record.

Ordering is important:

1. capture/select/process file;
2. successfully persist durable private file and obtain logical path;
3. only then append the `photo` cook event pointing to that path.

If DB event persistence fails after the file was successfully stored, do **not** automatically delete the stored photo unless ownership and recovery are unquestionably safe. Prefer surfacing an orphan/reconciliation condition over destroying evidence. Record any such path clearly in the report.

If the photo itself fails to save, the cook/timeline remains safe and the UI says the photo did not save.

## 9. REVIEW

Create a route such as:

```text
/cook/[id]/review
```

On first entry call `openReview` so `reviewOpenedAt` is set once.

### Verdict

- large multiline `How was it?` field;
- dictation-friendly;
- verdict may be blank/null;
- store exactly what the user typed;
- do not trim/case/rewrite it before persistence;
- if persistence fails, retain unsaved local text;
- saving uses accepted `saveReview`, which marks the cook reviewed and records `reviewSavedAt`.

The cook is valid with verdict only.

### Deterministic TEST proposal service

M2A is explicitly authorised to add a bundled deterministic fixture AI service **only** under stronger variant isolation than M1.

Implement a small deterministic fixture service for UI/integration testing if needed.

It may be used only when both are true:

```text
APP_VARIANT=test
M2_FIXTURE_AI=1
```

or an equivalent compile-time/build-config gate with the same security property.

Rules:

- production can never select/construct it;
- TEST without explicit fixture flag uses `UnavailableAiService`;
- fixture service has no DB/repository/DataLayer handle;
- no network/API/model/key;
- candidates only;
- deterministic output;
- fixture section is visibly marked **Simulated AI** / **Test suggestions** so nobody could mistake it for a real model;
- fixture output is used only in the TEST package with synthetic/test cooks.

If an existing M1 regression test asserted there can be no bundled fixture service anywhere under `src/`, deliberately replace that assertion with stronger M2 variant-isolation tests. Do not simply delete/weaken the safety coverage.

### Proposal rendering

Show candidate findings/lessons as cards after the saved review when fixture AI is active.

Finding cards show:

- class badge: Observed / AI inference / Knowledge;
- rationale/confidence when applicable;
- Proposed state;
- Approve;
- Edit;
- Reject.

Use the accepted ReviewService for every persistence decision.

Rules:

- AI candidate never arrives approved;
- rejected stays retained;
- AI cannot decide status;
- user edit of a finding uses the accepted edit path and becomes user-authored;
- approved item cannot be silently modified by fixture AI;
- `Approve all` may act only on currently proposed simulated items.

### Production/manual fallback

When `UnavailableAiService` is selected:

- the verdict still saves normally;
- display a calm non-blocking state such as `AI suggestions aren’t connected yet`;
- never fabricate an empty-success response;
- the user can finish the review with verdict only;
- optional: provide one simple `Add a takeaway` input that creates an explicitly user-entered lesson through normal services. Keep this optional and small; do not turn Review into a form.

## 10. HISTORY

Implement basic local History only.

- newest first;
- all cooks;
- simple All / Open / Reviewed filter is allowed;
- no search;
- no tags;
- no Knowledge page.

Card/row displays available:

- title or `Untitled cook`;
- date/time;
- status when useful;
- verdict excerpt;
- first photo thumbnail.

Navigation:

- open cook -> editable/resumable Active Cook;
- reviewed cook -> same cook detail/timeline in read-only mode with verdict/review summary visible;
- no destructive cook deletion UI.

Home and History are the only top-level destinations in M2A.

## 11. FAILURE / SAFETY STATES

Implement explicit safe user-facing behaviour for at least:

- database startup failure;
- cook save failure;
- event save failure;
- invalid temperature;
- camera permission denied;
- photo processing/storage failure;
- AI unavailable;
- proposal persistence refusal;
- cook not found.

Each state should say what is safe and what the user can do next.

Do not use generic `Something went wrong` when a specific condition is known.

No failure may silently drop a typed verdict/note while the screen remains mounted.

## 12. TESTS

Preserve all accepted M1 tests.

Add robust M2 tests.

### Component/screen tests

At minimum:

- Home empty state and New Cook;
- New Cook creates immediately with no form;
- Continue Cooking;
- note composer success/failure preservation;
- temperature meta shape;
- photo capture state machine through mocked native ports;
- Review verdict verbatim;
- review open/save timestamps/status behaviour;
- proposal card Approve/Edit/Reject;
- production AI-unavailable state;
- fixture AI simulation label;
- History filters/list/detail;
- reviewed detail cannot append new raw events through the UI;
- TEST badge/fixture labelling absent from production.

### Data integration

Using the real SQLite test harness:

1. create cook;
2. append note;
3. append temperature;
4. append photo event using a safe synthetic logical path;
5. save review verdict;
6. apply fixture proposals;
7. approve one;
8. edit+approve one;
9. reject one;
10. reload from repositories;
11. History returns exactly the persisted state;
12. raw timeline/verdict remain unchanged by proposal actions.

### Variant isolation

Prove all of:

- production + fixture flag -> fixture cannot be selected;
- TEST without fixture flag -> unavailable service;
- TEST + explicit fixture flag -> fixture service;
- fixture service has no DB/repository/data handle;
- no network/client/Anthropic configuration exists;
- production UI cannot display `Simulated AI` because the service cannot be selected.

### Existing protection tests

Do not delete, skip or loosen the M1 evidence, transaction, encryption, photo or concurrency suites.

Run:

```text
npm run typecheck
npm run lint
npm test
npm run doctor
npx expo install --check
```

All must pass or the report must say NOT READY.

## 13. SOURCE CONTROL BEFORE NATIVE BUILD

Once code/tests are green:

1. inspect full diff;
2. confirm scope only M2A;
3. confirm queue unchanged/inactive;
4. commit implementation once.

Suggested message:

```text
feat: implement M2A core local cooking loop
```

Do not write the report yet if the device/build evidence has not been gathered.

## 14. FRESH TEST BUILD

A fresh TEST build is mandatory because the previously installed APK predates accepted M1 JavaScript safety corrections and M2 changes UI/native photo configuration.

Build only TEST:

```text
APP_VARIANT=test
M2_FIXTURE_AI=1
```

Use the established CNG/local build approach.

Do not create production signing material.

Use at most approximately two Gradle workers and one native build at a time.

Inspect generated native changes/config carefully.

Expected new permission surface:

- CAMERA is acceptable because M2 now captures photos;
- RECORD_AUDIO is not acceptable for this feature and must be disabled/blocked;
- unexpected broad media/storage permission requires investigation and report.

Produce:

- TEST APK path;
- SHA-256;
- merged Android permissions;
- dependency/config evidence.

Install on the connected Samsung Fold as `com.cookinglab.personal.test`.

## 15. FINAL PHYSICAL QA — BATCHED ONCE

Do not interrupt Mike for routine device interaction during implementation.

After all automated work/build/install is finished, ask for one short final device QA pass only.

Mike should be able to complete this single synthetic script:

1. Open Cooking Lab Test on cover screen.
2. Tap New Cook.
3. Add a note such as `Synthetic test cook — note one`.
4. Add a temperature such as `62.5°C`, where `centre`.
5. Add one harmless test photo using camera or picker.
6. Tap Finish & Review.
7. Enter a clearly synthetic verdict.
8. Exercise at least one Approve, one Edit then Approve, and one Reject on **Simulated AI** proposals.
9. Return to History and reopen the cook.
10. Confirm note/temp/photo/verdict are present.
11. Force-stop/relaunch or let Claude do it through adb, then confirm the cook remains.
12. Open/unfold and confirm the same Home/Cook/Review/History UI has no clipping and stays centred/readable.

No genuine cooking history is to be entered during M2A QA.

Record exactly what Mike personally confirmed versus what automation/adb confirmed.

## 16. REQUIRED REPORT

Create:

```text
build-control/reports/M2A_CORE_LOOP_REPORT.md
```

Structure:

### 1. Scope completed
- screens/routes
- design system
- data composition
- notes
- temperatures
- photos
- Review
- fixture AI
- manual fallback
- History

### 2. Design Baseline implementation
- exact token/component changes
- responsive decisions
- evidence-vs-AI visual hierarchy
- any intentional variance from the locked baseline

### 3. Dependencies/config/permissions
- exact package versions added
- ImagePicker/ImageManipulator config
- merged permissions
- confirmation RECORD_AUDIO is absent

### 4. Data/evidence behaviour
- one-tap thin cook
- note/temp/photo persistence
- verdict verbatim
- status transition
- raw evidence protections

### 5. Fixture AI isolation
- selection gates
- simulated-label treatment
- production refusal proof
- no network/storage handle

### 6. Automated verification
- typecheck
- lint
- tests + suite/test totals
- doctor
- expo install check

### 7. Native TEST build
- build command
- package
- APK path
- SHA-256
- install result
- storage startup result

### 8. Device/Fold QA
- device/Android version
- exact synthetic end-to-end steps
- cover result
- inner-display result
- persistence after relaunch
- camera/photo result
- distinguish automated vs Mike-confirmed observations

### 9. Source control
- implementation commit
- report commit
- push result
- origin sync

### 10. Boundaries confirmed
Explicitly confirm:
- no M2B export/restore
- no production signing
- no live data
- no real AI/network/cloud
- no M3+
- no Project B/other repo
- queue still inactive
- no tag/release/acceptance record

### 11. Remaining M2 work
Only M2B items:
- portable export/restore
- production signing/update continuity
- final production build/live-data gate

### 12. Assessment

State exactly one:

```text
M2A CORE LOOP PASS CANDIDATE
```

or

```text
M2A CORE LOOP NOT READY
```

## 17. REPORT COMMIT / PUSH / STOP

After the report is complete:

1. commit the report separately;
2. push implementation + report to `origin/main`;
3. verify clean tree and origin sync;
4. STOP.

Do not begin M2B.
Do not generate a production signing key.
Do not create live data.
Do not activate unattended queue.
Do not create a tag/release/acceptance record.
Do not perform Project B work.

Return a concise completion summary and wait for ChatGPT Build Control review.
