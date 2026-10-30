/**
 * One cook as a text file a person would read.
 *
 * This is the export for *reading* — sending a cook to someone, or keeping
 * one dinner's record somewhere outside the app. The portable backup is the
 * export for *restoring*, and the two deliberately share nothing but their
 * input: a backup must be exact and machine-checkable; this file must be
 * pleasant on a phone screen, in an email, or printed. Plain text, not
 * Markdown or HTML, because plain text opens everywhere and never needs a
 * viewer to be installed first.
 *
 * NOTHING IS REWORDED
 * -------------------
 * The verdict, every note and every lesson appear exactly as they were
 * stored, whitespace included. The only text this module adds is labels,
 * times and the line saying where the file came from.
 *
 * A note or a verdict the cook has edited (0.2.2) is printed as it now reads —
 * its newest version, exactly as typed — and marked "(edited)", so a reader
 * knows there were earlier words. Every version is in *Export everything*.
 */

import type { Cook, CookEvent, Lesson, Revision, Tag } from '../../domain/entities';
import { latestWords } from '../../domain/evidence';
import { photoPlacedWhenAdded } from '../../domain/photoTime';
import type { AppVariant } from '../../config/variants';
import { celsiusFromEvent, readingKindFromEvent } from '../../domain/invariants';
import { formatDateTimeWithYear, formatTime } from '../../format/dateTime';

export type CookTextInput = {
  readonly cook: Cook;
  /** The timeline, oldest first. */
  readonly events: readonly CookEvent[];
  /** Approved lessons only. A proposal is not part of a cook's record. */
  readonly lessons: readonly Lesson[];
  /** The cook's tags, as they are on screen. */
  readonly tags: readonly Tag[];
  /** Every edit of this cook's notes and verdict. Empty when there are none. */
  readonly revisions?: readonly Revision[];
  readonly variant: AppVariant;
  /** When the file was made. */
  readonly exportedAt: string;
};

export const UNTITLED_COOK_EXPORT = 'Untitled cook';

/** Printed after words the cook has edited since they were first written. */
export const EDITED_MARK = '(edited)';

/** The line a TEST-build file carries so it can never pass for real history. */
export const TEST_EXPORT_NOTICE =
  'TEST build. This file comes from the Cooking Lab TEST app and is not real cooking history.';

function formatCelsiusPlain(event: CookEvent): string {
  const reading = celsiusFromEvent(event);
  if (reading === null) {
    return '— °C';
  }
  const value = Number.isInteger(reading) ? String(reading) : reading.toFixed(1).replace(/\.0$/, '');
  return `${value}°C`;
}

function whereOf(event: CookEvent): string | null {
  const meta = event.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const where = (meta as Record<string, unknown>).where;
  return typeof where === 'string' && where.trim() !== '' ? where : null;
}

/**
 * What a reading was taken of, in words, for a file with no colours in it.
 *
 * The screen tells an oven reading from an internal one by its card as well as
 * its label. A text file has only the label, which is the reason the label
 * exists on the screen too: the word is the information and the colour was only
 * ever helping.
 */
function readingLabelOf(event: CookEvent): string | null {
  switch (readingKindFromEvent(event)) {
    case 'oven':
      return 'Oven';
    case 'internal':
      return 'Internal';
    case 'none':
      return null;
  }
}

/**
 * One timeline entry as a line: the time, then what happened.
 *
 * `edits` are this note's revisions, if it has any: the line then carries its
 * newest words and says it was edited.
 */
export function renderEventLine(event: CookEvent, edits: readonly Revision[] = []): string {
  const time = formatTime(event.ts).padEnd(8, ' ');
  switch (event.kind) {
    case 'user_note': {
      const shown = latestWords(event.body, edits);
      return shown.edited ? `${time} ${shown.text ?? ''} ${EDITED_MARK}` : `${time} ${event.body ?? ''}`;
    }
    case 'temp': {
      // Both, when there is both: the kind says what it was taken of and the
      // cook's own words say where. Neither is a substitute for the other.
      const detail = [readingLabelOf(event), whereOf(event)].filter(
        (part) => part !== null && part !== '',
      );
      const suffix = detail.length === 0 ? '' : ` — ${detail.join(', ')}`;
      return `${time} ${formatCelsiusPlain(event)}${suffix}`;
    }
    case 'photo':
      return photoPlacedWhenAdded(event) ? `${time} [Photo, added]` : `${time} [Photo]`;
    case 'assistant_msg':
      return `${time} Assistant: ${event.body ?? ''}`;
    case 'plan':
      return `${time} Plan: ${event.body ?? ''}`;
  }
}

/**
 * The whole cook, as text.
 *
 * Sections appear only when they have something in them, except the verdict,
 * which is always present: a reviewed cook with no verdict says so rather than
 * leaving a reader to wonder whether a line went missing.
 */
export function renderCookAsText(input: CookTextInput): string {
  const { cook, events, lessons, tags, variant, exportedAt } = input;
  const revisions = input.revisions ?? [];
  const verdict = latestWords(
    cook.verdict,
    revisions.filter((revision) => revision.field === 'verdict'),
  );
  const title = cook.title ?? UNTITLED_COOK_EXPORT;
  const lines: string[] = [];

  lines.push(`Cooking Lab — ${title}`);
  lines.push(`Started: ${formatDateTimeWithYear(cook.startedAt)}`);
  if (cook.status === 'reviewed') {
    lines.push(
      cook.reviewSavedAt
        ? `Reviewed: ${formatDateTimeWithYear(cook.reviewSavedAt)}`
        : 'Reviewed',
    );
  } else {
    lines.push('Status: still open — not yet reviewed');
  }
  if (variant === 'test') {
    lines.push(TEST_EXPORT_NOTICE);
  }
  lines.push('');

  if (tags.length > 0) {
    lines.push(`Tags: ${tags.map((tag) => tag.name).join(', ')}`);
    lines.push('');
  }

  lines.push(verdict.edited ? `Verdict ${EDITED_MARK}` : 'Verdict');
  if (verdict.text !== null && verdict.text.trim() !== '') {
    lines.push(verdict.text);
  } else {
    lines.push(cook.status === 'reviewed' ? 'No verdict was written for this cook.' : 'Not reviewed yet.');
  }
  lines.push('');

  if (lessons.length > 0) {
    lines.push('Next time');
    for (const lesson of lessons) {
      lines.push(`- ${lesson.text}`);
    }
    lines.push('');
  }

  lines.push('Timeline');
  if (events.length === 0) {
    lines.push('Nothing was noted during this cook.');
  } else {
    for (const event of events) {
      lines.push(
        renderEventLine(
          event,
          revisions.filter((revision) => revision.cookEventId === event.id),
        ),
      );
    }
  }
  lines.push('');

  // A plain-text file cannot show a photograph, so it says which ones there
  // were and when. The timeline already marks where each one sits; this is the
  // list a reader scans to know there are three pictures of this dinner
  // somewhere, and at what point in the cooking each was taken.
  const photos = events.filter((event) => event.kind === 'photo');
  if (photos.length > 0) {
    lines.push('Photos');
    for (const photo of photos) {
      lines.push(
        photoPlacedWhenAdded(photo)
          ? `Photo, added ${formatTime(photo.ts)}`
          : `Photo, ${formatTime(photo.ts)}`,
      );
    }
    lines.push('');
  }

  lines.push(
    revisions.length > 0
      ? `Exported from Cooking Lab on ${formatDateTimeWithYear(exportedAt)}. Everything above is the cook's own record; words marked ${EDITED_MARK} are shown as the cook last wrote them, and every earlier version is kept in the app.`
      : `Exported from Cooking Lab on ${formatDateTimeWithYear(exportedAt)}. Everything above is the cook's own record, unchanged.`,
  );
  lines.push('');

  return lines.join('\n');
}

/** `cooking-lab-cook-2026-10-16-pork-chops.txt` — short, safe, and telling. */
export function cookExportFileName(cook: Cook, fileDate: string, variant: AppVariant): string {
  const slug = (cook.title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const label = variant === 'test' ? 'cooking-lab-TEST-cook' : 'cooking-lab-cook';
  return slug === '' ? `${label}-${fileDate}.txt` : `${label}-${fileDate}-${slug}.txt`;
}
