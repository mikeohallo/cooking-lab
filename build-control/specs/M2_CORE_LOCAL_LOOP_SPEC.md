# Cooking Lab — Milestone 2 Core Local Loop Specification

**Status:** PREPARED / IMPLEMENTATION NOT YET STARTED  
**Milestone:** M2 — Core local cooking loop  
**Design authority:** `build-control/design/DESIGN_BASELINE_V1.md`  
**Technical baseline:** accepted M1 through `build-control/acceptance/M1_ACCEPTED.md`  
**Prepared:** 7 September 2026

## 1. Milestone purpose

M2 turns the accepted local-first/storage foundation into the first genuinely usable Cooking Lab experience.

The success condition remains:

> You can actually cook dinner with Cooking Lab and retain useful history.

M2 is the point at which the product becomes usable, but **live personal use must not begin until M2 is formally accepted and the production signing/recovery gates below are complete**.

Core product loop in this milestone:

**New Cook → Observe in timeline → Finish & Review → retain verdict/approved learning → History**

Knowledge pages, Cook Again, real AI, in-cook AI and import remain later milestones.

## 2. Why M2 is split into two controlled slices

M2 combines two different risk classes:

1. high-volume ordinary product/UI work;
2. recovery + production-signing actions that can affect whether genuine history survives device loss and whether later APKs can update the production app.

They must not be bundled into one unreviewable implementation step.

### M2A — Core loop + visual implementation

Build and prove the complete day-to-day interaction in the TEST package with synthetic/test data only.

Includes:

- Design Baseline v1 implementation;
- Home;
- one-tap New Cook;
- Active Cook timeline;
- conversational notes;
- temperature capture;
- photo capture/attachment and durable storage;
- Review + raw free-text verdict;
- deterministic simulated proposal flow for TEST only;
- production/manual fallback when AI is unavailable;
- proposal approve/edit/reject UI;
- basic History and reviewed-cook detail;
- fresh TEST APK and device/Fold QA.

Does **not** authorise production signing, live data or portable restore mutation.

### M2B — Recovery + production readiness

Prepared conceptually here, but not issued until M2A is reviewed.

Includes:

- user-facing portable export;
- validated restore into a safe target, with no silent overwrite of existing history;
- recovery failure handling;
- final production-signing decision and protected key creation/storage;
- fresh production APK from the accepted source;
- final device acceptance;
- Build Control acceptance of M2.

The production signing step remains a human-gated boundary and requires explicit Mike approval at the time it is reached.

## 3. M2A controlled screen set

M2A implements the Design Baseline v1 screen behaviour below.

### 3.1 Home

Data:

- open cooks, newest first;
- recent reviewed cooks, newest first;
- first available photo thumbnail where present;
- verdict excerpt when present.

Actions:

- **New Cook** — one tap, immediately creates a valid `open` cook with no required title and routes to it;
- **Continue cooking** — resumes an open cook;
- History navigation.

Rules:

- no creation form;
- title is optional;
- no search, tags or Knowledge links in M2;
- if more than one open cook exists, show them without inventing a new status or forcing one to close.

### 3.2 Active Cook

Data shown chronologically from `cook_events`:

- `user_note`;
- `temp`;
- `photo`;
- `assistant_msg` only if one legitimately exists in test data; M2 does not provide live in-cook chat;
- `plan` only if already present in data; M2 does not add a planning form.

Actions:

- optional inline title edit;
- add note;
- add temperature;
- add photo;
- Finish & Review.

#### Notes

- composer placeholder: short practical language such as `What’s happening?`;
- OS keyboard dictation is sufficient voice support;
- blank notes are refused without losing typed input;
- persisted body is the user's evidence; do not AI-rewrite it.

#### Temperature

- Celsius only;
- numeric entry plus optional `where` text;
- persist as `kind='temp'` with `meta.celsius` and optional `meta.where`;
- do not create a Fahrenheit/unit selector;
- do not invent a product-level temperature range not already present in the domain model; UI may reject non-finite/non-numeric input.

#### Photos

M2 authorises first-party Expo camera/photo capability.

Preferred packages:

- `expo-image-picker` for camera/system photo selection;
- `expo-image-manipulator` for storage-sized copies.

Requirements:

- images only, not video;
- camera permission requested only when the user chooses camera capture;
- configure ImagePicker so `RECORD_AUDIO` is not requested;
- existing blocked legacy external-storage permissions remain blocked unless official SDK behaviour proves a required change;
- allow system image selection without adding unnecessary broad media permissions where Android's system picker avoids them;
- if the longest image edge exceeds 1600 px, create a storage copy at max 1600 px while preserving aspect ratio and normal orientation;
- use a quality level intended to preserve photographic evidence rather than aggressive compression;
- the durable stored copy goes through the accepted `PrivateFileStore` and logical-path protections;
- the temporary picker/manipulator file is not the durable record;
- a failed photo operation does not remove the cook/event evidence;
- no filters, cropping UI, image beautification or AI image processing.

A photo event must not be persisted as successfully captured until the durable private-file write/import succeeds and returns its final logical path/integrity metadata.

### 3.3 Review

Entering Review:

- call the accepted open-review path so `review_opened_at` is set once;
- keep an unsaved local verdict visible if persistence fails;
- verdict is a large free-text field and remains verbatim.

Saving Review:

- use the accepted `saveReview` path;
- cook becomes `reviewed` and `review_saved_at` is recorded;
- a verdict may be empty/null; thin records remain valid.

#### TEST deterministic proposals

M2 must prove the proposal interaction before real AI exists.

A deterministic `FixtureAiService` may now exist in the bundled TEST application **only** under all of these controls:

- production variant can never select or construct it;
- TEST variant does not silently use it merely because it is TEST;
- it requires an explicit build/config flag such as `M2_FIXTURE_AI=1` in addition to `APP_VARIANT=test`;
- the fixture service has no database/repository/DataLayer handle;
- it returns deterministic candidates only;
- UI visibly identifies the section as **Simulated AI** or equivalent in TEST builds;
- the fixture output is for synthetic/test history only;
- there is no network transport, API key or model configuration.

The earlier M1 regression that prohibited a bundled fixture service may be deliberately replaced with stronger tests for these M2 rules; that is an authorised milestone evolution, not permission to weaken production isolation.

Proposal UI:

- finding class badge: Observed / AI inference / Knowledge;
- proposed-state treatment;
- Approve;
- Edit;
- Reject;
- Approve all only for currently proposed fixture items;
- rejected rows retained;
- user edit of a finding uses the accepted evidence path and becomes `created_by='user'`;
- approved/rejected decisions persist through the accepted ReviewService.

#### Manual production fallback

With normal `UnavailableAiService`:

- saving the verdict succeeds independently;
- UI explains that AI suggestions are not connected yet without presenting that as a failed cook;
- verdict-only completion is valid;
- optionally allow the user to add one manual takeaway/lesson, explicitly user-entered, through the normal data/evidence layer;
- do not fabricate empty AI results or canned advice.

### 3.4 History

M2 basic history only:

- all cooks newest first;
- optional simple `All / Open / Reviewed` filters;
- title/date/status/verdict excerpt/thumbnail as available;
- no search yet;
- no tags/Knowledge page yet;
- tapping open cook resumes editing;
- tapping reviewed cook opens a read-only cook detail/timeline and verdict/review summary;
- no destructive cook deletion UI in M2A.

## 4. Application composition/state

M2 may add the minimum application-level composition/state needed to give screens access to the accepted `DataLayer`, `PrivateFileStore`, variant configuration and AI service.

Rules:

- screens never receive the raw SQLite adapter;
- screens do not execute SQL;
- AI never receives DataLayer/repositories;
- avoid adding a general state-management framework unless evidence shows React context/hooks cannot cleanly support this milestone;
- local writes must expose explicit pending/success/failure states to the screen;
- never optimistically display raw evidence as saved if persistence has failed;
- preserve unsaved text in component state when a write fails so Mike can retry/copy it.

## 5. Design implementation requirements

Implement `build-control/design/DESIGN_BASELINE_V1.md` rather than styling each screen independently.

Create/extend shared tokens and primitives for at least:

- palette;
- type scale;
- spacing;
- radius;
- button states;
- evidence/status chips;
- cards;
- text inputs/composer;
- top-level navigation;
- screen headers;
- empty/loading/error states;
- photo presentation.

The current M0 `src/theme/tokens.ts` is explicitly superseded as a visual target by Design Baseline v1 and may be changed.

Do not add a heavyweight UI framework.

## 6. Responsive/Fold acceptance

M2A UI must be physically checked at the end on the Samsung Galaxy Z Fold 6 in both:

- cover-screen/narrow state;
- unfolded/inner state.

Minimum acceptance:

- no horizontal clipping/scrolling;
- composer reachable with keyboard open;
- primary actions reachable and at least 48 dp targets;
- text does not clip at normal Android font scaling;
- History cards and Review proposal controls remain understandable on cover width;
- unfolded layout stays centred/capped rather than stretching unnaturally.

Because M2 materially changes UI, this physical visual QA is required once, at the end of the bounded implementation—not continuously during coding.

## 7. M2A dependencies and permission boundary

Authorised first-party Expo additions if required:

- `expo-image-picker`;
- `expo-image-manipulator`.

Install with `npx expo install` for SDK 57 compatibility.

No camera dependency other than the first-party/system picker path is needed.

No permission is authorised except what is genuinely required for the M2 photo feature. Specifically:

- `CAMERA` is justified when camera capture is implemented;
- `RECORD_AUDIO` is not justified and must be disabled/blocked;
- broad media/storage permissions should not be introduced merely for convenience if the Android system picker works without them.

Any unexpected merged Android permission must be reported for Build Control review.

## 8. M2A tests

Keep all accepted M1 tests.

Add coverage at three levels.

### Pure/component

- design primitives render accessible labels/states;
- New Cook one-tap behaviour;
- note validation + unsaved failure preservation;
- Celsius temperature parsing/meta shape;
- photo UI failure states;
- verdict retained verbatim;
- status transition to reviewed;
- proposal approve/edit/reject controls;
- production AI unavailable state;
- TEST fixture AI gating and visible simulation label;
- History list/filter/read-only detail.

### Data integration

Against the real test SQLite harness:

- create cook → append note/temp/photo → save review → read back in History;
- raw evidence survives review/proposal decisions unchanged;
- approved/rejected fixture proposals persist correctly;
- manual fallback works with no AI;
- reopened data layer still shows the same history.

### Variant isolation

Prove:

- production cannot select FixtureAiService even if a test flag is supplied;
- TEST without explicit fixture flag uses UnavailableAiService;
- TEST with explicit fixture flag can use deterministic fixture output;
- fixture AI has no storage handle;
- TEST-only labels/config do not appear in production.

## 9. M2A native/device evidence

At completion:

1. typecheck, lint, full test suite;
2. Expo dependency/config checks;
3. fresh TEST native build from the final tree;
4. SHA-256 the produced APK;
5. install `com.cookinglab.personal.test` on the Fold;
6. verify encrypted store opens from the accepted M1 path;
7. perform one synthetic end-to-end cook on device:
   - New Cook;
   - note;
   - temperature;
   - test photo;
   - Review verdict;
   - fixture proposal approve/edit/reject if fixture-enabled build;
   - History read-back;
8. force-stop/relaunch and confirm the synthetic cook remains;
9. physical cover + inner-display visual QA once at the end;
10. inspect final merged permissions.

Do not use Mike's genuine cooking history for M2A testing.

## 10. M2B recovery direction

M2B must be specified/issued after M2A review. The following constraints are already controlled:

- portable backup remains domain records + photo files, independent of SQLCipher key;
- use Android-supported user-selected storage, preferably the system Storage Access Framework through first-party Expo FileSystem capability rather than introducing cloud storage;
- export must be understandable/portable outside the app;
- restore must validate format version, schema version, entity relationships, photo presence and SHA-256 before applying;
- restore must never silently merge with or overwrite existing history;
- the safest initial pilot policy is to restore only into an effectively empty Cooking Lab history unless Build Control explicitly approves a more complex destructive replacement design;
- failure must leave the pre-existing state unchanged;
- no database encryption key is ever exported;
- no cloud/account/service is required.

M2A must not independently implement a destructive restore design.

## 11. Production signing / live-data gate

No production signing material may be created by the M2A implementation prompt.

After M2A and M2B technical work are reviewed, Build Control will ask Mike explicitly before creating the production signing identity.

The signing decision must establish:

- protected local location outside the repository;
- backup/recovery of the signing key itself;
- alias/password handling without committing secrets;
- update-continuity evidence;
- production package remains `com.cookinglab.personal`;
- TEST package/signing remains separate/disposable.

Only after:

1. M2 core loop is accepted;
2. portable recovery is accepted;
3. production signing is controlled;
4. a final production build is verified;

may Build Control authorise **first live Cooking Lab data**.

## 12. Explicitly out of M2

Do not implement:

- real Anthropic/API/gateway work (M3);
- tag/Knowledge pages or search (M4);
- Cook Again or briefings (M5);
- in-cook assistant/chat UI (M6);
- ChatGPT import or instrumentation (M7);
- cloud DB/storage/auth/sync;
- analytics/telemetry;
- social/community;
- recipe database/discovery;
- pantry/grocery/menu/nutrition/costing;
- gamification;
- appliance integration;
- iOS;
- Play Store/public distribution;
- Project B/cross-app automation changes.

## 13. M2 acceptance target

M2 is ready for Build Control acceptance when evidence shows:

- M2A core loop works end-to-end on the Fold using the accepted local store;
- Design Baseline v1 is materially reflected in the implemented screens;
- raw evidence remains protected;
- AI-unavailable/manual fallback makes real use possible before M3;
- deterministic TEST AI proves proposal interactions without leaking into production;
- History survives app restart;
- portable recovery is implemented and safely verified;
- production signing/update continuity has been established under explicit human approval;
- final production artifact is verified;
- no excluded milestone or cloud boundary was crossed.

**M2 IMPLEMENTATION HAS NOT STARTED.**
