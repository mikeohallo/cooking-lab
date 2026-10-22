import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { Briefing, Cook, CookEvent, ImportBatch } from '../src/domain/entities';
import type { EvidenceDecision } from '../src/domain/evidence';
import { isAllowed } from '../src/domain/evidence';
import { openTestDatabase, type TestDatabase } from './support/database';

/**
 * The repositories, against a real SQLite engine.
 *
 * Every constraint asserted here is SQLite's own: the CHECK lists, the unique
 * index on `(name, kind)`, the composite primary keys, the cascades and the
 * transaction boundaries. That is the point of using a real engine — a
 * hand-written stand-in would have to reimplement all of it, and a test against
 * a reimplementation proves only that it agrees with itself.
 */

const T0 = '2026-09-05T18:00:00.000Z';
const T1 = '2026-09-05T19:00:00.000Z';
const T2 = '2026-09-06T09:00:00.000Z';

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

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase(`repositories-${String(Math.random()).slice(2)}.db`);
});

afterEach(async () => {
  await db.close();
});

/** A cook, started the ordinary way. */
async function startCook(id = 'cook-01', title: string | null = 'Weeknight rice'): Promise<Cook> {
  const cook = granted(await db.data.capture.startCook({ id, title, startedAt: T0 }, 'user', T0));
  return cook;
}

async function addNote(cookId: string, id: string, body: string): Promise<CookEvent> {
  return granted(
    await db.data.capture.addEvent({ id, cookId, ts: T1, kind: 'user_note', body }, 'user'),
  );
}

describe('cooks round-trip through SQLite unchanged', () => {
  it('stores and reads back every controlled field', async () => {
    const cook = await startCook();

    const read = await db.data.cooks.findById('cook-01');

    expect(read).toEqual(cook);
    expect(read?.status).toBe('open');
    expect(read?.provenance).toBe('live');
    expect(read?.verdict).toBeNull();
  });

  it('keeps a thin cook, because a cook with only a start time is a real cook', async () => {
    const cook = granted(
      await db.data.capture.startCook({ id: 'cook-thin', startedAt: T0 }, 'user', T0),
    );

    expect(cook.title).toBeNull();
    expect(await db.data.cooks.findById('cook-thin')).toEqual(cook);
  });

  it('stores the verdict exactly as it was typed', async () => {
    await startCook();
    const typed = '  7/10 — "almost".\nToo much salt next time.  ';

    const saved = granted(await db.data.capture.saveReview('cook-01', typed, 'user', T2));

    expect(saved.verdict).toBe(typed);
    expect((await db.data.cooks.findById('cook-01'))?.verdict).toBe(typed);
  });

  it('links a repeat to the cook it followed on from, and keeps the child when the parent goes', async () => {
    await startCook('cook-01');
    await startCook('cook-02');
    granted(await db.data.capture.updateCook('cook-02', { parentCookId: 'cook-01' }, 'user'));

    expect(await db.data.cooks.listChildren('cook-01')).toHaveLength(1);

    await db.data.cooks.delete('cook-01');

    const survivor = await db.data.cooks.findById('cook-02');
    expect(survivor).not.toBeNull();
    expect(survivor?.parentCookId).toBeNull();
  });

  it('filters and counts by the corrected columns', async () => {
    await startCook('cook-01');
    await startCook('cook-02');
    granted(await db.data.capture.saveReview('cook-02', 'good', 'user', T2));

    expect((await db.data.cooks.list({ status: 'open' })).map((cook) => cook.id)).toEqual([
      'cook-01',
    ]);
    expect(await db.data.cooks.count({ status: 'reviewed' })).toBe(1);
    expect(await db.data.cooks.count()).toBe(2);
  });

  it('refuses a status the model does not have, at the database itself', async () => {
    await startCook();

    await expect(
      db.adapter.execute({
        sql: 'UPDATE cooks SET status = ? WHERE id = ?',
        params: ['in-progress', 'cook-01'],
      }),
    ).rejects.toBeDefined();
  });
});

describe('the timeline is stored in the order it happened', () => {
  it('reads events back oldest first, with meta and photo path intact', async () => {
    await startCook();
    await addNote('cook-01', 'event-01', 'Lid on.');
    granted(
      await db.data.capture.addEvent(
        { id: 'event-02', cookId: 'cook-01', ts: T2, kind: 'temp', meta: { celsius: 96 } },
        'user',
      ),
    );
    granted(
      await db.data.capture.addEvent(
        {
          id: 'event-03',
          cookId: 'cook-01',
          ts: T2,
          kind: 'photo',
          photoPath: 'cooks/cook-01/events/event-03/20260906t090000-01.jpg',
        },
        'user',
      ),
    );

    const timeline = await db.data.cookEvents.listForCook({ cookId: 'cook-01' });

    expect(timeline.map((event) => event.id)).toEqual(['event-01', 'event-02', 'event-03']);
    expect(timeline[1]?.meta).toEqual({ celsius: 96 });
    expect(timeline[2]?.photoPath).toBe(
      'cooks/cook-01/events/event-03/20260906t090000-01.jpg',
    );
  });

  it('refuses a photo path on anything but a photo event, at the database itself', async () => {
    await startCook();

    await expect(
      db.adapter.execute({
        sql: 'INSERT INTO cook_events (id, cook_id, ts, kind, body, meta, photo_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: ['event-bad', 'cook-01', T1, 'user_note', 'note', null, 'cooks/x/y.jpg'],
      }),
    ).rejects.toBeDefined();
  });

  it('takes the timeline with the cook when the cook is deleted', async () => {
    await startCook();
    await addNote('cook-01', 'event-01', 'Lid on.');

    await db.data.cooks.delete('cook-01');

    expect(await db.data.cookEvents.listForCook({ cookId: 'cook-01' })).toEqual([]);
  });
});

describe('a finding and its citations are written together or not at all', () => {
  async function cookWithEvents(): Promise<void> {
    await startCook();
    await addNote('cook-01', 'event-01', 'Lid on at a rolling boil.');
    await addNote('cook-01', 'event-02', 'Rested ten minutes.');
  }

  it('writes the finding and both citations in one go', async () => {
    await cookWithEvents();

    const applied = granted(
      await db.data.review.proposeFinding(
        {
          cookId: 'cook-01',
          class: 'inference',
          text: 'The rest is what made the difference.',
          confidence: 'medium',
          sourceEventIds: ['event-01', 'event-02'],
        },
        { id: 'finding-01' },
        'ai',
        T2,
      ),
    );

    expect(applied.finding.status).toBe('proposed');
    expect(applied.finding.createdBy).toBe('ai');
    expect(await db.data.findings.listSources('finding-01')).toHaveLength(2);
    expect(
      (await db.data.findings.listSourceEvents('finding-01')).map((event) => event.id),
    ).toEqual(['event-01', 'event-02']);
  });

  it('writes neither when a citation names an event that is not there', async () => {
    await cookWithEvents();

    await expect(
      db.data.review.proposeFinding(
        {
          cookId: 'cook-01',
          class: 'inference',
          text: 'A claim about nothing.',
          sourceEventIds: ['event-01', 'event-missing'],
        },
        { id: 'finding-02' },
        'ai',
        T2,
      ),
    ).rejects.toBeDefined();

    // The whole point: no orphaned finding was left behind.
    expect(await db.data.findings.findById('finding-02')).toBeNull();
    expect(await db.data.findings.listSources('finding-02')).toEqual([]);
  });

  it('finds every finding that cites a given timeline entry', async () => {
    await cookWithEvents();
    granted(
      await db.data.review.proposeFinding(
        { cookId: 'cook-01', class: 'observed', text: 'It boiled.', sourceEventIds: ['event-01'] },
        { id: 'finding-01' },
        'ai',
        T2,
      ),
    );

    expect((await db.data.findings.listCitingEvent('event-01')).map((f) => f.id)).toEqual([
      'finding-01',
    ]);
    expect(await db.data.findings.listCitingEvent('event-02')).toEqual([]);
  });

  it('lets general knowledge stand without citing this kitchen', async () => {
    await cookWithEvents();

    const applied = granted(
      await db.data.review.proposeFinding(
        {
          cookId: 'cook-01',
          class: 'knowledge',
          text: 'Rice keeps cooking off the heat.',
          sourceEventIds: [],
        },
        { id: 'finding-03' },
        'ai',
        T2,
      ),
    );

    expect(applied.finding.class).toBe('knowledge');
    expect(await db.data.findings.listSources('finding-03')).toEqual([]);
  });
});

describe('the evidence protections hold through the repositories', () => {
  beforeEach(async () => {
    await startCook();
    await addNote('cook-01', 'event-01', 'Lid on at a rolling boil.');
  });

  it('refuses the assistant a cook, a verdict and a timeline entry, and writes nothing', async () => {
    expect(
      refusalCode(await db.data.capture.startCook({ id: 'cook-ai', startedAt: T0 }, 'ai', T0)),
    ).toBe('ai_cannot_write_raw_evidence');
    expect(refusalCode(await db.data.capture.saveReview('cook-01', 'lovely', 'ai', T2))).toBe(
      'ai_cannot_write_raw_evidence',
    );
    expect(
      refusalCode(
        await db.data.capture.addEvent(
          { id: 'event-ai', cookId: 'cook-01', ts: T1, kind: 'user_note', body: 'I saw it' },
          'ai',
        ),
      ),
    ).toBe('ai_cannot_append_event_kind');

    expect(await db.data.cooks.findById('cook-ai')).toBeNull();
    expect((await db.data.cooks.findById('cook-01'))?.verdict).toBeNull();
    expect(await db.data.cookEvents.findById('event-ai')).toBeNull();
  });

  it('refuses the assistant an edit to the cook timeline', async () => {
    expect(
      refusalCode(await db.data.capture.editEvent('event-01', { body: 'Rewritten' }, 'ai')),
    ).toBe('ai_cannot_write_raw_evidence');

    expect((await db.data.cookEvents.findById('event-01'))?.body).toBe(
      'Lid on at a rolling boil.',
    );
  });

  it('lets the assistant add its own message and then never touch it again', async () => {
    const message = granted(
      await db.data.capture.addEvent(
        { id: 'event-ai-msg', cookId: 'cook-01', ts: T1, kind: 'assistant_msg', body: 'Try resting it.' },
        'ai',
      ),
    );

    expect(message.kind).toBe('assistant_msg');
    expect(
      refusalCode(await db.data.capture.editEvent('event-ai-msg', { body: 'Actually...' }, 'ai')),
    ).toBe('ai_cannot_write_raw_evidence');
    expect((await db.data.cookEvents.findById('event-ai-msg'))?.body).toBe('Try resting it.');
  });

  async function proposedFinding(): Promise<void> {
    granted(
      await db.data.review.proposeFinding(
        {
          cookId: 'cook-01',
          class: 'inference',
          text: 'The rest made the difference.',
          sourceEventIds: ['event-01'],
        },
        { id: 'finding-01' },
        'ai',
        T2,
      ),
    );
  }

  it('makes an edited finding the cook own words, which locks the assistant out for good', async () => {
    await proposedFinding();

    const edited = granted(
      await db.data.review.editFinding('finding-01', { text: 'The rest did it.' }, 'user', T2),
    );

    expect(edited.createdBy).toBe('user');
    expect(edited.updatedAt).toBe(T2);
    expect((await db.data.findings.findById('finding-01'))?.createdBy).toBe('user');

    expect(refusalCode(await db.data.review.editFinding('finding-01', { text: 'No' }, 'ai', T2))).toBe(
      'ai_cannot_update_user_authored_record',
    );
  });

  it('refuses the assistant an approved finding, and the stored row is unchanged', async () => {
    await proposedFinding();
    granted(await db.data.review.decideFinding('finding-01', 'approve', 'user', T2));

    expect(refusalCode(await db.data.review.editFinding('finding-01', { text: 'No' }, 'ai', T2))).toBe(
      'ai_cannot_update_approved_record',
    );
    expect((await db.data.findings.findById('finding-01'))?.text).toBe(
      'The rest made the difference.',
    );
  });

  it('refuses the assistant the decision itself', async () => {
    await proposedFinding();

    expect(refusalCode(await db.data.review.decideFinding('finding-01', 'approve', 'ai', T2))).toBe(
      'ai_cannot_decide_status',
    );
    expect((await db.data.findings.findById('finding-01'))?.status).toBe('proposed');
  });

  it('keeps a rejected finding, with its text, its class and its citations', async () => {
    await proposedFinding();

    const rejected = granted(await db.data.review.decideFinding('finding-01', 'reject', 'user', T2));

    expect(rejected.status).toBe('rejected');
    const stored = await db.data.findings.findById('finding-01');
    expect(stored).not.toBeNull();
    expect(stored?.text).toBe('The rest made the difference.');
    expect(stored?.class).toBe('inference');
    expect(await db.data.findings.listSources('finding-01')).toHaveLength(1);
    // And there is no way back out of it.
    expect(refusalCode(await db.data.review.decideFinding('finding-01', 'approve', 'user', T2))).toBe(
      'invalid_status_transition',
    );
  });

  it('keeps a rejected lesson too', async () => {
    granted(
      await db.data.review.proposeLesson({ cookId: 'cook-01', text: 'Rest it.' }, { id: 'lesson-01' }, T2),
    );

    granted(await db.data.review.decideLesson('lesson-01', 'reject', 'user', T2));

    const stored = await db.data.lessons.findById('lesson-01');
    expect(stored?.status).toBe('rejected');
    expect(stored?.text).toBe('Rest it.');
    expect(await db.data.lessons.list({ status: 'rejected' })).toHaveLength(1);
  });

  it('gives a proposal no way to arrive already approved', async () => {
    const applied = granted(
      await db.data.review.proposeFinding(
        { cookId: 'cook-01', class: 'observed', text: 'It boiled.', sourceEventIds: ['event-01'] },
        { id: 'finding-02' },
        'ai',
        T2,
      ),
    );

    expect(applied.finding.status).toBe('proposed');
    expect(await db.data.findings.list({ status: 'approved' })).toEqual([]);
  });
});

describe('tags are unique by name and kind, and normalised on the way in', () => {
  it('creates a tag once and finds it again however it is typed', async () => {
    const first = await db.data.tags.findOrCreate('Brown Butter', 'technique');
    const second = await db.data.tags.findOrCreate('  brown   butter  ', 'technique');

    expect(second.id).toBe(first.id);
    expect(first.name).toBe('brown butter');
    expect(await db.data.tags.list()).toHaveLength(1);
  });

  it('keeps the same word in two namespaces as two tags', async () => {
    const ingredient = await db.data.tags.findOrCreate('butter', 'ingredient');
    const technique = await db.data.tags.findOrCreate('butter', 'technique');

    expect(technique.id).not.toBe(ingredient.id);
    expect(await db.data.tags.list()).toHaveLength(2);
  });

  it('refuses a duplicate at the database itself, whatever the case', async () => {
    await db.data.tags.findOrCreate('butter', 'ingredient');

    await expect(
      db.adapter.execute({
        sql: 'INSERT INTO tags (id, name, kind) VALUES (?, ?, ?)',
        params: ['tag-99', 'BUTTER', 'ingredient'],
      }),
    ).rejects.toBeDefined();
  });

  it('links a cook to its tags and reads them back, without duplicating a link', async () => {
    await startCook();
    const tag = await db.data.tags.findOrCreate('risotto', 'dish');

    await db.data.cookTags.link({ cookId: 'cook-01', tagId: tag.id });
    await db.data.cookTags.link({ cookId: 'cook-01', tagId: tag.id });

    expect(await db.data.cookTags.listForCook('cook-01')).toEqual([tag]);
    expect(await db.data.cookTags.listCookIdsForTag(tag.id)).toEqual(['cook-01']);
  });

  it('filters cooks by every tag asked for, not by any of them', async () => {
    await startCook('cook-01');
    await startCook('cook-02');
    const dish = await db.data.tags.findOrCreate('risotto', 'dish');
    const technique = await db.data.tags.findOrCreate('braise', 'technique');
    await db.data.cookTags.link({ cookId: 'cook-01', tagId: dish.id });
    await db.data.cookTags.link({ cookId: 'cook-01', tagId: technique.id });
    await db.data.cookTags.link({ cookId: 'cook-02', tagId: dish.id });

    const both = await db.data.cooks.list({ tagIds: [dish.id, technique.id] });

    expect(both.map((cook) => cook.id)).toEqual(['cook-01']);
    expect((await db.data.cooks.list({ tagIds: [dish.id] })).length).toBe(2);
  });

  it('normalises a rename as well, so a rename cannot create a second spelling', async () => {
    const tag = await db.data.tags.findOrCreate('risoto', 'dish');

    const renamed = await db.data.tags.rename(tag.id, '  Risotto  ');

    expect(renamed.name).toBe('risotto');
  });
});

describe('a briefing is written with the cooks it came from', () => {
  it('stores the briefing, its JSON content and its sources in one go', async () => {
    await startCook('cook-01');
    await startCook('cook-02');
    const briefing: Briefing = {
      id: 'briefing-01',
      cookId: 'cook-02',
      content: { headline: 'Last time the rice was wet', points: ['less water'] },
      useful: null,
      createdAt: T2,
    };

    await db.data.briefingWorkflow.createBriefing(briefing, ['cook-01']);

    expect(await db.data.briefings.findById('briefing-01')).toEqual(briefing);
    expect((await db.data.briefings.listSourceCooks('briefing-01')).map((c) => c.id)).toEqual([
      'cook-01',
    ]);
  });

  it('writes neither when a source names a cook that is not there', async () => {
    await startCook('cook-02');
    const briefing: Briefing = {
      id: 'briefing-02',
      cookId: 'cook-02',
      content: {},
      useful: null,
      createdAt: T2,
    };

    await expect(
      db.data.briefingWorkflow.createBriefing(briefing, ['cook-missing']),
    ).rejects.toBeDefined();

    expect(await db.data.briefings.findById('briefing-02')).toBeNull();
  });

  it('keeps yes, no and not-yet-said as three different answers', async () => {
    await startCook('cook-01');
    const briefing: Briefing = {
      id: 'briefing-01',
      cookId: 'cook-01',
      content: {},
      useful: null,
      createdAt: T2,
    };
    await db.data.briefingWorkflow.createBriefing(briefing, []);

    expect((await db.data.briefings.findById('briefing-01'))?.useful).toBeNull();

    granted(await db.data.briefingWorkflow.recordUsefulness('briefing-01', false, 'user'));
    expect((await db.data.briefings.findById('briefing-01'))?.useful).toBe(false);
    expect(await db.data.briefings.list({ useful: false })).toHaveLength(1);
    expect(await db.data.briefings.list({ useful: true })).toHaveLength(0);

    granted(await db.data.briefingWorkflow.recordUsefulness('briefing-01', true, 'user'));
    expect((await db.data.briefings.findById('briefing-01'))?.useful).toBe(true);
  });

  it('refuses the assistant an answer about its own advice', async () => {
    await startCook('cook-01');
    await db.data.briefingWorkflow.createBriefing(
      { id: 'briefing-01', cookId: 'cook-01', content: {}, useful: null, createdAt: T2 },
      [],
    );

    expect(
      refusalCode(await db.data.briefingWorkflow.recordUsefulness('briefing-01', true, 'ai')),
    ).toBe('ai_cannot_write_raw_evidence');
    expect((await db.data.briefings.findById('briefing-01'))?.useful).toBeNull();
  });
});

describe('import batches and schema state', () => {
  it('stores a batch and keeps a failed one on the record', async () => {
    const batch: ImportBatch = {
      id: 'import-01',
      filename: 'notes.txt',
      status: 'processing',
      candidatesTotal: null,
      candidatesResolved: null,
      createdAt: T0,
    };

    await db.data.importBatches.create(batch);
    await db.data.importBatches.save({ ...batch, status: 'failed' });

    expect((await db.data.importBatches.findById('import-01'))?.status).toBe('failed');
    expect(await db.data.importBatches.list('failed')).toHaveLength(1);
  });

  it('reports the schema version and the tables that are actually there', async () => {
    const state = await db.data.schemaState.read();

    expect(state.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(state.appliedAt).not.toBeNull();
    expect(await db.data.schemaState.listTables()).toContain('finding_sources');
  });
});
