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

import { PendingDeletionProvider } from '../../src/state/PendingDeletion';
import { ReadyStorageProvider, type AppStorage } from '../../src/state/StorageProvider';
import type { CapturedImage, EncodedPhoto, PhotoEncoder, PhotoSource, PhotoSourceOutcome } from '../../src/data/adapters';
import { createUnavailableAiService } from '../../src/data/ai/unavailable';
import { createExportService } from '../../src/data/export/service';
import type { ExportFile, ExportSink } from '../../src/data/export/sink';
import { createPrivateFileStore } from '../../src/data/files/privateFileStore';
import { createPhotoService } from '../../src/data/photos/capture';
import { createCookDeletionWorkflow } from '../../src/data/deletion/workflow';
import { LATEST_SCHEMA_VERSION } from '../../src/data/schema/migrations';
import { countingIds, openTestDatabase, type TestDatabase } from './database';
import { memoryFileSystem, nodeDigest, type MemoryFileSystem } from './memoryPorts';

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

/**
 * A camera and a photo roll that answer however a test needs them to.
 *
 * `next` is what the next capture returns. Nothing about a real camera is being
 * imitated: the point is that the screen and the capture pipeline are the real
 * ones, and that cancelled, refused and failed can each be driven deliberately
 * rather than waited for.
 */
export type ScriptedPhotoSource = PhotoSource & {
  next: PhotoSourceOutcome;
  /** Every capture asked for, in order: `camera` or `library`. */
  readonly asked: ('camera' | 'library')[];
};

export function scriptedPhotoSource(bytes: Uint8Array): ScriptedPhotoSource & {
  readonly bytes: Uint8Array;
} {
  const source: ScriptedPhotoSource & { readonly bytes: Uint8Array } = {
    bytes,
    asked: [],
    next: {
      status: 'captured',
      image: { uri: 'file:///camera/shot.jpg', width: 3000, height: 2000 },
    },
    async takePhoto() {
      source.asked.push('camera');
      return source.next;
    },
    async choosePhoto() {
      source.asked.push('library');
      return source.next;
    },
  };
  return source;
}

/**
 * An encoder that hands back the bytes it was given, resized by nobody.
 *
 * Deliberately *does not* strip anything. The device's own encoder normally
 * drops metadata as a side effect of re-encoding, and this stands in for the
 * day it does not: the bytes arrive at the pipeline exactly as the camera wrote
 * them, metadata and all, so what the test proves is the app's own cleaning.
 */
export function passThroughEncoder(bytes: Uint8Array): PhotoEncoder {
  return {
    async encodeJpeg(image: CapturedImage): Promise<EncodedPhoto> {
      return { bytes, width: image.width, height: image.height };
    },
  };
}

export type ScreenHarness = {
  readonly db: TestDatabase;
  readonly storage: AppStorage;
  /** What the screens' exports handed to the share sheet. */
  readonly sink: RecordingSink;
  /** The camera and roll the screens' photo button reaches. */
  readonly camera: ScriptedPhotoSource;
  /** The files the photo store wrote, so a test can look at the bytes. */
  readonly files: MemoryFileSystem;
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

/**
 * A JPEG with nothing in it but the bytes a camera would write.
 *
 * Enough of one for a screen test: the pipeline checks that what it was handed
 * starts `FFD8` and walks its segments, and this is a JPEG by both of those
 * tests. `__tests__/photoCapture.test.ts` is where a picture carrying GPS is
 * put through it.
 */
const PLAIN_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x12, 0x34,
  0xff, 0xd9,
]);

export async function openScreenHarness(fileName?: string): Promise<ScreenHarness> {
  const db = await openTestDatabase(fileName);
  let clock = START;
  const newId = countingIds('id');

  const now = () => new Date(clock).toISOString();
  const sink = recordingSink();
  const files = memoryFileSystem();
  const photos = createPrivateFileStore(files, nodeDigest);
  const camera = scriptedPhotoSource(PLAIN_JPEG);

  const storage: AppStorage = {
    data: db.data,
    assistant: createUnavailableAiService(),
    exporter: createExportService({
      data: db.data,
      photos,
      schemaVersion: LATEST_SCHEMA_VERSION,
      sink,
      variant: 'test',
      now,
    }),
    photos,
    photoWorkflow: createPhotoService({
      data: db.data,
      photos,
      source: camera,
      encoder: passThroughEncoder(PLAIN_JPEG),
      newId,
      now,
    }),
    deletions: createCookDeletionWorkflow({ data: db.data, photos, now }),
    newId,
    now,
  };

  return {
    db,
    storage,
    sink,
    camera,
    files,
    tick() {
      clock += 60_000;
      return new Date(clock).toISOString();
    },
    async render(element, override = storage) {
      await render(
        <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
          <ReadyStorageProvider storage={override}>
            {/* As the root layout mounts it, so delete and Undo work as in the app. */}
            <PendingDeletionProvider>{element}</PendingDeletionProvider>
          </ReadyStorageProvider>
        </SafeAreaProvider>,
      );
    },
    close: () => db.close(),
  };
}
