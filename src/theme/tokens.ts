/**
 * Minimal styling tokens. Deliberately not a design system: just enough shared
 * values to keep the Milestone 0 shell readable and consistent.
 */

export const colors = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  border: '#E4DCD2',
  text: '#1E1A15',
  textMuted: '#5B5349',
  accent: '#8A3B12',
  accentPressed: '#6C2D0D',
  onAccent: '#FFFFFF',
  testBadge: '#B3261E',
  onTestBadge: '#FFFFFF',
  testSurface: '#FDECEA',
  testBorder: '#E8A9A3',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** Android/Material minimum. Applied to every interactive control. */
export const MIN_TOUCH_TARGET = 48;

/** Primary navigation controls are deliberately larger than the minimum. */
export const PRIMARY_TOUCH_TARGET = 64;

export const fontSize = {
  caption: 13,
  body: 16,
  bodyLarge: 18,
  title: 22,
  display: 28,
} as const;
