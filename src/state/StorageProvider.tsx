/**
 * Hands the opened store to the screens.
 *
 * The root layout opens the store once at launch; this provider is where the
 * outcome lives so any screen can read it. Screens take the `DataLayer` and
 * the `AiService` from here and nothing lower: the database connection is not
 * in the context because nothing above the data layer should be able to reach
 * it, and the assistant is in the context precisely so screens can ask it for
 * candidates without ever handing it a repository.
 *
 * Tests supply a store built on the Node SQLite harness through the same
 * provider, which is what lets a screen be tested end to end against real SQL.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { AiService, PrivateFileStore } from '../data/adapters';
import type { CookDeletionWorkflow } from '../data/deletion/workflow';
import type { ExportService } from '../data/export/service';
import type { PhotoService } from '../data/photos/capture';
import type { DataLayer } from '../data/repositories';
import type { StorageStartupResult } from '../data/runtime';
import type { DatabaseStartupFailureReason } from '../data/sqlite/lifecycle';

/** What a screen can use. Deliberately not the whole `CookingLabStorage`. */
export type AppStorage = {
  readonly data: DataLayer;
  readonly assistant: AiService;
  /** Hands history out of the phone. Reads only; see `src/data/export/`. */
  readonly exporter: ExportService;
  /**
   * The photo store, for resolving a stored photograph to something an
   * `<Image>` can draw. A screen reads from it; adding and removing go through
   * `photoWorkflow`, which is the only thing that writes a photograph.
   */
  readonly photos: PrivateFileStore;
  readonly photoWorkflow: PhotoService;
  /** Deletes a cook, with an undo window. See `src/data/deletion/workflow.ts`. */
  readonly deletions: CookDeletionWorkflow;
  /** Supplies ids for the records screens create: cooks, events, lessons. */
  readonly newId: () => string;
  /** The current instant, in the ISO UTC form the data model requires. */
  readonly now: () => string;
};

export type StorageState =
  | { readonly status: 'starting' }
  | { readonly status: 'ready'; readonly storage: AppStorage }
  | {
      readonly status: 'failed';
      readonly reason: DatabaseStartupFailureReason | 'unexpected';
      readonly message: string;
    };

const StorageContext = createContext<StorageState | null>(null);

type StorageProviderProps = {
  children: ReactNode;
  /** Opens the store. Memoised by the caller so two mounts share one connection. */
  start: () => Promise<StorageStartupResult>;
  newId: () => string;
  now?: () => string;
  /**
   * Called with the outcome, success or failure. The app uses it to write the
   * one startup line the device log is read from; it never sees the key.
   */
  onStarted?: (result: StorageStartupResult) => void;
};

/** ISO-8601 in UTC with millisecond precision, the one timestamp form the model accepts. */
export function isoNow(): string {
  return new Date().toISOString();
}

/** Open the store on mount and publish the outcome. */
export function StorageProvider({
  children,
  start,
  newId,
  now = isoNow,
  onStarted,
}: StorageProviderProps) {
  const [state, setState] = useState<StorageState>({ status: 'starting' });

  useEffect(() => {
    let live = true;
    start()
      .then((result) => {
        onStarted?.(result);
        if (!live) {
          return;
        }
        if (result.ok) {
          setState({
            status: 'ready',
            storage: {
              data: result.storage.data,
              assistant: result.storage.assistant,
              exporter: result.storage.exporter,
              photos: result.storage.photos,
              photoWorkflow: result.storage.photoWorkflow,
              deletions: result.storage.deletions,
              newId,
              now,
            },
          });
        } else {
          setState({ status: 'failed', reason: result.reason, message: result.message });
        }
      })
      .catch((cause: unknown) => {
        if (live) {
          setState({
            status: 'failed',
            reason: 'unexpected',
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });
    return () => {
      live = false;
    };
  }, [start, newId, now, onStarted]);

  return <StorageContext.Provider value={state}>{children}</StorageContext.Provider>;
}

/** For tests and previews: publish an already-open store without starting anything. */
export function ReadyStorageProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage: AppStorage;
}) {
  return (
    <StorageContext.Provider value={{ status: 'ready', storage }}>{children}</StorageContext.Provider>
  );
}

export function useStorageState(): StorageState {
  const state = useContext(StorageContext);
  if (state === null) {
    throw new Error('useStorageState must be used inside a StorageProvider');
  }
  return state;
}

/**
 * The store, for a screen that is only rendered once it is ready.
 *
 * Screens are mounted behind `StartupGate`, so reaching this hook in any other
 * state is a programming error rather than a condition to handle.
 */
export function useStorage(): AppStorage {
  const state = useStorageState();
  if (state.status !== 'ready') {
    throw new Error(`storage is not ready (${state.status})`);
  }
  return state.storage;
}
