/**
 * Design tokens for Cooking Lab, 0.4.0.
 *
 * Taken from the 0.4.0 design system's `tokens.json` (version 2), approved by
 * Mike (product owner) on 2 November 2026, and recorded in
 * `build-control/design/DESIGN_BASELINE_V3.md`. The JSON's kebab-case names
 * are kept, in camelCase: `meal-side` is `mealSide`, `next-ink` is `nextInk`.
 *
 * Every colour has one job (the baseline's table says which), and every one
 * has a light and a dark value. The app follows the phone's light or dark
 * setting (`src/theme/theme.tsx`); nothing here is chosen by a screen.
 *
 * Screens and components style themselves from these and from nothing else:
 * `__tests__/noHandTypedStyles.test.ts` fails on a colour, font size, line
 * height or corner radius typed into `src/screens` or `src/components`.
 *
 * Every text pair the app draws is in `textPairs`, and every control edge,
 * focus ring and meaning-carrying icon in `controlPairs`, for both themes;
 * `__tests__/contrast.test.ts` holds them to 4.5:1 (3:1 at 24 px and up) and
 * 3:1.
 */

import type { TextStyle } from 'react-native';

import type { StoredMealType } from '../domain/enums';

export type ThemeName = 'light' | 'dark';

export const THEME_NAMES: readonly ThemeName[] = ['light', 'dark'];

const light = {
  /** The ground behind every screen: off-white, never grey. */
  page: '#fbfaf6',
  /** Cards, sheets, the inner screen's detail pane and the composer. */
  surface: '#ffffff',
  /** The search bar, the filter button, unselected filter chips, the cuisine pill, tag chips, photo placeholders. */
  surfaceRaised: '#eef0ec',
  /** Card edges and dividers. Decoration only: never the only edge of a control. */
  line: '#efeee8',
  /** The edge of text fields, outlined buttons and unselected choice chips: 3:1 on page and surface. */
  controlLine: '#87918f',
  /** All text and titles; icons beside text. Navy, not black. */
  ink: '#00293b',
  /** Dates, counts, hints and placeholders. */
  inkMuted: '#5a6468',
  /** Orange: the one main action on a screen, and the lightbulb behind Next time. */
  primary: '#b85618',
  primaryPressed: '#9e4813',
  onPrimary: '#ffffff',
  /** Deep teal: secondary actions and your own choices. */
  secondary: '#00605a',
  secondaryPressed: '#004c47',
  onSecondary: '#ffffff',
  /** Text buttons and the focus ring. */
  link: '#00605a',
  /** The chosen filter chip on Home, and N/A when pressed. */
  selected: '#00293b',
  onSelected: '#ffffff',
  /** Sage: a place, not a thing to read. */
  zone: '#e2ece2',
  /** The Ingredients bar or box. */
  zoneQuiet: '#e8eeea',
  /** Icons drawn on zone and zone-quiet. */
  zoneIcon: '#1e5a66',
  /** Amber: Next time, and nothing else. */
  next: '#fff1e0',
  nextLine: '#f7d3ae',
  nextInk: '#8a3e0c',
  /** Go and look: Open on Last time, the Needs a review chip. */
  peach: '#fce6cf',
  onPeach: '#8a3e0c',
  /** Filled stars, always beside the number. */
  star: '#cc661e',
  /** A rating number shown in star colour. */
  starText: '#94480f',
  starEmpty: '#d3d6d1',
  /** The Oven reading's warm tint. */
  readingOven: '#fdebdd',
  readingOvenInk: '#8a3e0c',
  /** The Internal reading's cool blue tint. */
  readingInternal: '#e6effb',
  readingInternalInk: '#1f4e8c',
  /** Navy tint behind a note's pencil and Your notes' page icon. */
  noteIcon: '#e7ecf0',
  /** The word and icon of each meal. Never a fill. */
  mealBreakfast: '#9a5300',
  mealLunchDinner: '#2e6b3c',
  mealDessert: '#a3345f',
  mealSnack: '#3e5f8a',
  mealSide: '#726000',
  /** Delete and other actions that lose data. A state, never the brand. */
  danger: '#a1271b',
  dangerSoft: '#fbe9e6',
  /** The Undo bar. */
  inverse: '#00293b',
  onInverse: '#fbfaf6',
  inverseAction: '#f2a66a',
  /** The dimmed screen behind a sheet or dialog. */
  scrim: 'rgba(0, 41, 59, 0.4)',
  statusOpen: '#eef0ec',
  statusOpenInk: '#3f4a4e',
  statusReviewed: '#ddefec',
  statusReviewedInk: '#00605a',
  /** The warm badge behind an average rating. The JSON's `{reading-oven}`. */
  ratingBadge: '#fdebdd',
  /** Kept for the assistant's evidence labels in update 3. */
  statusInference: '#f4ecdb',
  statusInferenceInk: '#5c4a24',
  statusKnowledge: '#e4eaf5',
  statusKnowledgeInk: '#2c4a75',
  statusProposed: '#f1eee6',
  statusProposedInk: '#5c4d33',
  statusRejected: '#fbe9e6',
  statusRejectedInk: '#8a2a1c',
  statusImported: '#eeeaf6',
  statusImportedInk: '#4f4370',
  /** The TEST badge, in the Test build only. */
  testBadge: '#b3261e',
  onTestBadge: '#ffffff',
  testSurface: '#fdecea',
  testLine: '#e8a9a3',
};

export type Palette = { readonly [K in keyof typeof light]: string };

const dark: Palette = {
  page: '#0f1719',
  surface: '#182326',
  surfaceRaised: '#22302f',
  line: '#24323a',
  controlLine: '#6f8584',
  ink: '#e6eeec',
  inkMuted: '#b4c2c1',
  primary: '#f08a4b',
  primaryPressed: '#e07a3b',
  onPrimary: '#331300',
  secondary: '#7fd1c8',
  secondaryPressed: '#6bc0b6',
  onSecondary: '#00302c',
  link: '#7fd1c8',
  selected: '#e6eeec',
  onSelected: '#0f1719',
  zone: '#1c2e28',
  zoneQuiet: '#1f2c2a',
  zoneIcon: '#8ccfc4',
  next: '#3b300c',
  nextLine: '#6b5718',
  nextInk: '#ffd77a',
  peach: '#f5b88e',
  onPeach: '#3a1704',
  star: '#f08a4b',
  starText: '#f2a66a',
  starEmpty: '#3a4646',
  readingOven: '#42221a',
  readingOvenInk: '#ffbfa0',
  readingInternal: '#16233d',
  readingInternalInk: '#a9c6ff',
  noteIcon: '#22303a',
  mealBreakfast: '#f0b45e',
  mealLunchDinner: '#8fd19c',
  mealDessert: '#f29bbe',
  mealSnack: '#9dbdeb',
  mealSide: '#dcc65a',
  danger: '#ffb4ab',
  dangerSoft: '#4a1a14',
  inverse: '#e6eeec',
  onInverse: '#0f1719',
  inverseAction: '#94480f',
  scrim: 'rgba(0, 0, 0, 0.6)',
  statusOpen: '#22302f',
  statusOpenInk: '#c9d4d3',
  statusReviewed: '#12302c',
  statusReviewedInk: '#7fd1c8',
  ratingBadge: '#42221a',
  statusInference: '#2f2a20',
  statusInferenceInk: '#e0cfa8',
  statusKnowledge: '#1b2a4a',
  statusKnowledgeInk: '#afc6f5',
  statusProposed: '#2e2a22',
  statusProposedInk: '#d8cbb0',
  statusRejected: '#44160f',
  statusRejectedInk: '#ffb4a8',
  statusImported: '#2b2540',
  statusImportedInk: '#cfc2f0',
  testBadge: '#ffb4ab',
  onTestBadge: '#690005',
  testSurface: '#44160f',
  testLine: '#8c3a30',
};

export type ColorRole = keyof Palette;

export const palettes: Readonly<Record<ThemeName, Palette>> = { light, dark };

/**
 * The shadows, as React Native `boxShadow` strings. Dark has none: a card
 * there is edged with `line` instead.
 */
export type Shadows = {
  readonly card: string | undefined;
  readonly fab: string | undefined;
  readonly bar: string | undefined;
  readonly sheet: string | undefined;
};

export const shadows: Readonly<Record<ThemeName, Shadows>> = {
  light: {
    card: '0px 1px 2px rgba(0, 41, 59, 0.05), 0px 6px 18px rgba(0, 41, 59, 0.06)',
    fab: '0px 8px 20px rgba(184, 86, 24, 0.3)',
    bar: '0px -6px 18px rgba(0, 41, 59, 0.06)',
    sheet: '0px -8px 24px rgba(0, 41, 59, 0.16)',
  },
  dark: { card: undefined, fab: undefined, bar: undefined, sheet: undefined },
};

/** Each meal's colour role: the word and the icon, never a fill. */
export const mealColorRole: Readonly<Record<StoredMealType, ColorRole>> = {
  breakfast: 'mealBreakfast',
  lunch_dinner: 'mealLunchDinner',
  dessert: 'mealDessert',
  snack: 'mealSnack',
  side: 'mealSide',
};

/**
 * Status chips: a ground and its ink. Cooking, Reviewed and Needs a review are
 * shown now; the rest wait for the assistant's evidence labels in update 3.
 * Observed and Approved have no pair of their own in the design system, so
 * they wear Reviewed's teal tint: each is the cook's own, settled record.
 */
export const statusRoles = {
  open: { background: 'statusOpen', foreground: 'statusOpenInk' },
  reviewed: { background: 'statusReviewed', foreground: 'statusReviewedInk' },
  needsReview: { background: 'peach', foreground: 'onPeach' },
  observed: { background: 'statusReviewed', foreground: 'statusReviewedInk' },
  approved: { background: 'statusReviewed', foreground: 'statusReviewedInk' },
  inference: { background: 'statusInference', foreground: 'statusInferenceInk' },
  knowledge: { background: 'statusKnowledge', foreground: 'statusKnowledgeInk' },
  proposed: { background: 'statusProposed', foreground: 'statusProposedInk' },
  rejected: { background: 'statusRejected', foreground: 'statusRejectedInk' },
  imported: { background: 'statusImported', foreground: 'statusImportedInk' },
} as const satisfies Record<string, { background: ColorRole; foreground: ColorRole }>;

export type StatusTreatment = keyof typeof statusRoles;

/** A temperature reading's tint and ink, by what it was taken of. */
export const readingRoles = {
  oven: { tint: 'readingOven', ink: 'readingOvenInk' },
  internal: { tint: 'readingInternal', ink: 'readingInternalInk' },
} as const satisfies Record<string, { tint: ColorRole; ink: ColorRole }>;

export type ReadingTreatment = keyof typeof readingRoles;

/** The spacing steps. Spacing comes from these and nothing else. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  ml: 20,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

/** The cover screen's side margin: `space-md` plus 2. */
export const COVER_MARGIN = space.md + 2;

export const radius = {
  /** Photos on cook cards and in the Photos grid. */
  photo: 14,
  /** Text fields, the Ingredients bar, the Undo bar. */
  field: 16,
  /** Cards, the Cooking now card, reading cards and the title photo. */
  card: 20,
  /** The Next time card and the top corners of sheets. */
  zone: 22,
  /** Buttons, the search bar, chips, pills and icon circles. */
  pill: 999,
} as const;

export const size = {
  /** The smallest touch target for any control (Android). */
  targetMin: 48,
  /** The main action on a screen: New Cook, the composer, Finish review. */
  targetMain: 56,
  /** The tinted circle behind a section or reading icon. */
  iconCircle: 40,
  /** The same on the inner screen. */
  iconCircleInner: 36,
  /** The lightbulb circle on Next time. */
  nextCircle: 44,
  /** The icons themselves, on their 24 grid. */
  icon: 24,
  iconSmall: 16,
  iconTiny: 12,
  /** A cook card's photo on the cover screen. */
  photoCardW: 104,
  photoCardH: 88,
  /** The same in the inner list. */
  photoCardWInner: 72,
  photoCardHInner: 64,
  /** The square photo beside a cook's title. */
  photoTitle: 92,
  /** The widest a column of running text may grow. */
  measure: 680,
  /** The list pane on the inner screen. */
  paneList: 400,
  /** Filter chips sit 40 tall inside a 48 touch area. */
  chip: 40,
  /** Tag chips. */
  tagChip: 34,
  /** The sheet's handle. */
  handleW: 32,
  handleH: 4,
  /** A person's dot in Who ate it. */
  dot: 12,
  /** A star button's drawn width, in its 48 tall target. */
  starButton: 30,
  /** Hairlines and rings. */
  hairline: 1,
  nextEdge: 1.5,
  ring: 2,
} as const;

export const breakpoint = {
  /** From here the screen shows two panes. */
  medium: 600,
  /** The inner screen turned sideways: the same panes, a wider detail pane. */
  expanded: 840,
} as const;

/** Disabled controls fade to this, and say why nearby when it is not obvious. */
export const DISABLED_OPACITY = 0.4;

type TypeEntry = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;

/**
 * The type scale, one family: Plus Jakarta Sans. Each style carries its size,
 * line height, weight and tracking together.
 */
export const type = {
  appTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  /** The app name on the inner screen. */
  appTitleInner: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.6 },
  titleCompact: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2 },
  nextTime: { fontSize: 17, lineHeight: 25, fontWeight: '700' },
  /** Next time's words in the inner screen's side column. */
  nextTimeLarge: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  overline: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 1 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  chip: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  buttonMain: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  readingNumber: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
} as const satisfies Record<string, TypeEntry>;

export type TypeStyle = keyof typeof type;

/** Text of this size or larger may be held to 3:1 rather than 4.5:1. */
export const LARGE_TEXT_SIZE = 24;

/** A colour pair the contrast test checks, with the smallest size it is used at. */
export type ColorPair = {
  readonly name: string;
  readonly fg: ColorRole;
  readonly bg: ColorRole;
  readonly size: number;
};

const SMALL = type.label.fontSize;

function onEach(fg: ColorRole, backgrounds: readonly ColorRole[], size = SMALL): ColorPair[] {
  return backgrounds.map((bg) => ({ name: `${fg} on ${bg}`, fg, bg, size }));
}

const MEALS: readonly ColorRole[] = Object.values(mealColorRole);

/**
 * Every text colour the app draws, on every ground the token notes put it on.
 * Held to 4.5:1 in both themes, or 3:1 for text 24 px and up.
 */
export const textPairs: readonly ColorPair[] = [
  ...onEach('ink', [
    'page',
    'surface',
    'surfaceRaised',
    'zone',
    'zoneQuiet',
    'next',
    'dangerSoft',
    'testSurface',
    'ratingBadge',
    'statusOpen',
    'statusReviewed',
  ]),
  ...onEach('inkMuted', ['page', 'surface', 'surfaceRaised', 'zone', 'zoneQuiet']),
  ...onEach('onPrimary', ['primary', 'primaryPressed']),
  ...onEach('onSecondary', ['secondary', 'secondaryPressed']),
  ...onEach('link', ['page', 'surface', 'surfaceRaised', 'zone', 'zoneQuiet']),
  ...onEach('onSelected', ['selected']),
  ...onEach('nextInk', ['next']),
  ...onEach('onPeach', ['peach']),
  ...onEach('starText', ['page', 'surface']),
  ...onEach('readingOvenInk', ['readingOven']),
  ...onEach('readingInternalInk', ['readingInternal']),
  // A meal's word sits above a title on a card, on the page, and on the
  // Cooking now card's sage.
  ...MEALS.flatMap((meal) => onEach(meal, ['page', 'surface', 'zone'])),
  ...onEach('danger', ['page', 'surface', 'dangerSoft']),
  ...onEach('onInverse', ['inverse']),
  ...onEach('inverseAction', ['inverse']),
  ...Object.entries(statusRoles).map(([meaning, roles]) => ({
    name: `status ${meaning}`,
    fg: roles.foreground as ColorRole,
    bg: roles.background as ColorRole,
    size: SMALL,
  })),
  ...onEach('onTestBadge', ['testBadge']),
];

/**
 * Control edges, focus rings and icons that carry meaning, on the grounds
 * they are drawn on. Held to 3:1 in both themes.
 */
export const controlPairs: readonly ColorPair[] = [
  ...onEach('controlLine', ['page', 'surface']),
  // The focus ring sits 2 px outside a control, on page or surface, and on next.
  ...onEach('link', ['page', 'surface', 'next']),
  ...onEach('primary', ['page', 'surface']),
  ...onEach('secondary', ['page', 'surface']),
  ...onEach('selected', ['page', 'surface', 'surfaceRaised']),
  ...onEach('zoneIcon', ['zone', 'zoneQuiet']),
  ...onEach('star', ['page', 'surface']),
  // A meal's icon in a filter chip, and on the no-photo tile.
  ...MEALS.flatMap((meal) => onEach(meal, ['surfaceRaised', 'zone'])),
  ...onEach('readingOvenInk', ['readingOven']),
  ...onEach('readingInternalInk', ['readingInternal']),
  ...onEach('ink', ['noteIcon']),
];
