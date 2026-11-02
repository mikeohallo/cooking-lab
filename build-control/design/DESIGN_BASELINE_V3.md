# Cooking Lab — Design Baseline v3

**Status:** ACCEPTED — replaces [Design Baseline v2](./DESIGN_BASELINE_V2.md)
**Approved by:** Mike (product owner), on 2 November 2026, with the 0.4.0 plan
**Applies from:** 0.4.0
**Tokens:** `src/theme/tokens.ts` (colours in light and dark, type, corners,
shadows, spacing, sizes, breakpoints), `src/theme/theme.tsx` (light or dark)
and `src/theme/fonts.ts` (the typeface). A screen styles itself from these and
nothing else; `__tests__/noHandTypedStyles.test.ts` fails on a colour, font
size, line height or corner radius typed into `src/screens` or
`src/components`.

## 1. The look in one paragraph

A modern test kitchen: an off-white page, white cards that hold the cook's own
food photos, and a handful of colours that each do one job, so things can be
told apart at a glance. Orange is the one thing to do next. Amber is what to do
differently next time. Sage marks a place. Navy is the words. No single tone
runs the whole page, and nothing is grey all the way through.

## 2. One job per colour

Every colour role has a light and a dark value; the names are the design
system's, in camelCase.

| Job | Roles | Where |
|---|---|---|
| The ground | `page`, `surface` | The off-white page; white cards, sheets, the composer |
| Quiet controls | `surfaceRaised`, `line`, `controlLine` | The search bar, unselected chips, tag chips, the cuisine pill; card edges; the edge of fields and outlined buttons |
| Words | `ink`, `inkMuted` | All text, navy rather than black; dates, counts and hints |
| The one main action | `primary`, `primaryPressed`, `onPrimary` | Orange: New Cook, Send, Finish review, Cook this again. One per screen |
| Your choices, quieter actions | `secondary`, `secondaryPressed`, `onSecondary`, `link` | Teal: Finish & review, Edit review, a chosen meal or cuisine on the review, people's dots, text buttons, the focus ring |
| A chosen filter | `selected`, `onSelected` | Navy: All or a meal on Home, a pressed N/A, Next on the pager |
| A place | `zone`, `zoneQuiet`, `zoneIcon` | Sage: Cooking now, Screen on, + Someone else, the Ingredients bar, icon circles, the no-photo tile |
| What to do differently | `next`, `nextLine`, `nextInk` | Amber: Next time, and nothing else |
| Go and look | `peach`, `onPeach` | Open on Last time, the Needs a review chip |
| How it went | `star`, `starText`, `starEmpty`, `ratingBadge` | Stars, always beside a number |
| Readings | `readingOven`, `readingOvenInk`, `readingInternal`, `readingInternalInk` | Warm for Oven, cool blue for Internal: the icon circle and the °C chip |
| Notes | `noteIcon` | The navy tint behind a note's pencil and Your notes' page |
| What it was | `mealBreakfast`, `mealLunchDinner`, `mealDessert`, `mealSnack`, `mealSide` | The meal's word and icon. Never a fill, never without the word |
| Where it's from | `surfaceRaised` with `ink` | The cuisine pill: neutral on purpose, so it never competes with the meal |
| State | `statusOpen*`, `statusReviewed*` | Cooking and Reviewed chips. The inference, knowledge, proposed, rejected and imported pairs wait for the assistant in update 3 |
| Losing data | `danger`, `dangerSoft` | Delete. A state, never the brand |
| The Undo bar | `inverse`, `onInverse`, `inverseAction` | Navy bar, light words, Undo in warm orange |
| The Test build | `testBadge`, `onTestBadge`, `testSurface`, `testLine` | The TEST badge and notice, in the Test build only |

Never: near-black blocks or main buttons, red, paprika, saffron or purple as
the brand, a grey page all the way through, or Android's wallpaper colours.

### Light and dark

The app follows the phone's own light or dark setting and changes live when
the phone switches. There is no switch in the app. Dark uses the same roles
with dark values: orange and teal get lighter and take dark words on them.
Cards in light carry a soft shadow; in dark they are edged with `line`
instead. The status and navigation bars turn with the theme. Android's dynamic
colour is never used.

## 3. Type

One family, Plus Jakarta Sans, bundled with the app, as in v2. Heavy weights
(800) for titles and headings are a large part of the look.

| Style | Size / line | Weight | For |
|---|---:|---:|---|
| `appTitle` | 34 / 40 | 800 | "Cooking Lab" on Home, once (30 / 36 on the inner screen) |
| `title` | 28 / 33 | 800 | A cook's title on the cook and review screens |
| `titleCompact` | 24 / 29 | 800 | The title beside its photo in an inner pane |
| `heading` | 22 / 28 | 800 | Section headings: Your cooks, Readings, Notes, Photos, Who ate it? |
| `cardTitle` | 17 / 22 | 800 | A cook on a card; a person's name |
| `nextTime` | 17 / 25 | 700 | Next time's words, bigger and bolder than body on purpose (18 / 26 in the inner side column) |
| `body`, `bodyStrong` | 16 / 24 | 400, 700 | Notes, Your notes, ingredients. Never under 16 on the cook screen |
| `secondary` | 14 / 20 | 400 | Dates, counts, times |
| `overline` | 13 / 18 | 800 | NEXT TIME, COOKING NOW, written in capitals in the copy |
| `label` | 13 / 18 | 700 | The meal label, cuisine pill, status and tag chips |
| `chip` | 14 / 18 | 700 | Filter chips and the composer's reading chips |
| `button`, `buttonMain` | 16 / 20, 17 / 22 | 800 | Every button; New Cook and a screen's foot button |
| `readingNumber` | 30 / 34 | 800 | A temperature, Celsius only |

## 4. Shape, space and size

- **Corners:** `pill` for every button (New Cook too), the search bar, chips
  and icon circles; `card` (20) for cards and the title photo; `photo` (14)
  for photos in cards and grids; `zone` (22) for the Next time card and sheet
  tops; `field` (16) for text fields, the Ingredients bar and the Undo bar.
- **Spacing** comes only from the steps 4, 8, 12, 16, 20, 24, 32, 40. The cover
  screen's side margin is 18 (16 plus 2); inner panes use 20.
- **Sizes:** every control at least 48 dp; the main action 56 dp; icon circles
  40 dp (36 on the inner screen); a card's photo 104 × 88 on the cover screen
  and 72 × 64 in the inner list; running text never wider than 680 dp.
- **Icons:** rounded line icons on a 24 grid, a 2 px line, round caps and
  joins, after Material Symbols Rounded. The app draws its own
  (`src/components/Icon.tsx`) and names the nearest Material Symbol for each.
  An icon always sits beside a word, except ⋯, the camera and the filter
  button, which carry an accessibility label.

## 5. Three screen shapes

The Fold has a cover screen (one column, under 600 dp) and an inner screen
that is nearly square, about 792 × 880 upright and 880 × 792 sideways.

- **Read at the top, tap at the bottom.** Titles and Next time sit high;
  search, filters, the composer and the main button within thumb reach.
- **Cover screen, Home:** the app's name and ⋯; the Cooking now card; Your
  cooks with the search bar and the round filter button; the filter chips (All,
  then the five meals); cook cards with photos, ten to a page; New Cook as a
  centred orange pill.
- **Inner screen:** list and detail. One column under 600 dp wide; from 600
  up, two panes.
- **Layouts adapt to the space they are given** (0.4.0, part 5, replacing the
  design pack's "fixed 400"). No fixed widths for panes, columns, rows or
  buttons. A pane is a share of the window between a minimum and a maximum,
  worked out from the live window on every render, and the other pane takes
  the rest:
  - Home's list pane and the review's left pane: 45 % of the window, never
    less than 320 or more than 400 (`pane-list-share`, `pane-list-min`,
    `pane-list-max`);
  - the cook page's side column: 42 %, between 280 and 380
    (`pane-side-share`, `pane-side-min`, `pane-side-max`).
  Content flows to fit with flex wrapping and natural sizes: no label breaks
  inside a word; a row of buttons that does not fit wraps, a button a line at
  full width, the main action first; Who ate it?'s stars, N/A and pencil sit
  beside the name or wrap under it as one group. The only fixed numbers are
  limits (touch targets, line length, a pane's minimum and maximum) and marks
  drawn at their own size, and they live in `src/theme/tokens.ts`.
  Why: fixed widths taken from one phone broke on the Fold 6 bench (707 and
  823 dp wide, font size 1.15) — words broke letter by letter and the detail
  side was crushed to about 300 dp.
- **Unfolding or turning keeps your place:** the same cook, scroll position
  and half-typed note.

## 6. The grouped cook page

A cook's page is grouped by section, never a timeline. Under the title and
tags: **Next time first**, then Last time, then the Ingredients bar, then
Readings, Notes and Photos, each a heading over its own card. Readings are two
cards side by side; Notes is one card with a row per note, divided by lines,
and a count after the heading ("Notes · 2"); Photos is a grid. On a reviewed
cook the three join under one card. Times stay in the data and are shown on a
long press or in the photo viewer, not on the page. On the inner screen a side
column keeps Next time at the top, then Last time and Ingredients; upright,
Notes and Photos stack, sideways they sit side by side.

The composer is pinned to the foot: the Oven °C and Internal °C chips, then one
rounded field holding the camera, the note and Send (an orange circle with an
up arrow).

## 7. Imagery

The cook's own photos are the most important colour on the page. A cook's card
uses its own first photo; if it has none, the first photo of the most recent
earlier cook it was made again from; with neither, a sage tile with its meal
icon in the meal colour. Photos are never tinted or framed in colour. No stock,
generated or decorative food pictures, as in v1 and v2.

## 8. Accessibility

- Text holds 4.5:1 on its ground in both themes (3:1 at 24 px and up); control
  edges, focus rings and icons that carry meaning hold 3:1. Every pair is
  listed in `textPairs` and `controlPairs` in the tokens and checked by
  `__tests__/contrast.test.ts` in light and in dark.
- No state relies on colour alone: meals print their word and icon, readings
  print Oven or Internal (never Inside), choices show a tick, stars sit beside
  a number.
- Focus is a 2 px `link` ring, 2 px outside the control. Disabled is 40 %
  opacity on the whole control, and says why nearby when it is not obvious.
- Font scaling is respected: no fixed-height text containers, and a card's
  title wraps to every line it needs.

## 9. v1 and v2 rules that still stand

Evidence before suggestion; one obvious primary action per screen; 48 dp
targets; narrow first, from 320 dp with no sideways scrolling; calm empty,
loading and failure states that say what happened and what to do; sentence
case, British spelling, Celsius; no emoji and no exclamation marks in the
app's own voice; no invented household names in designs, tests or seed data
("You" and "Guest" in tests).

**DESIGN BASELINE V3 — ACCEPTED**
