import type { Cook, CookEvent, Finding, FindingSource } from '../src/domain/entities';
import {
  isEntityId,
  isIsoTimestamp,
  isValid,
  normaliseTagName,
  validateBriefing,
  validateBriefingSource,
  validateCook,
  validateCookEvent,
  validateFinding,
  validateFindingSource,
  validateImportBatch,
  validateLesson,
  validateTag,
} from '../src/domain/invariants';
import { syntheticSnapshot } from './fixtures/syntheticData';

const codes = (issues: readonly { readonly code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);
const fields = (issues: readonly { readonly field: string }[]): readonly string[] =>
  issues.map((issue) => issue.field);

/** The minimum a cook can be: a name and a moment it started. */
const THIN_COOK: Cook = {
  id: 'cook-01',
  title: 'Weeknight rice',
  status: 'in_progress',
  startedAt: '2026-09-05T18:00:00.000Z',
  finishedAt: null,
  verdict: 'unrated',
  verdictNote: null,
  notes: null,
  createdAt: '2026-09-05T18:00:00.000Z',
  updatedAt: '2026-09-05T18:00:00.000Z',
};

describe('identifier and timestamp shapes', () => {
  it('accepts device-generated ids', () => {
    expect(isEntityId('cook-01')).toBe(true);
    expect(isEntityId('a')).toBe(true);
  });

  it('rejects ids that could be anything but an id', () => {
    expect(isEntityId('')).toBe(false);
    expect(isEntityId('Cook-01')).toBe(false);
    expect(isEntityId('cook 01')).toBe(false);
    expect(isEntityId('../cook')).toBe(false);
    expect(isEntityId('-leading-hyphen')).toBe(false);
    expect(isEntityId('c'.repeat(65))).toBe(false);
    expect(isEntityId(42)).toBe(false);
  });

  it('accepts ISO-8601 UTC instants at second or millisecond precision', () => {
    expect(isIsoTimestamp('2026-09-05T18:00:00Z')).toBe(true);
    expect(isIsoTimestamp('2026-09-05T18:00:00.000Z')).toBe(true);
  });

  it('rejects local offsets, so ordering is total across devices', () => {
    expect(isIsoTimestamp('2026-09-05T18:00:00+01:00')).toBe(false);
    expect(isIsoTimestamp('2026-09-05 18:00:00Z')).toBe(false);
    expect(isIsoTimestamp('not a time')).toBe(false);
  });
});

describe('validateCook', () => {
  it('accepts a thin record', () => {
    expect(validateCook(THIN_COOK)).toEqual([]);
  });

  it('requires a complete cook to say when it ended', () => {
    const issues = validateCook({ ...THIN_COOK, status: 'complete' });

    expect(codes(issues)).toContain('inconsistent_state');
    expect(fields(issues)).toContain('finishedAt');
  });

  it('refuses a cook that finished before it started', () => {
    const issues = validateCook({
      ...THIN_COOK,
      status: 'complete',
      finishedAt: '2026-09-05T17:00:00.000Z',
    });

    expect(codes(issues)).toContain('out_of_order');
  });

  it('refuses a verdict note with no verdict behind it', () => {
    const issues = validateCook({ ...THIN_COOK, verdictNote: 'lovely' });

    expect(fields(issues)).toContain('verdictNote');
  });

  it('refuses a blank title and an unrecognised verdict', () => {
    const issues = validateCook({
      ...THIN_COOK,
      title: '   ',
      verdict: 'sublime' as unknown as Cook['verdict'],
    });

    expect(codes(issues)).toEqual(expect.arrayContaining(['required', 'invalid_enum']));
  });
});

describe('validateCookEvent', () => {
  const NOTE: CookEvent = {
    id: 'event-01',
    cookId: 'cook-01',
    kind: 'note',
    occurredAt: '2026-09-05T18:10:00.000Z',
    offsetSeconds: 600,
    label: null,
    text: 'Water on.',
    numericValue: null,
    unit: null,
    photoPath: null,
    createdAt: '2026-09-05T18:10:00.000Z',
  };

  it('accepts a plain note', () => {
    expect(validateCookEvent(NOTE)).toEqual([]);
  });

  it('requires a temperature event to carry a temperature and a unit', () => {
    const issues = validateCookEvent({ ...NOTE, kind: 'temperature' });

    expect(fields(issues)).toEqual(expect.arrayContaining(['numericValue', 'unit']));
  });

  it('accepts a temperature event that carries both', () => {
    expect(
      validateCookEvent({ ...NOTE, kind: 'temperature', numericValue: 96, unit: 'c' }),
    ).toEqual([]);
  });

  it('keeps photo references on photo events and nowhere else', () => {
    expect(fields(validateCookEvent({ ...NOTE, kind: 'photo' }))).toContain('photoPath');
    expect(
      fields(validateCookEvent({ ...NOTE, photoPath: 'cooks/cook-01/20260905t181000-01.jpg' })),
    ).toContain('photoPath');
  });
});

describe('validateFinding', () => {
  const PROPOSED: Finding = {
    id: 'finding-01',
    title: 'Rice benefits from a longer rest',
    detail: null,
    status: 'proposed',
    createdBy: 'ai',
    userEdited: false,
    evidenceStrength: 'single',
    createdAt: '2026-09-06T08:00:00.000Z',
    updatedAt: '2026-09-06T08:00:00.000Z',
    decidedAt: null,
  };

  it('accepts an undecided proposal', () => {
    expect(validateFinding(PROPOSED)).toEqual([]);
  });

  it('refuses a proposal that claims to have been decided', () => {
    const issues = validateFinding({ ...PROPOSED, decidedAt: '2026-09-06T09:00:00.000Z' });

    expect(fields(issues)).toContain('decidedAt');
  });

  it('refuses a decided record with no decision time', () => {
    const issues = validateFinding({ ...PROPOSED, status: 'approved' });

    expect(fields(issues)).toContain('decidedAt');
  });
});

describe('validateFindingSource', () => {
  const CITATION: FindingSource = {
    findingId: 'finding-01',
    sourceKind: 'cook',
    cookId: 'cook-01',
    cookEventId: null,
    relation: 'supports',
    createdAt: '2026-09-06T08:00:00.000Z',
  };

  it('accepts a citation of a cook', () => {
    expect(validateFindingSource(CITATION)).toEqual([]);
  });

  it('refuses a citation that sets both reference columns', () => {
    const issues = validateFindingSource({ ...CITATION, cookEventId: 'event-01' });

    expect(codes(issues)).toContain('invalid_relation');
  });

  it('refuses a citation that cites nothing at all', () => {
    const issues = validateFindingSource({ ...CITATION, cookId: null });

    expect(codes(issues)).toContain('invalid_relation');
  });

  it('refuses a citation whose kind and column disagree', () => {
    const issues = validateFindingSource({
      ...CITATION,
      sourceKind: 'cook_event',
      cookEventId: null,
    });

    expect(codes(issues)).toContain('invalid_relation');
  });
});

describe('tag names', () => {
  it('normalises case and internal whitespace', () => {
    expect(normaliseTagName('  Brown   Butter ')).toBe('brown butter');
  });

  it('refuses a tag stored unnormalised, so uniqueness means what it says', () => {
    const issues = validateTag({
      id: 'tag-01',
      name: 'Brown Butter',
      kind: 'technique',
      createdAt: '2026-09-05T18:00:00.000Z',
    });

    expect(codes(issues)).toContain('inconsistent_state');
  });
});

describe('bookkeeping records', () => {
  it('refuses a settled import batch with no completion time', () => {
    const issues = validateImportBatch({
      id: 'import-01',
      origin: 'backup_restore',
      status: 'applied',
      label: 'Restore',
      recordCount: 3,
      startedAt: '2026-09-05T18:00:00.000Z',
      completedAt: null,
      note: null,
    });

    expect(fields(issues)).toContain('completedAt');
  });

  it('refuses a negative record count', () => {
    const issues = validateImportBatch({
      id: 'import-01',
      origin: 'backup_restore',
      status: 'pending',
      label: 'Restore',
      recordCount: -1,
      startedAt: '2026-09-05T18:00:00.000Z',
      completedAt: null,
      note: null,
    });

    expect(codes(issues)).toContain('invalid_number');
  });

  it('refuses an issued briefing that never says when', () => {
    const issues = validateBriefing({
      id: 'briefing-01',
      cookId: null,
      title: 'Before this bake',
      body: 'Two things to watch.',
      status: 'issued',
      createdBy: 'ai',
      createdAt: '2026-09-05T18:00:00.000Z',
      issuedAt: null,
    });

    expect(fields(issues)).toContain('issuedAt');
  });

  it('refuses a briefing source that sets more than one reference', () => {
    const issues = validateBriefingSource({
      briefingId: 'briefing-01',
      sourceKind: 'finding',
      findingId: 'finding-01',
      lessonId: 'lesson-01',
      cookId: null,
      createdAt: '2026-09-05T18:00:00.000Z',
    });

    expect(codes(issues)).toContain('invalid_relation');
  });
});

describe('the synthetic fixture', () => {
  const snapshot = syntheticSnapshot();

  it('satisfies every domain constraint', () => {
    for (const cook of snapshot.cooks) {
      expect(validateCook(cook)).toEqual([]);
    }
    for (const event of snapshot.cookEvents) {
      expect(validateCookEvent(event)).toEqual([]);
    }
    for (const finding of snapshot.findings) {
      expect(validateFinding(finding)).toEqual([]);
    }
    for (const source of snapshot.findingSources) {
      expect(validateFindingSource(source)).toEqual([]);
    }
    for (const lesson of snapshot.lessons) {
      expect(validateLesson(lesson)).toEqual([]);
    }
    for (const tag of snapshot.tags) {
      expect(validateTag(tag)).toEqual([]);
    }
    for (const briefing of snapshot.briefings) {
      expect(validateBriefing(briefing)).toEqual([]);
    }
    for (const source of snapshot.briefingSources) {
      expect(validateBriefingSource(source)).toEqual([]);
    }
    for (const batch of snapshot.importBatches) {
      expect(validateImportBatch(batch)).toEqual([]);
    }
  });

  it('includes a thin cook, because thin records are real records', () => {
    const thin = snapshot.cooks.find((cook) => cook.finishedAt === null);

    expect(thin).toBeDefined();
    expect(isValid(validateCook(thin as Cook))).toBe(true);
  });
});
