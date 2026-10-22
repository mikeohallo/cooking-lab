/**
 * Getting a cook's history out of the phone.
 *
 * Two exports, one service:
 *
 *   `exportEverything`  the portable backup — every record, as the validated
 *                       JSON envelope `src/data/backup/` defines, for keeping
 *                       somewhere the phone is not. Readable by a future
 *                       version of the app, by another device, or by a person
 *                       with a text editor.
 *   `exportCook`        one cook as plain text a person would actually read
 *                       (`./cookText.ts`), for sending or keeping.
 *
 * Both hand a file to the system share sheet through an `ExportSink` and
 * stop there: where it goes is the person's choice, and the app never learns
 * it.
 *
 * WHAT AN EXPORT CAN NEVER DO
 * ---------------------------
 * Change anything. The service holds the data layer for reading and the
 * photo store for checking that photographs exist; nothing in here writes to
 * either, and a failed export — the sink throwing, a backup that does not
 * validate, a cook that is not there — comes back as a value with a message,
 * with the store exactly as it was. Nothing secret can be in a file because
 * nothing secret is reachable from here: the database key is not an input to
 * anything this module touches (see `../backup/assemble.ts`).
 */

import type { AppVariant } from '../../config/variants';
import type { CookId } from '../../domain/entities';
import type { PrivateFileStore } from '../adapters';
import type { DataLayer } from '../repositories';
import { assembleBackup } from '../backup/assemble';
import { serialiseBackup } from '../backup/validation';
import { cookExportFileName, renderCookAsText } from './cookText';
import type { ExportFile, ExportSink } from './sink';
import { formatFileDate } from '../../format/dateTime';

export type ExportOutcome =
  | {
      readonly ok: true;
      readonly fileName: string;
      /** One line for the screen: what went into the file. */
      readonly summary: string;
    }
  | { readonly ok: false; readonly message: string };

export type ExportService = {
  exportEverything(): Promise<ExportOutcome>;
  exportCook(cookId: CookId): Promise<ExportOutcome>;
};

export type ExportServiceDependencies = {
  readonly data: DataLayer;
  readonly photos: PrivateFileStore;
  readonly schemaVersion: number;
  readonly sink: ExportSink;
  readonly variant: AppVariant;
  readonly now: () => string;
};

export const BACKUP_MIME_TYPE = 'application/json';
export const COOK_TEXT_MIME_TYPE = 'text/plain';

export const NOTHING_TO_EXPORT = 'There are no cooks to export yet.';
export const SHARING_UNAVAILABLE = 'This device has nowhere to send a file.';
export const COOK_NOT_FOUND = 'That cook isn’t here. Nothing was exported.';

function failure(cause: unknown): ExportOutcome {
  return {
    ok: false,
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `cooking-lab-backup-2026-10-16.json`, or the TEST-labelled form. */
export function backupFileName(fileDate: string, variant: AppVariant): string {
  return variant === 'test'
    ? `cooking-lab-TEST-backup-${fileDate}.json`
    : `cooking-lab-backup-${fileDate}.json`;
}

export function createExportService(deps: ExportServiceDependencies): ExportService {
  const { data, photos, schemaVersion, sink, variant, now } = deps;

  async function handOver(file: ExportFile): Promise<void> {
    if (!(await sink.canShare())) {
      throw new Error(SHARING_UNAVAILABLE);
    }
    await sink.share(file);
  }

  return {
    async exportEverything(): Promise<ExportOutcome> {
      try {
        const at = now();
        const assembly = await assembleBackup(data.snapshots, photos, schemaVersion, at);
        if (!assembly.valid) {
          const first = assembly.issues[0];
          return {
            ok: false,
            message: `The backup did not pass its own checks, so no file was made. ${first ? `${first.at}: ${first.message}` : ''}`.trim(),
          };
        }
        const cooks = assembly.envelope.entities.cooks.length;
        if (cooks === 0) {
          return { ok: false, message: NOTHING_TO_EXPORT };
        }
        const fileName = backupFileName(formatFileDate(at), variant);
        await handOver({ fileName, mimeType: BACKUP_MIME_TYPE, text: serialiseBackup(assembly.envelope) });

        const photosNote =
          assembly.missingPhotos.length > 0
            ? ` ${plural(assembly.missingPhotos.length, 'photo')} named in the timeline could not be found on this phone and ${assembly.missingPhotos.length === 1 ? 'is' : 'are'} listed as missing.`
            : '';
        return {
          ok: true,
          fileName,
          summary: `${plural(cooks, 'cook')} in ${fileName}.${photosNote}`,
        };
      } catch (cause: unknown) {
        return failure(cause);
      }
    },

    async exportCook(cookId: CookId): Promise<ExportOutcome> {
      try {
        const cook = await data.cooks.findById(cookId);
        if (cook === null) {
          return { ok: false, message: COOK_NOT_FOUND };
        }
        const [events, lessons, tags] = await Promise.all([
          data.cookEvents.listForCook({ cookId, sort: 'oldest_first' }),
          data.lessons.list({ cookId, status: 'approved', sort: 'oldest_first' }),
          data.cookTags.listForCook(cookId),
        ]);
        const at = now();
        const fileName = cookExportFileName(cook, formatFileDate(at), variant);
        const text = renderCookAsText({ cook, events, lessons, tags, variant, exportedAt: at });
        await handOver({ fileName, mimeType: COOK_TEXT_MIME_TYPE, text });
        return {
          ok: true,
          fileName,
          summary: `${plural(events.length, 'timeline entry', 'timeline entries')} and the verdict in ${fileName}.`,
        };
      } catch (cause: unknown) {
        return failure(cause);
      }
    },
  };
}
