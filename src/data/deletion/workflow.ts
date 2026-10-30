/**
 * Deleting a cook, with an undo window (0.2.2).
 *
 * Three steps, and the order is the safety property:
 *
 *   1. `request` — rule 12 decides (`deleteCook`: the cook may, the assistant
 *      may not), and the cook is hidden. One row in `cook_deletions`; nothing
 *      of the cook is touched. Every list, count and export stops showing it.
 *   2. `undo` — within the window, the row is removed and the cook is back
 *      exactly as it was, because nothing else was ever changed.
 *   3. `finish` — once the window has passed, the cook is deleted for good: its
 *      rows in one transaction (`CookDeletionRepository.purge`), then its photo
 *      files. Rows first and files second, as `PhotoService.remove` does: a
 *      failure in between leaves at most a file nothing refers to, never a
 *      timeline entry pointing at nothing.
 *
 * If the app closes during the window, step 3 runs at the next start
 * (`finishPending`), which also deletes any photo file whose cook is no longer
 * there — the files a step 3 that was interrupted after its transaction would
 * otherwise leave behind.
 */

import type { CookId, IsoTimestamp } from '../../domain/entities';
import type { PrivateFileStore } from '../adapters';
import type { DataLayer } from '../repositories';
import { cookIdFromPhotoPath } from '../photos/photoPaths';

/** How long "Cook deleted · Undo" stays up before the deletion is final. */
export const UNDO_WINDOW_MS = 5_000;

export type DeletionRequestOutcome =
  | { readonly status: 'pending'; readonly cookId: CookId; readonly title: string | null }
  | { readonly status: 'refused'; readonly message: string }
  | { readonly status: 'failed'; readonly message: string };

export type CookDeletionWorkflow = {
  /** Hide the cook for its undo window. */
  request(cookId: CookId): Promise<DeletionRequestOutcome>;
  /** Bring it back exactly as it was. */
  undo(cookId: CookId): Promise<void>;
  /** Delete it for good: rows, then photo files. */
  finish(cookId: CookId): Promise<void>;
  /**
   * Finish every deletion still pending — after a restart — and delete photo
   * files that belong to no cook. Returns how many cooks were finished.
   */
  finishPending(): Promise<number>;
};

export type CookDeletionDependencies = {
  readonly data: DataLayer;
  readonly photos: PrivateFileStore;
  readonly now: () => IsoTimestamp;
};

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createCookDeletionWorkflow(deps: CookDeletionDependencies): CookDeletionWorkflow {
  const { data, photos, now } = deps;

  /** Delete a file and never let a failure stop the rest. */
  async function deleteQuietly(path: string): Promise<void> {
    try {
      await photos.delete(path);
    } catch {
      // A file left behind belongs to no cook; `finishPending` finds it at the
      // next start. The rows are what decide what is in the notebook.
    }
  }

  async function finish(cookId: CookId): Promise<void> {
    const { photoPaths } = await data.cookDeletions.purge(cookId);
    for (const path of photoPaths) {
      await deleteQuietly(path);
    }
  }

  return {
    async request(cookId: CookId): Promise<DeletionRequestOutcome> {
      try {
        const decision = await data.capture.requestCookDeletion(cookId, 'user', now());
        if (!decision.allowed) {
          return { status: 'refused', message: decision.message };
        }
        return { status: 'pending', cookId, title: decision.record.title };
      } catch (cause: unknown) {
        return { status: 'failed', message: describe(cause) };
      }
    },

    async undo(cookId: CookId): Promise<void> {
      await data.cookDeletions.cancel(cookId);
    },

    finish,

    async finishPending(): Promise<number> {
      const pending = await data.cookDeletions.listPending();
      for (const cookId of pending) {
        await finish(cookId);
      }

      // Files whose cook is gone. Only those: a file whose cook is still here
      // is that cook's business, whatever its row says.
      const stored = await photos.list();
      const known = new Map<CookId, boolean>();
      for (const file of stored) {
        const cookId = cookIdFromPhotoPath(file.logicalPath);
        if (cookId === null) {
          continue;
        }
        if (!known.has(cookId)) {
          known.set(cookId, (await data.cooks.findById(cookId)) !== null);
        }
        if (known.get(cookId) === false) {
          await deleteQuietly(file.logicalPath);
        }
      }
      return pending.length;
    },
  };
}
