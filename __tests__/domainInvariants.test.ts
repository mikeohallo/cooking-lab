import type { Briefing, Cook, CookEvent, Finding, Lesson } from '../src/domain/entities';
import {
  celsiusFromEvent,
  isEntityId,
  isIsoTimestamp,
  isJsonValue,
  isValid,
  normaliseTagName,
  validateBriefing,
  validateBriefingSource,
  validateCook,
  validateCookEvent,
  validateCookTag,
  validateFinding,
  validateFindingSource,
  validateImportBatch,
  validateLesson,
  validateSchemaMeta,
  validateTag,
} from '../src/domain/invariants';
import { SYNTHETIC_VERDICT, syntheticSnapshot } from './fixtures/syntheticData';

const codes = (issues: readonly { readonly code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);
const fields = (issues: readonly { readonly field: string }[]): readonly string[] =>
  issues.map((issue) => issue.field);

/** The minimum a cook can be: a moment it started, and nothing else. */
const THIN_COOK: Cook = {
  id: 'cook-01',
  title: null,
  status: 'open',
  provenance: 'live',
  parentCookId: null,
  startedAt: '2026-09-05T18:00:00.000Z',
  reviewOpenedAt: null,
  reviewSavedAt: null,
  verdict: null,
  createdAt: '2026-09-05T18:00:00.000Z',
};

const NOTE: CookEvent = {
  id: 'event-01',
  cookId: 'cook-01',
  ts: '2026-09-05T18:10:00.000Z',
  kind: 'user_note',
  body: 'Water on.',
  meta: null,
  photoPath: null,
};

const FINDING: Finding = {
  id: 'finding-01',
  cookId: 'cook-01',
  class: 'inference',
  text: 'The rice benefits from a longer rest.',
  rationale: 'Both rested batches held together better.',
  confidence: 'medium',
  status: 'proposed',
  createdBy: 'ai',
  provenance: 'live',
  createdAt: '2026-09-06T08:00:00.000Z',
  updatedAt: null,
};

const LESSON: Lesson = {
  id: 'lesson-01',
  cookId: 'cook-01',
  text: 'Rest the rice for ten minutes, lid on.',
  status: 'proposed',
  provenance: 'live',
  createdAt: '2026-09-06T08:00:00.000Z',
  updatedAt: null,
};

const BRIEFING: Briefing = {
  id: 'briefing-01',
  cookId: 'cook-02',
  content: { headline: 'Before this cook', points: ['Rest it'] },
  useful: null,
  createdAt: '2026-09-06T08:00:00.000Z',
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

describe('JSON-compatible values', () => {
  it('accepts what survives a round trip', () => {
    expect(isJsonValue(null)).toBe(true);
    expect(isJsonValue('text')).toBe(true);
    expect(isJsonValue(42)).toBe(true);
    expect(isJsonValue(true)).toBe(true);
    expect(isJsonValue({ celsius: 96, steps: ['rest', 'serve'] })).toBe(true);
  });

  it('rejects what comes back as something else', () => {
    expect(isJsonValue(undefined)).toBe(false);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isJsonValue(() => 1)).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);
    expect(isJsonValue(new Map())).toBe(false);
    expect(isJsonValue({ nested: { bad: undefined } })).toBe(false);
  });

  it('rejects a cycle rather than following it', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(isJsonValue(cyclic)).toBe(false);
  });
});

describe('validateCook', () => {
  it('accepts a thin record: no title, no verdict, not yet reviewed', () => {
    expect(validateCook(THIN_COOK)).toEqual([]);
  });

  it('accepts a reviewed cook that says when the review was saved', () => {
    expect(
      validateCook({
        ...THIN_COOK,
        status: 'reviewed',
        reviewOpenedAt: '2026-09-05T19:00:00.000Z',
        reviewSavedAt: '2026-09-05T19:05:00.000Z',
        verdict: 'Good.',
      }),
    ).toEqual([]);
  });

  it('requires a reviewed cook to say when it was reviewed', () => {
    const issues = validateCook({ ...THIN_COOK, status: 'reviewed' });

    expect(codes(issues)).toContain('inconsistent_state');
    expect(fields(issues)).toContain('reviewSavedAt');
  });

  it('refuses an open cook that claims to have been reviewed', () => {
    const issues = validateCook({
      ...THIN_COOK,
      reviewSavedAt: '2026-09-05T19:05:00.000Z',
    });

    expect(fields(issues)).toContain('reviewSavedAt');
  });

  it('refuses a review saved before the cook began', () => {
    const issues = validateCook({
      ...THIN_COOK,
      status: 'reviewed',
      reviewSavedAt: '2026-09-05T17:00:00.000Z',
    });

    expect(codes(issues)).toContain('out_of_order');
  });

  it('refuses a cook that follows on from itself', () => {
    const issues = validateCook({ ...THIN_COOK, parentCookId: THIN_COOK.id });

    expect(codes(issues)).toContain('invalid_relation');
  });

  it('refuses statuses and provenances outside the vocabulary', () => {
    const issues = validateCook({
      ...THIN_COOK,
      status: 'complete' as unknown as Cook['status'],
      provenance: 'ai' as unknown as Cook['provenance'],
    });

    expect(fields(issues)).toEqual(expect.arrayContaining(['status', 'provenance']));
    expect(codes(issues).filter((code) => code === 'invalid_enum')).toHaveLength(2);
  });
});

describe('the verdict is free text', () => {
  it('accepts any wording at all, including one that used to be a rating', () => {
    for (const verdict of [
      'excellent',
      'It was fine, honestly',
      '7/10',
      '   ',
      '',
      '“Never again.”\n— me',
      '🔥',
    ]) {
      expect(validateCook({ ...THIN_COOK, verdict })).toEqual([]);
    }
  });

  it('keeps the cook’s words exactly as typed, whitespace and all', () => {
    const cook: Cook = { ...THIN_COOK, verdict: SYNTHETIC_VERDICT };

    expect(validateCook(cook)).toEqual([]);
    expect(cook.verdict).toBe(SYNTHETIC_VERDICT);
    expect(cook.verdict).not.toBe(SYNTHETIC_VERDICT.trim());
  });

  it('accepts no verdict at all, which is not a rating of zero', () => {
    expect(validateCook({ ...THIN_COOK, verdict: null })).toEqual([]);
  });

  it('refuses only text that is not text, or is absurdly long', () => {
    expect(fields(validateCook({ ...THIN_COOK, verdict: 4 as unknown as string }))).toContain(
      'verdict',
    );
    expect(
      fields(validateCook({ ...THIN_COOK, verdict: 'x'.repeat(8001) })),
    ).toContain('verdict');
  });
});

describe('validateCookEvent', () => {
  it('accepts a plain note', () => {
    expect(validateCookEvent(NOTE)).toEqual([]);
  });

  it.each(['user_note', 'assistant_msg', 'photo', 'plan'] as const)(
    'accepts a %s event',
    (kind) => {
      const event: CookEvent = {
        ...NOTE,
        kind,
        photoPath: kind === 'photo' ? 'cooks/cook-01/20260905t181000-01.jpg' : null,
      };

      expect(validateCookEvent(event)).toEqual([]);
    },
  );

  it('refuses a kind outside the vocabulary', () => {
    const issues = validateCookEvent({
      ...NOTE,
      kind: 'observation' as unknown as CookEvent['kind'],
    });

    expect(codes(issues)).toContain('invalid_enum');
  });

  it('requires a temp event to record degrees Celsius in meta', () => {
    expect(fields(validateCookEvent({ ...NOTE, kind: 'temp' }))).toContain('meta');
    expect(validateCookEvent({ ...NOTE, kind: 'temp', meta: { celsius: 96 } })).toEqual([]);
  });

  it('does not recognise a reading in any other unit', () => {
    const fahrenheit: CookEvent = {
      ...NOTE,
      kind: 'temp',
      meta: { fahrenheit: 205 },
    };

    expect(celsiusFromEvent(fahrenheit)).toBeNull();
    expect(fields(validateCookEvent(fahrenheit))).toContain('meta');
    expect(celsiusFromEvent({ ...NOTE, kind: 'temp', meta: { celsius: 96 } })).toBe(96);
  });

  it('refuses meta that would not survive being stored as JSON', () => {
    const issues = validateCookEvent({
      ...NOTE,
      meta: { when: new Date() } as unknown as CookEvent['meta'],
    });

    expect(codes(issues)).toContain('invalid_json');
  });

  it('keeps photo references on photo events and nowhere else', () => {
    expect(fields(validateCookEvent({ ...NOTE, kind: 'photo' }))).toContain('photoPath');
    expect(
      fields(validateCookEvent({ ...NOTE, photoPath: 'cooks/cook-01/20260905t181000-01.jpg' })),
    ).toContain('photoPath');
  });
});

describe('validateFinding', () => {
  it('accepts an inference with its reasoning and confidence', () => {
    expect(validateFinding(FINDING)).toEqual([]);
  });

  it.each(['observed', 'inference', 'knowledge'] as const)('accepts a %s finding', (cls) => {
    expect(validateFinding({ ...FINDING, class: cls })).toEqual([]);
  });

  it.each(['low', 'medium', 'high'] as const)('accepts %s confidence', (confidence) => {
    expect(validateFinding({ ...FINDING, confidence })).toEqual([]);
  });

  it('accepts a thin finding with no reasoning and no confidence', () => {
    expect(validateFinding({ ...FINDING, rationale: null, confidence: null })).toEqual([]);
  });

  it('refuses a class, confidence, status or author outside the vocabulary', () => {
    const issues = validateFinding({
      ...FINDING,
      class: 'guess' as unknown as Finding['class'],
      confidence: 'certain' as unknown as Finding['confidence'],
      status: 'reinstated' as unknown as Finding['status'],
      createdBy: 'live' as unknown as Finding['createdBy'],
    });

    expect(fields(issues)).toEqual(
      expect.arrayContaining(['class', 'confidence', 'status', 'createdBy']),
    );
  });

  it('refuses provenance that names an author instead of an origin', () => {
    for (const provenance of ['user', 'ai']) {
      const issues = validateFinding({
        ...FINDING,
        provenance: provenance as unknown as Finding['provenance'],
      });

      expect(fields(issues)).toContain('provenance');
    }
  });

  it('refuses an update stamped before the record existed', () => {
    const issues = validateFinding({ ...FINDING, updatedAt: '2026-09-05T08:00:00.000Z' });

    expect(codes(issues)).toContain('out_of_order');
  });
});

describe('validateFindingSource', () => {
  it('links a finding to a timeline entry', () => {
    expect(
      validateFindingSource({ findingId: 'finding-01', cookEventId: 'event-01' }),
    ).toEqual([]);
  });

  it('refuses a link that identifies nothing', () => {
    const issues = validateFindingSource({ findingId: 'finding-01', cookEventId: '' });

    expect(fields(issues)).toContain('cookEventId');
  });
});

describe('validateLesson', () => {
  it('accepts a lesson attached to a cook and nothing else', () => {
    expect(validateLesson(LESSON)).toEqual([]);
    expect(Object.keys(LESSON).sort()).toEqual([
      'cookId',
      'createdAt',
      'id',
      'provenance',
      'status',
      'text',
      'updatedAt',
    ]);
  });

  it('requires text, a status and a provenance', () => {
    const issues = validateLesson({
      ...LESSON,
      text: '  ',
      status: 'draft' as unknown as Lesson['status'],
      provenance: 'ai' as unknown as Lesson['provenance'],
    });

    expect(fields(issues)).toEqual(expect.arrayContaining(['text', 'status', 'provenance']));
  });
});

describe('tag names and kinds', () => {
  it('normalises case and internal whitespace', () => {
    expect(normaliseTagName('  Brown   Butter ')).toBe('brown butter');
  });

  it('refuses a tag stored unnormalised, so uniqueness means what it says', () => {
    const issues = validateTag({ id: 'tag-01', name: 'Brown Butter', kind: 'technique' });

    expect(codes(issues)).toContain('inconsistent_state');
  });

  it.each(['dish', 'ingredient', 'technique', 'equipment'] as const)('accepts %s', (kind) => {
    expect(validateTag({ id: 'tag-01', name: 'butter', kind })).toEqual([]);
  });

  it('refuses the kinds the product model does not have', () => {
    for (const kind of ['outcome', 'free']) {
      const issues = validateTag({
        id: 'tag-01',
        name: 'butter',
        kind: kind as unknown as 'dish',
      });

      expect(fields(issues)).toContain('kind');
    }
  });

  it('links a cook to a tag', () => {
    expect(validateCookTag({ cookId: 'cook-01', tagId: 'tag-01' })).toEqual([]);
  });
});

describe('briefings', () => {
  it('accepts structured content and no answer yet', () => {
    expect(validateBriefing(BRIEFING)).toEqual([]);
  });

  it.each([[true], [false], [null]])('accepts useful = %s', (useful) => {
    expect(validateBriefing({ ...BRIEFING, useful })).toEqual([]);
  });

  it('refuses anything else in useful', () => {
    const issues = validateBriefing({
      ...BRIEFING,
      useful: 'yes' as unknown as Briefing['useful'],
    });

    expect(fields(issues)).toContain('useful');
  });

  it('refuses content that is not JSON-compatible', () => {
    const issues = validateBriefing({
      ...BRIEFING,
      content: { at: new Date() } as unknown as Briefing['content'],
    });

    expect(codes(issues)).toContain('invalid_json');
  });

  it('requires a briefing to be for a cook', () => {
    const issues = validateBriefing({ ...BRIEFING, cookId: '' });

    expect(fields(issues)).toContain('cookId');
  });

  it('sources a briefing from a cook', () => {
    expect(
      validateBriefingSource({ briefingId: 'briefing-01', cookId: 'cook-01' }),
    ).toEqual([]);
    expect(
      fields(validateBriefingSource({ briefingId: 'briefing-01', cookId: 'not an id' })),
    ).toContain('cookId');
  });
});

describe('bookkeeping records', () => {
  const BATCH = {
    id: 'import-01',
    filename: 'notebook.json',
    status: 'processing',
    candidatesTotal: null,
    candidatesResolved: null,
    createdAt: '2026-09-05T18:00:00.000Z',
  } as const;

  it.each(['processing', 'ready', 'done', 'failed'] as const)('accepts %s', (status) => {
    expect(validateImportBatch({ ...BATCH, status })).toEqual([]);
  });

  it('accepts a batch with no file name and no counts yet', () => {
    expect(validateImportBatch({ ...BATCH, filename: null })).toEqual([]);
  });

  it('refuses a negative count and a status outside the vocabulary', () => {
    const issues = validateImportBatch({
      ...BATCH,
      status: 'applied' as unknown as 'done',
      candidatesTotal: -1,
    });

    expect(fields(issues)).toEqual(expect.arrayContaining(['status', 'candidatesTotal']));
  });

  it('refuses resolving more candidates than there were', () => {
    const issues = validateImportBatch({
      ...BATCH,
      status: 'done',
      candidatesTotal: 3,
      candidatesResolved: 4,
    });

    expect(codes(issues)).toContain('inconsistent_state');
  });

  it('keeps schema metadata to a key and a value', () => {
    expect(validateSchemaMeta({ key: 'schema_version', value: '1' })).toEqual([]);
    expect(fields(validateSchemaMeta({ key: '', value: '1' }))).toContain('key');
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
    for (const link of snapshot.cookTags) {
      expect(validateCookTag(link)).toEqual([]);
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
    const thin = snapshot.cooks.find((cook) => cook.title === null);

    expect(thin).toBeDefined();
    expect(thin?.verdict).toBeNull();
    expect(thin?.status).toBe('open');
    expect(isValid(validateCook(thin as Cook))).toBe(true);
  });
});
