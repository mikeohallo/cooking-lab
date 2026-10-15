/**
 * Rendering a screen against a real database.
 *
 * The screens take their store from `StorageProvider`; here they are given a
 * store built on the Node SQLite harness, so a screen test exercises the real
 * repositories, the real services and real SQL. Ids and timestamps are
 * deterministic so assertions can name them.
 */

import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ReadyStorageProvider, type AppStorage } from '../../src/state/StorageProvider';
import { createUnavailableAiService } from '../../src/data/ai/unavailable';
import { countingIds, openTestDatabase, type TestDatabase } from './database';

export type ScreenHarness = {
  readonly db: TestDatabase;
  readonly storage: AppStorage;
  /** Advances the clock by one minute and returns the new instant. */
  tick(): string;
  /** Renders inside a ready `StorageProvider`. Overrides swap in parts of the store. */
  render(element: ReactElement, storage?: AppStorage): Promise<void>;
  close(): Promise<void>;
};

const START = Date.parse('2026-10-15T08:30:00.000Z');

/** A cover-screen-sized frame with a navigation bar, as the app's root provides. */
export const TEST_SAFE_AREA = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

export async function openScreenHarness(fileName?: string): Promise<ScreenHarness> {
  const db = await openTestDatabase(fileName);
  let clock = START;
  const newId = countingIds('id');

  const storage: AppStorage = {
    data: db.data,
    assistant: createUnavailableAiService(),
    newId,
    now: () => new Date(clock).toISOString(),
  };

  return {
    db,
    storage,
    tick() {
      clock += 60_000;
      return new Date(clock).toISOString();
    },
    async render(element, override = storage) {
      await render(
        <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
          <ReadyStorageProvider storage={override}>{element}</ReadyStorageProvider>
        </SafeAreaProvider>,
      );
    },
    close: () => db.close(),
  };
}
