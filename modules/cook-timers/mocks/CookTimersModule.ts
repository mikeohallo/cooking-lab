/**
 * The timers module in Jest (0.5.0): it remembers what it was asked and lets
 * a test play the phone's part — queue a timer that ran out while the app was
 * closed, turn notifications off, half-fold the screen. Installed for every
 * suite by `jest.setup.ts`; `resetCookTimersMock` puts it back between tests.
 */
import type {
  CookTimersEvents,
  CookTimersNative,
  EventName,
  NotificationPermission,
  Posture,
  QueuedTimerEvent,
  RunningTimer,
  TimerAlertState,
} from '../src/CookTimers.types';

type Listeners = { [E in EventName]: Set<CookTimersEvents[E]> };

type MockState = {
  running: Map<string, RunningTimer>;
  queue: QueuedTimerEvent[];
  alerts: TimerAlertState;
  /** What `requestNotifications` answers. */
  answer: NotificationPermission;
  posture: Posture;
  calls: string[];
  listeners: Listeners;
};

function fresh(): MockState {
  return {
    running: new Map(),
    queue: [],
    alerts: { notifications: 'granted', exactAlarms: true },
    answer: 'granted',
    posture: null,
    calls: [],
    listeners: { onQueued: new Set(), onAlertState: new Set(), onPosture: new Set() },
  };
}

export const mockState: MockState = fresh();

function emit<E extends EventName>(event: E, payload: Parameters<CookTimersEvents[E]>[0]): void {
  for (const listener of mockState.listeners[event]) {
    (listener as (value: typeof payload) => void)(payload);
  }
}

const module: CookTimersNative = {
  schedule(id, name, endsAt) {
    mockState.calls.push(`schedule ${id} ${name} ${endsAt}`);
    mockState.running.set(id, { id, name, endsAt });
  },
  cancel(id) {
    mockState.calls.push(`cancel ${id}`);
    mockState.running.delete(id);
  },
  alertState() {
    return mockState.alerts;
  },
  async requestNotifications() {
    mockState.calls.push('requestNotifications');
    mockState.alerts = { ...mockState.alerts, notifications: mockState.answer };
    return mockState.answer;
  },
  openNotificationSettings() {
    mockState.calls.push('openNotificationSettings');
  },
  openExactAlarmSettings() {
    mockState.calls.push('openExactAlarmSettings');
  },
  takeQueued() {
    const taken = mockState.queue;
    mockState.queue = [];
    return taken;
  },
  posture() {
    return mockState.posture;
  },
  addListener(event, listener) {
    const set = mockState.listeners[event] as Set<typeof listener>;
    set.add(listener);
    return { remove: () => set.delete(listener) };
  },
};

export default module;

/** Start every test from a phone with nothing running, alerts on and no fold. */
export function resetCookTimersMock(): void {
  Object.assign(mockState, fresh());
}

/** As the phone does: something happened while the app was closed or in a notification. */
export function queueTimerEvent(event: QueuedTimerEvent, tell = true): void {
  mockState.queue.push(event);
  if (tell) {
    emit('onQueued', { count: mockState.queue.length });
  }
}

export function setAlertState(state: TimerAlertState): void {
  mockState.alerts = state;
  emit('onAlertState', state);
}

export function setPosture(posture: Posture): void {
  mockState.posture = posture;
  emit('onPosture', { posture });
}
