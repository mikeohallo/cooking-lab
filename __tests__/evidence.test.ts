import { findDatabaseHandles } from '../src/data/adapters';
import type { AiService, AiReviewContext, DatabaseAdapter } from '../src/data/adapters';
import type { Cook, CookEvent, Finding, Lesson } from '../src/domain/entities';
import type {
  AiCandidateSet,
  EvidenceDecision,
  FindingCandidate,
} from '../src/domain/evidence';
import {
  applyFindingCandidate,
  applyLessonCandidate,
  appendCookEvent,
  createCook,
  createUserFinding,
  createUserLesson,
  decideFinding,
  decideLesson,
  isAllowed,
  openCookReview,
  recordBriefingUsefulness,
  saveCookReview,
  updateCook,
  updateCookEvent,
  updateFinding,
  updateLesson,
} from '../src/domain/evidence';
import { validateCook, validateFinding, validateLesson } from '../src/domain/invariants';

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
  status: 'open',
  provenance: 'live',
  parentCookId: null,
  startedAt: T0,
  reviewOpenedAt: null,
  reviewSavedAt: null,
  verdict: null,
  createdAt: T0,
};

const EVENT: CookEvent = {
  id: 'event-01',
  cookId: 'cook-01',
  ts: T0,
  kind: 'user_note',
  body: 'Lid on.',
  meta: null,
  photoPath: null,
};

const CANDIDATE: FindingCandidate = {
  cookId: 'cook-01',
  class: 'inference',
  text: 'Resting the rice matters',
  rationale: 'Both rested batches held together better.',
  confidence: 'medium',
  sourceEventIds: ['event-01', 'event-02'],
};

const IDENTITY = { id: 'finding-01' } as const;

/** The proposed finding an assistant candidate becomes. */
const proposed = (): Finding =>
  granted(applyFindingCandidate(CANDIDATE, IDENTITY, 'ai', T1)).finding;

describe('rule 1 — raw evidence belongs to the cook', () => {
  it('starts every cook open, live and unnamed unless told otherwise', () => {
    const cook = granted(createCook({ id: 'cook-09', startedAt: T0 }, 'user', T0));

    expect(cook.status).toBe('open');
    expect(cook.provenance).toBe('live');
    expect(cook.title).toBeNull();
    expect(cook.verdict).toBeNull();
    expect(validateCook(cook)).toEqual([]);
  });

  it('lets the cook save a review, verbatim', () => {
    const verdict = '  Too salty.\nUsed the wrong stock.  ';
    const opened = granted(openCookReview(COOK, 'user', T1));
    const reviewed = granted(saveCookReview(opened, verdict, 'user', T2));

    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.reviewOpenedAt).toBe(T1);
    expect(reviewed.reviewSavedAt).toBe(T2);
    expect(reviewed.verdict).toBe(verdict);
    expect(validateCook(reviewed)).toEqual([]);
  });

  it('stores the verdict as free text, whatever shape it takes', () => {
    for (const verdict of ['excellent', '7/10', 'fine, I suppose', '', null]) {
      const reviewed = granted(saveCookReview(COOK, verdict, 'user', T1));

      expect(reviewed.verdict).toBe(verdict);
    }
  });

  it('refuses to let the assistant record a verdict', () => {
    expect(refusalCode(saveCookReview(COOK, 'excellent', 'ai', T1))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });

  it('refuses every other assistant write to a cook', () => {
    expect(refusalCode(createCook({ id: 'cook-09', startedAt: T0 }, 'ai', T0))).toBe(
      'ai_cannot_write_raw_evidence',
    );
    expect(refusalCode(updateCook(COOK, { title: 'Renamed' }, 'ai'))).toBe(
      'ai_cannot_write_raw_evidence',
    );
    expect(refusalCode(openCookReview(COOK, 'ai', T1))).toBe('ai_cannot_write_raw_evidence');
  });

  it('leaves the original untouched when a write is refused', () => {
    saveCookReview(COOK, 'Assistant says it was excellent', 'ai', T1);

    expect(COOK.verdict).toBeNull();
    expect(COOK.status).toBe('open');
  });

  it('refuses to let the assistant record what the cook observed', () => {
    for (const kind of ['user_note', 'temp', 'photo', 'plan'] as const) {
      expect(
        refusalCode(
          appendCookEvent({ id: 'event-09', cookId: 'cook-01', ts: T1, kind }, 'ai'),
        ),
      ).toBe('ai_cannot_append_event_kind');
    }
  });

  it('lets the assistant add its own message, and nothing else', () => {
    const message = granted(
      appendCookEvent(
        {
          id: 'event-09',
          cookId: 'cook-01',
          ts: T1,
          kind: 'assistant_msg',
          body: 'Noted.',
        },
        'ai',
      ),
    );

    expect(message.kind).toBe('assistant_msg');
    // Having said it, it can never revise it.
    expect(refusalCode(updateCookEvent(message, { body: 'Actually…' }, 'ai'))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });

  it('refuses to let the assistant revise the timeline', () => {
    expect(refusalCode(updateCookEvent(EVENT, { body: 'Rewritten' }, 'ai'))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });

  // 0.2.2 replaced this test. It pinned "the cook may overwrite a note's
  // words in place"; from 0.2.2 nothing the cook writes is lost, an edit is a
  // revision beside the original (rule 11), and the in-place overwrite is
  // refused for the cook too. `revisions.test.ts` covers the edit itself.
  it('refuses to overwrite a note’s words in place, even for the cook', () => {
    expect(EVENT.kind).toBe('user_note');
    expect(
      refusalCode(updateCookEvent(EVENT, { body: 'Lid on at a rolling boil.' }, 'user')),
    ).toBe('words_are_revised_not_overwritten');
  });

  it('still lets the cook save a note with its words unchanged', () => {
    const same = granted(updateCookEvent(EVENT, { body: EVENT.body }, 'user'));

    expect(same).toEqual(EVENT);
  });
});

describe('rule 2 — an assistant returns candidates and holds no write handle', () => {
  const compliant: AiService = {
    async extractCook(_context: AiReviewContext) {
      const candidates: AiCandidateSet = { findings: [], lessons: [] };
      return { available: true as const, result: candidates };
    },
    async createBriefing() {
      return { available: false as const, reason: 'ai_not_connected' as const, message: 'n/a' };
    },
    async chat() {
      return { available: false as const, reason: 'ai_not_connected' as const, message: 'n/a' };
    },
    async importCandidates() {
      return { available: false as const, reason: 'ai_not_connected' as const, message: 'n/a' };
    },
  };

  it('finds no handle on a compliant assistant', () => {
    expect(findDatabaseHandles(compliant)).toEqual([]);
  });

  it('finds one on an assistant that was handed a database', () => {
    const database = {
      execute: async () => ({ rowsAffected: 0 }),
      select: async () => [],
      withTransaction: async () => undefined,
      close: async () => undefined,
    } as unknown as DatabaseAdapter;

    expect(findDatabaseHandles({ ...compliant, database })).toContain('database');
    expect(findDatabaseHandles({ ...compliant, anythingAtAll: database })).toContain(
      'anythingAtAll',
    );
    expect(findDatabaseHandles({ ...compliant, save: async () => undefined })).toContain('save');
  });

  it('finds one hidden on a prototype, where own-property enumeration would miss it', () => {
    // A service written as a class keeps its methods on the prototype, so a
    // check that only read own properties would report a leaky class as clean.
    class LeakyAssistant {
      async extractCook() {
        return { available: false as const, reason: 'ai_not_connected' as const, message: 'n/a' };
      }
      async save(): Promise<void> {
        return undefined;
      }
    }

    const leaky = new LeakyAssistant();

    expect(Object.keys(leaky)).toEqual([]);
    expect(findDatabaseHandles(leaky)).toContain('save');
  });
});

describe('rules 3 to 5 — a candidate becomes a proposal, and keeps its class', () => {
  it('creates a proposed finding and its citations together', () => {
    const applied = granted(applyFindingCandidate(CANDIDATE, IDENTITY, 'ai', T1));

    expect(applied.finding.status).toBe('proposed');
    expect(applied.finding.createdBy).toBe('ai');
    expect(applied.finding.provenance).toBe('live');
    expect(applied.finding.updatedAt).toBeNull();
    expect(applied.sources).toEqual([
      { findingId: 'finding-01', cookEventId: 'event-01' },
      { findingId: 'finding-01', cookEventId: 'event-02' },
    ]);
    expect(validateFinding(applied.finding)).toEqual([]);
  });

  it('carries the class, the reasoning and the confidence through untouched', () => {
    const applied = granted(applyFindingCandidate(CANDIDATE, IDENTITY, 'ai', T1));

    expect(applied.finding.class).toBe('inference');
    expect(applied.finding.rationale).toBe(CANDIDATE.rationale);
    expect(applied.finding.confidence).toBe('medium');
  });

  it.each(['observed', 'inference', 'knowledge'] as const)('keeps a %s claim as one', (cls) => {
    const applied = granted(
      applyFindingCandidate({ ...CANDIDATE, class: cls }, IDENTITY, 'ai', T1),
    );

    expect(applied.finding.class).toBe(cls);
  });

  it('refuses an assistant claim about this cook that cites nothing from it', () => {
    for (const cls of ['observed', 'inference'] as const) {
      expect(
        refusalCode(
          applyFindingCandidate(
            { ...CANDIDATE, class: cls, sourceEventIds: [] },
            IDENTITY,
            'ai',
            T1,
          ),
        ),
      ).toBe('candidate_requires_source_event');
    }
  });

  it('lets general knowledge stand without citing this kitchen', () => {
    const applied = granted(
      applyFindingCandidate(
        { ...CANDIDATE, class: 'knowledge', sourceEventIds: [] },
        IDENTITY,
        'ai',
        T1,
      ),
    );

    expect(applied.finding.class).toBe('knowledge');
    expect(applied.sources).toEqual([]);
  });

  it('refuses a citation that does not identify a timeline entry', () => {
    expect(
      refusalCode(
        applyFindingCandidate(
          { ...CANDIDATE, sourceEventIds: ['../etc'] },
          IDENTITY,
          'ai',
          T1,
        ),
      ),
    ).toBe('candidate_source_must_be_cook_event');
  });

  it('refuses to let the assistant create an approved finding or lesson', () => {
    expect(refusalCode(createUserFinding(CANDIDATE, IDENTITY, 'ai', T1))).toBe(
      'ai_cannot_create_approved_record',
    );
    expect(
      refusalCode(
        createUserLesson({ cookId: 'cook-01', text: 'Rest it.' }, { id: 'lesson-01' }, 'ai', T1),
      ),
    ).toBe('ai_cannot_create_approved_record');
  });

  it('lets the cook write a finding that needs nobody else to approve it', () => {
    const applied = granted(createUserFinding(CANDIDATE, IDENTITY, 'user', T1));

    expect(applied.finding.status).toBe('approved');
    expect(applied.finding.createdBy).toBe('user');
    expect(validateFinding(applied.finding)).toEqual([]);
  });

  it('proposes a lesson without requiring a finding behind it', () => {
    const lesson = granted(
      applyLessonCandidate({ cookId: 'cook-01', text: 'Rest the rice.' }, { id: 'lesson-01' }, T1),
    );

    expect(lesson.status).toBe('proposed');
    expect(lesson.cookId).toBe('cook-01');
    expect(lesson.provenance).toBe('live');
    expect(validateLesson(lesson)).toEqual([]);
  });

  it('marks an imported proposal as imported, which is not the same as who wrote it', () => {
    const applied = granted(
      applyFindingCandidate(CANDIDATE, { id: 'finding-01', provenance: 'imported' }, 'user', T1),
    );

    expect(applied.finding.provenance).toBe('imported');
    expect(applied.finding.createdBy).toBe('user');
  });
});

describe('rule 8 — a cook’s edit makes the words theirs', () => {
  it('sets createdBy to user and stamps updatedAt', () => {
    const before = proposed();
    const edited = granted(updateFinding(before, { text: 'My words' }, 'user', T2));

    expect(before.createdBy).toBe('ai');
    expect(edited.createdBy).toBe('user');
    expect(edited.updatedAt).toBe(T2);
    expect(edited.text).toBe('My words');
    expect(edited.id).toBe(before.id);
    expect(validateFinding(edited)).toEqual([]);
  });

  it('leaves the assistant unable to touch it afterwards', () => {
    const edited = granted(updateFinding(proposed(), { text: 'My words' }, 'user', T2));

    expect(refusalCode(updateFinding(edited, { text: 'Assistant words' }, 'ai', T2))).toBe(
      'ai_cannot_update_user_authored_record',
    );
  });

  it('lets the assistant revise its own undecided proposal without claiming authorship', () => {
    const revised = granted(updateFinding(proposed(), { text: 'Resting matters more' }, 'ai', T2));

    expect(revised.createdBy).toBe('ai');
    expect(revised.updatedAt).toBe(T2);
  });

  it('lets the cook change the class and confidence of a claim', () => {
    const edited = granted(
      updateFinding(proposed(), { class: 'observed', confidence: 'high' }, 'user', T2),
    );

    expect(edited.class).toBe('observed');
    expect(edited.confidence).toBe('high');
  });
});

describe('rule 9 — a lesson has no author column', () => {
  const lesson = (): Lesson =>
    granted(applyLessonCandidate({ cookId: 'cook-01', text: 'Rest it.' }, { id: 'lesson-01' }, T1));

  it('updates the text and the timestamp, and invents nothing', () => {
    const before = lesson();
    const edited = granted(updateLesson(before, { text: 'Rest it for ten minutes.' }, 'user', T2));

    expect(edited.text).toBe('Rest it for ten minutes.');
    expect(edited.updatedAt).toBe(T2);
    expect(Object.keys(edited).sort()).toEqual(Object.keys(before).sort());
    expect(validateLesson(edited)).toEqual([]);
  });
});

describe('rules 6 and 7 — approval protects, rejection retains', () => {
  it('refuses the assistant an approved finding', () => {
    const approved = granted(decideFinding(proposed(), 'approve', 'user', T2));

    expect(approved.status).toBe('approved');
    expect(refusalCode(updateFinding(approved, { text: 'Second thoughts' }, 'ai', T2))).toBe(
      'ai_cannot_update_approved_record',
    );
  });

  it('refuses the assistant an approved lesson', () => {
    const proposedLesson = granted(
      applyLessonCandidate({ cookId: 'cook-01', text: 'Rest it.' }, { id: 'lesson-01' }, T1),
    );
    const approved = granted(decideLesson(proposedLesson, 'approve', 'user', T2));

    expect(approved.status).toBe('approved');
    expect(refusalCode(updateLesson(approved, { text: 'Twenty minutes.' }, 'ai', T2))).toBe(
      'ai_cannot_update_approved_record',
    );
    // The cook may still revise their own.
    expect(granted(updateLesson(approved, { text: 'Fifteen minutes.' }, 'user', T2)).text).toBe(
      'Fifteen minutes.',
    );
  });

  it('refuses the assistant a rejected record', () => {
    const rejected = granted(decideFinding(proposed(), 'reject', 'user', T2));

    expect(refusalCode(updateFinding(rejected, { text: 'Retry' }, 'ai', T2))).toBe(
      'ai_cannot_update_rejected_record',
    );
  });

  it('keeps the whole row when a finding is rejected', () => {
    const before = proposed();
    const rejected = granted(decideFinding(before, 'reject', 'user', T2));

    expect(rejected.status).toBe('rejected');
    expect(rejected.id).toBe(before.id);
    expect(rejected.text).toBe(before.text);
    expect(rejected.class).toBe(before.class);
    expect(rejected.rationale).toBe(before.rationale);
    expect(rejected.confidence).toBe(before.confidence);
    expect(rejected.createdBy).toBe(before.createdBy);
    expect(rejected.cookId).toBe(before.cookId);
    expect(validateFinding(rejected)).toEqual([]);
  });

  it('keeps the whole row when a lesson is rejected', () => {
    const before = granted(
      applyLessonCandidate({ cookId: 'cook-01', text: 'Rest it.' }, { id: 'lesson-01' }, T1),
    );
    const rejected = granted(decideLesson(before, 'reject', 'user', T2));

    expect(rejected.status).toBe('rejected');
    expect(rejected.id).toBe(before.id);
    expect(rejected.text).toBe(before.text);
    expect(validateLesson(rejected)).toEqual([]);
  });

  it('makes a decision the cook’s alone', () => {
    expect(refusalCode(decideFinding(proposed(), 'approve', 'ai', T2))).toBe(
      'ai_cannot_decide_status',
    );
    expect(refusalCode(decideFinding(proposed(), 'reject', 'ai', T2))).toBe(
      'ai_cannot_decide_status',
    );
  });

  it('offers no way back out of rejected', () => {
    const rejected = granted(decideFinding(proposed(), 'reject', 'user', T2));

    expect(refusalCode(decideFinding(rejected, 'approve', 'user', T2))).toBe(
      'invalid_status_transition',
    );
    expect(refusalCode(decideFinding(rejected, 'reject', 'user', T2))).toBe(
      'invalid_status_transition',
    );
  });

  it('refuses to approve what is already approved', () => {
    const approved = granted(decideFinding(proposed(), 'approve', 'user', T2));

    expect(refusalCode(decideFinding(approved, 'approve', 'user', T2))).toBe(
      'invalid_status_transition',
    );
  });
});

describe('briefing feedback', () => {
  const BRIEFING = {
    id: 'briefing-01',
    cookId: 'cook-02',
    content: { headline: 'Before this cook' },
    useful: null,
    createdAt: T0,
  } as const;

  it('is the cook’s to give, in three states', () => {
    expect(granted(recordBriefingUsefulness(BRIEFING, true, 'user')).useful).toBe(true);
    expect(granted(recordBriefingUsefulness(BRIEFING, false, 'user')).useful).toBe(false);
    expect(granted(recordBriefingUsefulness(BRIEFING, null, 'user')).useful).toBeNull();
  });

  it('cannot be answered by the assistant on their behalf', () => {
    expect(refusalCode(recordBriefingUsefulness(BRIEFING, true, 'ai'))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });
});
