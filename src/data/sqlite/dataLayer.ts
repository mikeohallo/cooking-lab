/**
 * Everything the app needs from storage, assembled once.
 *
 * A screen is given a `DataLayer` and never a database handle, so the day the
 * store changes is the day this one function changes. It is also the boundary
 * the assistant cannot cross: an `AiService` is constructed somewhere else
 * entirely, is never passed a `DataLayer`, and could not use one if it were —
 * see `findDatabaseHandles` in `src/data/adapters.ts`.
 *
 * The repositories are built first and then handed to the services, which is
 * the whole of the dependency graph: repositories know SQL, services know the
 * evidence rules, and screens know neither.
 */

import type { DatabaseAdapter } from '../adapters';
import type { DataLayer } from '../repositories';
import {
  createBriefingRepository,
  createCookEventRepository,
  createCookRepository,
  createCookTagRepository,
  createFindingRepository,
  createImportBatchRepository,
  createLessonRepository,
  createSchemaStateRepository,
  createTagRepository,
  type IdSource,
} from './repositories';
import {
  createBriefingService,
  createCookCaptureService,
  createReviewService,
  createSnapshotService,
} from './services';

/**
 * Build the data layer over an open, migrated database.
 *
 * `newId` supplies identifiers for the one kind of row the store creates on its
 * own account — a tag the cook has just named for the first time. Everything
 * else arrives with an id already decided by the caller, because an id that the
 * storage layer invented would make a record's identity depend on where it was
 * saved.
 */
export function createSqliteDataLayer(adapter: DatabaseAdapter, newId: IdSource): DataLayer {
  const cooks = createCookRepository(adapter);
  const cookEvents = createCookEventRepository(adapter);
  const findings = createFindingRepository(adapter);
  const lessons = createLessonRepository(adapter);
  const tags = createTagRepository(adapter, newId);
  const cookTags = createCookTagRepository(adapter);
  const briefings = createBriefingRepository(adapter);
  const importBatches = createImportBatchRepository(adapter);
  const schemaState = createSchemaStateRepository(adapter);

  return {
    cooks,
    cookEvents,
    findings,
    lessons,
    tags,
    cookTags,
    briefings,
    importBatches,
    schemaState,
    review: createReviewService(findings, lessons),
    capture: createCookCaptureService(cooks, cookEvents),
    briefingWorkflow: createBriefingService(briefings),
    snapshots: createSnapshotService(adapter),
  };
}
