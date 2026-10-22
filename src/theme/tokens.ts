/**
 * Design tokens for Cooking Lab.
 *
 * These are the controlled values from `build-control/design/DESIGN_BASELINE_V1.md`
 * ("Calm Modern Companion"). Screens and components style themselves from
 * these and from nothing else, so that the look of the app is decided in one
 * place and a hue change is a token change rather than a hunt through screens.
 *
 * The baseline's own words for the palette: warm stone background, deep muted
 * sage as the one action colour, amber kept for temperature and inference,
 * ink text rather than black. Raw evidence and assistant suggestions must never
 * look interchangeable, and no state may rely on colour alone — which is why
 * the status treatments below come paired with text labels wherever they are
 * used.
 */

import type { TextStyle } from 'react-native';

export const colors = {
  background: '#F7F4EE',
  surface: '#FFFCF7',
  surfaceStrong: '#FFFFFF',
  surfaceMuted: '#EEF0E8',
  text: '#20251F',
  textMuted: '#687064',
  border: '#D9DED2',
  primary: '#526A55',
  primaryPressed: '#435747',
  primarySoft: '#E5EDE4',
  onPrimary: '#FFFFFF',
  accent: '#D39542',
  accentPressed: '#B87829',
  accentSoft: '#F6E8D3',
  danger: '#9B4D47',
  dangerSoft: '#F5E7E5',
  testBadge: '#B3261E',
  onTestBadge: '#FFFFFF',
  testSurface: '#FDECEA',
  testBorder: '#E8A9A3',
  /**
   * The oven card's muted grey, and the ink on it.
   *
   * Added for the reading kinds, inside the baseline palette rather than beside
   * it: a warm grey drawn from the existing stone and sage neighbours, not a
   * new hue. The oven is the quiet reading of the two — it is the setting, not
   * the thing being cooked — so it is grey, and amber stays for the reading
   * that matters most, the internal one.
   */
  readingOvenSurface: '#ECEDE9',
  readingOvenBorder: '#DBDFD5',
  readingOvenText: '#4A5247',
  /** The border for the internal card, whose surface is the palette's amber. */
  readingInternalBorder: '#EBD5B2',
} as const;

/**
 * Evidence and status treatments: a background and a foreground for each
 * meaning. Always rendered with the meaning spelled out next to the colour.
 */
export const statusTreatments = {
  observed: { background: '#E5EFE6', foreground: '#35543B' },
  inference: { background: '#F7E8CF', foreground: '#735019' },
  knowledge: { background: '#E8EDF3', foreground: '#3F556A' },
  proposed: { background: '#F4EEE2', foreground: '#6A593D' },
  approved: { background: '#E5EFE6', foreground: '#35543B' },
  rejected: { background: '#F5E7E5', foreground: '#7A3F39' },
  imported: { background: '#EEEAF4', foreground: '#5C4F70' },
  /** An open cook, still being cooked. Neutral: it is a state, not a verdict. */
  open: { background: '#F4EEE2', foreground: '#6A593D' },
  /** A reviewed cook. Shares the approved treatment: the cook has sat down with it. */
  reviewed: { background: '#E5EFE6', foreground: '#35543B' },
} as const;

export type StatusTreatment = keyof typeof statusTreatments;

/**
 * How a temperature reading is painted, by what it was taken of.
 *
 * Both treatments come with a word — "Oven", "Internal" — printed on the card
 * by `TimelineEvent`, because the baseline forbids colour as the only signal
 * and two readings that differ only in hue would be exactly that. A reading
 * that does not say what it was taken of is not in here: it keeps the card it
 * has always had.
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
    surface: colors.accentSoft,
    border: colors.readingInternalBorder,
    ink: colors.accentPressed,
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
 * Font family is the platform's own sans; no custom font is loaded.
 */
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  screenTitle: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  temperature: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
} as const satisfies Record<string, Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>>;

export type TypeStyle = keyof typeof type;
