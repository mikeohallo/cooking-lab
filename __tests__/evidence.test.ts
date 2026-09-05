import type { Cook, CookEvent, Finding, FindingSource, Lesson } from '../src/domain/entities';
import type { EvidenceDecision } from '../src/domain/evidence';
import {
  applyFindingProposal,
  applyLessonProposal,
  createCookEvent,
  createUserFinding,
  createUserLesson,
  decideFinding,
  decideLesson,
  deriveEvidenceStrength,
  isAllowed,
  recordCookVerdict,
  refreshEvidenceStrength,
  updateCook,
  updateCookEvent,
  updateFinding,
  updateLesson,
} from '../src/domain/evidence';
import { validateFinding, validateLesson } from '../src/domain/invariants';

const T0 = '2026-09-05T18:00:00.000Z';
const T1 = '2026-09-06T09:00:00.000Z';
const T2 = '2026-09-07T09:00:00.000Z';

/** Unwrap an allowed decision, failing the test if it was refused. */
function granted<T>(decision: EvidenceDecision<T>): T {
  if (!isAllowed(decision)) {
    throw new Error(`expected the operation to be allowed, but it was refused: ${decision.code}`);
  }
  return decision.record;
}

function refusalCode<T>(decision: EvidenceDecision<T>): string {
  if (decision.allowed) {
    throw new Error('expected the operation to be refused, but it was allowed');
  }
  return decision.code;
}

const COOK: Cook = {
  id: 'cook-01',
  title: 'Weeknight rice',
  status: 'complete',
  startedAt: T0,
  finishedAt: '2026-09-05T18:40:00.000Z',
  verdict: 'unrated',
  verdictNote: null,
  notes: null,
  createdAt: T0,
  updatedAt: T0,
};

const EVENT: CookEvent = {
  id: 'event-01',
  cookId: 'cook-01',
  kind: 'observation',
  occurredAt: T0,
  offsetSeconds: 0,
  label: null,
  text: 'Lid on.',
  numericValue: null,
  unit: null,
  photoPath: null,
  createdAt: T0,
};

const PROPOSAL = {
  id: 'finding-01',
  title: 'Resting the rice matters',
  detail: 'Both rested batches held together better.',
  sources: [
    { sourceKind: 'cook', sourceId: 'cook-01', relation: 'supports' },
    { sourceKind: 'cook_event', sourceId: 'event-01', relation: 'supports' },
  ],
} as const;

describe('rule 1 — raw evidence belongs to the cook', () => {
  it('lets the cook record a verdict', () => {
    const cook = granted(recordCookVerdict(COOK, 'good', 'Better than last time', 'user', T1));

    expect(cook.verdict).toBe('good');
    expect(cook.verdictNote).toBe('Better than last time');
    expect(cook.updatedAt).toBe(T1);
  });

  it('refuses to let the assistant record a verdict', () => {
    expect(refusalCode(recordCookVerdict(COOK, 'excellent', null, 'ai', T1))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });

  it('drops a verdict note when the verdict is withdrawn', () => {
    const rated = granted(recordCookVerdict(COOK, 'good', 'Nice', 'user', T1));
    const unrated = granted(recordCookVerdict(rated, 'unrated', 'Nice', 'user', T2));

    expect(unrated.verdictNote).toBeNull();
  });

  it('refuses every assistant write to a cook or its timeline', () => {
    expect(refusalCode(updateCook(COOK, { title: 'Renamed' }, 'ai', T1))).toBe(
      'ai_cannot_write_raw_evidence',
    );
    expect(
      refusalCode(
        createCookEvent(
          { id: 'event-02', cookId: 'cook-01', kind: 'note', occurredAt: T1 },
          'ai',
          T1,
        ),
      ),
    ).toBe('ai_cannot_write_raw_evidence');
    expect(refusalCode(updateCookEvent(EVENT, { text: 'Rewritten' }, 'ai'))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });

  it('leaves the original untouched when a write is refused', () => {
    recordCookVerdict(COOK, 'excellent', 'Assistant says so', 'ai', T1);

    expect(COOK.verdict).toBe('unrated');
    expect(COOK.verdictNote).toBeNull();
  });

  it('lets the cook edit their own timeline entry', () => {
    const edited = granted(updateCookEvent(EVENT, { text: 'Lid on at a rolling boil.' }, 'user'));

    expect(edited.text).toBe('Lid on at a rolling boil.');
    expect(edited.id).toBe(EVENT.id);
  });
});

describe('rule 2 — the assistant may only propose', () => {
  it('creates a proposed finding and its citations together', () => {
    const applied = granted(applyFindingProposal(PROPOSAL, 'ai', T1));

    expect(applied.finding.status).toBe('proposed');
    expect(applied.finding.createdBy).toBe('ai');
    expect(applied.finding.userEdited).toBe(false);
    expect(applied.finding.decidedAt).toBeNull();
    expect(applied.sources).toHaveLength(2);
    expect(applied.sources.every((source) => source.findingId === 'finding-01')).toBe(true);
    expect(validateFinding(applied.finding)).toEqual([]);
  });

  it('splits a citation into the reference column that matches its kind', () => {
    const applied = granted(applyFindingProposal(PROPOSAL, 'ai', T1));
    const [cookSource, eventSource] = applied.sources as readonly FindingSource[];

    expect(cookSource?.cookId).toBe('cook-01');
    expect(cookSource?.cookEventId).toBeNull();
    expect(eventSource?.cookEventId).toBe('event-01');
    expect(eventSource?.cookId).toBeNull();
  });

  it('refuses an assistant proposal with nothing behind it', () => {
    expect(refusalCode(applyFindingProposal({ ...PROPOSAL, sources: [] }, 'ai', T1))).toBe(
      'proposal_requires_supporting_source',
    );
  });

  it('refuses an assistant proposal that only argues against the evidence', () => {
    const contradicting = {
      ...PROPOSAL,
      sources: [{ sourceKind: 'cook', sourceId: 'cook-01', relation: 'contradicts' }],
    } as const;

    expect(refusalCode(applyFindingProposal(contradicting, 'ai', T1))).toBe(
      'proposal_requires_supporting_source',
    );
  });

  it('refuses a citation that does not identify real evidence', () => {
    const bad = {
      ...PROPOSAL,
      sources: [{ sourceKind: 'cook', sourceId: '../etc', relation: 'supports' }],
    } as const;

    expect(refusalCode(applyFindingProposal(bad, 'ai', T1))).toBe(
      'proposal_source_must_be_raw_evidence',
    );
  });

  it('lets the cook raise a thin finding of their own, with no citations at all', () => {
    const applied = granted(
      applyFindingProposal({ id: 'finding-02', title: 'A hunch', detail: null, sources: [] }, 'user', T1),
    );

    expect(applied.finding.status).toBe('proposed');
    expect(applied.finding.evidenceStrength).toBe('unsupported');
    expect(validateFinding(applied.finding)).toEqual([]);
  });

  it('refuses to let the assistant create an approved finding', () => {
    expect(
      refusalCode(
        createUserFinding(
          { id: 'finding-03', title: 'Approved by fiat', detail: null, sources: [] },
          'ai',
          T1,
        ),
      ),
    ).toBe('ai_cannot_create_decided_record');
  });

  it('lets the cook write a finding that needs nobody else to approve it', () => {
    const applied = granted(
      createUserFinding({ id: 'finding-04', title: 'I know this one', detail: null, sources: [] }, 'user', T1),
    );

    expect(applied.finding.status).toBe('approved');
    expect(applied.finding.createdBy).toBe('user');
    expect(applied.finding.decidedAt).toBe(T1);
    expect(validateFinding(applied.finding)).toEqual([]);
  });

  it('requires an assistant lesson to generalise a finding', () => {
    expect(
      refusalCode(
        applyLessonProposal(
          { id: 'lesson-01', title: 'Rest the rice', guidance: 'Ten minutes, lid on.', originFindingId: null },
          'ai',
          T1,
        ),
      ),
    ).toBe('proposal_requires_supporting_source');

    const lesson = granted(
      applyLessonProposal(
        {
          id: 'lesson-01',
          title: 'Rest the rice',
          guidance: 'Ten minutes, lid on.',
          originFindingId: 'finding-01',
        },
        'ai',
        T1,
      ),
    );

    expect(lesson.status).toBe('proposed');
    expect(validateLesson(lesson)).toEqual([]);
  });

  it('refuses to let the assistant create an approved lesson', () => {
    expect(
      refusalCode(
        createUserLesson(
          { id: 'lesson-02', title: 'By fiat', guidance: 'No.', originFindingId: null },
          'ai',
          T1,
        ),
      ),
    ).toBe('ai_cannot_create_decided_record');
  });
});

describe('evidence strength', () => {
  const source = (
    kind: 'cook' | 'cook_event',
    id: string,
    relation: 'supports' | 'contradicts' = 'supports',
  ): FindingSource => ({
    findingId: 'finding-01',
    sourceKind: kind,
    cookId: kind === 'cook' ? id : null,
    cookEventId: kind === 'cook_event' ? id : null,
    relation,
    createdAt: T1,
  });

  it('grows with the number of distinct supporting sources', () => {
    expect(deriveEvidenceStrength([])).toBe('unsupported');
    expect(deriveEvidenceStrength([source('cook', 'cook-01')])).toBe('single');
    expect(deriveEvidenceStrength([source('cook', 'cook-01'), source('cook', 'cook-02')])).toBe(
      'corroborated',
    );
    expect(
      deriveEvidenceStrength([
        source('cook', 'cook-01'),
        source('cook', 'cook-02'),
        source('cook', 'cook-03'),
      ]),
    ).toBe('strong');
  });

  it('counts one cook once, however many times it is cited', () => {
    expect(deriveEvidenceStrength([source('cook', 'cook-01'), source('cook', 'cook-01')])).toBe(
      'single',
    );
  });

  it('does not count evidence that argues the other way', () => {
    expect(
      deriveEvidenceStrength([source('cook', 'cook-01', 'contradicts')]),
    ).toBe('unsupported');
  });

  it('recomputes only from the finding it belongs to', () => {
    const applied = granted(applyFindingProposal(PROPOSAL, 'ai', T1));
    const foreign: FindingSource = { ...source('cook', 'cook-09'), findingId: 'finding-99' };
    const refreshed = refreshEvidenceStrength(applied.finding, [...applied.sources, foreign], T2);

    expect(refreshed.evidenceStrength).toBe('corroborated');
  });
});

describe('rules 3 and 4 — decisions and the cook’s own words', () => {
  const proposed = (): Finding => granted(applyFindingProposal(PROPOSAL, 'ai', T1)).finding;

  it('lets the assistant revise its own undecided proposal', () => {
    const revised = granted(updateFinding(proposed(), { title: 'Resting rice matters more' }, 'ai', T2));

    expect(revised.title).toBe('Resting rice matters more');
    expect(revised.userEdited).toBe(false);
  });

  it('marks a user edit as a user edit, and keeps it marked', () => {
    const edited = granted(updateFinding(proposed(), { title: 'My words' }, 'user', T2));

    expect(edited.userEdited).toBe(true);
    expect(edited.createdBy).toBe('ai');

    expect(refusalCode(updateFinding(edited, { title: 'Assistant words' }, 'ai', T2))).toBe(
      'ai_cannot_overwrite_user_edit',
    );
  });

  it('refuses to let the assistant touch an approved record', () => {
    const approved = granted(decideFinding(proposed(), 'approve', 'user', T2));

    expect(approved.status).toBe('approved');
    expect(refusalCode(updateFinding(approved, { title: 'Second thoughts' }, 'ai', T2))).toBe(
      'ai_cannot_update_approved_record',
    );
  });

  it('refuses to let the assistant touch a rejected record or a user-written one', () => {
    const rejected = granted(decideFinding(proposed(), 'reject', 'user', T2));
    expect(refusalCode(updateFinding(rejected, { title: 'Retry' }, 'ai', T2))).toBe(
      'ai_cannot_update_rejected_record',
    );

    const mine = granted(
      createUserFinding({ id: 'finding-05', title: 'Mine', detail: null, sources: [] }, 'user', T1),
    ).finding;
    const stillProposed: Finding = { ...mine, status: 'proposed', decidedAt: null };
    expect(refusalCode(updateFinding(stillProposed, { title: 'Not yours' }, 'ai', T2))).toBe(
      'ai_cannot_update_user_authored_record',
    );
  });

  it('makes approval explicit and refuses it to the assistant', () => {
    expect(refusalCode(decideFinding(proposed(), 'approve', 'ai', T2))).toBe(
      'ai_cannot_decide_review_status',
    );

    const approved = granted(decideFinding(proposed(), 'approve', 'user', T2));
    expect(approved.decidedAt).toBe(T2);
    expect(validateFinding(approved)).toEqual([]);
  });

  it('keeps the row when a finding is rejected', () => {
    const before = proposed();
    const rejected = granted(decideFinding(before, 'reject', 'user', T2));

    expect(rejected.status).toBe('rejected');
    expect(rejected.id).toBe(before.id);
    expect(rejected.title).toBe(before.title);
    expect(rejected.detail).toBe(before.detail);
    expect(rejected.createdBy).toBe(before.createdBy);
    expect(rejected.evidenceStrength).toBe(before.evidenceStrength);
    expect(validateFinding(rejected)).toEqual([]);
  });

  it('lets the cook change their mind about a rejection', () => {
    const rejected = granted(decideFinding(proposed(), 'reject', 'user', T2));
    const reinstated = granted(decideFinding(rejected, 'reinstate', 'user', T2));

    expect(reinstated.status).toBe('proposed');
    expect(reinstated.decidedAt).toBeNull();
    expect(validateFinding(reinstated)).toEqual([]);
  });

  it('refuses transitions a record cannot make', () => {
    const approved = granted(decideFinding(proposed(), 'approve', 'user', T2));

    expect(refusalCode(decideFinding(approved, 'approve', 'user', T2))).toBe(
      'invalid_status_transition',
    );
    expect(refusalCode(decideFinding(proposed(), 'reinstate', 'user', T2))).toBe(
      'invalid_status_transition',
    );
  });

  it('applies the same protections to lessons', () => {
    const lesson: Lesson = granted(
      applyLessonProposal(
        { id: 'lesson-03', title: 'Rest it', guidance: 'Ten minutes.', originFindingId: 'finding-01' },
        'ai',
        T1,
      ),
    );

    expect(refusalCode(decideLesson(lesson, 'approve', 'ai', T2))).toBe(
      'ai_cannot_decide_review_status',
    );

    const approved = granted(decideLesson(lesson, 'approve', 'user', T2));
    expect(approved.status).toBe('approved');
    expect(refusalCode(updateLesson(approved, { guidance: 'Twenty minutes.' }, 'ai', T2))).toBe(
      'ai_cannot_update_approved_record',
    );

    const edited = granted(updateLesson(approved, { guidance: 'Fifteen minutes.' }, 'user', T2));
    expect(edited.userEdited).toBe(true);
    expect(validateLesson(edited)).toEqual([]);
  });
});
