/**
 * Design tokens for Cooking Lab.
 *
 * These are the controlled values from `build-control/design/DESIGN_BASELINE_V2.md`:
 * colour scheme A, "Paprika", picked on 30 October 2026, with Plus Jakarta
 * Sans. Screens and components style themselves from these and from nothing
 * else, so the look of the app is decided in one place and a hue change is a
 * token change rather than a hunt through screens.
 *
 * Scheme A in its own words: a cool light ground, white cards, near-black ink
 * and near-black primary buttons, and one warm accent — paprika — kept for
 * links and small actions. Meal types each have a soft label colour, always
 * printed with the word. Raw evidence and assistant suggestions must never
 * look interchangeable, and no state may rely on colour alone — which is why
 * the status treatments below come paired with text labels wherever they are
 * used.
 *
 * Every pair of text and background colour the app draws is listed in
 * `textPairs` at the bottom, and `__tests__/contrast.test.ts` holds each one
 * to 4.5:1 (3:1 for text 24 px and up).
 */

import type { TextStyle } from 'react-native';

import type { StoredMealType } from '../domain/enums';

export const colors = {
  /** The ground behind every screen. */
  background: '#F4F4F2',
  /** Cards, sheets and the composer. */
  surface: '#FFFFFF',
  /** Inputs. The same white as a card; kept as its own name for the inputs. */
  surfaceStrong: '#FFFFFF',
  /** Surface 2: secondary grouping, pressed states, quiet panels. */
  surfaceMuted: '#EDEDEA',
  /** Ink. */
  text: '#17181B',
  /** Muted text: dates, hints, labels. */
  textMuted: '#5B5E64',
  border: '#E0E0DC',
  /** Primary buttons and selected chips: near-black, with white on it. */
  primary: '#1D1E22',
  primaryPressed: '#3A3C42',
  /** Secondary buttons and soft selected states. A shade under surface 2. */
  primarySoft: '#EAEAE6',
  onPrimary: '#FFFFFF',
  /** Paprika: links and small actions. Never a fill behind words. */
  accent: '#B83F27',
  accentPressed: '#96321E',
  /** The stars in a rating. Always beside the number, which is in ink. */
  star: '#C98A00',
  /** The Last time and Next time panel. */
  lastTimeSurface: '#FBEDE8',
  lastTimeBorder: '#F1D3C9',
  danger: '#A1271B',
  dangerSoft: '#FBE9E6',
  testBadge: '#B3261E',
  onTestBadge: '#FFFFFF',
  testSurface: '#FDECEA',
  testBorder: '#E8A9A3',
  /**
   * The oven card's quiet grey, and the ink on it. The oven is the quiet
   * reading of the two — it is the setting, not the thing being cooked — so it
   * is grey, and amber stays for the reading that matters most, the internal
   * one. Retuned for scheme A: a cool grey that sits on the white cards.
   */
  readingOvenSurface: '#EEEEEB',
  readingOvenBorder: '#DCDCD7',
  readingOvenText: '#45474D',
  /** The internal card: amber, retuned to sit beside paprika rather than sage. */
  readingInternalSurface: '#FBF0D9',
  readingInternalBorder: '#EED9A8',
  readingInternalText: '#7A5200',
  /** The dimmed screen behind a sheet. Ink at 40 %. */
  scrim: 'rgba(23, 24, 27, 0.4)',
} as const;

/**
 * Evidence and status treatments: a background and a foreground for each
 * meaning. Always rendered with the meaning spelled out next to the colour.
 * Retuned for scheme A; the meanings are v1's.
 */
export const statusTreatments = {
  observed: { background: '#E3F0E8', foreground: '#1F5A3A' },
  inference: { background: '#FBF0D9', foreground: '#6E4A00' },
  knowledge: { background: '#E4EAF5', foreground: '#2C4A75' },
  proposed: { background: '#F1EEE6', foreground: '#5C4D33' },
  approved: { background: '#E3F0E8', foreground: '#1F5A3A' },
  rejected: { background: '#FBE9E6', foreground: '#8A2A1C' },
  imported: { background: '#EEEAF6', foreground: '#4F4370' },
  /** An open cook, still being cooked. Neutral: it is a state, not a verdict. */
  open: { background: '#ECECE8', foreground: '#3F4147' },
  /** A reviewed cook. Shares the approved treatment: the cook has sat down with it. */
  reviewed: { background: '#E3F0E8', foreground: '#1F5A3A' },
} as const;

export type StatusTreatment = keyof typeof statusTreatments;

/**
 * Each meal type's label: a background and text colour for the small label
 * above a title, and a dot for the chips. The word is always printed; the
 * colour is never the only signal (scheme A, 30 October 2026).
 */
export const mealTypeColors: Readonly<
  Record<StoredMealType, { readonly background: string; readonly text: string; readonly dot: string }>
> = {
  breakfast: { background: '#FCEFD4', text: '#714900', dot: '#D79A1E' },
  lunch_dinner: { background: '#E2EAFA', text: '#1E4691', dot: '#3D6FD1' },
  dessert: { background: '#F9E0EA', text: '#8E2156', dot: '#C9417F' },
  snack: { background: '#DDF1EA', text: '#155C46', dot: '#2E9B76' },
};

/**
 * How a temperature reading is painted, by what it was taken of.
 *
 * Both treatments come with a word — "Oven", "Internal" — printed on the card
 * by `TimelineEvent`, because the baseline forbids colour as the only signal
 * and two readings that differ only in hue would be exactly that. A reading
 * that does not say what it was taken of is not in here: it is drawn neutral,
 * on the plain surface with the border token and ordinary text, so amber means
 * Internal and grey means Oven and nothing else.
 *
 * The text colour is `ink` and not `value`, which is the name it wants. A
 * member called `value` read inside a JSX inline style is what a Reanimated
 * shared value looks like, so Reanimated's Babel plugin rewrites every such
 * style to `console.warn(require('react-native-reanimated')…)` — which pulls a
 * whole animation library into a screen that does not animate, and warns about
 * a mistake nobody made. Avoiding the name is cheaper than explaining it twice.
 */
export const readingTreatments = {
  oven: {
    surface: colors.readingOvenSurface,
    border: colors.readingOvenBorder,
    ink: colors.readingOvenText,
  },
  internal: {
    surface: colors.readingInternalSurface,
    border: colors.readingInternalBorder,
    ink: colors.readingInternalText,
  },
} as const;

export type ReadingTreatment = keyof typeof readingTreatments;

/** The baseline spacing scale, by name rather than by number. */
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

export const radius = {
  /** Inputs and buttons. */
  control: 14,
  /** Standard cards. */
  card: 18,
  /** Hero cards. */
  hero: 24,
  /** Chips and pills. */
  pill: 999,
  /** Photos in the timeline. */
  photo: 16,
} as const;

/** Android/Material minimum. Applied to every interactive control. */
export const MIN_TOUCH_TARGET = 48;

/** The one main action on a screen is deliberately larger than the minimum. */
export const PRIMARY_TOUCH_TARGET = 64;

/**
 * The type scale. Each style carries its size, line height and weight together
 * so a screen cannot pair a display size with a body line height by accident.
 * The face is Plus Jakarta Sans, bundled in the app (`src/theme/fonts.ts`);
 * `AppText` picks the file for each weight, and falls back to the system sans
 * with the same weights if the fonts could not be loaded.
 */
export const type = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '800' },
  screenTitle: { fontSize: 24, lineHeight: 31, fontWeight: '700' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  button: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  temperature: { fontSize: 28, lineHeight: 35, fontWeight: '700' },
} as const satisfies Record<string, Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>>;

export type TypeStyle = keyof typeof type;

/** Text of this size or larger may be held to 3:1 rather than 4.5:1. */
export const LARGE_TEXT_SIZE = 24;

/**
 * Every text colour the app draws, on every background it draws it on.
 *
 * `size` is the smallest size that pair is used at, so a pair used only for a
 * large title is held to the large-text ratio and every other to 4.5:1. The
 * stars are not here: a star is always next to its number, which is printed
 * in ink, so the colour is decoration and not the text that carries the
 * meaning (see `DESIGN_BASELINE_V2.md`).
 */
export type TextPair = {
  readonly name: string;
  readonly text: string;
  readonly background: string;
  readonly size: number;
};

const SMALL = type.caption.fontSize;

function onEach(
  name: string,
  text: string,
  backgrounds: Readonly<Record<string, string>>,
  size = SMALL,
): TextPair[] {
  return Object.entries(backgrounds).map(([where, background]) => ({
    name: `${name} on ${where}`,
    text,
    background,
    size,
  }));
}

const GROUNDS = {
  background: colors.background,
  surface: colors.surface,
  surfaceMuted: colors.surfaceMuted,
  primarySoft: colors.primarySoft,
  lastTimeSurface: colors.lastTimeSurface,
} as const;

export const textPairs: readonly TextPair[] = [
  ...onEach('text', colors.text, { ...GROUNDS, dangerSoft: colors.dangerSoft, testSurface: colors.testSurface }),
  ...onEach('textMuted', colors.textMuted, { ...GROUNDS, dangerSoft: colors.dangerSoft }),
  ...onEach('accent', colors.accent, GROUNDS),
  ...onEach('danger', colors.danger, { ...GROUNDS, dangerSoft: colors.dangerSoft }),
  ...onEach('onPrimary', colors.onPrimary, {
    primary: colors.primary,
    primaryPressed: colors.primaryPressed,
    // The Undo bar is ink with white words on it.
    text: colors.text,
  }),
  ...onEach('onTestBadge', colors.onTestBadge, { testBadge: colors.testBadge }),
  // The ink of the Undo bar's own button, a secondary button on the ink bar.
  ...onEach('text', colors.text, { 'secondary on the Undo bar': colors.primarySoft }),
  ...Object.entries(statusTreatments).map(([meaning, treatment]) => ({
    name: `status ${meaning}`,
    text: treatment.foreground,
    background: treatment.background,
    size: type.label.fontSize,
  })),
  ...Object.entries(mealTypeColors).map(([mealType, treatment]) => ({
    name: `meal type ${mealType}`,
    text: treatment.text,
    background: treatment.background,
    size: SMALL,
  })),
  ...Object.entries(readingTreatments).flatMap(([kind, treatment]) => [
    { name: `reading ${kind} ink`, text: treatment.ink, background: treatment.surface, size: SMALL },
    { name: `reading ${kind} text`, text: colors.text, background: treatment.surface, size: SMALL },
    { name: `reading ${kind} muted`, text: colors.textMuted, background: treatment.surface, size: SMALL },
  ]),
];
