/**
 * The contract between Cooking Lab's JavaScript and its timers module
 * (0.5.0): `android/` on the phone, `CookTimersModule.web.ts` in the web
 * preview, `mocks/CookTimersModule.ts` in Jest. All three hold to these types.
 *
 * Times are milliseconds since the epoch. Sizes are dp.
 */

/** Whether Android lets the app post notifications. `undetermined`: never asked. */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

/** What decides whether a timer can ring, and ring on time. */
export type TimerAlertState = {
  readonly notifications: NotificationPermission;
  /** Alarms & reminders: true when exact alarms may be set (always, before Android 12). */
  readonly exactAlarms: boolean;
};

/**
 * A running timer as the module holds it, outside the encrypted notebook so
 * it can ring after a restart: its id, its name and when it ends. Nothing
 * else about the cook. Removed when the timer ends or is stopped.
 */
export type RunningTimer = {
  readonly id: string;
  readonly name: string;
  readonly endsAt: number;
};

/**
 * Something that happened while the app was closed, or in a notification,
 * for the app to put in the notebook: it ran out (`at` is its end time), a
 * minute was added from the notification, or it was stopped from there.
 */
export type QueuedTimerEvent =
  | { readonly kind: 'ranOut'; readonly id: string; readonly at: number }
  | { readonly kind: 'added'; readonly id: string; readonly at: number; readonly addedMs: number }
  | { readonly kind: 'stopped'; readonly id: string; readonly at: number };

/**
 * Where the fold is, in dp from the top of the window. `tabletop`: half
 * opened and the hinge across the screen. `null` on a phone with no fold, or
 * when the fold is not across this window.
 */
export type Posture = {
  readonly tabletop: boolean;
  readonly foldTop: number;
  readonly foldBottom: number;
} | null;

export type CookTimersEvents = {
  /** Something was queued while the app is open: take it with `takeQueued`. */
  onQueued(event: { readonly count: number }): void;
  /** Notifications or Alarms & reminders were turned on or off. */
  onAlertState(state: TimerAlertState): void;
  onPosture(posture: { readonly posture: Posture }): void;
};

export type EventName = keyof CookTimersEvents;

export type Subscription = { remove(): void };

/** The module itself, as each platform provides it. */
export type CookTimersNative = {
  /** Set or replace this timer's exact alarm, its ongoing notification and its entry in the module's store. */
  schedule(id: string, name: string, endsAt: number): void;
  /** Cancel its alarm, its notification and its store entry, and silence it if it is ringing. */
  cancel(id: string): void;
  alertState(): TimerAlertState;
  /** Ask for POST_NOTIFICATIONS (Android 13 and later); resolves with the answer. */
  requestNotifications(): Promise<NotificationPermission>;
  openNotificationSettings(): void;
  /** Android's Alarms & reminders page for this app. */
  openExactAlarmSettings(): void;
  /** Everything queued since the last call, oldest first; the queue is emptied. */
  takeQueued(): QueuedTimerEvent[];
  posture(): Posture;
  addListener<E extends EventName>(event: E, listener: CookTimersEvents[E]): Subscription;
};
