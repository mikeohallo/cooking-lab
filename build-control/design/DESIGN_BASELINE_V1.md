# Cooking Lab — Design Baseline v1

**Status:** LOCKED / ACCEPTED  
**Design direction:** Calm Modern Companion  
**Approved by:** Mike O'Halloran  
**Approval instruction:** "Lock the design and prepare M2."  
**Date:** 7 September 2026  
**Applies from:** Milestone 2 onward unless changed through Cooking Lab Build Control

## 1. Design intent

Cooking Lab should feel like a calm, premium kitchen companion rather than a laboratory dashboard, recipe app or generic productivity tool.

The visual hierarchy must reinforce the product hierarchy:

1. **What actually happened** — raw user evidence is primary.
2. **What the app proposes** — AI interpretation is secondary, clearly labelled and reviewable.
3. **What was approved** — approved learning becomes durable history.

The app should be practical enough to use with wet hands and divided attention while still feeling considered enough that accumulated history feels worth keeping.

The governing personality is:

- warm, not rustic;
- modern, not clinical;
- restrained, not sterile;
- tactile, not decorative;
- evidence-led, not data-dashboard-heavy;
- premium through spacing and hierarchy rather than visual effects.

## 2. Non-negotiable visual principles

- Warm off-white/stone background instead of stark white.
- Deep muted sage/green is the primary action colour.
- Amber is a restrained accent, especially for temperature and inference states.
- Ink/dark olive text rather than pure black.
- Large rounded cards with generous internal spacing.
- Food photography appears only when it is the user's own cook evidence; no decorative stock or generated food imagery inside the app.
- Raw Evidence and AI Suggestions must never look interchangeable.
- Proposed / Approved / Rejected and Observed / Inference / Knowledge states must use both text labels and visual treatment; colour alone is insufficient.
- One obvious primary action per screen/state.
- No dense forms. Capture is conversational.
- Minimum touch target 48 dp; major primary actions target approximately 64 dp.
- Narrow cover screen is the first layout target; unfolded width is an enhancement, not a separate desktop UI.

## 3. Colour system

These values are the controlled target palette for M2 implementation. Small accessibility adjustments are permitted only if required to meet contrast; any material hue change requires Build Control review.

| Token | Hex | Use |
|---|---|---|
| `background` | `#F7F4EE` | App canvas / warm stone |
| `surface` | `#FFFCF7` | Primary cards, sheets and composer |
| `surfaceStrong` | `#FFFFFF` | High-emphasis cards / inputs when needed |
| `surfaceMuted` | `#EEF0E8` | Sage-tinted secondary surface |
| `text` | `#20251F` | Primary ink text |
| `textMuted` | `#687064` | Secondary text |
| `border` | `#D9DED2` | Hairline card/input borders |
| `primary` | `#526A55` | Main action / active navigation |
| `primaryPressed` | `#435747` | Pressed primary state |
| `primarySoft` | `#E5EDE4` | Selected/approved soft background |
| `onPrimary` | `#FFFFFF` | Text/icons on primary |
| `accent` | `#D39542` | Temperature / restrained emphasis |
| `accentPressed` | `#B87829` | Pressed amber state |
| `accentSoft` | `#F6E8D3` | Soft amber surface |
| `danger` | `#9B4D47` | Destructive/reject action |
| `dangerSoft` | `#F5E7E5` | Rejected / destructive soft surface |
| `testBadge` | `#B3261E` | TEST identity only |
| `testSurface` | `#FDECEA` | TEST identity surface |

### Evidence/status treatments

| Meaning | Background | Foreground |
|---|---|---|
| Observed | `#E5EFE6` | `#35543B` |
| AI inference | `#F7E8CF` | `#735019` |
| Knowledge | `#E8EDF3` | `#3F556A` |
| Proposed | `#F4EEE2` | `#6A593D` |
| Approved | `#E5EFE6` | `#35543B` |
| Rejected | `#F5E7E5` | `#7A3F39` |
| Imported (later milestone) | `#EEEAF4` | `#5C4F70` |

## 4. Typography

M2 uses the Android/system sans family. Do not add a custom-font dependency solely for styling. On Android this should render with the platform's normal modern sans/Roboto stack.

| Style | Size | Line height | Weight |
|---|---:|---:|---:|
| Display | 30 | 36 | 700 |
| Screen title | 24 | 30 | 700 |
| Section title | 18 | 24 | 700 |
| Body | 16 | 23 | 400 |
| Body strong | 16 | 23 | 600 |
| Secondary | 14 | 20 | 400 |
| Label | 13 | 18 | 600 |
| Caption | 12 | 16 | 500 |
| Button | 16 | 20 | 700 |
| Temperature value | 28 | 34 | 700 |

Rules:

- Sentence case, not all-caps UI labels.
- Use bold sparingly; spacing and grouping do most of the hierarchy work.
- User-entered verdict/note text must remain readable at normal body size and never be visually subordinated to AI content.
- Respect Android font scaling. Do not use fixed-height text containers that clip scaled text.

## 5. Spacing and geometry

Base spacing scale:

`4, 8, 12, 16, 20, 24, 32, 40`

Controlled layout rules:

- Cover-screen horizontal gutter: **20 dp**.
- Wider/unfolded gutter: **24 dp**.
- Centred content column max width: **560 dp**.
- Standard card padding: **16–20 dp**.
- Major section separation: **24–32 dp**.
- Control gap: **8–12 dp**.
- Card radius: **18 dp**.
- Large/hero card radius: **24 dp**.
- Input/button radius: **14 dp**.
- Chip/pill radius: fully rounded.
- Border: 1 dp where a boundary is needed.
- Elevation: minimal; prefer borders and tonal surfaces. No heavy drop shadows.

## 6. Buttons and controls

### Primary action

- Solid `primary`.
- White label.
- Full width when it is the main screen action.
- Approx. 64 dp touch height.
- Clear pressed and disabled states.
- Never place two equally prominent primary buttons together.

### Secondary action

- `surface` or `primarySoft` background with primary text.
- Minimum 48 dp touch target.
- Used for utilities such as temperature/photo capture or non-primary progression.

### Destructive / Reject

- Do not use a filled red button for routine proposal rejection.
- Use restrained danger text/icon on a neutral/soft background.
- Destructive history/photo/restore actions require explicit confirmation.

### Chips

- Use for status/evidence classes only when the label carries meaningful information.
- Avoid turning ordinary metadata into a field of coloured pills.

## 7. Navigation

M2 top-level navigation is deliberately small:

- **Home**
- **History**

Settings/Backup is reached from a clearly discoverable header action rather than becoming a third primary product destination.

Rules:

- Home and History may use a bottom navigation treatment on top-level screens.
- Labels remain visible; icons never stand alone where meaning is ambiguous.
- Cook and Review are pushed task screens and do not show the top-level bottom bar while the user is actively cooking/reviewing.
- Android back behaviour must be predictable and never discard an unsaved user edit without warning.

Knowledge, Cook Again and other later-milestone destinations must not appear as disabled teaser tabs in M2.

## 8. Screen baseline

### 8.1 Home

Purpose: start or resume a cook immediately and see recent history without feeling like a dashboard.

Order:

1. Compact brand/header row — `Cooking Lab`; TEST badge only in TEST package.
2. Strong headline/short supporting line only when the screen is empty or first-use; do not repeat marketing copy every visit.
3. **New Cook** — dominant full-width primary action.
4. **Continue cooking** card when an open cook exists.
5. **Recent cooks** — up to a small useful set, newest first.
6. Link/action to History if more exists.

A New Cook is created in one tap. Do not open a title/details form first.

Empty state should be calm and useful: explain that a cook can be as small as one sentence and present the New Cook action.

### 8.2 Active Cook

Purpose: capture what is happening with the least possible interruption.

Structure:

- Header: back, title (`Untitled cook` when absent), optional inline title edit affordance, **Finish & review** action.
- Timeline: chronological evidence cards/bubbles.
- User note: warm neutral/surface card, timestamp secondary.
- Temperature: compact amber-accent card with large °C value and optional `where` text.
- Photo: user's photo as evidence, rounded image treatment and timestamp.
- Assistant messages are not part of M2 live use; do not simulate an in-cook chatbot.
- Bottom composer: multiline text input with OS dictation support, send action, plus compact temperature and photo actions.

The composer must not resemble a long form. One sentence followed by Send is a complete interaction.

### 8.3 Review

Purpose: make the post-cook reflection quick and preserve the distinction between verdict/evidence and interpretation.

Order:

1. Title + simple context/date.
2. **How was it?** large multiline verdict field.
3. Save verdict/progress action.
4. `Raw evidence` section where relevant timeline/verdict context is visually quiet but clearly primary/source material.
5. `Suggestions` section only when deterministic TEST-fixture proposals are legitimately present.
6. Proposal cards with visible class badge and **Approve / Edit / Reject** controls.
7. `Approve all` only for proposed items currently visible and only in TEST/synthetic proposal flow.
8. Production/manual fallback: AI unavailable is a non-blocking state; the cook can be completed with verdict only. An optional user-authored lesson may be added without pretending AI ran.
9. **Finish review** marks the cook `reviewed`.

Routine review target remains under 60 seconds.

### 8.4 History

Purpose: make past cooks easy to scan and reopen.

M2 is basic history only:

- newest first;
- simple `All / Open / Reviewed` filter if useful;
- no search yet;
- no tag/knowledge filters yet;
- each row/card: title or `Untitled cook`, date, short verdict excerpt if present, first photo thumbnail if available, open/reviewed status where needed;
- tapping an open cook resumes the active-cook experience;
- tapping a reviewed cook opens the same cook-detail/timeline in read-only mode with its verdict/review summary.

### 8.5 Settings / Backup utility

Purpose: protect the local-first history without turning Settings into a feature area.

M2 may add a minimal Settings screen or sheet containing only M2-required recovery actions and basic app identity/build information.

Backup/restore UI must be plain, explicit and confidence-building:

- Export portable backup
- Restore from portable backup
- clear explanation that the database key itself is not exported
- restore is destructive/replacing and must never occur from one accidental tap

No general settings catalogue, themes, accounts or cloud options.

## 9. Photography treatment

- User cook photos are evidence, not decoration.
- Crop for list thumbnails only; never alter the stored evidence image merely for presentation.
- Timeline detail should favour a natural 4:3 or original-ratio presentation within screen bounds.
- Corners approximately 14–18 dp.
- No filters, colour grading, decorative overlays or AI-generated replacement imagery.
- If M2 creates a downscaled durable copy for storage, that is a controlled technical storage choice and must preserve the original visual content without stylistic transformation.

## 10. Empty, loading and failure states

Every state should answer: what happened, is my cook safe, and what can I do now?

- Empty: concise explanation + one obvious action.
- Loading: local storage actions should normally be near-instant; use lightweight progress only when genuinely asynchronous (photo processing/export/restore).
- AI unavailable: never blocks saving the cook; state that suggestions are not connected yet.
- Storage failure: do not silently continue as if saved. Keep unsaved user input visible and offer retry/copy where practical.
- Photo failure: timeline evidence remains; explain that the photo itself did not save.
- Restore failure: leave existing history untouched.

Avoid generic `Something went wrong` when the system can state the actual safe condition.

## 11. Fold / responsive rules

- Must work from **320 dp** usable width upward without horizontal scrolling.
- Cover screen is canonical for interaction design.
- Unfolded layout keeps the same information architecture; do not invent a second desktop navigation model.
- At wider widths, centre the content column and allow cards/composer to breathe rather than stretching edge-to-edge.
- Keyboard-open states must keep the active composer/input reachable.
- No essential action may depend on a hover state or precision pointer.

## 12. Accessibility

- Target WCAG-style contrast equivalent to at least 4.5:1 for ordinary text where practical.
- Colour is never the sole status signal.
- 48 dp minimum touch targets.
- Labels for icon-only accessibility semantics even if visual labels are present elsewhere.
- Dynamic/font scaling must not clip core actions or evidence text.
- Error copy is specific and non-blaming.

## 13. What M2 must not visually introduce

Do not introduce UI for:

- real AI chat;
- Knowledge/tag pages;
- Cook Again briefings;
- import;
- instrumentation;
- accounts/login;
- cloud sync;
- social/community;
- recipe discovery/database;
- pantry/grocery/menu/nutrition/costing;
- gamification;
- custom voice UI;
- Play Store/distribution management.

## 14. Implementation authority

This baseline replaces the minimal M0 shell styling as the target visual/interaction design from M2 onward. Existing M0 tokens/components may be changed to implement this baseline.

It does **not** change the accepted product data model, evidence rules, local-first architecture, security controls or M1 storage implementation.

Any materially different visual direction — especially dark-first theming, a clinical/data-lab aesthetic, recipe-card mimicry, dense dashboard design or a new navigation model — requires a new Cooking Lab design decision.

**DESIGN BASELINE V1 — LOCKED**
