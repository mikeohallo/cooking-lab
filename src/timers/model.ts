/**
 * Kitchen timers (0.5.0): what a timer is at any moment, and how its time is
 * said. Pure TypeScript: no React, no storage, no clock of its own. Every
 * function is handed the moment it is asked about.
 *
 * A timer is its end time, never a ticking count. Time left is worked out
 * from `endsAt` each time it is drawn, so it is right after the app is
 * closed, the phone sleeps, the screen is recreated or the phone restarts.
 */

import type { CookId, IsoTimestamp, Timer, TimerId } from '../domain/entities';
import type { TimerColour } from '../domain/enums';
import { MAX_TIMER_LENGTH_MS, MAX_TIMER_NAME_LENGTH } from '../domain/invariants';

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

/** What a timer is doing at a moment. */
export type TimerState = 'running' | 'paused' | 'finished' | 'stopped';

/** The names offered first, each with its own colour. */
export const STARTER_NAMES: readonly { readonly name: string; readonly colour: TimerColour }[] = [
  { name: 'Meat', colour: 'warm' },
  { name: 'Veg', colour: 'green' },
  { name: 'Rest', colour: 'blue' },
];

/** Any other name takes the next of these not already taken, then round again. */
export const OTHER_COLOURS: readonly TimerColour[] = ['plum', 'gold'];

/** The lengths offered in New timer, in minutes. */
export const TIMER_LENGTHS_MIN: readonly number[] = [5, 10, 15, 20, 30, 45, 60, 90];

/** New timer starts here for a name that has never been used. */
export const DEFAULT_LENGTH_MIN = 15;

/** The shortest a timer may be set to, in minutes. */
export const MIN_LENGTH_MIN = 1;
/** The longest, in minutes. */
export const MAX_LENGTH_MIN = MAX_TIMER_LENGTH_MS / MINUTE;

function ms(iso: IsoTimestamp): number {
  return Date.parse(iso);
}

function iso(at: number): IsoTimestamp {
  return new Date(at).toISOString();
}

/** A name as it is compared: trimmed, ignoring case. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** What a timer is doing at `now` (ms since the epoch). */
export function timerState(timer: Timer, now: number): TimerState {
  if (timer.stoppedAt !== null) {
    return 'stopped';
  }
  if (timer.ranOutAt !== null) {
    return 'finished';
  }
  if (timer.pausedLeftMs !== null) {
    return 'paused';
  }
  return now >= ms(timer.endsAt) ? 'finished' : 'running';
}

/** Time left at `now`, in ms: what was left when paused, 0 once it has run out. */
export function timeLeftMs(timer: Timer, now: number): number {
  switch (timerState(timer, now)) {
    case 'paused':
      return timer.pausedLeftMs ?? 0;
    case 'running':
      return Math.max(0, ms(timer.endsAt) - now);
    default:
      return 0;
  }
}

/** How much of the bar is left, 0 to 1. */
export function shareLeft(timer: Timer, now: number): number {
  if (timer.lengthMs <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, timeLeftMs(timer, now) / timer.lengthMs));
}

/** Shown, and still the cook's business: running, paused or finished but not yet stopped. */
export function isLive(timer: Timer, now: number): boolean {
  return timerState(timer, now) !== 'stopped';
}

/** When it ran out, or will: `ranOutAt`, else `endsAt` (a paused timer has none yet). */
function endOf(timer: Timer): number {
  return timer.ranOutAt !== null ? ms(timer.ranOutAt) : ms(timer.endsAt);
}

/**
 * The order timers are shown in: finished first (the one that rang first on
 * top), then the soonest to finish. Stopped timers are left out.
 */
export function inOrder(timers: readonly Timer[], now: number): Timer[] {
  return timers
    .filter((timer) => isLive(timer, now))
    .sort((a, b) => {
      const doneA = timerState(a, now) === 'finished';
      const doneB = timerState(b, now) === 'finished';
      if (doneA !== doneB) {
        return doneA ? -1 : 1;
      }
      const diff = doneA ? endOf(a) - endOf(b) : timeLeftMs(a, now) - timeLeftMs(b, now);
      return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

// ---------------------------------------------------------------------------
// The end-time arithmetic
// ---------------------------------------------------------------------------

export type TimerRefusal = { readonly ok: false; readonly message: string };
export type TimerChange = { readonly ok: true; readonly timer: Timer } | TimerRefusal;

function refuse(message: string): TimerRefusal {
  return { ok: false, message };
}

function done(timer: Timer): TimerChange {
  return { ok: true, timer };
}

export type NewTimer = {
  readonly id: TimerId;
  readonly cookId: CookId;
  readonly name: string;
  readonly colour: TimerColour;
  readonly lengthMs: number;
};

/** Check a name as typed: trimmed, 1 to 40 characters, one line. */
export function checkTimerName(raw: string): { ok: true; name: string } | TimerRefusal {
  const name = raw.trim();
  if (name === '') {
    return refuse('Give the timer a name.');
  }
  if (name.length > MAX_TIMER_NAME_LENGTH) {
    return refuse(`Keep the name under ${MAX_TIMER_NAME_LENGTH} characters.`);
  }
  if (/[\r\n]/.test(name)) {
    return refuse('Keep the name to one line.');
  }
  return { ok: true, name };
}

/** Start: it ends `lengthMs` from now. */
export function startTimer(input: NewTimer, now: number): TimerChange {
  const name = checkTimerName(input.name);
  if (!name.ok) {
    return name;
  }
  if (!Number.isInteger(input.lengthMs) || input.lengthMs < MINUTE || input.lengthMs > MAX_TIMER_LENGTH_MS) {
    return refuse('A timer runs from 1 minute to 12 hours.');
  }
  return done({
    id: input.id,
    cookId: input.cookId,
    name: name.name,
    colour: input.colour,
    lengthMs: input.lengthMs,
    startedAt: iso(now),
    endsAt: iso(now + input.lengthMs),
    pausedLeftMs: null,
    ranOutAt: null,
    stoppedAt: null,
  });
}

/** Pause: what is left is kept; the end time no longer counts. */
export function pauseTimer(timer: Timer, now: number): TimerChange {
  if (timerState(timer, now) !== 'running') {
    return refuse('Only a running timer can be paused.');
  }
  return done({ ...timer, pausedLeftMs: Math.max(0, ms(timer.endsAt) - now) });
}

/** Resume: it ends what was left from now. */
export function resumeTimer(timer: Timer, now: number): TimerChange {
  if (timerState(timer, now) !== 'paused') {
    return refuse('Only a paused timer can be resumed.');
  }
  return done({ ...timer, endsAt: iso(now + (timer.pausedLeftMs ?? 0)), pausedLeftMs: null });
}

/** +1 min, +5 min: later by that much, and the bar's length grows with it. */
export function addToTimer(timer: Timer, extraMs: number, now: number): TimerChange {
  const state = timerState(timer, now);
  if (state !== 'running' && state !== 'paused') {
    return refuse('Time can be added only to a running or paused timer.');
  }
  if (!Number.isInteger(extraMs) || extraMs <= 0) {
    return refuse('Add a whole number of minutes.');
  }
  const lengthMs = Math.min(MAX_TIMER_LENGTH_MS, timer.lengthMs + extraMs);
  if (state === 'paused') {
    return done({ ...timer, lengthMs, pausedLeftMs: (timer.pausedLeftMs ?? 0) + extraMs });
  }
  return done({ ...timer, lengthMs, endsAt: iso(ms(timer.endsAt) + extraMs) });
}

/** Finished: it ran out at `at` (its end time). */
export function finishTimer(timer: Timer, at: number): TimerChange {
  if (timer.stoppedAt !== null || timer.ranOutAt !== null) {
    return refuse('That timer has already finished.');
  }
  if (timer.pausedLeftMs !== null) {
    return refuse('A paused timer does not finish.');
  }
  return done({ ...timer, ranOutAt: iso(Math.max(at, ms(timer.startedAt))) });
}

/**
 * Stop: early, or once it has rung. A timer stopped after its end time is
 * marked finished at its end time too, so the record says it ran out.
 */
export function stopTimer(timer: Timer, now: number): TimerChange {
  if (timer.stoppedAt !== null) {
    return refuse('That timer is already stopped.');
  }
  const ranOut = timer.ranOutAt === null && timer.pausedLeftMs === null && now >= ms(timer.endsAt);
  return done({
    ...timer,
    ranOutAt: ranOut ? timer.endsAt : timer.ranOutAt,
    stoppedAt: iso(Math.max(now, ms(timer.startedAt))),
  });
}

/**
 * A running timer whose end time has passed, not yet marked: finished at its
 * end time, as when it ended while the phone was off. Anything else as it is.
 */
export function settleTimer(timer: Timer, now: number): Timer {
  if (timer.stoppedAt === null && timer.ranOutAt === null && timer.pausedLeftMs === null && now >= ms(timer.endsAt)) {
    return { ...timer, ranOutAt: timer.endsAt };
  }
  return timer;
}

// ---------------------------------------------------------------------------
// Colours and lengths by name
// ---------------------------------------------------------------------------

/**
 * The colour a name gets. A name used before keeps the colour it was given
 * (ignoring case). Meat is warm, Veg green, Rest blue. Any other name takes
 * the next of plum and gold that no other name has, and round again once
 * both are taken. `earlier` is every timer there has been, any order.
 */
export function colourForName(name: string, earlier: readonly Timer[]): TimerColour {
  const key = nameKey(name);
  const oldestFirst = [...earlier].sort((a, b) => ms(a.startedAt) - ms(b.startedAt) || (a.id < b.id ? -1 : 1));
  const before = oldestFirst.find((timer) => nameKey(timer.name) === key);
  if (before !== undefined) {
    return before.colour;
  }
  const starter = STARTER_NAMES.find((entry) => nameKey(entry.name) === key);
  if (starter !== undefined) {
    return starter.colour;
  }
  const others = new Map<string, TimerColour>();
  for (const timer of oldestFirst) {
    const other = nameKey(timer.name);
    if (!STARTER_NAMES.some((entry) => nameKey(entry.name) === other) && !others.has(other)) {
      others.set(other, timer.colour);
    }
  }
  const taken = new Set(others.values());
  const free = OTHER_COLOURS.find((colour) => !taken.has(colour));
  return free ?? OTHER_COLOURS[others.size % OTHER_COLOURS.length]!;
}

/** The length a name was last set to (its newest timer's first length), in ms; null if never used. */
export function lastLengthMs(name: string, earlier: readonly Timer[]): number | null {
  const key = nameKey(name);
  const newest = [...earlier]
    .filter((timer) => nameKey(timer.name) === key)
    .sort((a, b) => ms(b.startedAt) - ms(a.startedAt) || (a.id < b.id ? 1 : -1))[0];
  return newest === undefined ? null : newest.lengthMs;
}

/** Names used before, other than the three starters: newest first, each once, as last spelt. */
export function namesUsedBefore(earlier: readonly Timer[]): string[] {
  const seen = new Set<string>(STARTER_NAMES.map((entry) => nameKey(entry.name)));
  const names: string[] = [];
  for (const timer of [...earlier].sort((a, b) => ms(b.startedAt) - ms(a.startedAt))) {
    const key = nameKey(timer.name);
    if (!seen.has(key)) {
      seen.add(key);
      names.push(timer.name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Saying the time
// ---------------------------------------------------------------------------

/** "4:32", or "1:05:00" from an hour up. Rounded up to the second, so 0:00 is only at the end. */
export function clockWords(leftMs: number): string {
  const total = Math.max(0, Math.ceil(leftMs / SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The widest a clock of this many characters is drawn: every digit an 8, the same length. */
export function clockTemplate(leftMs: number): string {
  return clockWords(leftMs).replace(/\d/g, '8');
}

/** "15 min", "1 h", "1 h 30 min". */
export function durationWords(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} min`;
  }
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function unit(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? '' : 's'}`;
}

/** "4 minutes 32 seconds", "1 hour 5 minutes", "45 seconds": the parts that are not 0. */
export function spokenDuration(leftMs: number): string {
  const total = Math.max(0, Math.ceil(leftMs / SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [h > 0 ? unit(h, 'hour') : null, m > 0 ? unit(m, 'minute') : null, s > 0 ? unit(s, 'second') : null];
  const said = parts.filter((part): part is string => part !== null);
  return said.length === 0 ? '0 seconds' : said.join(' ');
}

/**
 * What TalkBack says for a timer: "Rest, 4 minutes 32 seconds left",
 * "Rest, paused, 4 minutes left", "Rest is done". The label is read when the
 * timer is focused; it is never a live region, so the seconds are not read
 * out as they tick.
 */
export function spokenTimer(timer: Timer, now: number): string {
  const state = timerState(timer, now);
  if (state === 'finished' || state === 'stopped') {
    return `${timer.name} is done`;
  }
  const left = spokenDuration(timeLeftMs(timer, now));
  return state === 'paused' ? `${timer.name}, paused, ${left} left` : `${timer.name}, ${left} left`;
}

/** Said once, when a timer runs out while the app is open. */
export function finishedAnnouncement(timer: Timer): string {
  return `${timer.name} is done`;
}

/** "Rest 15 min, ended 7:42 pm": one timer in Export this cook. */
export function exportedTimer(timer: Timer, formatTime: (iso: IsoTimestamp) => string, now: number): string {
  const length = durationWords(Math.round(timer.lengthMs / MINUTE));
  const state = timerState(timer, now);
  if (timer.ranOutAt !== null) {
    return `${timer.name} ${length}, ended ${formatTime(timer.ranOutAt)}`;
  }
  if (state === 'stopped' && timer.stoppedAt !== null) {
    return `${timer.name} ${length}, stopped ${formatTime(timer.stoppedAt)}`;
  }
  if (state === 'finished') {
    return `${timer.name} ${length}, ended ${formatTime(timer.endsAt)}`;
  }
  if (state === 'paused') {
    return `${timer.name} ${length}, paused`;
  }
  return `${timer.name} ${length}, ends ${formatTime(timer.endsAt)}`;
}
