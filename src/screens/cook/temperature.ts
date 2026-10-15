/**
 * Turning what was typed into a temperature event, and back again.
 *
 * The rule is finite-number validation and nothing more: the product model has
 * one unit and no sanctioned range, and inventing a range here would be a
 * product decision wearing a parser's clothing. A reading of `-18` for the
 * freezer and `250` for the oven are both readings.
 */

import type { CookEvent, JsonObject } from '../../domain/entities';
import { TEMPERATURE_META_KEY } from '../../domain/enums';
import { celsiusFromEvent } from '../../domain/invariants';

export const MAX_WHERE_LENGTH = 120;

export type TemperatureInput = {
  readonly celsius: string;
  readonly where: string;
};

export type ParsedTemperature =
  | { readonly ok: true; readonly meta: JsonObject; readonly celsius: number; readonly where: string | null }
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

  const meta: JsonObject =
    where === null ? { [TEMPERATURE_META_KEY]: celsius } : { [TEMPERATURE_META_KEY]: celsius, where };

  return { ok: true, meta, celsius, where };
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

/** `62.5°C`, with no trailing zeros for whole readings. */
export function formatCelsius(event: CookEvent): string {
  const reading = celsiusFromEvent(event);
  if (reading === null) {
    return '—';
  }
  return `${Number.isInteger(reading) ? reading : reading.toFixed(1).replace(/\.0$/, '')}°C`;
}
