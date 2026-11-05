/**
 * The type scale, one step smaller app-wide (0.4.1), exactly as Mike approved
 * it on 3 November 2026. Size / line height; weights and letter spacing are
 * unchanged from 0.4.0, and so are the drawn sizes of buttons (40), chips
 * (32), icon circles, the spacing steps and the 48 dp touch area.
 */
import { size, space, type } from '../src/theme/tokens';

const SCALE: Readonly<Record<keyof typeof type, readonly [number, number]>> = {
  appTitle: [24, 30],
  appTitleInner: [22, 28],
  title: [20, 26],
  titleCompact: [18, 24],
  heading: [16, 22],
  cardTitle: [15, 20],
  nextTime: [15, 22],
  nextTimeLarge: [16, 23],
  body: [15, 21],
  bodyStrong: [15, 21],
  secondary: [12, 16],
  overline: [11, 16],
  label: [11, 16],
  chip: [12, 16],
  button: [13, 18],
  buttonMain: [14, 20],
  readingNumber: [20, 24],
};

/** 0.4.0's weights and tracking, which 0.4.1 keeps. */
const UNCHANGED: Readonly<Record<keyof typeof type, readonly [string, number | undefined]>> = {
  appTitle: ['800', -0.6],
  appTitleInner: ['800', -0.6],
  title: ['800', -0.5],
  titleCompact: ['800', -0.4],
  heading: ['700', -0.2],
  cardTitle: ['700', -0.2],
  nextTime: ['600', undefined],
  nextTimeLarge: ['600', undefined],
  body: ['400', undefined],
  bodyStrong: ['600', undefined],
  secondary: ['400', undefined],
  overline: ['700', 0.8],
  label: ['600', undefined],
  chip: ['600', undefined],
  button: ['600', undefined],
  buttonMain: ['700', undefined],
  readingNumber: ['700', -0.5],
};

describe('the 0.4.1 type scale', () => {
  it('has exactly the listed styles', () => {
    expect(Object.keys(type).sort()).toEqual(Object.keys(SCALE).sort());
  });

  it.each(Object.entries(SCALE))('%s is %j', (name, [fontSize, lineHeight]) => {
    const style = type[name as keyof typeof type];
    expect(style.fontSize).toBe(fontSize);
    expect(style.lineHeight).toBe(lineHeight);
  });

  it.each(Object.entries(UNCHANGED))('%s keeps its weight and letter spacing', (name, [weight, tracking]) => {
    const style = type[name as keyof typeof type] as { fontWeight: string; letterSpacing?: number };
    expect(style.fontWeight).toBe(weight);
    expect(style.letterSpacing).toBe(tracking);
  });

  it('leaves the drawn sizes, spacing and touch area alone', () => {
    expect(size.button).toBe(40);
    expect(size.chip).toBe(32);
    expect(size.iconCircle).toBe(32);
    expect(size.iconButton).toBe(40);
    expect(size.targetMin).toBe(48);
    expect(space).toEqual({ xxs: 4, xs: 8, sm: 12, md: 16, ml: 20, lg: 24, xl: 32, xxl: 40 });
  });
});
