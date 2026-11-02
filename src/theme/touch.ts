/**
 * The touch area, apart from the drawn size (0.4.0, part 7).
 *
 * Material 3 draws a button about 40 dp tall and a chip 32 dp, and gives each
 * a 48 dp touch area from the space around it. Cooking Lab does the same:
 * every control keeps a touch area of at least `size.targetMin` (48 dp), and
 * what is drawn follows Material 3's sizes. Where a control is drawn smaller
 * than 48, its `hitSlop` reaches out the rest of the way, evenly on each side.
 * `__tests__/touchArea.test.tsx` holds every pressable on every screen to it.
 */

import type { Insets } from 'react-native';

import { size } from './tokens';

/** The smallest touch area of any control, drawn size plus hit area. */
export const TOUCH_AREA = size.targetMin;

/** How far a side must reach out for `drawn` to become a touch area. */
function reach(drawn: number): number {
  return Math.max(0, Math.ceil((TOUCH_AREA - drawn) / 2));
}

/**
 * The hit area that grows a control drawn `height` tall (and `width` wide, when
 * that is fixed) to a 48 dp touch area. A control whose width comes from its
 * words is already wide enough and reaches out only above and below.
 */
export function touchSlop(height: number, width?: number): Insets {
  const vertical = reach(height);
  const horizontal = width === undefined ? 0 : reach(width);
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}
