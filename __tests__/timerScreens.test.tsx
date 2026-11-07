/**
 * Kitchen timers and tabletop mode on the screens (0.5.0), end to end: the
 * real screens, the real services and SQL, and the timers module's mock
 * playing the phone's part.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { mockState, queueTimerEvent, setAlertState, setPosture } from '../modules/cook-timers/mocks/CookTimersModule';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { TABLETOP_BUTTONS } from '../src/screens/timers/TabletopCook';
import { MINUTE } from '../src/timers/model';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const COOK = 'cook-roast';

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('timer-screens.db');
  const at = harness.tick();
  await harness.db.data.capture.startCook({ id: COOK, title: 'Roast chicken', startedAt: at }, 'user', at);
});

afterEach(async () => {
  await harness.close();
});

const nowIso = () => harness.storage.now();
const ago = (minutes: number) => new Date(Date.parse(nowIso()) - minutes * MINUTE).toISOString();

async function startTimer(name: string, minutes: number, id: string, at = nowIso()) {
  const decision = await harness.db.data.timerWorkflow.start(COOK, name, minutes * MINUTE, { id }, 'user', at);
  if (!decision.allowed) {
    throw new Error(decision.message);
  }
  return decision.record;
}

const cookPage = () => <CookScreen cookId={COOK} onBack={jest.fn()} onReview={jest.fn()} />;

describe('New timer', () => {
  it('sits beside Oven °C and Internal °C, and starts a named timer of the chosen length', async () => {
    await harness.render(cookPage());
    const chips = [
      await screen.findByTestId('oven-reading-toggle'),
      screen.getByTestId('internal-reading-toggle'),
      screen.getByTestId('timer-toggle'),
    ];
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual(['Oven °C', 'Internal °C', 'Timer']);

    await fireEvent.press(screen.getByTestId('timer-toggle'));
    await screen.findByTestId('timer-sheet');
    for (const name of ['meat', 'veg', 'rest']) {
      expect(screen.getByTestId(`timer-name-${name}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId('timer-start')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('timer-name-rest'));
    expect(screen.getByTestId('timer-start')).toHaveTextContent('Start Rest · 15 min');
    await fireEvent.press(screen.getByTestId('timer-more'));
    expect(screen.getByTestId('timer-length')).toHaveTextContent('16 min');
    await fireEvent(screen.getByTestId('timer-more'), 'longPress');
    expect(screen.getByTestId('timer-length')).toHaveTextContent('21 min');
    await fireEvent.press(screen.getByTestId('timer-less'));
    expect(screen.getByTestId('timer-length')).toHaveTextContent('20 min');
    await fireEvent.press(screen.getByTestId('timer-length-90'));
    expect(screen.getByTestId('timer-start')).toHaveTextContent('Start Rest · 1 h 30 min');

    await fireEvent.press(screen.getByTestId('timer-start'));
    await waitFor(() => expect(screen.queryByTestId('timer-sheet')).toBeNull());

    const [rest] = await harness.db.data.timers.listForCook(COOK);
    expect(rest).toMatchObject({ name: 'Rest', colour: 'blue', lengthMs: 90 * MINUTE });
    // The module holds it: id, name and end time, and nothing else.
    await waitFor(() => expect([...mockState.running.values()]).toEqual([{ id: rest!.id, name: 'Rest', endsAt: Date.parse(rest!.endsAt) }]));
    expect(await screen.findByTestId(`timer-${rest!.id}`)).toBeOnTheScreen();
  });

  it('starts a name typed, and a name used before at the length it was last given', async () => {
    await startTimer('Gravy', 12, 'timer-gravy-before', ago(60));
    await harness.db.data.timerWorkflow.stop('timer-gravy-before', 'user', ago(40));
    await harness.render(cookPage());
    await fireEvent.press(await screen.findByTestId('timer-toggle'));
    await fireEvent.press(await screen.findByTestId('timer-name-gravy'));
    expect(screen.getByTestId('timer-start')).toHaveTextContent('Start Gravy · 12 min');

    await fireEvent.changeText(screen.getByTestId('timer-name-input'), 'Sauce');
    expect(screen.getByTestId('timer-start')).toHaveTextContent('Start Sauce · 12 min');
    await fireEvent.press(screen.getByTestId('timer-start'));
    await waitFor(async () => expect((await harness.db.data.timers.listLive()).map((timer) => timer.name)).toEqual(['Sauce']));
    // Gravy took plum; Sauce takes gold.
    expect((await harness.db.data.timers.listLive())[0]?.colour).toBe('gold');
  });

  it('asks for notifications the first time a timer starts, and only then', async () => {
    mockState.alerts = { notifications: 'undetermined', exactAlarms: true };
    mockState.answer = 'granted';
    await harness.render(cookPage());
    for (const name of ['rest', 'veg']) {
      await fireEvent.press(await screen.findByTestId('timer-toggle'));
      await fireEvent.press(await screen.findByTestId(`timer-name-${name}`));
      await fireEvent.press(screen.getByTestId('timer-start'));
      await waitFor(() => expect(screen.queryByTestId('timer-sheet')).toBeNull());
      mockState.alerts = { notifications: 'undetermined', exactAlarms: true };
    }
    expect(mockState.calls.filter((call) => call === 'requestNotifications')).toHaveLength(1);
  });
});

describe('the running timers above the composer', () => {
  it('shows each with its time left, and +1 min, +5 min, Pause, Resume and Stop', async () => {
    const meat = await startTimer('Meat', 70, 'timer-meat');
    await harness.render(cookPage());
    expect(await screen.findByTestId('timer-timer-meat-time')).toHaveTextContent('1:10:00');
    expect(screen.getByTestId('timer-timer-meat').props.accessibilityLabel).toBe('Meat, 1 hour 10 minutes left');

    await fireEvent.press(screen.getByTestId('timer-timer-meat'));
    await fireEvent.press(await screen.findByTestId('timer-add-1'));
    await waitFor(async () =>
      expect((await harness.db.data.timers.findById('timer-meat'))?.endsAt).toBe(new Date(Date.parse(meat.endsAt) + MINUTE).toISOString()),
    );
    await waitFor(() => expect(mockState.running.get('timer-meat')?.endsAt).toBe(Date.parse(meat.endsAt) + MINUTE));
    await fireEvent.press(screen.getByTestId('timer-add-5'));
    await waitFor(() => expect(screen.getByTestId('timer-timer-meat-time')).toHaveTextContent('1:16:00'));

    await fireEvent.press(screen.getByTestId('timer-pause'));
    await waitFor(() => expect(mockState.running.has('timer-meat')).toBe(false));
    expect(await screen.findByTestId('timer-resume')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('timer-resume'));
    await waitFor(() => expect(mockState.running.has('timer-meat')).toBe(true));

    await fireEvent.press(await screen.findByTestId('timer-stop'));
    await waitFor(() => expect(screen.queryByTestId('timer-timer-meat')).toBeNull());
    expect(mockState.running.has('timer-meat')).toBe(false);
    expect((await harness.db.data.timers.findById('timer-meat'))?.stoppedAt).not.toBeNull();
  });

  it('turns a finished timer solid with Done; one tap stops it', async () => {
    await startTimer('Rest', 15, 'timer-rest', ago(20));
    await harness.render(cookPage());
    expect(await screen.findByTestId('timer-timer-rest-time')).toHaveTextContent('Done');
    expect(screen.getByTestId('timer-timer-rest').props.accessibilityLabel).toBe('Rest is done');
    await fireEvent.press(screen.getByTestId('timer-timer-rest'));
    await waitFor(() => expect(screen.queryByTestId('timer-timer-rest')).toBeNull());
    expect(screen.queryByTestId('timer-actions')).toBeNull();
    expect(mockState.calls).toContain('cancel timer-rest');
  });

  it('marks one that runs out while open as finished at its end time, and tells TalkBack once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const rest = await startTimer('Rest', 1, 'timer-rest');
    await harness.render(cookPage());
    await screen.findByTestId('timer-timer-rest');
    harness.tick();
    harness.tick();
    await waitFor(() => expect(screen.getByTestId('timer-timer-rest-time')).toHaveTextContent('Done'), { timeout: 4000 });
    await waitFor(async () => expect((await harness.db.data.timers.findById('timer-rest'))?.ranOutAt).toBe(rest.endsAt));
    expect(announce.mock.calls.filter(([words]) => words === 'Rest is done')).toHaveLength(1);
    // It is left to ring: Stop is what silences it.
    expect(mockState.calls).not.toContain('cancel timer-rest');
    announce.mockRestore();
  });

  it('applies what happened while the app was closed, and from a notification while open', async () => {
    const rest = await startTimer('Rest', 15, 'timer-rest', ago(20));
    await startTimer('Veg', 25, 'timer-veg');
    await startTimer('Meat', 70, 'timer-meat');
    queueTimerEvent({ kind: 'ranOut', id: 'timer-rest', at: Date.parse(rest.endsAt) }, false);
    await harness.render(cookPage());
    await waitFor(async () => expect((await harness.db.data.timers.findById('timer-rest'))?.ranOutAt).toBe(rest.endsAt));

    const veg = await harness.db.data.timers.findById('timer-veg');
    await act(async () => {
      queueTimerEvent({ kind: 'added', id: 'timer-veg', at: Date.parse(nowIso()), addedMs: MINUTE });
      queueTimerEvent({ kind: 'stopped', id: 'timer-meat', at: Date.parse(nowIso()) });
    });
    await waitFor(async () =>
      expect((await harness.db.data.timers.findById('timer-veg'))?.endsAt).toBe(new Date(Date.parse(veg!.endsAt) + MINUTE).toISOString()),
    );
    await waitFor(() => expect(screen.queryByTestId('timer-timer-meat')).toBeNull());
  });

  it('says in one line when timers cannot ring, or not on time, and opens the setting', async () => {
    await startTimer('Meat', 70, 'timer-meat');
    setAlertState({ notifications: 'denied', exactAlarms: true });
    await harness.render(cookPage());
    const off = await screen.findByTestId('timer-alert-notifications');
    expect(off).toHaveTextContent('Timer alerts are off: tap to turn them on');
    await fireEvent.press(off);
    expect(mockState.calls).toContain('openNotificationSettings');

    await act(async () => setAlertState({ notifications: 'granted', exactAlarms: false }));
    const late = await screen.findByTestId('timer-alert-exactAlarms');
    expect(late).toHaveTextContent('Timers can’t ring on time: tap to allow');
    await fireEvent.press(late);
    expect(mockState.calls).toContain('openExactAlarmSettings');

    await act(async () => setAlertState({ notifications: 'granted', exactAlarms: true }));
    await waitFor(() => expect(screen.queryByTestId('timer-alert-exactAlarms')).toBeNull());
  });
});

describe('elsewhere', () => {
  it('shows a cook’s timers in its Cooking now card on Home', async () => {
    await startTimer('Meat', 70, 'timer-meat');
    await harness.render(<HomeScreen onOpenCook={jest.fn()} />);
    const dock = await screen.findByTestId(`cook-timers-${COOK}`);
    expect(within(dock).getByTestId('timer-timer-meat')).toBeOnTheScreen();
    await fireEvent.press(within(dock).getByTestId('timer-timer-meat'));
    expect(await screen.findByTestId('timer-add-5')).toBeOnTheScreen();
  });

  it('lets Finish & review go ahead with timers running, and says so in one line', async () => {
    await startTimer('Meat', 70, 'timer-meat');
    await harness.render(<ReviewScreen cookId={COOK} onBack={jest.fn()} onFinished={jest.fn()} />);
    expect(await screen.findByTestId('review-timers-running')).toHaveTextContent(
      'Meat is still running. It keeps going after the review.',
    );
    expect(screen.getByTestId('finish-review')).toBeEnabled();
  });

  it('shows a timer that rings during the review, Done with its Stop, and stops it there (0.5.0 fix)', async () => {
    await startTimer('Rest', 15, 'timer-rest', ago(20));
    await startTimer('Meat', 70, 'timer-meat');
    await harness.render(<ReviewScreen cookId={COOK} onBack={jest.fn()} onFinished={jest.fn()} />);
    const ringing = await screen.findByTestId('review-timer-timer-rest');
    expect(ringing.props.accessibilityLabel).toBe('Rest is done');
    expect(screen.getByTestId('review-timer-timer-rest-time')).toHaveTextContent('Done');
    expect(screen.getByTestId('review-timers-running')).toHaveTextContent(
      'Meat is still running. It keeps going after the review.',
    );
    await fireEvent.press(ringing);
    await waitFor(() => expect(screen.queryByTestId('review-timer-timer-rest')).toBeNull());
    expect((await harness.db.data.timers.findById('timer-rest'))?.stoppedAt).not.toBeNull();
    expect(mockState.calls).toContain('cancel timer-rest');
    expect(screen.getByTestId('review-timers-running')).toBeOnTheScreen();
  });
});

describe('tabletop mode', () => {
  const fold = { tabletop: true, foldTop: 376, foldBottom: 376 };

  it('splits the page where the fold is: upright half above it, the flat half below', async () => {
    await startTimer('Gravy', 10, 'timer-gravy');
    setPosture(fold);
    await harness.render(cookPage());
    const top = await screen.findByTestId('tabletop-top');
    expect(top).toHaveStyle({ height: 376 });
    expect(screen.getByTestId('tabletop-hinge')).toHaveStyle({ height: 0 });
    expect(screen.getByTestId('tabletop-timer-timer-gravy')).toBeOnTheScreen();
    expect(screen.queryByTestId('composer')).toBeNull();
  });

  it('has five big buttons: Timer, Oven, Internal, Photo, Note, never "Inside"', async () => {
    setPosture(fold);
    await harness.render(cookPage());
    await screen.findByTestId('tabletop-bottom');
    expect(TABLETOP_BUTTONS.map((button) => button.label)).toEqual(['Timer', 'Oven', 'Internal', 'Photo', 'Note']);
    expect(TABLETOP_BUTTONS.map((button) => screen.getByTestId(`tabletop-${button.key}`).props.accessibilityLabel)).toEqual([
      'Timer',
      'Oven',
      'Internal',
      'Photo',
      'Note',
    ]);
    expect(screen.queryByText(/Inside/)).toBeNull();
    expect(screen.getByText('No timers running. Tap Timer below to start one.')).toBeOnTheScreen();
  });

  it('opens from each button what it opens on the cook page', async () => {
    setPosture(fold);
    await harness.render(cookPage());
    await fireEvent.press(await screen.findByTestId('tabletop-oven'));
    expect(await screen.findByTestId('reading-panel-oven')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('temperature-cancel'));
    await fireEvent.press(screen.getByTestId('tabletop-internal'));
    expect(await screen.findByTestId('reading-panel-internal')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('temperature-cancel'));
    await fireEvent.press(screen.getByTestId('tabletop-timer'));
    expect(await screen.findByTestId('timer-sheet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('timer-sheet-scrim'));
    await fireEvent.press(screen.getByTestId('tabletop-photo'));
    expect(await screen.findByTestId('take-photo')).toBeOnTheScreen();
  });

  it('adds a note from Note', async () => {
    setPosture(fold);
    await harness.render(cookPage());
    await fireEvent.press(await screen.findByTestId('tabletop-note'));
    await fireEvent.changeText(await screen.findByTestId('note-sheet-input'), 'Skin crisping nicely.');
    await fireEvent.press(screen.getByTestId('note-sheet-send'));
    await waitFor(() => expect(screen.queryByTestId('note-sheet')).toBeNull());
    const events = await harness.db.data.cookEvents.listForCook({ cookId: COOK });
    expect(events.map((event) => event.body)).toContain('Skin crisping nicely.');
  });

  it('turns the flat half into one Stop when a timer is done', async () => {
    await startTimer('Rest', 15, 'timer-rest', ago(20));
    setPosture(fold);
    await harness.render(cookPage());
    const stop = await screen.findByTestId('tabletop-stop');
    expect(stop.props.accessibilityLabel).toBe('Stop. Rest is done');
    expect(screen.queryByTestId('tabletop-timer')).toBeNull();
    await fireEvent.press(stop);
    expect(await screen.findByTestId('tabletop-timer')).toBeOnTheScreen();
  });

  it('goes back to the usual page the moment it is not tabletop', async () => {
    setPosture(fold);
    await harness.render(cookPage());
    await screen.findByTestId('tabletop');
    await act(async () => setPosture({ tabletop: false, foldTop: 376, foldBottom: 376 }));
    expect(await screen.findByTestId('cook-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('tabletop')).toBeNull();
    await act(async () => setPosture(fold));
    expect(await screen.findByTestId('tabletop')).toBeOnTheScreen();
    await act(async () => setPosture(null));
    expect(await screen.findByTestId('cook-screen')).toBeOnTheScreen();
  });
});
