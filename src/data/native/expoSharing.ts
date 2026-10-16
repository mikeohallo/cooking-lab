/**
 * The system share sheet, and the one temporary file it is shown.
 *
 * `Paths.cache` is the right place for an export and the wrong place for
 * everything else this app stores: the file exists to be handed to another
 * app in the next few seconds, and the system is welcome to reclaim it after
 * that. The person's copy is wherever the share sheet put it; this one is
 * disposable by design. Compare `./expoFileSystem.ts`, where `Paths.cache`
 * deliberately appears nowhere.
 *
 * Each export overwrites its own file name, so a second "Export everything"
 * on the same day replaces the first rather than leaving copies behind.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ExportFile, ExportSink } from '../export/sink';

const EXPORT_DIRECTORY = 'exports';

function exportsDirectory(): Directory {
  return new Directory(Paths.cache, EXPORT_DIRECTORY);
}

export const expoSharingSink: ExportSink = {
  async canShare(): Promise<boolean> {
    return Sharing.isAvailableAsync();
  },

  async share(file: ExportFile): Promise<void> {
    const directory = exportsDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const target = new File(directory, file.fileName);
    target.create({ overwrite: true, intermediates: true });
    target.write(file.text);
    await Sharing.shareAsync(target.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.fileName,
    });
  },
};
