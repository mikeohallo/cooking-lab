/**
 * No colour, font size, line height or corner radius is typed by hand into a
 * screen or a component (0.4.0). They come from `src/theme/tokens.ts`, so the
 * look is decided in one place and dark theme cannot be missed.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

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

const files = FOLDERS.flatMap((folder) => filesUnder(join(ROOT, folder)));

/** Drops comments, so prose about a colour does not count. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const RULES: readonly [string, RegExp][] = [
  ['a hex colour', /#[0-9a-fA-F]{3,8}\b/],
  ['an rgb() colour', /\brgba?\s*\(/],
  ['a named colour', /['"](white|black|red|grey|gray)['"]/],
  ['a font size', /fontSize:\s*\d/],
  ['a line height', /lineHeight:\s*\d/],
  ['a corner radius', /[Rr]adius:\s*\d/],
];

describe('no hand-typed styles in screens and components', () => {
  it('finds the files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(RULES)('has no %s', (_what, pattern) => {
    const offenders = files.filter((file) => pattern.test(code(readFileSync(file, 'utf8'))));
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });

  it('would catch one', () => {
    expect(RULES[0]![1].test(code("const x = { color: '#00293b' };"))).toBe(true);
    expect(RULES[0]![1].test(code('// #00293b in a comment'))).toBe(false);
  });
});
