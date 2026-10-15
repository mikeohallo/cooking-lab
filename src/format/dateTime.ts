/**
 * Dates as the kitchen reads them.
 *
 * Timestamps are stored as ISO UTC and shown in the device's local time. These
 * formatters are pure functions over a `Date` so they can be tested without
 * depending on which `Intl` tables the JavaScript engine on the phone ships.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `7:42 pm` */
export function formatTime(iso: string): string {
  const date = parse(iso);
  if (date === null) {
    return '';
  }
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const suffix = hours24 < 12 ? 'am' : 'pm';
  return `${hours12}:${pad(date.getMinutes())} ${suffix}`;
}

/** `Thu 15 Oct` — or with the year when it is not this year: `Thu 15 Oct 2025`. */
export function formatDate(iso: string, today: Date = new Date()): string {
  const date = parse(iso);
  if (date === null) {
    return '';
  }
  const day = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** `Thu 15 Oct, 7:42 pm` */
export function formatDateTime(iso: string, today: Date = new Date()): string {
  const date = formatDate(iso, today);
  return date === '' ? '' : `${date}, ${formatTime(iso)}`;
}
