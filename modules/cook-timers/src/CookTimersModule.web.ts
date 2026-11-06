/**
 * The timers module in the web preview (0.5.0): a stub, so the preview
 * builds and draws. Nothing rings and nothing is kept. Alerts are on.
 *
 * The posture comes from the page's own query string, as the preview's other
 * options do: `?posture=tabletop&foldAt=<dp>` reports tabletop with the fold
 * that far down the window (half way when `foldAt` is left out). The preview
 * screens `tabletop` and `tabletop-done` report it without being asked.
 */
import type { CookTimersNative, Posture, QueuedTimerEvent } from './CookTimers.types';

const TABLETOP_SCREENS = ['tabletop', 'tabletop-done'];

function query(): URLSearchParams {
  const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
  return new URLSearchParams(search);
}

/** The posture the page asks for, read afresh each time. */
export function previewPosture(): Posture {
  const params = query();
  const asked = params.get('posture') === 'tabletop' || TABLETOP_SCREENS.includes(params.get('screen') ?? '');
  if (!asked) {
    return null;
  }
  const height = typeof window !== 'undefined' ? window.innerHeight : 0;
  const foldAt = Number(params.get('foldAt'));
  const top = Number.isFinite(foldAt) && foldAt > 0 && foldAt < height ? foldAt : Math.round(height / 2);
  return { tabletop: true, foldTop: top, foldBottom: top };
}

const module: CookTimersNative = {
  schedule() {},
  cancel() {},
  alertState() {
    return { notifications: 'granted', exactAlarms: true };
  },
  async requestNotifications() {
    return 'granted';
  },
  openNotificationSettings() {},
  openExactAlarmSettings() {},
  takeQueued(): QueuedTimerEvent[] {
    return [];
  },
  posture: previewPosture,
  addListener() {
    return { remove() {} };
  },
};

export default module;
