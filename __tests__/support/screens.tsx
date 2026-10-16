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
import { createExportService } from '../../src/data/export/service';
import type { ExportFile, ExportSink } from '../../src/data/export/sink';
import { createPrivateFileStore } from '../../src/data/files/privateFileStore';
import { LATEST_SCHEMA_VERSION } from '../../src/data/schema/migrations';
import { countingIds, openTestDatabase, type TestDatabase } from './database';
import { memoryFileSystem, nodeDigest } from './memoryPorts';

/**
 * A share sheet that only remembers. `shared` is every file handed to it, in
 * order; `fail` makes the next hand-over throw, as a device with nowhere to
 * send a file would.
 */
export type RecordingSink = ExportSink & {
  readonly shared: ExportFile[];
  fail: Error | null;
};

export function recordingSink(): RecordingSink {
  const sink: RecordingSink = {
    shared: [],
    fail: null,
    async canShare() {
      return true;
    },
    async share(file) {
      if (sink.fail) {
        throw sink.fail;
      }
      sink.shared.push(file);
    },
  };
  return sink;
}

export type ScreenHarness = {
  readonly db: TestDatabase;
  readonly storage: AppStorage;
  /** What the screens' exports handed to the share sheet. */
  readonly sink: RecordingSink;
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

  const now = () => new Date(clock).toISOString();
  const sink = recordingSink();

  const storage: AppStorage = {
    data: db.data,
    assistant: createUnavailableAiService(),
    exporter: createExportService({
      data: db.data,
      photos: createPrivateFileStore(memoryFileSystem(), nodeDigest),
      schemaVersion: LATEST_SCHEMA_VERSION,
      sink,
      variant: 'test',
      now,
    }),
    newId,
    now,
  };

  return {
    db,
    storage,
    sink,
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
