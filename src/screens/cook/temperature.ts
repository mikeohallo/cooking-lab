/**
 * Turning what was typed into a temperature event, and back again.
 *
 * The rule is finite-number validation and nothing more: the product model has
 * one unit and no sanctioned range, and inventing a range here would be a
 * product decision wearing a parser's clothing. A reading of `-18` for the
 * freezer and `250` for the oven are both readings.
 *
 * A reading may also say what it was taken of — the oven's air, or the food
 * itself. That is stored as `meta.readingKind`, and only when it is one of
 * those two: a reading that does not say carries no such key at all, which is
 * what keeps every reading already in the notebook byte for byte as it was, and
 * what makes "somewhere else, in my own words" the same shape as a reading
 * taken before the kinds existed. See `READING_KINDS` in `src/domain/enums.ts`.
 */

import type { CookEvent, JsonObject } from '../../domain/entities';
import type { ReadingKind, StoredReadingKind } from '../../domain/enums';
import { READING_KIND_META_KEY, TEMPERATURE_META_KEY } from '../../domain/enums';
import { celsiusFromEvent, readingKindFromEvent } from '../../domain/invariants';

export const MAX_WHERE_LENGTH = 120;

export type TemperatureInput = {
  readonly celsius: string;
  readonly where: string;
  /**
   * What the reading was taken of. Omitted, or `'none'`, for a reading that
   * does not say — which is the case for the free-text *where* form.
   */
  readonly kind?: ReadingKind;
};

export type ParsedTemperature =
  | {
      readonly ok: true;
      readonly meta: JsonObject;
      readonly celsius: number;
      readonly where: string | null;
      readonly kind: ReadingKind;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Accepts `62`, `62.5`, `-18`, `  96 `, and a decimal comma. Refuses anything
 * that is not one finite number.
 */
export function parseTemperature(input: TemperatureInput): ParsedTemperature {
  const raw = input.celsius.trim().replace(',', '.');
  if (raw === '') {
    return { ok: false, message: 'Enter a temperature in °C.' };
  }
  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) {
    return { ok: false, message: 'Enter a number, such as 62 or 62.5.' };
  }
  const celsius = Number(raw);
  if (!Number.isFinite(celsius)) {
    return { ok: false, message: 'That is not a temperature this app can record.' };
  }

  const whereTrimmed = input.where.trim();
  if (whereTrimmed.length > MAX_WHERE_LENGTH) {
    return { ok: false, message: `Keep “where” under ${MAX_WHERE_LENGTH} characters.` };
  }
  const where = whereTrimmed === '' ? null : whereTrimmed;
  const kind: ReadingKind = input.kind ?? 'none';

  // Built key by key rather than with a spread of optionals, so it is plain to
  // read that `none` adds nothing: the meta of a reading that does not say what
  // it was taken of is exactly what this app has always written.
  let meta: JsonObject = { [TEMPERATURE_META_KEY]: celsius };
  if (where !== null) {
    meta = { ...meta, where };
  }
  if (kind !== 'none') {
    meta = { ...meta, [READING_KIND_META_KEY]: kind satisfies StoredReadingKind };
  }

  return { ok: true, meta, celsius, where, kind };
}

/** The `where` text a `temp` event carries, or `null`. */
export function whereFromEvent(event: CookEvent): string | null {
  const meta = event.meta;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const where = (meta as Record<string, unknown>).where;
  return typeof where === 'string' && where.trim() !== '' ? where : null;
}

/** What a reading was taken of, as stored. `none` when it does not say. */
export { readingKindFromEvent };

/**
 * The word a reading's kind is shown by.
 *
 * "Internal", never "Inside": one of them is what a cook calls the temperature
 * of the food and the other is where the dog sleeps. A reading that does not
 * say what it was taken of has no word, and `null` is how that is said here —
 * the card then shows what the cook wrote in the *where* field, or nothing.
 *
 * Every card that uses a colour for a kind also prints this word. The colour is
 * never the signal on its own.
 */
export function readingKindLabel(kind: ReadingKind): string | null {
  switch (kind) {
    case 'oven':
      return 'Oven';
    case 'internal':
      return 'Internal';
    case 'none':
      return null;
  }
}

/** `62.5°C`, with no trailing zeros for whole readings. */
export function formatCelsius(event: CookEvent): string {
  const reading = celsiusFromEvent(event);
  if (reading === null) {
    return '—';
  }
  return `${Number.isInteger(reading) ? reading : reading.toFixed(1).replace(/\.0$/, '')}°C`;
}
