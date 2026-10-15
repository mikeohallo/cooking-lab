import { formatDate, formatDateTime, formatTime } from '../src/format/dateTime';
import { verdictExcerpt } from '../src/state/useCookList';
import { formatCelsius, parseTemperature, whereFromEvent } from '../src/screens/cook/temperature';
import type { CookEvent } from '../src/domain/entities';

function tempEvent(meta: CookEvent['meta']): CookEvent {
  return { id: 'e', cookId: 'c', ts: '2026-10-15T08:30:00.000Z', kind: 'temp', body: null, meta, photoPath: null };
}

describe('parseTemperature', () => {
  it('accepts whole, decimal, negative and comma-decimal readings', () => {
    expect(parseTemperature({ celsius: '62', where: '' })).toMatchObject({ ok: true, celsius: 62, meta: { celsius: 62 } });
    expect(parseTemperature({ celsius: ' 62.5 ', where: '' })).toMatchObject({ ok: true, celsius: 62.5 });
    expect(parseTemperature({ celsius: '-18', where: 'freezer' })).toMatchObject({
      ok: true,
      celsius: -18,
      meta: { celsius: -18, where: 'freezer' },
    });
    expect(parseTemperature({ celsius: '96,5', where: '' })).toMatchObject({ ok: true, celsius: 96.5 });
  });

  it('refuses anything that is not one finite number', () => {
    for (const bad of ['', '  ', 'hot', '62C', '1e400', '62.', 'NaN', '--5']) {
      expect(parseTemperature({ celsius: bad, where: '' }).ok).toBe(false);
    }
  });

  it('does not invent a range: oven and freezer readings are both readings', () => {
    expect(parseTemperature({ celsius: '250', where: 'oven' }).ok).toBe(true);
    expect(parseTemperature({ celsius: '-40', where: '' }).ok).toBe(true);
  });

  it('trims where, drops it when blank, and caps its length', () => {
    expect(parseTemperature({ celsius: '60', where: '   ' })).toMatchObject({ where: null, meta: { celsius: 60 } });
    expect(parseTemperature({ celsius: '60', where: '  centre  ' })).toMatchObject({ where: 'centre' });
    expect(parseTemperature({ celsius: '60', where: 'x'.repeat(121) }).ok).toBe(false);
  });
});

describe('temperature display', () => {
  it('formats readings without trailing zeros and reads back where', () => {
    expect(formatCelsius(tempEvent({ celsius: 62 }))).toBe('62°C');
    expect(formatCelsius(tempEvent({ celsius: 62.5 }))).toBe('62.5°C');
    expect(formatCelsius(tempEvent({ celsius: 62.25 }))).toBe('62.3°C');
    expect(formatCelsius(tempEvent(null))).toBe('—');
    expect(whereFromEvent(tempEvent({ celsius: 62, where: 'centre' }))).toBe('centre');
    expect(whereFromEvent(tempEvent({ celsius: 62 }))).toBeNull();
    expect(whereFromEvent(tempEvent({ celsius: 62, where: 7 }))).toBeNull();
  });
});

describe('date formatting', () => {
  const sameYear = new Date('2026-12-01T00:00:00Z');

  it('renders local time and date in kitchen language', () => {
    const iso = new Date(2026, 9, 15, 19, 42).toISOString(); // local 15 Oct 2026, 7:42 pm
    expect(formatTime(iso)).toBe('7:42 pm');
    expect(formatDate(iso, sameYear)).toBe('Thu 15 Oct');
    expect(formatDateTime(iso, sameYear)).toBe('Thu 15 Oct, 7:42 pm');
  });

  it('handles midnight, noon and single-digit minutes', () => {
    expect(formatTime(new Date(2026, 0, 1, 0, 5).toISOString())).toBe('12:05 am');
    expect(formatTime(new Date(2026, 0, 1, 12, 0).toISOString())).toBe('12:00 pm');
  });

  it('adds the year only when it is not the current one', () => {
    const iso = new Date(2025, 2, 3, 9, 0).toISOString();
    expect(formatDate(iso, sameYear)).toBe('Mon 3 Mar 2025');
  });

  it('renders nothing for an unparseable timestamp', () => {
    expect(formatDateTime('not a date')).toBe('');
  });
});

describe('verdictExcerpt', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(verdictExcerpt(null)).toBeNull();
    expect(verdictExcerpt('   ')).toBeNull();
    expect(verdictExcerpt('Great crust.\n\nApple needed acid.')).toBe('Great crust. Apple needed acid.');
    const long = 'word '.repeat(50);
    const excerpt = verdictExcerpt(long, 40);
    expect(excerpt?.length).toBeLessThanOrEqual(40);
    expect(excerpt?.endsWith('…')).toBe(true);
  });
});
