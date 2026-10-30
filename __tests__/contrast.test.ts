/**
 * Every text and background pair in the palette is readable (scheme A, 0.3.0).
 *
 * WCAG's contrast ratio: 4.5:1 for ordinary text, 3:1 for text 24 px and up.
 * The pairs are the ones `src/theme/tokens.ts` lists in `textPairs`; this file
 * also checks that the list covers every status, meal type and reading
 * treatment, so a new one cannot be added without being checked.
 */
import {
  LARGE_TEXT_SIZE,
  colors,
  mealTypeColors,
  readingTreatments,
  statusTreatments,
  textPairs,
} from '../src/theme/tokens';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new Error(`Not a six-digit colour: ${hex}`);
  }
  const [r = 0, g = 0, b = 0] = match.slice(1, 4).map((part) => channel(parseInt(part, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('contrast', () => {
  it('computes the known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThan(4.5);
  });

  it.each(textPairs.map((pair) => [pair.name, pair] as const))('%s is readable', (_name, pair) => {
    const needed = pair.size >= LARGE_TEXT_SIZE ? 3 : 4.5;
    expect(contrastRatio(pair.text, pair.background)).toBeGreaterThanOrEqual(needed);
  });

  it('lists every status, meal type and reading treatment', () => {
    for (const treatment of Object.values(statusTreatments)) {
      expect(textPairs).toContainEqual(
        expect.objectContaining({ text: treatment.foreground, background: treatment.background }),
      );
    }
    for (const treatment of Object.values(mealTypeColors)) {
      expect(textPairs).toContainEqual(
        expect.objectContaining({ text: treatment.text, background: treatment.background }),
      );
    }
    for (const treatment of Object.values(readingTreatments)) {
      expect(textPairs).toContainEqual(
        expect.objectContaining({ text: treatment.ink, background: treatment.surface }),
      );
    }
  });

  it('holds ink, muted text and paprika to 4.5:1 on every ground', () => {
    for (const background of [
      colors.background,
      colors.surface,
      colors.surfaceMuted,
      colors.lastTimeSurface,
    ]) {
      for (const text of [colors.text, colors.textMuted, colors.accent]) {
        expect(textPairs).toContainEqual(expect.objectContaining({ text, background }));
      }
    }
  });

  it('keeps scheme A as picked', () => {
    expect(colors).toMatchObject({
      background: '#F4F4F2',
      surface: '#FFFFFF',
      surfaceMuted: '#EDEDEA',
      text: '#17181B',
      textMuted: '#5B5E64',
      border: '#E0E0DC',
      primary: '#1D1E22',
      onPrimary: '#FFFFFF',
      accent: '#B83F27',
      star: '#C98A00',
      lastTimeSurface: '#FBEDE8',
      lastTimeBorder: '#F1D3C9',
    });
    expect(mealTypeColors).toEqual({
      breakfast: { background: '#FCEFD4', text: '#714900', dot: '#D79A1E' },
      lunch_dinner: { background: '#E2EAFA', text: '#1E4691', dot: '#3D6FD1' },
      dessert: { background: '#F9E0EA', text: '#8E2156', dot: '#C9417F' },
      snack: { background: '#DDF1EA', text: '#155C46', dot: '#2E9B76' },
    });
  });

  // The stars are not text pairs: a star is always printed beside its number,
  // in ink, so the colour never carries the meaning. Pinned here so a change
  // to them is a deliberate one.
  it('keeps the stars beside a number rather than alone', () => {
    expect(textPairs.some((pair) => pair.text === colors.star)).toBe(false);
  });
});
