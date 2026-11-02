/**
 * Rule 14 (0.4.0): a written note is deleted only by its owner.
 *
 * The one exception to "a kept cook keeps every word", named and narrow: the
 * cook may delete a `user_note` of theirs; nothing else is deletable this
 * way, and the assistant may delete nothing. The rules around it are pinned
 * here too, unchanged: Remove still takes back only a photograph, a note's
 * first words still cannot be overwritten, and an edit still keeps them.
 */

import {
  deleteNote,
  removeCookEvent,
  reviseNote,
  updateCookEvent,
  type EvidenceDecision,
} from '../src/domain/evidence';
import type { CookEvent } from '../src/domain/entities';
import { COOK_EVENT_KINDS } from '../src/domain/enums';

const T1 = '2026-11-02T17:05:00.000Z';

function refusal<T>(decision: EvidenceDecision<T>): string | null {
  return decision.allowed ? null : decision.code;
}

function entry(kind: CookEvent['kind']): CookEvent {
  return {
    id: `event-${kind.replace('_', '-')}`,
    cookId: 'cook-01',
    ts: T1,
    kind,
    body: kind === 'temp' || kind === 'photo' ? null : 'Words.',
    meta: kind === 'temp' ? { celsius: 180 } : null,
    photoPath: kind === 'photo' ? 'photos/cook-01/x.jpg' : null,
  };
}

const NOTE = entry('user_note');

describe('rule 14 — deleting a written note', () => {
  it('lets the cook delete their own written note, handing it back unchanged', () => {
    const decision = deleteNote(NOTE, 'user');
    expect(decision).toEqual({ allowed: true, record: NOTE });
  });

  it('refuses the assistant, even for a written note', () => {
    expect(refusal(deleteNote(NOTE, 'ai'))).toBe('ai_cannot_delete_a_note');
  });

  it('refuses every other kind of entry, for the cook and for the assistant', () => {
    for (const kind of COOK_EVENT_KINDS.filter((each) => each !== 'user_note')) {
      expect(refusal(deleteNote(entry(kind), 'user'))).toBe('only_a_written_note_may_be_deleted');
      expect(refusal(deleteNote(entry(kind), 'ai'))).toBe('ai_cannot_delete_a_note');
    }
  });

  it('leaves the other rules that keep a cook’s words as they were', () => {
    // Remove (rule 10) still takes back a photograph and nothing else.
    expect(refusal(removeCookEvent(NOTE, 'user'))).toBe('only_a_photo_may_be_removed');
    expect(refusal(removeCookEvent(entry('photo'), 'ai'))).toBe('ai_cannot_remove_raw_evidence');
    // A note's first words still cannot be overwritten in place (rule 11).
    expect(refusal(updateCookEvent(NOTE, { body: 'Other words.' }, 'user'))).toBe(
      'words_are_revised_not_overwritten',
    );
    // An edit is still a new version beside them, and the assistant makes none.
    expect(reviseNote(NOTE, 'New words.', { id: 'rev-1' }, 'user', T1).allowed).toBe(true);
    expect(refusal(reviseNote(NOTE, 'New words.', { id: 'rev-1' }, 'ai', T1))).toBe(
      'ai_cannot_write_raw_evidence',
    );
  });
});
