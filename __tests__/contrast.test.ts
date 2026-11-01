/**
 * Every colour pair the app draws is readable, in light and in dark (0.4.0).
 *
 * WCAG's contrast ratio: text at 4.5:1 (3:1 at 24 px and up); control edges,
 * focus rings and icons that carry meaning at 3:1. The pairs come from the
 * token notes and are listed in `src/theme/tokens.ts` (`textPairs`,
 * `controlPairs`); this file also checks the lists cover every meal, status
 * and reading, so a new one cannot be added unchecked.
 */
import {
  LARGE_TEXT_SIZE,
  THEME_NAMES,
  controlPairs,
  mealColorRole,
  palettes,
  readingRoles,
  statusRoles,
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

const textCases = THEME_NAMES.flatMap((theme) =>
  textPairs.map((pair) => [theme, pair.name, pair] as const),
);
const controlCases = THEME_NAMES.flatMap((theme) =>
  controlPairs.map((pair) => [theme, pair.name, pair] as const),
);

describe('contrast', () => {
  it('computes the known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThan(4.5);
  });

  it.each(textCases)('%s: text %s is readable', (theme, _name, pair) => {
    const palette = palettes[theme];
    const needed = pair.size >= LARGE_TEXT_SIZE ? 3 : 4.5;
    expect(contrastRatio(palette[pair.fg], palette[pair.bg])).toBeGreaterThanOrEqual(needed);
  });

  it.each(controlCases)('%s: control or icon %s holds 3:1', (theme, _name, pair) => {
    const palette = palettes[theme];
    expect(contrastRatio(palette[pair.fg], palette[pair.bg])).toBeGreaterThanOrEqual(3);
  });

  it('has the same roles in both themes', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });

  it('lists every meal, status and reading', () => {
    for (const role of Object.values(mealColorRole)) {
      expect(textPairs).toContainEqual(expect.objectContaining({ fg: role, bg: 'surface' }));
      expect(controlPairs).toContainEqual(expect.objectContaining({ fg: role, bg: 'surfaceRaised' }));
    }
    for (const roles of Object.values(statusRoles)) {
      expect(textPairs).toContainEqual(
        expect.objectContaining({ fg: roles.foreground, bg: roles.background }),
      );
    }
    for (const roles of Object.values(readingRoles)) {
      expect(textPairs).toContainEqual(expect.objectContaining({ fg: roles.ink, bg: roles.tint }));
    }
  });

  it('gives Side its own colour, and five meals five colours', () => {
    expect(mealColorRole.side).toBe('mealSide');
    for (const theme of THEME_NAMES) {
      const values = Object.values(mealColorRole).map((role) => palettes[theme][role]);
      expect(new Set(values).size).toBe(5);
    }
  });

  it('keeps the design system values as approved', () => {
    expect(palettes.light.page).toBe('#fbfaf6');
    expect(palettes.light.primary).toBe('#b85618');
    expect(palettes.dark.primary).toBe('#f08a4b');
    expect(palettes.light.mealSide).toBe('#726000');
    expect(palettes.dark.mealSide).toBe('#dcc65a');
    expect(palettes.light.ratingBadge).toBe(palettes.light.readingOven);
    expect(palettes.dark.ratingBadge).toBe(palettes.dark.readingOven);
  });

  it('has none of scheme A left', () => {
    const names = Object.keys(palettes.light);
    for (const old of [
      'background',
      'text',
      'textMuted',
      'accent',
      'primarySoft',
      'surfaceMuted',
      'border',
      'lastTimeSurface',
    ]) {
      expect(names).not.toContain(old);
    }
  });
});
