/**
 * Kitchen timers while the app runs (0.5.0).
 *
 * One controller for the whole app, above every screen: it holds the timers
 * still showing (running, paused, or finished and not yet stopped), keeps the
 * clock ticking once a second while one is running, and keeps three things
 * agreeing:
 *
 *   - the notebook, written only through the timer service, as the user;
 *   - the timers module (`modules/cook-timers`): a running timer's exact
 *     alarm and countdown notification, cancelled when it is paused, stopped
 *     or gone. A finished one is left to ring;
 *   - what happened while the app was closed, or in a notification: taken
 *     from the module's queue at launch, when the app comes back to the
 *     front and whenever the module says there is something, and applied.
 *
 * A timer that runs out while the app is open is marked finished at its end
 * time and announced to TalkBack once. Screens read it with `useTimers()`.
 * Outside the provider (a screen drawn on its own in a test) the hook runs a
 * controller of its own, so every screen behaves the same either way.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

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
  type Posture,
  type TimerAlertState,
} from '../../modules/cook-timers';
import type { CookId, Timer, TimerId } from '../domain/entities';
import type { EvidenceDecision } from '../domain/evidence';
import { MINUTE, finishedAnnouncement, inOrder, timerState } from '../timers/model';
import { useStorageState, type AppStorage } from './StorageProvider';

/** The app setting that says notifications have been asked for once. */
const ASKED_KEY = 'timers.notifications-asked';

export type TimersApi = {
  /** False until the first load. */
  readonly ready: boolean;
  /** Every timer still showing, on every cook. */
  readonly timers: readonly Timer[];
  /** The moment the timers are drawn at, in ms; moves once a second while one runs. */
  readonly now: number;
  /** One cook's timers in the order they are shown: finished first, then the soonest. */
  forCook(cookId: CookId): Timer[];
  /** Start a timer; resolves with a message when it was not started. */
  start(cookId: CookId, name: string, minutes: number): Promise<string | null>;
  pause(id: TimerId): Promise<string | null>;
  resume(id: TimerId): Promise<string | null>;
  add(id: TimerId, minutes: number): Promise<string | null>;
  stop(id: TimerId): Promise<string | null>;
  /** Every timer there has been, for New timer's names and lengths. */
  history(): Promise<readonly Timer[]>;
  /** Whether timers can ring, and ring on time. */
  readonly alerts: TimerAlertState;
  openAlertSetting(which: 'notifications' | 'exactAlarms'): void;
  /** Where the fold is, or null. */
  readonly posture: Posture;
};

const TimersContext = createContext<TimersApi | null>(null);

const INERT_ALERTS: TimerAlertState = { notifications: 'granted', exactAlarms: true };

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The controller itself. `enabled` false: it does nothing and holds nothing. */
function useTimerController(storage: AppStorage | null, enabled: boolean): TimersApi {
  const [timers, setTimers] = useState<readonly Timer[]>([]);
  const [ready, setReady] = useState(false);
  const clock = useCallback(() => (storage ? Date.parse(storage.now()) : Date.now()), [storage]);
  const [now, setNow] = useState(clock);
  const [alerts, setAlerts] = useState<TimerAlertState>(() => (enabled ? safe(timerAlertState, INERT_ALERTS) : INERT_ALERTS));
  const [posture, setPostureState] = useState<Posture>(() => (enabled ? safe(currentPosture, null) : null));
  /** What the module was last told, by timer id: the end time it rings at. */
  const scheduled = useRef(new Map<TimerId, string>());
  const announced = useRef(new Set<TimerId>());
  const live = useRef(true);

  const active = enabled && storage !== null;

  /** Tell the module what changed: running ones armed at their end, paused and stopped ones cancelled. */
  const sync = useCallback((list: readonly Timer[], at: number) => {
    const seen = new Set<TimerId>();
    for (const timer of list) {
      seen.add(timer.id);
      const state = timerState(timer, at);
      if (state === 'running') {
        if (scheduled.current.get(timer.id) !== timer.endsAt) {
          safe(() => scheduleTimer(timer), undefined);
          scheduled.current.set(timer.id, timer.endsAt);
        }
      } else if (state === 'paused' || state === 'stopped') {
        if (scheduled.current.has(timer.id)) {
          safe(() => cancelTimer(timer.id), undefined);
          scheduled.current.delete(timer.id);
        }
      } else {
        // Finished: it rings in the module; nothing is cancelled until Stop.
        scheduled.current.delete(timer.id);
      }
    }
    for (const id of [...scheduled.current.keys()]) {
      if (!seen.has(id)) {
        scheduled.current.delete(id);
      }
    }
  }, []);

  const reload = useCallback(async () => {
    if (!storage) {
      return;
    }
    const list = await storage.data.timers.listLive();
    if (!live.current) {
      return;
    }
    // Ones finished before this load are not announced again.
    if (!ready) {
      for (const timer of list) {
        if (timerState(timer, clock()) === 'finished') {
          announced.current.add(timer.id);
        }
      }
    }
    setTimers(list);
    setReady(true);
    sync(list, clock());
  }, [storage, sync, clock, ready]);

  /** Apply what the module queued while the app was closed, or from a notification. */
  const drain = useCallback(async () => {
    if (!storage) {
      return;
    }
    const events = safe(takeQueuedTimerEvents, []);
    for (const event of events) {
      const at = new Date(event.at).toISOString();
      const { timerWorkflow } = storage.data;
      try {
        if (event.kind === 'ranOut') {
          await timerWorkflow.finish(event.id, at, 'user');
        } else if (event.kind === 'added') {
          await timerWorkflow.add(event.id, event.addedMs, 'user', at);
        } else {
          await timerWorkflow.stop(event.id, 'user', at);
        }
      } catch {
        // A timer whose cook has gone: there is nothing left to apply it to.
      }
    }
    await reload();
  }, [storage, reload]);

  useEffect(() => {
    live.current = true;
    if (!active) {
      return undefined;
    }
    void drain();
    const subs = [
      safe(() => onQueuedTimerEvents(() => void drain()), null),
      safe(() => onTimerAlertState(setAlerts), null),
      safe(() => onPosture(setPostureState), null),
    ];
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setAlerts(safe(timerAlertState, INERT_ALERTS));
        void drain();
      }
    });
    return () => {
      live.current = false;
      subs.forEach((sub) => sub?.remove());
      appState.remove();
    };
    // `drain` changes with `ready`; listening once per storage is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, storage]);

  // Tick while something is running; mark what has run out, and say so once.
  const anyRunning = timers.some((timer) => timerState(timer, now) === 'running');
  useEffect(() => {
    if (!active || !anyRunning) {
      return undefined;
    }
    const tick = setInterval(() => setNow(clock()), 1_000);
    return () => clearInterval(tick);
  }, [active, anyRunning, clock]);

  useEffect(() => {
    if (!active || !storage) {
      return;
    }
    const due = timers.filter((timer) => timer.ranOutAt === null && timerState(timer, now) === 'finished');
    if (due.length === 0) {
      return;
    }
    void (async () => {
      for (const timer of due) {
        try {
          await storage.data.timerWorkflow.finish(timer.id, timer.endsAt, 'user');
        } catch {
          // Gone meanwhile.
        }
        if (!announced.current.has(timer.id)) {
          announced.current.add(timer.id);
          AccessibilityInfo.announceForAccessibility(finishedAnnouncement(timer));
        }
      }
      await reload();
    })();
  }, [active, storage, timers, now, reload]);

  const write = useCallback(
    async (run: () => Promise<EvidenceDecision<Timer>>): Promise<string | null> => {
      try {
        const decision = await run();
        if (!decision.allowed) {
          return decision.message;
        }
        setNow(clock());
        await reload();
        return null;
      } catch (cause: unknown) {
        return messageOf(cause);
      }
    },
    [reload, clock],
  );

  const start = useCallback(
    async (cookId: CookId, name: string, minutes: number): Promise<string | null> => {
      if (!storage) {
        return 'The notebook is not open yet.';
      }
      const problem = await write(() =>
        storage.data.timerWorkflow.start(cookId, name, minutes * MINUTE, { id: storage.newId() }, 'user', storage.now()),
      );
      // Asked for the first time a timer starts, never before, and once.
      if (problem === null && active && safe(timerAlertState, INERT_ALERTS).notifications === 'undetermined') {
        const asked = await storage.data.settings.get(ASKED_KEY).catch(() => null);
        if (asked === null) {
          await storage.data.settings.set(ASKED_KEY, storage.now()).catch(() => {});
          await askForNotifications().catch(() => 'denied');
          setAlerts(safe(timerAlertState, INERT_ALERTS));
        }
      }
      return problem;
    },
    [storage, write, active],
  );

  const api = useMemo<TimersApi>(() => {
    const at = storage ? now : 0;
    return {
      ready,
      timers,
      now: at,
      forCook: (cookId) => inOrder(timers.filter((timer) => timer.cookId === cookId), at),
      start,
      pause: (id) => (storage ? write(() => storage.data.timerWorkflow.pause(id, 'user', storage.now())) : Promise.resolve(null)),
      resume: (id) => (storage ? write(() => storage.data.timerWorkflow.resume(id, 'user', storage.now())) : Promise.resolve(null)),
      add: (id, minutes) =>
        storage ? write(() => storage.data.timerWorkflow.add(id, minutes * MINUTE, 'user', storage.now())) : Promise.resolve(null),
      stop: async (id) => {
        if (!storage) {
          return null;
        }
        // Quiet at once, whatever the notebook says: Stop was pressed.
        safe(() => cancelTimer(id), undefined);
        scheduled.current.delete(id);
        return write(() => storage.data.timerWorkflow.stop(id, 'user', storage.now()));
      },
      history: () => (storage ? storage.data.timers.listAll() : Promise.resolve([])),
      alerts,
      openAlertSetting: (which) => safe(() => (which === 'notifications' ? openNotificationSettings() : openExactAlarmSettings()), undefined),
      posture,
    };
  }, [ready, timers, now, start, write, storage, alerts, posture]);

  return api;
}

/** Call into the module, and carry on without it if it throws. */
function safe<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

/** Above every screen, once the notebook is open. */
export function TimersProvider({ children }: { children: ReactNode }) {
  const state = useStorageState();
  const storage = state.status === 'ready' ? state.storage : null;
  const api = useTimerController(storage, true);
  return <TimersContext.Provider value={api}>{children}</TimersContext.Provider>;
}

/** The timers, from the app's controller, or a controller of this screen's own outside one. */
export function useTimers(): TimersApi {
  const shared = useContext(TimersContext);
  const state = useStorageState();
  const own = useTimerController(state.status === 'ready' ? state.storage : null, shared === null);
  return shared ?? own;
}
