import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

import { IMPORT_BATCH_ORIGINS, PRODUCTION_IMPORT_ORIGIN } from '../src/domain/enums';
import { SYNTHETIC_ID_PREFIX, syntheticIds, syntheticSnapshot } from './fixtures/syntheticData';

/**
 * Synthetic data must not be able to reach the app.
 *
 * The rest of the suite proves the fixture is *valid*. This file proves it is
 * *unreachable*: nothing the bundler compiles imports it, and nothing about it
 * could be mistaken for a real kitchen's history if it somehow appeared.
 */

const REPO_ROOT = resolve(__dirname, '..');
const BUNDLED_DIRECTORIES = ['app', 'src'];

/** Module specifiers a bundled file may never import. */
const FORBIDDEN_SPECIFIER = /(^|\/)(__tests__|__mocks__|fixtures?)(\/|$)|synthetic/i;

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

function sourceFilesUnder(directory: string): readonly string[] {
  const absolute = join(REPO_ROOT, directory);
  const found: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const entryPath = join(current, entry);
      if (statSync(entryPath).isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
        found.push(entryPath);
      }
    }
  };

  walk(absolute);
  return found;
}

function importSpecifiers(contents: string): readonly string[] {
  const specifiers: string[] = [];
  let match = IMPORT_SPECIFIER.exec(contents);
  while (match !== null) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
    match = IMPORT_SPECIFIER.exec(contents);
  }
  IMPORT_SPECIFIER.lastIndex = 0;
  return specifiers;
}

describe('the fixture is outside the app bundle', () => {
  const bundledFiles = BUNDLED_DIRECTORIES.flatMap(sourceFilesUnder);

  it('finds the source files it claims to be checking', () => {
    // Guards against the whole suite passing because the walk found nothing.
    expect(bundledFiles.length).toBeGreaterThan(5);
  });

  it('has no test, mock or fixture module anywhere under app/ or src/', () => {
    const offenders = bundledFiles
      .map((file) => relative(REPO_ROOT, file).split(sep).join('/'))
      .filter((file) => FORBIDDEN_SPECIFIER.test(file));

    expect(offenders).toEqual([]);
  });

  it('is imported by nothing the bundler compiles', () => {
    const offenders: string[] = [];

    for (const file of bundledFiles) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (FORBIDDEN_SPECIFIER.test(specifier)) {
          offenders.push(`${relative(REPO_ROOT, file)} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('detects a forbidden import if one were added', () => {
    // The check above is only worth having if it would actually fire.
    expect(importSpecifiers("import { x } from './fixtures/syntheticData';")).toEqual([
      './fixtures/syntheticData',
    ]);
    expect(FORBIDDEN_SPECIFIER.test('./fixtures/syntheticData')).toBe(true);
    expect(FORBIDDEN_SPECIFIER.test('../../src/domain/entities')).toBe(false);
  });
});

describe('the fixture announces itself as synthetic', () => {
  const snapshot = syntheticSnapshot();

  it('prefixes every identifier', () => {
    const ids = syntheticIds();

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith(SYNTHETIC_ID_PREFIX)).toBe(true);
    }
  });

  it('records its import batch with an origin the shipping app cannot write', () => {
    expect(snapshot.importBatches.length).toBeGreaterThan(0);
    for (const batch of snapshot.importBatches) {
      expect(batch.origin).toBe('synthetic_fixture');
      expect(batch.origin).not.toBe(PRODUCTION_IMPORT_ORIGIN);
    }
  });

  it('keeps the two origins distinct in the vocabulary itself', () => {
    expect(IMPORT_BATCH_ORIGINS).toContain(PRODUCTION_IMPORT_ORIGIN);
    expect(IMPORT_BATCH_ORIGINS).toContain('synthetic_fixture');
    expect(PRODUCTION_IMPORT_ORIGIN).not.toBe('synthetic_fixture');
  });
});
