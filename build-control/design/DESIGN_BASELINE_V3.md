# Cooking Lab — Design Baseline v3

**Status:** ACCEPTED — replaces [Design Baseline v2](./DESIGN_BASELINE_V2.md)
**Approved by:** Mike (product owner), on 2 November 2026, with the 0.4.0 plan
**Applies from:** 0.4.0
**Updated:** 0.4.1, 3 November 2026, by Mike's call: the type a step smaller,
wrapping meal buttons, a slimmer Cooking now (sections 3, 4 and 5)
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

One family, Plus Jakarta Sans, bundled with the app, as in v2. Since 0.4.0
part 7 the sizes sit at Material 3's, and 800 is kept for the app's name and
titles only; headings and cards are 700, Next time and buttons 600.

**0.4.1: one step smaller, app-wide** (Mike, 3 November 2026). Every style
below is a step down from 0.4.0; weights and letter spacing are unchanged, and
so are the drawn sizes (a button 40, a chip 32, the icon circles), the spacing,
the photos and the 48 dp touch area. The contrast test still passes in both
themes. `__tests__/typeScale.test.ts` holds the table exactly.

| Style | Size / line | Weight | Was (0.4.0) | For |
|---|---:|---:|---|---|
| `appTitle` | 24 / 30 | 800 | 26 / 32 | "Cooking Lab" on Home, once |
| `appTitleInner` | 22 / 28 | 800 | 24 / 30 | The same on the inner screen |
| `title` | 20 / 26 | 800 | 22 / 28 | A cook's title on the cook and review screens |
| `titleCompact` | 18 / 24 | 800 | 20 / 26 | The title beside its photo in an inner pane |
| `heading` | 16 / 22 | 700 | 18 / 24 | Section headings: Your cooks, Readings, Notes, Photos, Who ate it? |
| `cardTitle` | 15 / 20 | 700 | 16 / 22 | A cook on a card; a person's name |
| `nextTime` | 15 / 22 | 600 | 16 / 24 | Next time's words |
| `nextTimeLarge` | 16 / 23 | 600 | 17 / 25 | The same in the inner side column |
| `body` | 15 / 21 | 400 | 16 / 22 | Notes, Your notes, ingredients. Notes on the cook page are 15, by Mike's call on 3 November 2026; this replaces "never under 16 on the cook screen" |
| `bodyStrong` | 15 / 21 | 600 | 16 / 22 | The same, stressed |
| `secondary` | 12 / 16 | 400 | 13 / 18 | Dates, counts, times |
| `overline` | 11 / 16 | 700, tracking 0.8 | 12 / 16 | NEXT TIME, COOKING NOW, written in capitals in the copy |
| `label` | 11 / 16 | 600 | 12 / 16 | The meal label, cuisine pill, status and tag chips |
| `chip` | 12 / 16 | 600 | 13 / 18 | Filter chips and the composer's reading chips |
| `button` | 13 / 18 | 600 | 14 / 20 | Every button |
| `buttonMain` | 14 / 20 | 700 | 15 / 20 | New Cook and a screen's foot button |
| `readingNumber` | 20 / 24 | 700 | 24 / 28 | A temperature, Celsius only |

Before part 7 (0.4.0) the sizes were larger again: `appTitle` 34 / 40,
`title` 28 / 33, `heading` 22 / 28, `body` 16 / 24, `button` 16 / 20, all
heavier; the part 7 record in `build-control/slices/RELEASE_0.4.0.md` has them.

Titles keep a little negative tracking, scaled down with their size
(`appTitle` and `appTitleInner` −0.6, `title` −0.5, `titleCompact` −0.4,
`heading` and `cardTitle` −0.2, `readingNumber` −0.5).

## 4. Shape, space and size

- **Corners:** `pill` for every button (New Cook too), the search bar, chips
  and icon circles; `card` (16) for cards and the title photo; `photo` (12)
  for photos in cards and grids; `zone` (18) for the Next time card and sheet
  tops; `field` (12) for text fields, the Ingredients bar and the Undo bar.
- **Spacing** comes only from the steps 4, 8, 12, 16, 20, 24, 32, 40. The cover
  screen's side margin is 16 (20 when it is turned sideways); inner panes use
  20. Cards and zones are padded 12 to 14. Gaps between sections are a step
  tighter than before part 7.
- **Touch area 48, drawn size per Material 3.** Every control a finger can
  press keeps a touch area of at least 48 × 48 dp, Android's minimum. What is
  drawn follows Material 3: a button is 40 tall, a chip 32, a round icon
  button 40 or less. Where the drawn size is under 48, the control's hit area
  (`hitSlop`, from `touchSlop` in `src/theme/touch.ts`) reaches out the rest
  of the way, evenly.
  *Why:* until part 7 every drawn size was made equal to its touch target, and
  the type ran a size or two above Material 3 with 800 nearly everywhere; on
  the Fold everything looked far too big. Material 3 gets its 48 from the
  space around a control, not by drawing it at 48.
  `__tests__/touchArea.test.tsx` measures every pressable on every screen and
  sheet, on the cover and inner screens, and holds it to 48.
- **Touch areas never overlap** (0.4.1). Rows of wrapped controls (the meal
  buttons, the review's meal and cuisine choices, the Filters sheet, tags,
  the composer's reading chips, Add a reading's choices) sit **16 apart**
  (`space.md`): a chip is drawn 32 and reaches out 8 above and below, so two
  rows 8 apart shared 8 dp of touch area. Stacked controls are spaced the
  same way. `__tests__/touchOverlap.test.tsx` checks every screen and sheet,
  cover and inner. One exception, kept from part 6: the five stars of one
  person's rating, 38 wide with 5 either side, share 10 dp between
  neighbours (a tap there goes to the later star); five stars 48 apart do not
  fit a cover-screen row.
- **Sizes (dp), drawn:**

| What | Now | Was |
|---|---:|---:|
| Touch area of any control (`targetMin`) | 48 | 48 |
| A button (`button`) | 40 | 48 |
| The main action: New Cook, Finish review's bar, the composer's bar (`targetMain`) | 48 | 56 |
| A filter, choice, tag or reading chip; N/A (`chip`, `tagChip`) | 32 | 40, 34; N/A 48 |
| A round icon button: ⋯, Back, a pencil, the bin, the camera (`iconButton`) | 40 | 48 |
| The filter button beside the search bar (`filterButton`) | 40 | 50 |
| The search bar's × and Send (`inlineButton`) | 36 | 44 |
| The search bar | 48 | 50 |
| Links (Show all, edited) and Screen on | 40 | 48 |
| Icon circles: sections, readings, Next time's bulb, a card's chevron (`iconCircle`, `iconCircleInner`, `nextCircle`) | 32 | 40, 36, 44 |
| An icon inside a 32 circle | 18 | 22 |
| A cook card's photo, cover screen (`photoCardW` × `photoCardH`) | 80 × 68 | 104 × 88 |
| The same, inner list (`photoCardWInner` × `photoCardHInner`) | 64 × 56 | 72 × 64 |
| Cooking now's photo, both screens (`photoNow`) | 56 × 56 | 104 × 88; 72 × 64 inner |
| The photo beside a cook's title (`photoTitle`) | 72 | 92 |
| A person's circle in Who's eating (`avatar`) | 40 | 52 |
| A star: drawn width, own width, height | 30, 38, 48 | unchanged; its hit area now reaches 5 either side |
| Running text, widest | 680 | 680 |

- **Cooking now** shows just the dish (0.4.1): a 56 photo, the title, the
  meal label and cuisine pill, and the chevron. When it started, how many notes
  and which time it is cooked are no longer drawn; TalkBack still reads all of
  it in the card's label. The meal and cuisine are a line of their own inside
  the text column and wrap there, never under the chevron.
  *Was (0.4.0):* one row of meta (meal, cuisine, when it started, notes,
  which time) under the title.
- **Meal buttons wrap, everywhere** (0.4.1). Home's meal filter (All, then the
  five meals) wraps onto as many rows as the width needs, on the cover screen
  as on the inner one; the sideways-scrolling row is gone. Rows sit 16 apart.
  Each button has 12 either side of its words (was 14). At 360 dp wide that
  is two rows at font size 1.0 and three at 1.3.
  *Was (0.4.0):* one row scrolling sideways on the cover screen.
- **A heading's trailing word never clips** (0.4.1): "Optional", "12
  reviewed", "0 of 12", the average badge. The heading gives way first; the
  trailing word never shrinks, and when the two do not fit on a line it moves
  under the heading (`src/components/HeadingRow.tsx`).
- **Lists end clear of the dock's fade** (0.4.1): with New Cook docked, the
  list ends with 20 and the fade's 24 besides, so its last control is never
  under the fade.
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
  beside the name or under it as one group, and since 0.4.1 the whole list
  takes one layout: beside on every row when every row fits, under on every
  row when any one does not, worked out afresh from each measurement so a
  wider window brings them back beside. The only fixed numbers are
  limits (touch targets, line length, a pane's minimum and maximum) and marks
  drawn at their own size, and they live in `src/theme/tokens.ts`.
  Why: fixed widths taken from one phone broke on the Fold 6 bench (707 and
  823 dp wide, font size 1.15) — words broke letter by letter and the detail
  side was crushed to about 300 dp.
- **Unfolding or turning keeps your place:** the same cook, scroll position
  and half-typed note. Since 0.4.1 so does a live font-size or display-size
  change, which makes Android recreate the app's screens: the same screen and
  cook, the scroll position, and half-typed words (a note, a title, a rating
  line, Next time, Your notes), held in memory through the recreation
  (`src/layout/KeptPlace.ts`).

## 6. The grouped cook page

A cook's page is grouped by section, never a timeline. Under the title and
tags: **Next time first**, then Last time, then the Ingredients bar, then
Readings, Notes and Photos, each a heading over its own card. Readings are two
cards side by side; Notes is one card with a row per note, divided by lines,
and a count after the heading ("Notes · 2"); Photos is a grid. On a reviewed
cook the three join under one card. Times stay in the data and are shown on a
long press or in the photo viewer, not on the page. On the inner screen a side
column keeps Next time at the top, then Last time and Ingredients. Notes and
Photos stack, Notes above Photos, unless the screen is turned sideways **and**
each would get at least 300 dp of the main column (`notes-photos-min`,
0.4.0 part 8); only then do they sit side by side, the photos two to a row.
The main column comes from the live window, as the panes do: the window less
the side column's share, less the gutters, never wider than a column of
cards (560). So today they stack on every window: side by side each would
get at most 274 dp. Why: at about 230 dp each, sideways on the Fold, a note
wrapped a word or two to a line.

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
- Every control keeps a 48 dp touch area, whatever its drawn size (section 4).

## 9. v1 and v2 rules that still stand

Evidence before suggestion; one obvious primary action per screen; 48 dp
targets; narrow first, from 320 dp with no sideways scrolling; calm empty,
loading and failure states that say what happened and what to do; sentence
case, British spelling, Celsius; no emoji and no exclamation marks in the
app's own voice; no invented household names in designs, tests or seed data
("You" and "Guest" in tests; the web preview also has "Guest 2" and, since
0.4.1, the made-up "Guest with a longer name").

**DESIGN BASELINE V3 — ACCEPTED**
