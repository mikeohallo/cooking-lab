/**
 * Kitchen timers' own logic (0.5.0, `src/timers/model.ts`): a timer is its
 * end time, never a ticking count. The arithmetic of start, pause, resume,
 * +1 and +5 min, stop and a timer that ran out while the phone was off; the
 * order they are shown in; colour by name, kept; the last length per name;
 * and how the time is said, on screen and to TalkBack.
 */
import type { Timer } from '../src/domain/entities';
import {
  HOUR,
  MINUTE,
  SECOND,
  addToTimer,
  checkTimerName,
  clockTemplate,
  clockWords,
  colourForName,
  durationWords,
  exportedTimer,
  finishTimer,
  inOrder,
  lastLengthMs,
  namesUsedBefore,
  pauseTimer,
  resumeTimer,
  settleTimer,
  shareLeft,
  spokenDuration,
  spokenTimer,
  startTimer,
  stopTimer,
  timeLeftMs,
  timerState,
  type TimerChange,
} from '../src/timers/model';
import { formatTime } from '../src/format/dateTime';

const T0 = Date.parse('2026-11-06T08:00:00.000Z');
const at = (offset: number) => new Date(T0 + offset).toISOString();

function ok(change: TimerChange): Timer {
  if (!change.ok) {
    throw new Error(change.message);
  }
  return change.timer;
}

function timer(name: string, lengthMs: number, startOffset = 0, id = `t-${name.toLowerCase()}`): Timer {
  return ok(startTimer({ id, cookId: 'cook-1', name, colour: 'blue', lengthMs }, T0 + startOffset));
}

describe('the end-time arithmetic', () => {
  it('starts: it ends its length from now, and is running until then', () => {
    const rest = timer('Rest', 15 * MINUTE);
    expect(rest.startedAt).toBe(at(0));
    expect(rest.endsAt).toBe(at(15 * MINUTE));
    expect(timerState(rest, T0 + 15 * MINUTE - 1)).toBe('running');
    expect(timeLeftMs(rest, T0 + 4 * MINUTE)).toBe(11 * MINUTE);
    expect(timerState(rest, T0 + 15 * MINUTE)).toBe('finished');
    expect(timeLeftMs(rest, T0 + 20 * MINUTE)).toBe(0);
  });

  it('pauses: what is left is kept however long it stays paused, and resumes from there', () => {
    const rest = timer('Rest', 15 * MINUTE);
    const paused = ok(pauseTimer(rest, T0 + 5 * MINUTE));
    expect(paused.pausedLeftMs).toBe(10 * MINUTE);
    expect(timerState(paused, T0 + 3 * HOUR)).toBe('paused');
    expect(timeLeftMs(paused, T0 + 3 * HOUR)).toBe(10 * MINUTE);
    const resumed = ok(resumeTimer(paused, T0 + 3 * HOUR));
    expect(resumed.pausedLeftMs).toBeNull();
    expect(resumed.endsAt).toBe(at(3 * HOUR + 10 * MINUTE));
    expect(timeLeftMs(resumed, T0 + 3 * HOUR + 4 * MINUTE)).toBe(6 * MINUTE);
  });

  it('adds +1 min and +5 min to the end time, and to the bar’s length', () => {
    const meat = timer('Meat', 70 * MINUTE);
    const one = ok(addToTimer(meat, MINUTE, T0 + 10 * MINUTE));
    expect(one.endsAt).toBe(at(71 * MINUTE));
    expect(one.lengthMs).toBe(71 * MINUTE);
    const five = ok(addToTimer(one, 5 * MINUTE, T0 + 20 * MINUTE));
    expect(five.endsAt).toBe(at(76 * MINUTE));
    expect(timeLeftMs(five, T0 + 20 * MINUTE)).toBe(56 * MINUTE);
  });

  it('adds to a paused timer’s time left', () => {
    const paused = ok(pauseTimer(timer('Veg', 25 * MINUTE), T0 + 5 * MINUTE));
    const more = ok(addToTimer(paused, 5 * MINUTE, T0 + 9 * MINUTE));
    expect(more.pausedLeftMs).toBe(25 * MINUTE);
    expect(more.endsAt).toBe(paused.endsAt);
  });

  it('refuses what a timer cannot do', () => {
    const rest = timer('Rest', 15 * MINUTE);
    expect(resumeTimer(rest, T0).ok).toBe(false);
    expect(pauseTimer(rest, T0 + 16 * MINUTE).ok).toBe(false);
    expect(addToTimer(rest, MINUTE, T0 + 16 * MINUTE).ok).toBe(false);
    expect(addToTimer(rest, 0, T0).ok).toBe(false);
    const stopped = ok(stopTimer(rest, T0 + MINUTE));
    expect(stopTimer(stopped, T0 + 2 * MINUTE).ok).toBe(false);
    expect(startTimer({ id: 't', cookId: 'c', name: 'Rest', colour: 'blue', lengthMs: 30 * SECOND }, T0).ok).toBe(false);
    expect(startTimer({ id: 't', cookId: 'c', name: '  ', colour: 'blue', lengthMs: MINUTE }, T0).ok).toBe(false);
    expect(startTimer({ id: 't', cookId: 'c', name: 'Rest', colour: 'blue', lengthMs: 13 * HOUR }, T0).ok).toBe(false);
  });

  it('stops early: stopped, not ran out', () => {
    const stopped = ok(stopTimer(timer('Rest', 15 * MINUTE), T0 + 5 * MINUTE));
    expect(stopped.stoppedAt).toBe(at(5 * MINUTE));
    expect(stopped.ranOutAt).toBeNull();
    expect(timerState(stopped, T0 + HOUR)).toBe('stopped');
  });

  it('stops once rung: it ran out at its end time, and was stopped when Stop was pressed', () => {
    const stopped = ok(stopTimer(timer('Rest', 15 * MINUTE), T0 + 17 * MINUTE));
    expect(stopped.ranOutAt).toBe(at(15 * MINUTE));
    expect(stopped.stoppedAt).toBe(at(17 * MINUTE));
  });

  it('marks one that ended while the phone was off as finished at its own end time, not when the app saw it', () => {
    const rest = timer('Rest', 15 * MINUTE);
    const seenLater = settleTimer(rest, T0 + 9 * HOUR);
    expect(seenLater.ranOutAt).toBe(at(15 * MINUTE));
    expect(timerState(seenLater, T0 + 9 * HOUR)).toBe('finished');
    // Still running, or paused: left as it is.
    expect(settleTimer(rest, T0 + MINUTE)).toBe(rest);
    const paused = ok(pauseTimer(rest, T0 + MINUTE));
    expect(settleTimer(paused, T0 + 9 * HOUR)).toBe(paused);
    // Finished from the queue, at the time the phone gave.
    expect(ok(finishTimer(rest, T0 + 15 * MINUTE)).ranOutAt).toBe(at(15 * MINUTE));
    expect(finishTimer(seenLater, T0 + 15 * MINUTE).ok).toBe(false);
  });

  it('draws the bar from the time left over the length, emptying to 0', () => {
    const veg = timer('Veg', 20 * MINUTE);
    expect(shareLeft(veg, T0)).toBe(1);
    expect(shareLeft(veg, T0 + 5 * MINUTE)).toBe(0.75);
    expect(shareLeft(veg, T0 + 30 * MINUTE)).toBe(0);
  });
});

describe('the order', () => {
  it('puts finished first, the first to ring on top, then the soonest to finish; stopped ones left out', () => {
    const meat = timer('Meat', 70 * MINUTE, 0, 't-meat');
    const veg = timer('Veg', 25 * MINUTE, 0, 't-veg');
    const gravy = timer('Gravy', 10 * MINUTE, 0, 't-gravy');
    const rest = timer('Rest', 5 * MINUTE, 0, 't-rest');
    const early = timer('Early', 3 * MINUTE, 0, 't-early');
    const stopped = ok(stopTimer(timer('Gone', 2 * MINUTE, 0, 't-gone'), T0 + MINUTE));
    const pausedSoon = ok(pauseTimer(timer('Sauce', 8 * MINUTE, 0, 't-sauce'), T0 + 7 * MINUTE));
    const now = T0 + 6 * MINUTE;
    expect(inOrder([meat, veg, gravy, rest, stopped, early, pausedSoon], now).map((t) => t.name)).toEqual([
      'Early',
      'Rest',
      'Sauce',
      'Gravy',
      'Veg',
      'Meat',
    ]);
    // A paused one sits by what it has left.
    expect(inOrder([meat, pausedSoon], T0 + 8 * MINUTE).map((t) => t.name)).toEqual(['Sauce', 'Meat']);
  });
});

describe('colour by name', () => {
  it('gives Meat warm, Veg green, Rest blue, any case', () => {
    expect(colourForName('Meat', [])).toBe('warm');
    expect(colourForName('veg', [])).toBe('green');
    expect(colourForName(' REST ', [])).toBe('blue');
  });

  it('gives any other name the next of plum then gold, then round again', () => {
    const used: Timer[] = [];
    const add = (name: string) => {
      const colour = colourForName(name, used);
      used.push({ ...timer(name, MINUTE, used.length * MINUTE, `t-${used.length}`), colour });
      return colour;
    };
    expect(add('Gravy')).toBe('plum');
    expect(add('Meat')).toBe('warm');
    expect(add('Sauce')).toBe('gold');
    expect(add('Pasta')).toBe('plum');
    expect(add('Rice')).toBe('gold');
  });

  it('keeps a name’s colour from then on, whatever came after', () => {
    const gravy: Timer = { ...timer('Gravy', MINUTE, 0, 't-1'), colour: 'gold' };
    const later: Timer = { ...timer('Sauce', MINUTE, MINUTE, 't-2'), colour: 'plum' };
    expect(colourForName('gravy', [later, gravy])).toBe('gold');
    // Even a starter name keeps what it was first given.
    const oddRest: Timer = { ...timer('Rest', MINUTE, 0, 't-3'), colour: 'plum' };
    expect(colourForName('Rest', [oddRest])).toBe('plum');
  });
});

describe('a name’s last length', () => {
  it('is the newest timer of that name’s length, ignoring case; none for a new name', () => {
    const first = timer('Rest', 10 * MINUTE, 0, 't-1');
    const second = timer('rest', 15 * MINUTE, HOUR, 't-2');
    const other = timer('Meat', 70 * MINUTE, 2 * HOUR, 't-3');
    expect(lastLengthMs('Rest', [second, other, first])).toBe(15 * MINUTE);
    expect(lastLengthMs('Gravy', [first, second, other])).toBeNull();
  });

  it('offers names used before, newest first, each once, the starters left to their own chips', () => {
    const names = namesUsedBefore([
      timer('Gravy', MINUTE, 0, 't-1'),
      timer('Rest', MINUTE, MINUTE, 't-2'),
      timer('Sauce', MINUTE, 2 * MINUTE, 't-3'),
      timer('gravy', MINUTE, 3 * MINUTE, 't-4'),
    ]);
    expect(names).toEqual(['gravy', 'Sauce']);
  });
});

describe('saying the time', () => {
  it('shows 4:32, and 1:05:00 from an hour up, rounding up to the second', () => {
    expect(clockWords(4 * MINUTE + 32 * SECOND)).toBe('4:32');
    expect(clockWords(4 * MINUTE + 31 * SECOND + 1)).toBe('4:32');
    expect(clockWords(38 * MINUTE + 12 * SECOND)).toBe('38:12');
    expect(clockWords(HOUR + 5 * MINUTE)).toBe('1:05:00');
    expect(clockWords(0)).toBe('0:00');
    expect(clockTemplate(HOUR + 5 * MINUTE)).toBe('8:88:88');
  });

  it('says lengths as the sheet shows them', () => {
    expect([5, 15, 45, 60, 90, 61].map(durationWords)).toEqual(['5 min', '15 min', '45 min', '1 h', '1 h 30 min', '1 h 1 min']);
  });

  it('gives TalkBack the time in words, and that a timer is done', () => {
    const rest = timer('Rest', 15 * MINUTE);
    expect(spokenTimer(rest, T0 + 15 * MINUTE - (4 * MINUTE + 32 * SECOND))).toBe('Rest, 4 minutes 32 seconds left');
    expect(spokenDuration(HOUR + 5 * MINUTE)).toBe('1 hour 5 minutes');
    expect(spokenDuration(MINUTE + SECOND)).toBe('1 minute 1 second');
    expect(spokenTimer(ok(pauseTimer(rest, T0 + 11 * MINUTE)), T0 + 12 * MINUTE)).toBe('Rest, paused, 4 minutes left');
    expect(spokenTimer(rest, T0 + 16 * MINUTE)).toBe('Rest is done');
  });

  it('writes a timer for Export this cook', () => {
    const rang = ok(stopTimer(timer('Rest', 15 * MINUTE), T0 + 16 * MINUTE));
    expect(exportedTimer(rang, formatTime, T0 + HOUR)).toBe(`Rest 15 min, ended ${formatTime(at(15 * MINUTE))}`);
    const early = ok(stopTimer(timer('Veg', 25 * MINUTE), T0 + 5 * MINUTE));
    expect(exportedTimer(early, formatTime, T0 + HOUR)).toBe(`Veg 25 min, stopped ${formatTime(at(5 * MINUTE))}`);
  });

  it('checks a typed name: trimmed, one line, 1 to 40 characters', () => {
    expect(checkTimerName('  Gravy ')).toEqual({ ok: true, name: 'Gravy' });
    expect(checkTimerName('x'.repeat(41)).ok).toBe(false);
    expect(checkTimerName('a\nb').ok).toBe(false);
  });
});
