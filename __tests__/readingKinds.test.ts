/**
 * What a temperature reading was taken of.
 *
 * Two things are being protected here and they pull in opposite directions:
 *
 *   a new reading must record its kind, so a cook looking back can tell the
 *   oven's 180 from the pork's 62;
 *
 *   a reading already in the notebook must not change in any way, which means
 *   a reading that does not say what it was taken of has to stay a reading with
 *   nothing extra written in it — not one carrying `readingKind: "none"`.
 *
 * Which is why `none` is the absence of the key and never a stored value.
 */

import { READING_KINDS, READING_KIND_META_KEY, STORED_READING_KINDS } from '../src/domain/enums';
import {
  celsiusFromEvent,
  readingKindFromEvent,
  validateCookEvent,
} from '../src/domain/invariants';
import type { CookEvent, JsonValue } from '../src/domain/entities';
import {
  formatCelsius,
  parseTemperature,
  readingKindLabel,
  whereFromEvent,
} from '../src/screens/cook/temperature';

function reading(meta: JsonValue | null): CookEvent {
  return {
    id: 'event-01',
    cookId: 'cook-01',
    ts: '2026-10-20T18:30:00.000Z',
    kind: 'temp',
    body: null,
    meta,
    photoPath: null,
  };
}

function parsed(celsius: string, kind?: 'oven' | 'internal' | 'none', where = '') {
  const result = parseTemperature({ celsius, where, kind });
  if (!result.ok) {
    throw new Error(`expected "${celsius}" to parse, but: ${result.message}`);
  }
  return result;
}

describe('the vocabulary', () => {
  it('is oven, internal, or it does not say', () => {
    expect([...READING_KINDS]).toEqual(['oven', 'internal', 'none']);
  });

  it('only ever writes two of the three down', () => {
    expect([...STORED_READING_KINDS]).toEqual(['oven', 'internal']);
    expect(STORED_READING_KINDS).not.toContain('none');
  });

  it('says "Internal", never "Inside"', () => {
    expect(readingKindLabel('internal')).toBe('Internal');
    expect(readingKindLabel('oven')).toBe('Oven');
    // A reading that does not say has no word, rather than a word that guesses.
    expect(readingKindLabel('none')).toBeNull();
  });
});

describe('recording a reading', () => {
  it('writes the kind for an oven reading', () => {
    expect(parsed('180', 'oven').meta).toEqual({ celsius: 180, readingKind: 'oven' });
  });

  it('writes the kind for an internal reading', () => {
    expect(parsed('62.5', 'internal').meta).toEqual({ celsius: 62.5, readingKind: 'internal' });
  });

  it('writes nothing extra for a reading that does not say', () => {
    // Byte for byte what slice 1 wrote. This is the assertion that keeps every
    // reading already on the phone exactly as it is.
    expect(parsed('62.5', 'none').meta).toEqual({ celsius: 62.5 });
    expect(parsed('62.5').meta).toEqual({ celsius: 62.5 });
    expect(Object.keys(parsed('62.5').meta)).not.toContain(READING_KIND_META_KEY);
  });

  it('keeps the cook’s own words for where, alongside no kind', () => {
    expect(parsed('62.5', 'none', '  thickest part  ').meta).toEqual({
      celsius: 62.5,
      where: 'thickest part',
    });
  });

  it('still accepts everything it accepted before', () => {
    expect(parsed('62', 'oven').celsius).toBe(62);
    expect(parsed('62,5', 'oven').celsius).toBe(62.5);
    expect(parsed('-18', 'internal').celsius).toBe(-18);
    expect(parsed('  96 ', 'oven').celsius).toBe(96);
    expect(parsed('250', 'oven').celsius).toBe(250);
  });

  it('still refuses anything that is not one finite number', () => {
    for (const raw of ['', 'hot', '62c', '1e3', '62.5.5', '--18']) {
      expect(parseTemperature({ celsius: raw, where: '', kind: 'oven' }).ok).toBe(false);
    }
  });
});

describe('reading a reading back', () => {
  it('reads the kind that was written', () => {
    expect(readingKindFromEvent(reading({ celsius: 180, readingKind: 'oven' }))).toBe('oven');
    expect(readingKindFromEvent(reading({ celsius: 62, readingKind: 'internal' }))).toBe(
      'internal',
    );
  });

  it('reads an older reading as "it does not say"', () => {
    expect(readingKindFromEvent(reading({ celsius: 62.5 }))).toBe('none');
    expect(readingKindFromEvent(reading({ celsius: 62.5, where: 'centre' }))).toBe('none');
    expect(readingKindFromEvent(reading(null))).toBe('none');
  });

  it('does not guess at a kind it does not recognise', () => {
    expect(readingKindFromEvent(reading({ celsius: 62, readingKind: 'ambient' }))).toBe('none');
    expect(readingKindFromEvent(reading({ celsius: 62, readingKind: 7 }))).toBe('none');
  });

  it('leaves the number and the where alone whatever the kind', () => {
    const event = reading({ celsius: 62.5, where: 'thickest part', readingKind: 'internal' });

    expect(celsiusFromEvent(event)).toBe(62.5);
    expect(whereFromEvent(event)).toBe('thickest part');
    expect(formatCelsius(event)).toBe('62.5°C');
  });

  it('formats a whole number without a trailing zero', () => {
    expect(formatCelsius(reading({ celsius: 180, readingKind: 'oven' }))).toBe('180°C');
  });
});

describe('what the store will accept', () => {
  it('accepts a reading with a kind, and one without', () => {
    expect(validateCookEvent(reading({ celsius: 180, readingKind: 'oven' }))).toEqual([]);
    expect(validateCookEvent(reading({ celsius: 180, readingKind: 'internal' }))).toEqual([]);
    expect(validateCookEvent(reading({ celsius: 180 }))).toEqual([]);
  });

  it('refuses a reading whose kind is a word this build does not know', () => {
    // Reported rather than quietly read as "it does not say": a third value in
    // that key is a corrupted row, and a corrupted row is worth knowing about.
    const issues = validateCookEvent(reading({ celsius: 180, readingKind: 'ambient' }));

    expect(issues.map((issue) => issue.code)).toContain('invalid_enum');
  });

  it('refuses a reading that never says how hot it was', () => {
    expect(validateCookEvent(reading({ readingKind: 'oven' }))).not.toEqual([]);
  });

  it('does not mind a kind on something that is not a reading', () => {
    // `meta` is free-form on other kinds, and a note is not a reading.
    const note: CookEvent = { ...reading({ readingKind: 'oven' }), kind: 'user_note', body: 'x' };

    expect(validateCookEvent(note)).toEqual([]);
  });
});
