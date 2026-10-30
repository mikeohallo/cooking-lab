/**
 * Edits keep the earlier words (0.2.2, rule 11).
 *
 * The promise this pins: nothing the cook writes is lost. A note or a verdict
 * can be reworded, open cook or reviewed, and every edit is a new revision
 * beside the original — the original row stays exactly as it was first
 * written, byte for byte, and keeps its place in the timeline. The newest
 * words are what a screen shows and what *Export this cook* prints, marked
 * "(edited)"; every version is still there to read.
 */

import {
  deleteCook,
  latestWords,
  reviseNote,
  reviseVerdict,
  saveCookReview,
  type EvidenceDecision,
} from '../src/domain/evidence';
import type { Cook, CookEvent, Revision } from '../src/domain/entities';
import { validateRevision } from '../src/domain/invariants';
import { EDITED_MARK, renderCookAsText } from '../src/data/export/cookText';
import { openTestDatabase, type TestDatabase } from './support/database';

const T0 = '2026-10-29T17:00:00.000Z';
const T1 = '2026-10-29T17:05:00.000Z';
const T2 = '2026-10-29T19:00:00.000Z';
const T3 = '2026-10-30T08:00:00.000Z';
const T4 = '2026-10-30T09:00:00.000Z';

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`expected allowed, refused: ${decision.code}`);
  }
  return decision.record;
}

function refusal<T>(decision: EvidenceDecision<T>): string | null {
  return decision.allowed ? null : decision.code;
}

const NOTE: CookEvent = {
  id: 'event-note',
  cookId: 'cook-01',
  ts: T1,
  kind: 'user_note',
  body: 'Salted at 8.',
  meta: null,
  photoPath: null,
};

const OPEN: Cook = {
  id: 'cook-01',
  title: null,
  status: 'open',
  provenance: 'live',
  parentCookId: null,
  startedAt: T0,
  reviewOpenedAt: null,
  reviewSavedAt: null,
  verdict: null,
  createdAt: T0,
};

const REVIEWED: Cook = { ...OPEN, status: 'reviewed', reviewOpenedAt: T2, reviewSavedAt: T2, verdict: 'Good.' };

describe('rule 11 in the domain', () => {
  it('rewords a note as a new revision and leaves the note as it was', () => {
    const before = JSON.stringify(NOTE);
    const revision = granted(reviseNote(NOTE, 'Salted at 7, not 8.', { id: 'rev-1' }, 'user', T3));

    expect(revision).toEqual({
      id: 'rev-1',
      cookId: 'cook-01',
      cookEventId: 'event-note',
      field: 'note',
      text: 'Salted at 7, not 8.',
      revisedAt: T3,
    });
    expect(JSON.stringify(NOTE)).toBe(before);
    expect(validateRevision(revision)).toEqual([]);
  });

  it('keeps the new words exactly as typed', () => {
    const typed = '  Salted at 7.\n  "Not" 8.  ';
    expect(granted(reviseNote(NOTE, typed, { id: 'rev-1' }, 'user', T3)).text).toBe(typed);
  });

  it('refuses the assistant, a reading, a photo and an empty edit', () => {
    expect(refusal(reviseNote(NOTE, 'x', { id: 'r' }, 'ai', T3))).toBe('ai_cannot_write_raw_evidence');
    const reading: CookEvent = { ...NOTE, kind: 'temp', body: null, meta: { celsius: 60 } };
    expect(refusal(reviseNote(reading, '61', { id: 'r' }, 'user', T3))).toBe('only_a_note_may_be_reworded');
    const photo: CookEvent = { ...NOTE, kind: 'photo', body: null, photoPath: 'cooks/x/a.jpg' };
    expect(refusal(reviseNote(photo, 'x', { id: 'r' }, 'user', T3))).toBe('only_a_note_may_be_reworded');
    expect(refusal(reviseNote(NOTE, '   ', { id: 'r' }, 'user', T3))).toBe('revision_needs_words');
  });

  it('rewords the verdict of a reviewed cook, and only of a reviewed one', () => {
    const revision = granted(reviseVerdict(REVIEWED, 'Good. Needed acid.', { id: 'rev-v' }, 'user', T3));
    expect(revision.field).toBe('verdict');
    expect(revision.cookEventId).toBeNull();
    expect(refusal(reviseVerdict(OPEN, 'x', { id: 'r' }, 'user', T3))).toBe(
      'only_a_reviewed_verdict_may_be_reworded',
    );
    expect(refusal(reviseVerdict(REVIEWED, 'x', { id: 'r' }, 'ai', T3))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });

  it('will not save a second review over a reviewed cook’s verdict', () => {
    expect(refusal(saveCookReview(REVIEWED, 'Different.', 'user', T3))).toBe(
      'words_are_revised_not_overwritten',
    );
    // Saving the same words again changes nothing and is not refused.
    expect(granted(saveCookReview(REVIEWED, 'Good.', 'user', T3)).verdict).toBe('Good.');
  });

  it('shows the newest words, and the original when there are none', () => {
    const edits: Revision[] = [
      { id: 'b', cookId: 'cook-01', cookEventId: 'event-note', field: 'note', text: 'second', revisedAt: T4 },
      { id: 'a', cookId: 'cook-01', cookEventId: 'event-note', field: 'note', text: 'first', revisedAt: T3 },
    ];
    expect(latestWords('original', edits)).toEqual({ text: 'second', edited: true });
    expect(latestWords('original', [])).toEqual({ text: 'original', edited: false });
  });

  it('refuses the assistant a cook’s deletion (rule 12)', () => {
    expect(refusal(deleteCook(REVIEWED, 'ai'))).toBe('ai_cannot_delete_a_cook');
    expect(granted(deleteCook(REVIEWED, 'user'))).toBe(REVIEWED);
  });
});

describe('edits against real SQLite', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await openTestDatabase();
    granted(await db.data.capture.startCook({ id: 'cook-01', startedAt: T0 }, 'user', T0));
    granted(
      await db.data.capture.addEvent(
        { id: 'event-note', cookId: 'cook-01', ts: T1, kind: 'user_note', body: 'Salted at 8.' },
        'user',
      ),
    );
    granted(
      await db.data.capture.addEvent(
        { id: 'event-later', cookId: 'cook-01', ts: T2, kind: 'user_note', body: 'Out at 62.' },
        'user',
      ),
    );
  });

  afterEach(async () => {
    await db.close();
  });

  const noteRow = async () =>
    db.adapter.select({ sql: "SELECT * FROM cook_events WHERE id = 'event-note'" });

  it('stores each edit beside the original, which stays byte for byte, in its place', async () => {
    const before = await noteRow();

    granted(await db.data.capture.reviseNote('event-note', 'Salted at 7.', { id: 'rev-1' }, 'user', T3));
    granted(await db.data.capture.reviseNote('event-note', 'Salted at 7:30.', { id: 'rev-2' }, 'user', T4));

    expect(await noteRow()).toEqual(before);
    const timeline = await db.data.cookEvents.listForCook({ cookId: 'cook-01' });
    expect(timeline.map((event) => event.id)).toEqual(['event-note', 'event-later']);

    const edits = await db.data.revisions.listForCook('cook-01');
    expect(edits.map((edit) => [edit.text, edit.revisedAt])).toEqual([
      ['Salted at 7.', T3],
      ['Salted at 7:30.', T4],
    ]);
    expect(latestWords(before[0]?.body as string, edits)).toEqual({ text: 'Salted at 7:30.', edited: true });
  });

  it('works the same on a reviewed cook, and edits its verdict without touching the column', async () => {
    granted(await db.data.capture.saveReview('cook-01', 'Good.', 'user', T2));
    const cookBefore = await db.adapter.select({ sql: "SELECT * FROM cooks WHERE id = 'cook-01'" });

    granted(await db.data.capture.reviseNote('event-note', 'Salted at 7.', { id: 'rev-1' }, 'user', T3));
    granted(await db.data.capture.reviseVerdict('cook-01', 'Good. Needed acid.', { id: 'rev-v' }, 'user', T3));

    expect(await db.adapter.select({ sql: "SELECT * FROM cooks WHERE id = 'cook-01'" })).toEqual(cookBefore);
    const edits = await db.data.revisions.listForCook('cook-01');
    expect(edits.map((edit) => edit.field).sort()).toEqual(['note', 'verdict']);
    expect(
      (await db.data.revisions.listVerdictsForCooks(['cook-01'])).map((edit) => edit.text),
    ).toEqual(['Good. Needed acid.']);
  });

  it('can no longer overwrite a note in place, even through the old door', async () => {
    const before = await noteRow();
    const decision = await db.data.capture.editEvent('event-note', { body: 'Rewritten' }, 'user');

    expect(refusal(decision)).toBe('words_are_revised_not_overwritten');
    expect(await noteRow()).toEqual(before);
  });

  it('stores nothing for a refused edit', async () => {
    expect(
      refusal(await db.data.capture.reviseNote('event-note', 'x', { id: 'r' }, 'ai', T3)),
    ).toBe('ai_cannot_write_raw_evidence');
    expect(await db.data.revisions.listForCook('cook-01')).toEqual([]);
  });

  it('goes with its cook', async () => {
    granted(await db.data.capture.reviseNote('event-note', 'Salted at 7.', { id: 'rev-1' }, 'user', T3));
    await db.data.cooks.delete('cook-01');
    expect(await db.data.revisions.listForCook('cook-01')).toEqual([]);
  });
});

describe('Export this cook, after edits', () => {
  it('prints the newest words marked (edited), and the originals where unedited', () => {
    const later: CookEvent = { ...NOTE, id: 'event-later', ts: T2, body: 'Out at 62.' };
    const text = renderCookAsText({
      cook: REVIEWED,
      events: [NOTE, later],
      lessons: [],
      tags: [],
      revisions: [
        { id: 'r1', cookId: 'cook-01', cookEventId: 'event-note', field: 'note', text: 'Salted at 7.', revisedAt: T3 },
        { id: 'r2', cookId: 'cook-01', cookEventId: null, field: 'verdict', text: 'Good. Needed acid.', revisedAt: T3 },
      ],
      variant: 'production',
      exportedAt: T4,
    });

    expect(text).toContain(`Salted at 7. ${EDITED_MARK}`);
    expect(text).not.toContain('Salted at 8.');
    expect(text).toContain('Out at 62.');
    expect(text).not.toContain(`Out at 62. ${EDITED_MARK}`);
    expect(text).toContain(`Your notes ${EDITED_MARK}\nGood. Needed acid.`);
  });

  it('prints exactly what it always did for a cook with no edits', () => {
    const text = renderCookAsText({
      cook: REVIEWED,
      events: [NOTE],
      lessons: [],
      tags: [],
      variant: 'production',
      exportedAt: T4,
    });
    expect(text).toContain('Salted at 8.');
    expect(text).not.toContain(EDITED_MARK);
    expect(text).toContain("Everything above is the cook's own record, unchanged.");
  });
});
