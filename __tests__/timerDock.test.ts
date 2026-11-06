/**
 * The running timers above the composer (0.5.0): two to a row only when each
 * half holds its timer's name and time in full at the current text size,
 * never more than a third of the window's height, the rest as "+ N more".
 *
 * Every window width from 320 to 1200 dp, at font scales 1.0, 1.15 and 1.3,
 * on short and tall windows, with the words measured in the app's own font
 * file (`support/fontMetrics.ts`), as the phone draws them.
 */
import { TIMER_DOCK_SHARE, size, type } from '../src/theme/tokens';
import { MORE_HEIGHT, TIMER_DOCK_GAP, planDock, rowHeight, rowNeed, type TimerWords } from '../src/timers/dock';
import { textWidth } from './support/fontMetrics';

const SCALES = [1, 1.15, 1.3] as const;
const HEIGHTS = [600, 752, 835, 905] as const;
const COVER_MARGIN = 16;

/** Some kitchens' timers: short names, a long one, and an hour-long clock. */
const SETS: readonly (readonly (readonly [string, string])[])[] = [
  [['Gravy', '4:05'], ['Veg', '11:40'], ['Meat', '38:12']],
  [['Rest', '15:00'], ['Gravy', '4:05']],
  [['Roast potatoes', '1:05:00'], ['Yorkshire puddings', '22:10']],
  [['A timer with a name forty characters long', '12:00'], ['Veg', '2:40']],
  [['Rest', 'Done'], ['Gravy', '1:05'], ['Veg', '2:40'], ['Meat', '38:12'], ['Sauce', '9:59'], ['Rice', '12:00'], ['Pud', '45:00'], ['Bread', '1:00:00']],
];

function words(set: readonly (readonly [string, string])[], scale: number): TimerWords[] {
  return set.map(([name, time]) => ({
    name: textWidth(name, type.bodyStrong.fontSize * scale, '600SemiBold'),
    time: textWidth(time.replace(/\d/g, '8'), type.timerNumber.fontSize * scale, '700Bold', (type.timerNumber.letterSpacing ?? 0) * scale),
    paused: 0,
  }));
}

describe('the dock’s rules', () => {
  it('holds at every window from 320 to 1200, at 1.0, 1.15 and 1.3', () => {
    let checked = 0;
    let twoUp = 0;
    let more = 0;
    for (let window = 320; window <= 1200; window += 1) {
      // On one column the dock is the window less its margins; wider, a pane
      // of at least 320. Either way it is never wider than the window.
      const width = window < 600 ? window - COVER_MARGIN * 2 : Math.max(320, window * 0.58) - COVER_MARGIN * 2;
      for (const scale of SCALES) {
        for (const height of HEIGHTS) {
          for (const set of SETS) {
            const measured = words(set, scale);
            const plan = planDock({ across: width, windowHeight: height, fontScale: scale, words: measured });
            checked += 1;
            // Every timer is either shown or counted in "+ N more".
            expect(plan.shown + plan.more).toBe(set.length);
            // Never more than a third of the window's height.
            expect(plan.height).toBeLessThanOrEqual(height * TIMER_DOCK_SHARE + 1e-9);
            // Two to a row only when each shown timer fits half a row whole.
            if (plan.perRow === 2) {
              twoUp += 1;
              const half = (width - TIMER_DOCK_GAP) / 2;
              expect(half).toBeGreaterThanOrEqual(size.timerPairMin);
              for (const entry of measured.slice(0, plan.shown)) {
                expect(rowNeed(entry)).toBeLessThanOrEqual(half);
              }
            } else if (window >= 360 && set !== SETS[3]) {
              // One to a row: from 360 dp (the Fold's cover is 369) an
              // ordinary name and its time fit whole on a row of their own.
              // Narrower, or with a forty-character name, a name can be cut
              // short with an ellipsis; TalkBack still reads it whole.
              for (const entry of measured.slice(0, plan.shown)) {
                expect(rowNeed(entry)).toBeLessThanOrEqual(width + 1);
              }
            }
            // "+ N more" only when one more row would not fit.
            if (plan.more > 0) {
              more += 1;
              const rows = Math.ceil(plan.shown / plan.perRow);
              const next = (rows + 1) * plan.rowHeight + rows * TIMER_DOCK_GAP + TIMER_DOCK_GAP + MORE_HEIGHT;
              expect(next).toBeGreaterThan(height * TIMER_DOCK_SHARE);
            }
          }
        }
      }
    }
    expect(checked).toBe(881 * SCALES.length * HEIGHTS.length * SETS.length);
    // Both ways happen across the range, and so does "+ N more".
    expect(twoUp).toBeGreaterThan(0);
    expect(more).toBeGreaterThan(0);
  });

  it('puts Gravy and Veg two to a row on a 360 window at normal text, as the approved picture does', () => {
    const plan = planDock({ across: 360 - 32, windowHeight: 840, fontScale: 1, words: words(SETS[0]!, 1) });
    expect(plan).toMatchObject({ perRow: 2, shown: 3, more: 0 });
  });

  it('goes one to a row when a name and its time no longer fit half, and back when they do', () => {
    const long = words(SETS[2]!, 1.3);
    expect(planDock({ across: 328, windowHeight: 840, fontScale: 1.3, words: long }).perRow).toBe(1);
    expect(planDock({ across: 900, windowHeight: 840, fontScale: 1.3, words: long }).perRow).toBe(2);
  });

  it('is one to a row until the words have been measured', () => {
    expect(planDock({ across: 900, windowHeight: 840, fontScale: 1, words: [null, null] }).perRow).toBe(1);
  });

  it('shows eight timers as some rows and "+ N more", within a third of the window', () => {
    const plan = planDock({ across: 328, windowHeight: 600, fontScale: 1.3, words: words(SETS[4]!, 1.3) });
    expect(plan.more).toBeGreaterThan(0);
    expect(plan.height).toBeLessThanOrEqual(200);
  });

  it('grows a row with the text, never below 48', () => {
    expect(rowHeight(1)).toBe(48);
    expect(rowHeight(1.3)).toBeGreaterThan(48);
  });
});
