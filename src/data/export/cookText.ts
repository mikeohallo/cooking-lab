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
 */

import type { Cook, CookEvent, Lesson } from '../../domain/entities';
import type { AppVariant } from '../../config/variants';
import { celsiusFromEvent } from '../../domain/invariants';
import { formatDateTimeWithYear, formatTime } from '../../format/dateTime';

export type CookTextInput = {
  readonly cook: Cook;
  /** The timeline, oldest first. */
  readonly events: readonly CookEvent[];
  /** Approved lessons only. A proposal is not part of a cook's record. */
  readonly lessons: readonly Lesson[];
  readonly variant: AppVariant;
  /** When the file was made. */
  readonly exportedAt: string;
};

export const UNTITLED_COOK_EXPORT = 'Untitled cook';

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

/** One timeline entry as a line: the time, then what happened. */
export function renderEventLine(event: CookEvent): string {
  const time = formatTime(event.ts).padEnd(8, ' ');
  switch (event.kind) {
    case 'user_note':
      return `${time} ${event.body ?? ''}`;
    case 'temp': {
      const where = whereOf(event);
      return `${time} ${formatCelsiusPlain(event)}${where ? ` — ${where}` : ''}`;
    }
    case 'photo':
      return `${time} [Photo]`;
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
  const { cook, events, lessons, variant, exportedAt } = input;
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

  lines.push('Verdict');
  if (cook.verdict !== null && cook.verdict.trim() !== '') {
    lines.push(cook.verdict);
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
      lines.push(renderEventLine(event));
    }
  }
  lines.push('');

  lines.push(
    `Exported from Cooking Lab on ${formatDateTimeWithYear(exportedAt)}. Everything above is the cook's own record, unchanged.`,
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
