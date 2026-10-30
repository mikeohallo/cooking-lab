# Cooking Lab — Design Baseline v2

**Status:** ACCEPTED — replaces [Design Baseline v1](./DESIGN_BASELINE_V1.md)
**Picked by:** Mike, product owner, on 30 October 2026, from the designs shown
for update 2: **colour scheme A, "Paprika"**, set in **Plus Jakarta Sans**
**Applies from:** 0.3.0
**Tokens:** `src/theme/tokens.ts` (colours, type scale) and `src/theme/fonts.ts`
(the typeface). A screen styles itself from these and nothing else.

## 1. What changed from v1

v1's warm stone, sage and amber are replaced by scheme A: a cool light ground,
white cards, near-black ink and buttons, and one warm accent, paprika, kept for
links and small actions. Each meal type has a soft colour of its own. The
system sans is replaced by Plus Jakarta Sans, bundled in the app.

Everything else v1 asked for still stands; section 5 lists it.

## 2. Colour scheme A, "Paprika"

| Token | Hex | Use |
|---|---|---|
| `background` | `#F4F4F2` | The ground behind every screen |
| `surface` | `#FFFFFF` | Cards, sheets, the composer, inputs |
| `surfaceMuted` | `#EDEDEA` | Surface 2: quiet panels, pressed states |
| `text` | `#17181B` | Ink |
| `textMuted` | `#5B5E64` | Dates, hints, labels |
| `border` | `#E0E0DC` | Hairlines round cards and inputs |
| `primary` | `#1D1E22` | Primary buttons and selected chips, with white (`onPrimary`) text |
| `primarySoft` | `#EAEAE6` | Secondary buttons, with ink text |
| `accent` | `#B83F27` | Paprika: links and small actions (quiet buttons, Back, "edited") |
| `star` | `#C98A00` | The stars of a rating |
| `lastTimeSurface` / `lastTimeBorder` | `#FBEDE8` / `#F1D3C9` | The Last time and Next time panel |

`primarySoft` is the one shade not given in the pick. It was `#E7E7E3` in the
first draft and is `#EAEAE6`, because paprika on the darker shade was 4.48:1,
just under the line (section 4).

### Meal types

The word is always shown; colour is never the only signal.

| Meal type | Label background | Label text | Chip dot |
|---|---|---|---|
| Breakfast | `#FCEFD4` | `#714900` | `#D79A1E` |
| Lunch/Dinner | `#E2EAFA` | `#1E4691` | `#3D6FD1` |
| Dessert | `#F9E0EA` | `#8E2156` | `#C9417F` |
| Snack | `#DDF1EA` | `#155C46` | `#2E9B76` |

The label is the small word above a cook's title, wherever a cook is shown. The
chips — on a cook, on the review and in Home's filter — carry the dot beside
the word.

### Meanings kept from v1, shades retuned

| Meaning | Treatment in 0.3.0 |
|---|---|
| Oven reading | A quiet grey card: `#EEEEEB`, border `#DCDCD7`, ink `#45474D`, with the word "Oven" |
| Internal reading | Amber: `#FBF0D9`, border `#EED9A8`, ink `#7A5200`, with the word "Internal" |
| TEST badge | Red `#B3261E` with white, unchanged; TEST surface `#FDECEA` |
| Danger | `#A1271B` on `#FBE9E6`; never a filled red button |
| Observed / Approved / Reviewed | `#1F5A3A` on `#E3F0E8` |
| Inference | `#6E4A00` on `#FBF0D9` |
| Knowledge | `#2C4A75` on `#E4EAF5` |
| Proposed | `#5C4D33` on `#F1EEE6` |
| Open (a cook still cooking) | `#3F4147` on `#ECECE8` |
| Rejected | `#8A2A1C` on `#FBE9E6` |
| Imported (later) | `#4F4370` on `#EEEAF6` |

Each is always drawn with its text label.

## 3. Typography: Plus Jakarta Sans

Five weights, 400, 500, 600, 700 and 800, from
`@expo-google-fonts/plus-jakarta-sans`, loaded with `expo-font`. The files are
bundled in the APK and never fetched. A plain screen shows until they have
loaded; if they cannot be loaded, the system sans is used at the same weights.
Android font scaling applies either way. The font is under the SIL Open Font
License 1.1 (see the README and `build-control/dependency-triage.md`).

| Style | Size | Line height | Weight |
|---|---:|---:|---:|
| Display ("Cooking Lab") | 30 | 38 | 800 |
| Screen title | 24 | 31 | 700 |
| Section title | 18 | 24 | 700 |
| Body | 16 | 23 | 400 |
| Body strong | 16 | 23 | 600 |
| Secondary | 14 | 20 | 400 |
| Label | 13 | 18 | 600 |
| Caption | 12 | 16 | 500 |
| Button | 16 | 21 | 700 |
| Temperature value | 28 | 35 | 700 |

The line heights are a little taller than v1's for the display, title, button
and temperature styles: Plus Jakarta Sans sits taller than the system sans,
and the extra room keeps descenders clear.

## 4. Contrast

Every pair of text and background colour the app draws is listed in
`textPairs` in `src/theme/tokens.ts`, and `__tests__/contrast.test.ts` holds
each to **4.5:1**, or **3:1** for text 24 px and up. The test also fails if a
status, meal type or reading treatment is added without its pair.

The stars are the exception, by design: `#C98A00` on white is 2.95:1, so a star
is never the thing that carries a rating. It is always printed beside its
number and the person's name in ink ("★ 5 Alex"), and the star buttons on the
review are named "1 star" to "5 stars" for TalkBack.

## 5. v1 rules that still stand

From Design Baseline v1, unchanged:

- **Evidence versus suggestion.** Raw evidence is primary; anything an
  assistant proposes is secondary, labelled, and never looks like evidence.
  Proposed / Approved / Rejected and Observed / Inference / Knowledge each keep
  a text label and a visual treatment.
- **No colour alone.** Every state, meal type and reading carries its word.
  Selected chips have a fill *and* a tick; a search match is bold *and* tinted.
- **Touch targets.** 48 dp at least; the one primary action about 64 dp.
- **No decorative imagery.** The only photographs are the cook's own, as
  evidence. No stock, generated or decorative food pictures.
- **One obvious primary action** per screen or state; no two equal primary
  buttons together.
- **Respect font scaling.** No fixed-height text containers. A card's title
  wraps to every line it needs (0.3.0's N2 fix).
- **Narrow first.** The cover display is the canonical layout and works from
  320 dp with no horizontal scrolling.
- **Calm states.** Empty, loading and failure states say what happened, that
  the cook is safe, and what can be done now.
- Sentence case, British spelling, Celsius; spacing scale, radii and the 560 dp
  content column as v1.

## 6. Layout changes in 0.3.0

These go with the new look and are recorded in
`build-control/slices/RELEASE_0.3.0.md`:

- **Home is History.** v1's separate Home and History destinations are one
  screen; there is no navigation bar to choose between them.
- **Two panes on the unfolded inner display.** v1 said the unfolded width was
  "an enhancement, not a separate desktop UI". It still is: the same screens
  and the same order, side by side — Home's list beside the chosen cook, an
  open cook's timeline beside Last time and the ingredients, the review's
  ratings beside the notes. Two panes from 600 dp wide when the shorter side is
  600 dp too (`src/layout/responsive.ts`); the cover display is one column
  either way up.

**DESIGN BASELINE V2 — ACCEPTED**
