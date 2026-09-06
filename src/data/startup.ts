/**
 * Opening the store when the app launches, once.
 *
 * The app has no screen that reads or writes anything yet — that is the M2
 * workflow — but the store still has to be opened at launch, because opening it
 * is where the key is created, the migrations run and the recovery check
 * happens. This module is that step and nothing more: it starts the store,
 * remembers the outcome, and describes it in one line.
 *
 * IT CHANGES NOTHING ON SCREEN
 * ----------------------------
 * Deliberately. What it produces is a short line in the device log, which is
 * what the native build evidence for this milestone is read from. Showing the
 * outcome to the person using the app is part of the M2 work that will have
 * something to say when it goes wrong.
 *
 * NOTHING HERE NAMES THE KEY
 * --------------------------
 * `describeStartup` is built from the outcome, the schema version and whether
 * this was a first run. The key is not one of its inputs and is not reachable
 * from any of them.
 */

import { getAppVariant } from '../config/appIdentity';
import { newDeviceId } from './native/expoCrypto';
import { startCookingLabStorage, type StorageStartupResult } from './runtime';

let started: Promise<StorageStartupResult> | null = null;

/**
 * Start the store, or hand back the attempt that is already running.
 *
 * Memoised because the database is opened once per launch: two callers must get
 * the same connection, not two connections to one encrypted file.
 */
export function initialiseStorage(): Promise<StorageStartupResult> {
  started ??= startCookingLabStorage({ variant: getAppVariant(), newId: newDeviceId });
  return started;
}

/** One line, safe to log: what happened, and nothing about the key. */
export function describeStartup(result: StorageStartupResult): string {
  if (!result.ok) {
    return `Cooking Lab storage did not open: ${result.reason}`;
  }
  const state = result.storage.freshInstall ? 'created' : 'opened';
  return `Cooking Lab storage ${state} at schema version ${result.storage.schemaVersion}`;
}
