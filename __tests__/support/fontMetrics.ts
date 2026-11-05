/**
 * How wide a line of words is drawn in the app's own font (0.4.1).
 *
 * Jest has no layout engine and no text shaper, so this reads the advance
 * widths straight from the bundled Plus Jakarta Sans file: the font's own
 * numbers, not a guess. Kerning is left out, which only ever makes a line a
 * touch wider than drawn, so a fit found here also fits on the phone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

type Metrics = { readonly unitsPerEm: number; advance(codePoint: number): number };

const cache = new Map<string, Metrics>();

/** The font file for one weight, e.g. `600SemiBold`. */
function fontPath(weight: string): string {
  return join(
    __dirname,
    '..',
    '..',
    'node_modules',
    '@expo-google-fonts',
    'plus-jakarta-sans',
    weight,
    `PlusJakartaSans_${weight}.ttf`,
  );
}

function read(weight: string): Metrics {
  const font = readFileSync(fontPath(weight));
  const tables = new Map<string, number>();
  const count = font.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    tables.set(font.toString('latin1', at, at + 4), font.readUInt32BE(at + 8));
  }
  const table = (name: string) => {
    const at = tables.get(name);
    if (at === undefined) {
      throw new Error(`No ${name} table in ${weight}`);
    }
    return at;
  };
  const unitsPerEm = font.readUInt16BE(table('head') + 18);
  const metricsCount = font.readUInt16BE(table('hhea') + 34);
  const hmtx = table('hmtx');

  // The Unicode cmap, format 4 (the Basic Multilingual Plane).
  const cmap = table('cmap');
  let format4 = -1;
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i += 1) {
    const record = cmap + 4 + i * 8;
    const offset = cmap + font.readUInt32BE(record + 4);
    if (font.readUInt16BE(offset) === 4) {
      format4 = offset;
      break;
    }
  }
  if (format4 < 0) {
    throw new Error(`No format 4 cmap in ${weight}`);
  }
  const segments = font.readUInt16BE(format4 + 6) / 2;
  const ends = format4 + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;

  const glyphOf = (code: number): number => {
    for (let s = 0; s < segments; s += 1) {
      if (code > font.readUInt16BE(ends + s * 2)) {
        continue;
      }
      const start = font.readUInt16BE(starts + s * 2);
      if (code < start) {
        return 0;
      }
      const delta = font.readInt16BE(deltas + s * 2);
      const rangeAt = ranges + s * 2;
      const range = font.readUInt16BE(rangeAt);
      if (range === 0) {
        return (code + delta) & 0xffff;
      }
      const glyph = font.readUInt16BE(rangeAt + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  return {
    unitsPerEm,
    advance(codePoint) {
      const glyph = glyphOf(codePoint);
      const index = Math.min(glyph, metricsCount - 1);
      return font.readUInt16BE(hmtx + index * 4);
    },
  };
}

/** The drawn width of `words` at `fontSize` px, plus `letterSpacing` after each character. */
export function textWidth(words: string, fontSize: number, weight = '600SemiBold', letterSpacing = 0): number {
  let metrics = cache.get(weight);
  if (metrics === undefined) {
    metrics = read(weight);
    cache.set(weight, metrics);
  }
  let units = 0;
  for (const char of words) {
    units += metrics.advance(char.codePointAt(0)!);
  }
  return (units / metrics.unitsPerEm) * fontSize + letterSpacing * [...words].length;
}
