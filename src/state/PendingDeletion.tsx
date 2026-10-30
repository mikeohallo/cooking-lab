/**
 * The one cook whose deletion can still be undone, and the bar that offers it.
 *
 * Mounted once, above every screen, because a cook deleted from its own page
 * is deleted on the way back to Home or History, and the Undo has to be on
 * whichever screen the cook lands on. The bar reads "Cook deleted · Undo" for
 * `UNDO_WINDOW_MS`; then the deletion is finished for good.
 *
 * One at a time: deleting a second cook while the first one's Undo is still up
 * finishes the first. Two Undo bars stacked, or one that undoes the wrong cook,
 * would be worse than either.
 *
 * `version` changes whenever a cook disappears from or returns to the lists, so
 * a screen that lists cooks adds it to its refresh token and reloads.
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

import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { COOK_DELETED, UNDO } from '../content/product';
import { UNDO_WINDOW_MS } from '../data/deletion/workflow';
import type { CookId } from '../domain/entities';
import { colors, radius, space } from '../theme/tokens';
import { useStorageState } from './StorageProvider';

export type PendingDeletion = {
  /** The cook whose Undo is showing, or `null`. */
  readonly pending: CookId | null;
  /** Changes whenever a cook leaves or returns to the lists. */
  readonly version: number;
  /** Hide the cook and show Undo. Resolves with a message if it was not deleted. */
  requestDelete(cookId: CookId): Promise<string | null>;
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
  version: 0,
  requestDelete: async () => 'Deleting is not available here.',
  undo: async () => {},
  claimBar: () => () => {},
};

const PendingDeletionContext = createContext<PendingDeletion>(INERT);

export function usePendingDeletion(): PendingDeletion {
  return useContext(PendingDeletionContext);
}

export function PendingDeletionProvider({ children }: { children: ReactNode }) {
  const state = useStorageState();
  const deletions = state.status === 'ready' ? state.storage.deletions : null;
  const [pending, setPending] = useState<CookId | null>(null);
  const [version, setVersion] = useState(0);
  const [claims, setClaims] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<CookId | null>(null);

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Make the pending deletion final. A failure leaves the cook hidden; the next start retries. */
  const finishNow = useCallback(async () => {
    clearTimer();
    const cookId = current.current;
    current.current = null;
    setPending(null);
    if (cookId === null || deletions === null) {
      return;
    }
    try {
      await deletions.finish(cookId);
    } catch {
      // Still in `cook_deletions`, so still hidden, and finished at next start.
    }
    bump();
  }, [deletions, bump]);

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
      current.current = cookId;
      setPending(cookId);
      bump();
      timer.current = setTimeout(() => {
        void finishNow();
      }, UNDO_WINDOW_MS);
      return null;
    },
    [deletions, finishNow, bump],
  );

  const undo = useCallback(async () => {
    clearTimer();
    const cookId = current.current;
    current.current = null;
    setPending(null);
    if (cookId === null || deletions === null) {
      return;
    }
    await deletions.undo(cookId);
    bump();
  }, [deletions, bump]);

  // Leaving the app's root is not a reason to delete anything early: a cook
  // still pending is finished at the next start, as the cook asked.
  useEffect(() => () => clearTimer(), []);

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

  const value = useMemo<PendingDeletion>(
    () => ({ pending, version, requestDelete, undo, claimBar }),
    [pending, version, requestDelete, undo, claimBar],
  );

  return (
    <PendingDeletionContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {pending !== null && claims === 0 ? <UndoBar onUndo={() => void undo()} /> : null}
      </View>
    </PendingDeletionContext.Provider>
  );
}

/**
 * The Undo bar inside a pane (0.3.0). `ScreenContainer` puts one in the main
 * pane on two panes; while it is there, the bar across the whole display is
 * not drawn.
 */
export function UndoSlot() {
  const { pending, undo, claimBar } = usePendingDeletion();
  useEffect(() => claimBar(), [claimBar]);
  return pending !== null ? <UndoBar onUndo={() => void undo()} inPane /> : null;
}

/** "Cook deleted · Undo", over the bottom of whatever screen or pane is showing. */
function UndoBar({ onUndo, inPane = false }: { onUndo: () => void; inPane?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, { bottom: (inPane ? 0 : insets.bottom) + space.md }]}
      accessibilityLiveRegion="polite"
      testID="undo-bar"
    >
      <AppText variant="bodyStrong" tone="onPrimary" style={styles.message}>
        {COOK_DELETED}
      </AppText>
      <ActionButton
        label={UNDO}
        variant="secondary"
        onPress={onUndo}
        accessibilityHint="Brings the cook back exactly as it was"
        testID="undo-delete"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: space.xs,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderRadius: radius.card,
    backgroundColor: colors.text,
  },
  message: {
    flexShrink: 1,
  },
});
