/**
 * No fixed widths for panes, columns, rows or buttons (0.4.0, part 5).
 *
 * Layouts adapt to the space they are given. Every width, minWidth and
 * maxWidth set in a screen or a component is one of:
 *   - a token on `widthTokens`' list: a touch target, a line length, a pane's
 *     minimum or maximum, or a mark drawn at its own size;
 *   - a share of the window, worked out by `paneWidths` (`panes.main`,
 *     `panes.side`), or '100%';
 *   - 'auto' or 0, which set nothing.
 * Anything else — a number, a sum, a token off the list — fails here.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { size, widthTokens } from '../src/theme/tokens';

const ROOT = join(__dirname, '..');
const FOLDERS = ['src/screens', 'src/components'];

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      return filesUnder(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Drops comments, so prose about a width does not count. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ALLOWED_TOKENS: ReadonlySet<string> = new Set(Object.values(widthTokens).flat());

/** A type annotation (`maxWidth: number;`), not a style. */
const TYPE_WORDS = /^(number|string|DimensionValue)\b/;

/** Is this right-hand side allowed as a width? */
export function allowedWidth(value: string): boolean {
  const v = value.trim();
  if (TYPE_WORDS.test(v)) {
    return true;
  }
  if (v === "'100%'" || v === "'auto'" || v === '0') {
    return true;
  }
  const token = /^size\.(\w+)$/.exec(v);
  if (token) {
    return ALLOWED_TOKENS.has(token[1]!);
  }
  // A share of the window, from `paneWidths`.
  if (/^panes\.(main|side)$/.test(v)) {
    return true;
  }
  if (/^pane === 'main' \? panes\.main : panes\.side$/.test(v)) {
    return true;
  }
  return false;
}

/** Every `width:`, `minWidth:` and `maxWidth:` in a source, with its value. */
export function widthsIn(source: string): { key: string; value: string }[] {
  const found: { key: string; value: string }[] = [];
  const pattern = /\b(width|minWidth|maxWidth)\??\s*:\s*([^,}\n]+)/g;
  for (const match of code(source).matchAll(pattern)) {
    found.push({ key: match[1]!, value: match[2]!.replace(/;$/, '').trim() });
  }
  return found;
}

const files = FOLDERS.flatMap((folder) => filesUnder(join(ROOT, folder)));

describe('no fixed widths in screens and components', () => {
  it('finds the files and the widths in them', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.flatMap((file) => widthsIn(readFileSync(file, 'utf8'))).length).toBeGreaterThan(20);
  });

  it('sets every width, minWidth and maxWidth from a limit token or a share of the window', () => {
    const offenders = files.flatMap((file) =>
      widthsIn(readFileSync(file, 'utf8'))
        .filter(({ value }) => !allowedWidth(value))
        .map(({ key, value }) => `${relative(ROOT, file)}: ${key}: ${value}`),
    );
    expect(offenders).toEqual([]);
  });

  it('lists only tokens that exist, and no pane width of the old kind', () => {
    for (const name of ALLOWED_TOKENS) {
      expect(size).toHaveProperty(name);
    }
    expect(size).not.toHaveProperty('paneList');
    expect(size).not.toHaveProperty('paneSide');
  });

  it('would catch a fixed pane, a sum, or a token off the list', () => {
    const caught = (line: string) => widthsIn(line).some(({ value }) => !allowedWidth(value));
    expect(caught('const s = { width: 400 };')).toBe(true);
    expect(caught('const s = { minWidth: size.targetMain + space.xl };')).toBe(true);
    expect(caught('const s = { maxWidth: 344 };')).toBe(true);
    expect(caught('const s = { width: size.photoCardH };')).toBe(true);
    expect(caught('<View style={{ width: fixed.width }} />')).toBe(true);
    expect(caught('const s = { width: size.targetMin };')).toBe(false);
    expect(caught('const s = { maxWidth: size.measure };')).toBe(false);
    expect(caught("const s = { width: '100%' };")).toBe(false);
    expect(caught('// width: 400 in a comment')).toBe(false);
  });
});
