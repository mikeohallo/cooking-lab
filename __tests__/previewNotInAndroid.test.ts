/**
 * Nothing of the web preview reaches the Android build (0.4.0, part 7).
 *
 * Metro bundles a `.web.ts` or `.web.tsx` file for the web only, and turns
 * `Platform.OS` into a constant in each bundle, so a `require` behind
 * `Platform.OS === 'web'` is dropped from an Android bundle. This holds the
 * code to that shape:
 *
 * - every file in `src/preview/` is a web file;
 * - the web storage runtime is a web file, beside the phone's own;
 * - outside those, the preview is reached from exactly two places — the root
 *   layout and the type scale — each by one `require` inside
 *   `if (Platform.OS === 'web')` or `Platform.OS === 'web' ? … : …`;
 * - nothing imports the preview by a plain `import`.
 *
 * The run report for part 7 also exports an Android bundle and searches it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..');

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      found.push(path);
    }
  }
  return found;
}

const posix = (path: string) => relative(ROOT, path).split(sep).join('/');
const isWebFile = (path: string) => /\.web\.(ts|tsx)$/.test(path);

const SHARED = [...filesUnder(join(ROOT, 'src')), ...filesUnder(join(ROOT, 'app'))].filter(
  (path) => !isWebFile(path),
);

/** Where shared code may reach the preview, and nowhere else. */
const GUARDED_ENTRIES: Readonly<Record<string, string>> = {
  'app/_layout.tsx': '../src/preview/PreviewShell.web',
  'src/theme/tokens.ts': '../preview/typeScale.web',
};

describe('the web preview stays out of the Android build', () => {
  it('keeps every file of the preview a web file', () => {
    const files = filesUnder(join(ROOT, 'src', 'preview'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(posix(file)).toMatch(/\.web\.(ts|tsx)$/);
    }
  });

  it('keeps the browser’s storage beside the phone’s, as a web file', () => {
    expect(statSync(join(ROOT, 'src', 'data', 'runtime.web.ts')).isFile()).toBe(true);
    expect(statSync(join(ROOT, 'src', 'data', 'runtime.ts')).isFile()).toBe(true);
    // The phone's runtime knows nothing of the preview.
    expect(readFileSync(join(ROOT, 'src', 'data', 'runtime.ts'), 'utf8')).not.toMatch(/preview/i);
  });

  it('reaches the preview from shared code only behind Platform.OS === "web"', () => {
    const reaching = SHARED.filter((file) => /preview\//.test(readFileSync(file, 'utf8'))).map(posix).sort();
    expect(reaching).toEqual(Object.keys(GUARDED_ENTRIES).sort());
    for (const [file, target] of Object.entries(GUARDED_ENTRIES)) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      // Code lines only: a comment may name the folder.
      const mentions = source
        .split('\n')
        .filter((line) => line.includes('preview/') && !/^\s*(\*|\/\/|\/\*)/.test(line));
      expect(mentions).toHaveLength(1);
      expect(mentions[0]).toContain(`require('${target}')`);
      // The require sits inside a web check that opens no more than three lines above it.
      const lines = source.split('\n');
      const at = lines.findIndex((line) => line.includes(`require('${target}')`));
      const before = lines.slice(Math.max(0, at - 3), at + 1).join('\n');
      expect(before).toMatch(/Platform\.OS === 'web'/);
    }
  });

  it('never imports the preview with a plain import', () => {
    for (const file of SHARED) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/import[^;]*from '[^']*preview\//);
    }
  });
});
