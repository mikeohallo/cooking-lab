/**
 * How the running timers sit above the composer, and inside Cooking now
 * (0.5.0). Pure: it is handed the room there is and how wide each timer's
 * words are drawn, and says how many go to a row and how many are shown.
 *
 * - Two to a row only when each half has room for its timer's name and time
 *   in full at the current text size (and is at least `size.timerPairMin`,
 *   a limit, not a width); otherwise one to a row.
 * - Never more than a third of the window's height (`TIMER_DOCK_SHARE`).
 *   Timers that do not fit are "+ N more", which opens the full list.
 */

import { TIMER_DOCK_SHARE, size, space, type } from '../theme/tokens';

/** A timer row's padding at each side, and above and below. */
export const TIMER_ROW_PAD_X = space.sm;
export const TIMER_ROW_PAD_Y = space.xs;
/** Between the dot, the name and the time. */
export const TIMER_ROW_GAP = space.xs;
/** Between the words and the bar. */
export const TIMER_ROW_INNER_GAP = space.xxs;
/** Between two timers, beside or above each other. */
export const TIMER_DOCK_GAP = space.xs;

/** One timer's words, as drawn at the current text size: its name, its time and Paused when paused. */
export type TimerWords = {
  readonly name: number;
  readonly time: number;
  /** "Paused", when it is; 0 otherwise. */
  readonly paused: number;
};

/** How wide a row must be to hold these words in full. */
export function rowNeed(words: TimerWords): number {
  const parts = [size.timerDot, words.name, words.time, ...(words.paused > 0 ? [words.paused] : [])];
  return TIMER_ROW_PAD_X * 2 + parts.reduce((sum, part) => sum + part, 0) + TIMER_ROW_GAP * (parts.length - 1);
}

/** A timer row's height at this font scale: the words' line, the bar, the padding; never under 48. */
export function rowHeight(fontScale: number): number {
  const line = Math.max(type.bodyStrong.lineHeight, type.timerNumber.lineHeight) * fontScale;
  return Math.max(size.targetMin, TIMER_ROW_PAD_Y * 2 + line + TIMER_ROW_INNER_GAP + size.timerBar);
}

/** "+ N more": a control of its own, 48 tall. */
export const MORE_HEIGHT = size.targetMin;

export type DockPlan = {
  /** 1, or 2 when every shown timer fits half a row in full. */
  readonly perRow: 1 | 2;
  /** How many timers are drawn, from the top of the order. */
  readonly shown: number;
  /** How many are left to "+ N more". */
  readonly more: number;
  /** One row's height. */
  readonly rowHeight: number;
  /** What the dock takes, "+ N more" included. */
  readonly height: number;
};

export type DockInput = {
  /** How wide the dock itself is drawn. */
  readonly across: number;
  readonly windowHeight: number;
  readonly fontScale: number;
  /** Each timer's words, in the order shown; null until measured. */
  readonly words: readonly (TimerWords | null)[];
};

function heightOf(rows: number, rowH: number, more: boolean): number {
  const stacked = rows === 0 ? 0 : rows * rowH + (rows - 1) * TIMER_DOCK_GAP;
  if (!more) {
    return stacked;
  }
  return stacked + (rows > 0 ? TIMER_DOCK_GAP : 0) + MORE_HEIGHT;
}

export function planDock({ across, windowHeight, fontScale, words }: DockInput): DockPlan {
  const count = words.length;
  const rowH = rowHeight(fontScale);
  if (count === 0) {
    return { perRow: 1, shown: 0, more: 0, rowHeight: rowH, height: 0 };
  }
  const limit = windowHeight * TIMER_DOCK_SHARE;
  const half = (across - TIMER_DOCK_GAP) / 2;
  const fitsHalf = (shown: number) =>
    shown >= 2 &&
    half >= size.timerPairMin &&
    words.slice(0, shown).every((entry) => entry !== null && rowNeed(entry) <= half);

  const plan = (perRow: 1 | 2): DockPlan => {
    const rowsAll = Math.ceil(count / perRow);
    if (heightOf(rowsAll, rowH, false) <= limit) {
      return { perRow, shown: count, more: 0, rowHeight: rowH, height: heightOf(rowsAll, rowH, false) };
    }
    let rows = 0;
    while (heightOf(rows + 1, rowH, true) <= limit && (rows + 1) * perRow < count) {
      rows += 1;
    }
    const shown = Math.min(count, rows * perRow);
    return { perRow, shown, more: count - shown, rowHeight: rowH, height: heightOf(rows, rowH, true) };
  };

  // Two to a row when everything that would be shown that way fits whole.
  const two = plan(2);
  if (fitsHalf(Math.max(two.shown, 2)) && two.shown >= 2) {
    return two;
  }
  return plan(1);
}
