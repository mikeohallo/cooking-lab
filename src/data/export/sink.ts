/**
 * Where an export goes once it is text: the seam between "a file's worth of
 * the cook's own words" and the device's way of handing a file to another
 * app.
 *
 * WHY A SEAM
 * ----------
 * Everything that decides *what* an export contains is pure and lives next to
 * this file. The one thing that cannot be pure — putting a file in front of
 * the system share sheet — is behind this interface, so the export service
 * can be driven end to end in a test with a sink that merely records what it
 * was given, and the real sink (`src/data/native/expoSharing.ts`) stays a
 * dozen lines that do nothing clever.
 *
 * A sink hands the file *out*. It is never asked to read anything back, never
 * given a database, and never told where the file ends up: the share sheet
 * is the person's choice of destination, and the app does not get to know it.
 */

export type ExportFile = {
  /** A plain file name, never a path. */
  readonly fileName: string;
  readonly mimeType: string;
  /** The whole file, as text. Exports are text so a person can read them. */
  readonly text: string;
};

export type ExportSink = {
  /** False on a device that has nowhere to send a file. */
  canShare(): Promise<boolean>;
  /**
   * Put the file somewhere temporary and open the system share sheet on it.
   * Resolves once the sheet has been dealt with, including dismissed; a
   * dismissed sheet is not a failure.
   */
  share(file: ExportFile): Promise<void>;
};
