import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

import {
  COOK_EVENT_KINDS,
  COOK_STATUSES,
  CONFIDENCE_LEVELS,
  CREATED_BY_VALUES,
  FINDING_CLASSES,
  IMPORT_BATCH_STATUSES,
  PROPOSAL_STATUSES,
  PROVENANCES,
  STORED_READING_KINDS,
  TAG_KINDS,
} from '../src/domain/enums';
import { SYNTHETIC_ID_PREFIX, syntheticIds, syntheticSnapshot } from './fixtures/syntheticData';

/**
 * Synthetic data must not be able to reach the app.
 *
 * The rest of the suite proves the fixture is *valid*. This file proves it is
 * *unreachable*: nothing the bundler compiles imports it, and nothing about it
 * could be mistaken for a real kitchen's history if it somehow appeared.
 *
 * It also proves the reverse direction — that keeping the fixture separate has
 * not been paid for by putting a fixture-shaped value into the product model.
 * Every value in the fixture is one the shipping app may itself write.
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

  it('is named nowhere in the product source', () => {
    const offenders = bundledFiles.filter((file) =>
      /synthetic/i.test(readFileSync(file, 'utf8')),
    );

    expect(offenders.map((file) => relative(REPO_ROOT, file))).toEqual([]);
  });
});

describe('the fixture announces itself by its identifiers', () => {
  it('prefixes every identifier', () => {
    const ids = syntheticIds();

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.startsWith(SYNTHETIC_ID_PREFIX)).toBe(true);
    }
  });

  it('never has the app generate an id that would collide with one', () => {
    // Nothing in the product writes this prefix; it exists only here.
    expect(SYNTHETIC_ID_PREFIX).toBe('synthetic-');
  });
});

describe('the fixture uses the production vocabularies and no others', () => {
  const snapshot = syntheticSnapshot();

  it('uses only real cook statuses and provenances', () => {
    for (const cook of snapshot.cooks) {
      expect(COOK_STATUSES).toContain(cook.status);
      expect(PROVENANCES).toContain(cook.provenance);
    }
  });

  it('uses only real event kinds', () => {
    for (const event of snapshot.cookEvents) {
      expect(COOK_EVENT_KINDS).toContain(event.kind);
    }
  });

  it('uses only real reading kinds, and never writes "none" down', () => {
    for (const event of snapshot.cookEvents) {
      if (event.kind !== 'temp' || event.meta === null || typeof event.meta !== 'object') {
        continue;
      }
      const kind = (event.meta as Record<string, unknown>).readingKind;
      if (kind !== undefined) {
        expect(STORED_READING_KINDS).toContain(kind);
      }
    }
  });

  it('holds a tag with no kind, and one with each of the four', () => {
    // The fixture has to cover what the schema now allows, or the backup round
    // trip proves nothing about the thing version 2 changed.
    expect(snapshot.tags.filter((tag) => tag.kind === null).length).toBeGreaterThan(0);
    for (const kind of TAG_KINDS) {
      expect(snapshot.tags.some((tag) => tag.kind === kind)).toBe(true);
    }
  });

  it('uses only real finding classes, confidences, statuses and authors', () => {
    for (const finding of snapshot.findings) {
      expect(FINDING_CLASSES).toContain(finding.class);
      expect(PROPOSAL_STATUSES).toContain(finding.status);
      expect(CREATED_BY_VALUES).toContain(finding.createdBy);
      expect(PROVENANCES).toContain(finding.provenance);
      if (finding.confidence !== null) {
        expect(CONFIDENCE_LEVELS).toContain(finding.confidence);
      }
    }
  });

  it('uses only real tag kinds and import statuses', () => {
    for (const tag of snapshot.tags) {
      // A tag may have no kind at all from schema version 2 on, and most do
      // not. One that has a kind must still have one of the four.
      if (tag.kind !== null) {
        expect(TAG_KINDS).toContain(tag.kind);
      }
    }
    for (const batch of snapshot.importBatches) {
      expect(IMPORT_BATCH_STATUSES).toContain(batch.status);
    }
  });

  it('needed no fixture-only value added to the product model to be safe', () => {
    // A `synthetic_fixture` origin, a `test` provenance or a `sample` status
    // would have to be handled, shown and migrated forever. The identifiers do
    // the job instead.
    const vocabularies = [
      ...COOK_STATUSES,
      ...PROVENANCES,
      ...COOK_EVENT_KINDS,
      ...FINDING_CLASSES,
      ...CONFIDENCE_LEVELS,
      ...PROPOSAL_STATUSES,
      ...CREATED_BY_VALUES,
      ...TAG_KINDS,
      ...IMPORT_BATCH_STATUSES,
    ];

    for (const value of vocabularies) {
      expect(value).not.toMatch(/synthetic|fixture|sample|test|dummy|seed/i);
    }
  });
});
