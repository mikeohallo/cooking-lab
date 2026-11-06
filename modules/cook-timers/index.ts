/**
 * Cooking Lab's timers module (0.5.0): exact alarms that ring when a timer
 * runs out, its notifications, and the fold's posture. A local Expo module
 * (`./modules` is autolinked); Kotlin in `android/`, a stub for the web
 * preview, a mock in Jest.
 *
 * The app talks to it only through these functions. Each one hands over the
 * least it can: a running timer goes over as its id, name and end time, and
 * nothing else about the cook.
 */
import native from './src/CookTimersModule';
import type {
  NotificationPermission,
  Posture,
  QueuedTimerEvent,
  Subscription,
  TimerAlertState,
} from './src/CookTimers.types';

export type {
  NotificationPermission,
  Posture,
  QueuedTimerEvent,
  RunningTimer,
  Subscription,
  TimerAlertState,
} from './src/CookTimers.types';

/** Ring at `endsAt` (ISO), with Android's own countdown in an ongoing notification until then. */
export function scheduleTimer(timer: { readonly id: string; readonly name: string; readonly endsAt: string }): void {
  native.schedule(timer.id, timer.name, Date.parse(timer.endsAt));
}

/** Paused, stopped or gone: no alarm, no notification, nothing kept, and quiet if ringing. */
export function cancelTimer(id: string): void {
  native.cancel(id);
}

export function timerAlertState(): TimerAlertState {
  return native.alertState();
}

/** Ask Android for notifications. Only ever called the first time a timer starts. */
export function askForNotifications(): Promise<NotificationPermission> {
  return native.requestNotifications();
}

export function openNotificationSettings(): void {
  native.openNotificationSettings();
}

/** Alarms & reminders, where exact alarms are allowed. */
export function openExactAlarmSettings(): void {
  native.openExactAlarmSettings();
}

function isQueued(value: unknown): value is QueuedTimerEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const event = value as Record<string, unknown>;
  if (typeof event.id !== 'string' || typeof event.at !== 'number' || !Number.isFinite(event.at)) {
    return false;
  }
  if (event.kind === 'added') {
    return typeof event.addedMs === 'number' && Number.isInteger(event.addedMs) && event.addedMs > 0;
  }
  return event.kind === 'ranOut' || event.kind === 'stopped';
}

/** What happened while the app was closed or in a notification, oldest first. Anything malformed is left out. */
export function takeQueuedTimerEvents(): QueuedTimerEvent[] {
  return native.takeQueued().filter(isQueued);
}

export function currentPosture(): Posture {
  return native.posture();
}

export function onQueuedTimerEvents(listener: () => void): Subscription {
  return native.addListener('onQueued', () => listener());
}

export function onTimerAlertState(listener: (state: TimerAlertState) => void): Subscription {
  return native.addListener('onAlertState', listener);
}

export function onPosture(listener: (posture: Posture) => void): Subscription {
  return native.addListener('onPosture', (event) => listener(event.posture));
}
