/**
 * Deleting a written note, with an undo window (0.4.0, rule 14).
 *
 * Three steps, as for a cook (`./workflow.ts`), with one difference that is
 * the safety property: the undo window lives in memory, not in the database.
 *
 *   1. `request` — rule 14 decides (`deleteNote`: the cook's own written note,
 *      never the assistant), and the note is held back. Nothing is written.
 *      Every screen, count and export leaves a held-back note out.
 *   2. `undo` — within the window, the note is let go and is back exactly as
 *      it was, in its place, with every earlier version, because nothing of it
 *      was ever touched.
 *   3. `finish` — once the window has passed, the note is deleted for good:
 *      its row and every revision of it, in one transaction
 *      (`CookEventRepository.deleteNote`).
 *
 * If the app closes during the window, step 3 never runs and nothing was
 * written, so the note is simply still there at the next start. No table, no
 * schema change, and nothing for the next start to finish.
 */

import type { CookEvent, CookEventId, CookId, DatabaseSnapshot, Revision } from '../../domain/entities';
import type { DataLayer } from '../repositories';

export type NoteDeletionRequestOutcome =
  | { readonly status: 'pending'; readonly noteId: CookEventId; readonly cookId: CookId }
  | { readonly status: 'refused'; readonly message: string }
  | { readonly status: 'failed'; readonly message: string };

export type NoteDeletionWorkflow = {
  /** Hold the note back for its undo window. Writes nothing. */
  request(noteId: CookEventId): Promise<NoteDeletionRequestOutcome>;
  /** Bring it back exactly as it was. */
  undo(noteId: CookEventId): void;
  /** Delete it for good, with its earlier versions. Does nothing once undone. */
  finish(noteId: CookEventId): Promise<void>;
  /** The notes held back now: left out of every screen, count and export. */
  pending(): ReadonlySet<CookEventId>;
};

export type NoteDeletionDependencies = {
  readonly data: DataLayer;
};

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createNoteDeletionWorkflow(deps: NoteDeletionDependencies): NoteDeletionWorkflow {
  const { data } = deps;
  const held = new Set<CookEventId>();

  return {
    async request(noteId: CookEventId): Promise<NoteDeletionRequestOutcome> {
      try {
        const decision = await data.capture.requestNoteDeletion(noteId, 'user');
        if (!decision.allowed) {
          return { status: 'refused', message: decision.message };
        }
        held.add(noteId);
        return { status: 'pending', noteId, cookId: decision.record.cookId };
      } catch (cause: unknown) {
        return { status: 'failed', message: describe(cause) };
      }
    },

    undo(noteId: CookEventId): void {
      held.delete(noteId);
    },

    async finish(noteId: CookEventId): Promise<void> {
      if (!held.has(noteId)) {
        return;
      }
      try {
        const decision = await data.capture.deleteNote(noteId, 'user');
        if (!decision.allowed) {
          throw new Error(decision.message);
        }
      } finally {
        // Deleted, or not deleted and therefore shown again: either way it is
        // no longer waiting on Undo.
        held.delete(noteId);
      }
    },

    pending(): ReadonlySet<CookEventId> {
      return new Set(held);
    },
  };
}

/** A cook's timeline and edits without the notes held back. */
export function withoutHeldNotes(
  events: readonly CookEvent[],
  revisions: readonly Revision[],
  held: ReadonlySet<CookEventId>,
): { readonly events: readonly CookEvent[]; readonly revisions: readonly Revision[] } {
  if (held.size === 0) {
    return { events, revisions };
  }
  return {
    events: events.filter((event) => !held.has(event.id)),
    revisions: revisions.filter((revision) => revision.cookEventId === null || !held.has(revision.cookEventId)),
  };
}

/**
 * The whole notebook without the notes held back, for Export everything: as
 * it will be once they are deleted for good — the note, its revisions and any
 * citation of it gone, exactly what the foreign keys will take.
 */
export function snapshotWithoutHeldNotes(
  snapshot: DatabaseSnapshot,
  held: ReadonlySet<CookEventId>,
): DatabaseSnapshot {
  if (held.size === 0) {
    return snapshot;
  }
  const { events, revisions } = withoutHeldNotes(snapshot.cookEvents, snapshot.revisions, held);
  return {
    ...snapshot,
    cookEvents: events,
    revisions,
    findingSources: snapshot.findingSources.filter((source) => !held.has(source.cookEventId)),
  };
}
