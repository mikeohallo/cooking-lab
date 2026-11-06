/**
 * The timers module's JavaScript contract (0.5.0), against its Jest mock.
 *
 * The app reaches the module only through `modules/cook-timers/index.ts`.
 * These hold that what goes over is the least it can be (a running timer is
 * its id, name and end time), that what comes back from the phone is checked
 * before the app acts on it, and that the mock answers as the module's types
 * say the phone does.
 */
import {
  askForNotifications,
  cancelTimer,
  currentPosture,
  onPosture,
  onQueuedTimerEvents,
  onTimerAlertState,
  openExactAlarmSettings,
  openNotificationSettings,
  scheduleTimer,
  takeQueuedTimerEvents,
  timerAlertState,
} from '../modules/cook-timers';
import native, {
  mockState,
  queueTimerEvent,
  setAlertState,
  setPosture,
} from '../modules/cook-timers/mocks/CookTimersModule';
import type { CookTimersNative } from '../modules/cook-timers/src/CookTimers.types';
import webStub from '../modules/cook-timers/src/CookTimersModule.web';

const ENDS = '2026-11-06T08:15:00.000Z';

describe('what the app hands the module', () => {
  it('schedules a timer as its id, name and end time in ms, and nothing else', () => {
    scheduleTimer({ id: 't-rest', name: 'Rest', endsAt: ENDS });
    expect(mockState.calls).toEqual([`schedule t-rest Rest ${Date.parse(ENDS)}`]);
    expect([...mockState.running.values()]).toEqual([{ id: 't-rest', name: 'Rest', endsAt: Date.parse(ENDS) }]);
  });

  it('cancels by id, and the module keeps nothing of it', () => {
    scheduleTimer({ id: 't-rest', name: 'Rest', endsAt: ENDS });
    cancelTimer('t-rest');
    expect(mockState.running.size).toBe(0);
  });

  it('opens each setting, and asks for notifications', async () => {
    openNotificationSettings();
    openExactAlarmSettings();
    mockState.answer = 'denied';
    expect(await askForNotifications()).toBe('denied');
    expect(timerAlertState()).toEqual({ notifications: 'denied', exactAlarms: true });
    expect(mockState.calls).toEqual(['openNotificationSettings', 'openExactAlarmSettings', 'requestNotifications']);
  });
});

describe('what comes back from the phone', () => {
  it('takes what was queued, oldest first, once', () => {
    queueTimerEvent({ kind: 'ranOut', id: 't-rest', at: 1 }, false);
    queueTimerEvent({ kind: 'added', id: 't-meat', at: 2, addedMs: 60_000 }, false);
    queueTimerEvent({ kind: 'stopped', id: 't-veg', at: 3 }, false);
    expect(takeQueuedTimerEvents().map((event) => `${event.kind} ${event.id}`)).toEqual([
      'ranOut t-rest',
      'added t-meat',
      'stopped t-veg',
    ]);
    expect(takeQueuedTimerEvents()).toEqual([]);
  });

  it('leaves out anything malformed rather than acting on it', () => {
    mockState.queue.push(
      { kind: 'added', id: 't-meat', at: 2, addedMs: -5 } as never,
      { kind: 'rang', id: 't-x', at: 1 } as never,
      { kind: 'stopped', id: 7, at: 1 } as never,
      { kind: 'ranOut', id: 't-ok', at: 4 },
    );
    expect(takeQueuedTimerEvents()).toEqual([{ kind: 'ranOut', id: 't-ok', at: 4 }]);
  });

  it('tells the app when something is queued, alerts change or the fold moves', () => {
    const heard: string[] = [];
    const subs = [
      onQueuedTimerEvents(() => heard.push('queued')),
      onTimerAlertState((state) => heard.push(`alerts ${state.notifications} ${state.exactAlarms}`)),
      onPosture((posture) => heard.push(`posture ${posture?.tabletop ?? 'none'} ${posture?.foldTop ?? ''}`)),
    ];
    queueTimerEvent({ kind: 'ranOut', id: 't-rest', at: 1 });
    setAlertState({ notifications: 'granted', exactAlarms: false });
    setPosture({ tabletop: true, foldTop: 376, foldBottom: 376 });
    expect(currentPosture()).toEqual({ tabletop: true, foldTop: 376, foldBottom: 376 });
    setPosture(null);
    subs.forEach((sub) => sub.remove());
    setPosture(null);
    expect(heard).toEqual(['queued', 'alerts granted false', 'posture true 376', 'posture none ']);
  });
});

describe('every platform provides the same functions', () => {
  const NAMES: readonly (keyof CookTimersNative)[] = [
    'schedule',
    'cancel',
    'alertState',
    'requestNotifications',
    'openNotificationSettings',
    'openExactAlarmSettings',
    'takeQueued',
    'posture',
    'addListener',
  ];

  it.each([
    ['the Jest mock', native],
    ['the web preview stub', webStub],
  ])('%s', (_name, module) => {
    for (const name of NAMES) {
      expect(typeof module[name]).toBe('function');
    }
    expect(module.alertState()).toEqual({ notifications: 'granted', exactAlarms: true });
    expect(module.takeQueued()).toEqual([]);
  });

  it('the Kotlin module declares each of them', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    const kotlin = readFileSync(
      `${__dirname}/../modules/cook-timers/android/src/main/java/expo/modules/cooktimers/CookTimersModule.kt`,
      'utf8',
    );
    expect(kotlin).toContain('Name("CookTimers")');
    for (const name of NAMES.filter((name) => name !== 'addListener')) {
      expect(kotlin).toMatch(new RegExp(`(Function|AsyncFunction)\\("${name}"\\)`));
    }
    expect(kotlin).toContain('Events("onQueued", "onAlertState", "onPosture")');
  });
});
