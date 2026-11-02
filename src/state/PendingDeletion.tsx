/**
 * The one cook or note whose deletion can still be undone, and the bar that
 * offers it.
 *
 * Mounted once, above every screen, because a cook deleted from its own page
 * is deleted on the way back to Home or History, and the Undo has to be on
 * whichever screen the cook lands on. The bar reads "Cook deleted · Undo" for
 * `UNDO_WINDOW_MS`; then the deletion is finished for good.
 *
 * A written note (0.4.0, rule 14) is held the same way, with "Note deleted ·
 * Undo" for the same `UNDO_WINDOW_MS`; the cook page and the counts leave it
 * out while it is held. Unlike a cook, a note is held in memory only
 * (`src/data/deletion/notes.ts`): if this provider goes, or the app closes,
 * before the window passes, the note is simply not deleted.
 *
 * One at a time: deleting a second cook or note while the first one's Undo is
 * still up finishes the first. Two Undo bars stacked, or one that undoes the
 * wrong thing, would be worse than either.
 *
 * `version` changes whenever a cook or a note disappears or returns, so a
 * screen that lists them adds it to its refresh token and reloads.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UndoBar as SharedUndoBar } from '../components/UndoBar';
import { COOK_DELETED, NOTE_DELETED, UNDO } from '../content/product';
import { UNDO_WINDOW_MS } from '../data/deletion/workflow';
import type { CookEventId, CookId } from '../domain/entities';
import { makeStyles } from '../theme/theme';
import { space } from '../theme/tokens';
import { useStorageState } from './StorageProvider';

/** What the Undo bar is holding: a cook, or one written note on a cook. */
type Held =
  | { readonly kind: 'cook'; readonly cookId: CookId }
  | { readonly kind: 'note'; readonly noteId: CookEventId; readonly cookId: CookId };

export type PendingDeletion = {
  /** The cook whose Undo is showing, or `null`. */
  readonly pending: CookId | null;
  /** The note whose Undo is showing, or `null` (0.4.0). */
  readonly pendingNote: CookEventId | null;
  /** Changes whenever a cook or a note leaves or returns. */
  readonly version: number;
  /** Hide the cook and show Undo. Resolves with a message if it was not deleted. */
  requestDelete(cookId: CookId): Promise<string | null>;
  /** Hold a written note back and show "Note deleted · Undo". A message if refused. */
  requestDeleteNote(noteId: CookEventId): Promise<string | null>;
  undo(): Promise<void>;
  /**
   * A pane that will draw the Undo bar itself (0.3.0): on two panes the bar
   * sits inside Home's list pane, where the deleted cook was, rather than
   * across the whole display. Returns the release.
   */
  claimBar(): () => void;
};

const INERT: PendingDeletion = {
  pending: null,
  pendingNote: null,
  version: 0,
  requestDelete: async () => 'Deleting is not available here.',
  requestDeleteNote: async () => 'Deleting is not available here.',
  undo: async () => {},
  claimBar: () => () => {},
};

const PendingDeletionContext = createContext<PendingDeletion>(INERT);

export function usePendingDeletion(): PendingDeletion {
  return useContext(PendingDeletionContext);
}

export function PendingDeletionProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const state = useStorageState();
  const deletions = state.status === 'ready' ? state.storage.deletions : null;
  const noteDeletions = state.status === 'ready' ? state.storage.noteDeletions : null;
  const [held, setHeld] = useState<Held | null>(null);
  const [version, setVersion] = useState(0);
  const [claims, setClaims] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<Held | null>(null);

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /**
   * Make the pending deletion final. A cook that fails stays hidden and the
   * next start retries; a note that fails is simply shown again.
   */
  const finishNow = useCallback(async () => {
    clearTimer();
    const was = current.current;
    current.current = null;
    setHeld(null);
    if (was === null) {
      return;
    }
    try {
      if (was.kind === 'cook') {
        await deletions?.finish(was.cookId);
      } else {
        await noteDeletions?.finish(was.noteId);
      }
    } catch {
      // A cook: still in `cook_deletions`, so still hidden, finished at next
      // start. A note: nothing was deleted, and it is back on its page.
    }
    bump();
  }, [deletions, noteDeletions, bump]);

  /** Hold this one, and finish it when the window passes. */
  const hold = useCallback(
    (next: Held) => {
      current.current = next;
      setHeld(next);
      bump();
      timer.current = setTimeout(() => {
        void finishNow();
      }, UNDO_WINDOW_MS);
    },
    [finishNow, bump],
  );

  const requestDelete = useCallback(
    async (cookId: CookId): Promise<string | null> => {
      if (deletions === null) {
        return INERT.requestDelete(cookId);
      }
      if (current.current !== null) {
        await finishNow();
      }
      const outcome = await deletions.request(cookId);
      if (outcome.status !== 'pending') {
        return outcome.message;
      }
      hold({ kind: 'cook', cookId });
      return null;
    },
    [deletions, finishNow, hold],
  );

  const requestDeleteNote = useCallback(
    async (noteId: CookEventId): Promise<string | null> => {
      if (noteDeletions === null) {
        return INERT.requestDeleteNote(noteId);
      }
      if (current.current !== null) {
        await finishNow();
      }
      const outcome = await noteDeletions.request(noteId);
      if (outcome.status !== 'pending') {
        return outcome.message;
      }
      hold({ kind: 'note', noteId, cookId: outcome.cookId });
      return null;
    },
    [noteDeletions, finishNow, hold],
  );

  const undo = useCallback(async () => {
    clearTimer();
    const was = current.current;
    current.current = null;
    setHeld(null);
    if (was === null) {
      return;
    }
    if (was.kind === 'cook') {
      await deletions?.undo(was.cookId);
    } else {
      noteDeletions?.undo(was.noteId);
    }
    bump();
  }, [deletions, noteDeletions, bump]);

  // Leaving the app's root is not a reason to delete anything early: a cook
  // still pending is finished at the next start, as the cook asked, and a
  // note still held is let go and kept, as if the app had closed.
  const noteStore = useRef(noteDeletions);
  useEffect(() => {
    noteStore.current = noteDeletions;
  }, [noteDeletions]);
  useEffect(
    () => () => {
      clearTimer();
      const was = current.current;
      if (was !== null && was.kind === 'note') {
        noteStore.current?.undo(was.noteId);
      }
    },
    [],
  );

  const claimBar = useCallback(() => {
    setClaims((count) => count + 1);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        setClaims((count) => count - 1);
      }
    };
  }, []);

  const pending = held?.kind === 'cook' ? held.cookId : null;
  const pendingNote = held?.kind === 'note' ? held.noteId : null;
  const value = useMemo<PendingDeletion>(
    () => ({ pending, pendingNote, version, requestDelete, requestDeleteNote, undo, claimBar }),
    [pending, pendingNote, version, requestDelete, requestDeleteNote, undo, claimBar],
  );

  return (
    <PendingDeletionContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {held !== null && claims === 0 ? <UndoBar note={held.kind === 'note'} onUndo={() => void undo()} /> : null}
      </View>
    </PendingDeletionContext.Provider>
  );
}

/**
 * The Undo bar inside a pane (0.3.0). `ScreenContainer` puts one in the main
 * pane on two panes; while it is there, the bar across the whole display is
 * not drawn.
 */
export function UndoSlot({ inline = false }: { inline?: boolean }) {
  const { pending, pendingNote, undo, claimBar } = usePendingDeletion();
  useEffect(() => claimBar(), [claimBar]);
  if (pending === null && pendingNote === null) {
    return null;
  }
  const note = pendingNote !== null;
  // Inline: in the caller's own column, above Home's New Cook (0.4.0).
  return inline ? (
    <SharedUndoBar
      message={note ? NOTE_DELETED : COOK_DELETED}
      undoLabel={UNDO}
      onUndo={() => void undo()}
      undoHint={undoHint(note)}
      testID="undo-bar"
      undoTestID="undo-delete"
    />
  ) : (
    <UndoBar note={note} onUndo={() => void undo()} inPane />
  );
}

function undoHint(note: boolean): string {
  return note ? 'Brings the note back exactly as it was' : 'Brings the cook back exactly as it was';
}

/** "Cook deleted · Undo" or "Note deleted · Undo", over the bottom of whatever screen or pane is showing. */
function UndoBar({ note, onUndo, inPane = false }: { note: boolean; onUndo: () => void; inPane?: boolean }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <SharedUndoBar
      message={note ? NOTE_DELETED : COOK_DELETED}
      undoLabel={UNDO}
      onUndo={onUndo}
      undoHint={undoHint(note)}
      testID="undo-bar"
      undoTestID="undo-delete"
      style={[styles.bar, { bottom: (inPane ? 0 : insets.bottom) + space.md }]}
    />
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    bar: {
      position: 'absolute',
      left: space.md,
      right: space.md,
    },
  }),
);
