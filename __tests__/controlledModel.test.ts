import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

import type { Cook, CookEvent, Finding, Lesson } from '../src/domain/entities';
import { emptySnapshot } from '../src/domain/entities';
import * as enums from '../src/domain/enums';
import {
  CONFIDENCE_LEVELS,
  COOK_EVENT_KINDS,
  COOK_STATUSES,
  CREATED_BY_VALUES,
  FINDING_CLASSES,
  IMPORT_BATCH_STATUSES,
  PROPOSAL_STATUSES,
  PROVENANCES,
  TAG_KINDS,
  TEMPERATURE_UNIT,
  isConfidenceLevel,
  isCookEventKind,
  isCookStatus,
  isCreatedBy,
  isFindingClass,
  isImportBatchStatus,
  isProposalStatus,
  isProvenance,
  isTagKind,
} from '../src/domain/enums';
import type { EvidenceDecision } from '../src/domain/evidence';
import {
  applyFindingCandidate,
  applyLessonCandidate,
  createCook,
  isAllowed,
} from '../src/domain/evidence';

/**
 * The controlled product model, asserted value by value.
 *
 * Everything else in the suite tests behaviour. This file tests the model
 * itself: these are the vocabularies, these are the columns, and these are the
 * concepts that were tried, rejected and must not creep back in. A change to
 * any of it is a product decision, and this file is where an unauthorised one
 * stops.
 */

const REPO_ROOT = resolve(__dirname, '..');

function productSourceFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const entryPath = join(current, entry);
      if (statSync(entryPath).isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entry)) {
        found.push(entryPath);
      }
    }
  };
  walk(join(REPO_ROOT, 'src'));
  walk(join(REPO_ROOT, 'app'));
  return found;
}

describe('the exact vocabularies', () => {
  it('has two cook statuses', () => {
    expect([...COOK_STATUSES]).toEqual(['open', 'reviewed']);
  });

  it('has two provenances, and neither of them names an author', () => {
    expect([...PROVENANCES]).toEqual(['live', 'imported']);
    expect(PROVENANCES).not.toContain('user');
    expect(PROVENANCES).not.toContain('ai');
  });

  it('has five event kinds', () => {
    expect([...COOK_EVENT_KINDS]).toEqual([
      'user_note',
      'assistant_msg',
      'temp',
      'photo',
      'plan',
    ]);
  });

  it('measures temperature in one unit', () => {
    expect(TEMPERATURE_UNIT).toBe('celsius');
  });

  it('has three finding classes', () => {
    expect([...FINDING_CLASSES]).toEqual(['observed', 'inference', 'knowledge']);
  });

  it('has three confidence levels', () => {
    expect([...CONFIDENCE_LEVELS]).toEqual(['low', 'medium', 'high']);
  });

  it('has three proposal statuses', () => {
    expect([...PROPOSAL_STATUSES]).toEqual(['proposed', 'approved', 'rejected']);
  });

  it('has two authors', () => {
    expect([...CREATED_BY_VALUES]).toEqual(['ai', 'user']);
  });

  it('has four tag kinds', () => {
    expect([...TAG_KINDS]).toEqual(['dish', 'ingredient', 'technique', 'equipment']);
  });

  it('has four import statuses', () => {
    expect([...IMPORT_BATCH_STATUSES]).toEqual(['processing', 'ready', 'done', 'failed']);
  });

  it.each([
    ['cook status', COOK_STATUSES, isCookStatus, ['planned', 'in_progress', 'complete', 'abandoned']],
    ['provenance', PROVENANCES, isProvenance, ['user', 'ai', 'synthetic']],
    ['event kind', COOK_EVENT_KINDS, isCookEventKind, ['note', 'observation', 'temperature', 'timing', 'step', 'taste']],
    ['finding class', FINDING_CLASSES, isFindingClass, ['guess', 'fact', 'opinion']],
    ['confidence', CONFIDENCE_LEVELS, isConfidenceLevel, ['certain', 'none', 'unsupported']],
    ['proposal status', PROPOSAL_STATUSES, isProposalStatus, ['draft', 'issued', 'reinstated']],
    ['author', CREATED_BY_VALUES, isCreatedBy, ['live', 'imported', 'system']],
    ['tag kind', TAG_KINDS, isTagKind, ['outcome', 'free']],
    ['import status', IMPORT_BATCH_STATUSES, isImportBatchStatus, ['pending', 'applied', 'rejected']],
  ])('recognises every %s and nothing else', (_name, values, guard, rejected) => {
    for (const value of values as readonly string[]) {
      expect((guard as (v: unknown) => boolean)(value)).toBe(true);
    }
    for (const value of rejected as readonly string[]) {
      expect((guard as (v: unknown) => boolean)(value)).toBe(false);
    }
    expect((guard as (v: unknown) => boolean)('')).toBe(false);
    expect((guard as (v: unknown) => boolean)(null)).toBe(false);
  });
});

describe('the vocabularies that must not exist', () => {
  const exported = Object.keys(enums);

  it('has no verdict vocabulary, because a verdict is free text', () => {
    expect(exported.filter((name) => /verdict/i.test(name))).toEqual([]);
  });

  it('has no briefing lifecycle vocabulary', () => {
    expect(exported.filter((name) => /briefing/i.test(name))).toEqual([]);
  });

  it('has no import-origin vocabulary', () => {
    expect(exported.filter((name) => /origin/i.test(name))).toEqual([]);
  });

  it('has no evidence-strength or source-relation vocabulary', () => {
    expect(
      exported.filter((name) => /strength|relation|source_kind|sourcekind/i.test(name)),
    ).toEqual([]);
  });

  it('has no temperature-unit vocabulary to choose from', () => {
    expect(exported.filter((name) => /UNITS/.test(name))).toEqual([]);
  });
});

describe('the entity shapes', () => {
  const at = '2026-09-05T18:00:00.000Z';

  function unwrap<T>(decision: EvidenceDecision<T>): T {
    if (!isAllowed(decision)) {
      throw new Error(`expected the operation to be allowed, but it was refused: ${decision.code}`);
    }
    return decision.record;
  }

  it('gives a cook exactly the controlled fields', () => {
    const cook: Cook = unwrap(createCook({ id: 'cook-01', startedAt: at }, 'user', at));

    expect(Object.keys(cook).sort()).toEqual([
      'createdAt',
      'id',
      'parentCookId',
      'provenance',
      'reviewOpenedAt',
      'reviewSavedAt',
      'startedAt',
      'status',
      'title',
      'verdict',
    ]);
  });

  it('gives a finding exactly the controlled fields', () => {
    const applied = applyFindingCandidate(
      {
        cookId: 'cook-01',
        class: 'inference',
        text: 'A claim',
        sourceEventIds: ['event-01'],
      },
      { id: 'finding-01' },
      'ai',
      at,
    );

    expect(isAllowed(applied)).toBe(true);
    if (isAllowed(applied)) {
      expect(Object.keys(applied.record.finding).sort()).toEqual([
        'class',
        'confidence',
        'cookId',
        'createdAt',
        'createdBy',
        'id',
        'provenance',
        'rationale',
        'status',
        'text',
        'updatedAt',
      ]);
      expect(Object.keys(applied.record.sources[0] ?? {}).sort()).toEqual([
        'cookEventId',
        'findingId',
      ]);
    }
  });

  it('gives a lesson exactly the controlled fields, with no author column', () => {
    const lesson: Lesson = unwrap(
      applyLessonCandidate({ cookId: 'cook-01', text: 'Rest it.' }, { id: 'lesson-01' }, at),
    );

    expect(Object.keys(lesson).sort()).toEqual([
      'cookId',
      'createdAt',
      'id',
      'provenance',
      'status',
      'text',
      'updatedAt',
    ]);
    expect(lesson).not.toHaveProperty('createdBy');
  });

  it('keeps the snapshot to the eleven tables of the model', () => {
    expect(Object.keys(emptySnapshot())).toEqual([
      'cooks',
      'cookEvents',
      'findings',
      'findingSources',
      'lessons',
      'tags',
      'cookTags',
      'briefings',
      'briefingSources',
      'importBatches',
    ]);
  });

  it('types a finding without a strength and an event without a unit', () => {
    // Compile-time facts, asserted at runtime so a reader can see them fail.
    const finding = {} as Finding;
    const event = {} as CookEvent;

    expect(finding).not.toHaveProperty('evidenceStrength');
    expect(event).not.toHaveProperty('unit');
    expect(event).not.toHaveProperty('numericValue');
  });
});

describe('the rejected trial concepts are absent from the product source', () => {
  const files = productSourceFiles();

  it('found the files it is checking', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each([
    ['evidence strength', /evidence[_\s]?strength/i],
    ['a strength vocabulary', /\b(unsupported|corroborated)\b/i],
    ['source relations', /\b(supports|contradicts)\b/i],
    ['a polymorphic source kind', /source[_]?kind/i],
    ['a user-edited flag', /user[_]?edited/i],
    ['a reinstatement lifecycle', /reinstat/i],
    ['a decision timestamp column', /decided[_]?at/i],
    ['the old cook lifecycle', /\b(in_progress|abandoned)\b/i],
    ['a finish time', /finished[_]?at/i],
    ['a verdict rating', /\b(unrated|verdict[_]?note)\b/i],
    ['a required finding on a lesson', /origin[_]?finding/i],
    ['an import origin', /import[_]?batch[_]?origin|backup_restore|synthetic_fixture/i],
    ['a briefing lifecycle', /briefing[_]?status|\bissued[_]?at\b/i],
    ['hidden memory', /hidden[_\s]?memory|shadow[_\s]?memory/i],
    ['fahrenheit', /fahrenheit/i],
  ])('contains no %s', (_description, pattern) => {
    const offenders = files
      .filter((file) => (pattern as RegExp).test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('would notice if one came back', () => {
    // The scan is only worth having if it would actually fire.
    expect(/evidence[_\s]?strength/i.test('readonly evidenceStrength: string')).toBe(true);
    expect(/\b(supports|contradicts)\b/i.test("relation: 'contradicts'")).toBe(true);
    expect(/user[_]?edited/i.test('userEdited: true')).toBe(true);
  });
});
