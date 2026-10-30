/**
 * The screen stays on while an open cook is in front (0.2.2).
 *
 * On while an open cook's page is in front and its toggle says "Screen stays
 * on" — which it does by default, for every cook. Off the moment the page is
 * left, the app goes to the background or the phone locks (Android reports a
 * lock as the app going to the background), or the toggle is turned to
 * "Screen can sleep". Never for a reviewed cook, Home or History.
 */

import { act, cleanup, fireEvent, screen } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { AppState, Pressable, type AppStateStatus } from 'react-native';

import { SCREEN_CAN_SLEEP, SCREEN_STAYS_ON } from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { KEEP_AWAKE_TAG } from '../src/state/useKeepScreenOn';
import { openScreenHarness, type ScreenHarness } from './support/screens';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

const activate = activateKeepAwakeAsync as jest.Mock;
const deactivate = deactivateKeepAwake as jest.Mock;

let harness: ScreenHarness;
let appStateListener: ((state: AppStateStatus) => void) | null = null;

beforeEach(async () => {
  activate.mockClear();
  deactivate.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
  harness = await openScreenHarness();
  const { data, now } = harness.storage;
  await data.capture.startCook({ id: 'cook-open', startedAt: now() }, 'user', now());
  await data.capture.startCook({ id: 'cook-done', startedAt: now() }, 'user', now());
  await data.capture.saveReview('cook-done', 'Good.', 'user', harness.tick());
});

afterEach(async () => {
  await cleanup();
  await harness.close();
  jest.restoreAllMocks();
  appStateListener = null;
});

/** The cook page, with a way to push another page over it as the route does. */
function FrontAndBack() {
  const [inFront, setInFront] = useState(true);
  return (
    <>
      <Pressable testID="push-another-page" onPress={() => setInFront(false)} />
      <CookScreen cookId="cook-open" onBack={() => {}} onReview={() => {}} inFront={inFront} />
    </>
  );
}

function holding(): boolean {
  // Held when the last call was an activate.
  const lastOn = activate.mock.invocationCallOrder.at(-1) ?? 0;
  const lastOff = deactivate.mock.invocationCallOrder.at(-1) ?? 0;
  return lastOn > lastOff;
}

describe('an open cook in front', () => {
  it('keeps the screen on, by default, under the app’s own tag', async () => {
    await harness.render(<CookScreen cookId="cook-open" onBack={() => {}} onReview={() => {}} />);
    const toggle = await screen.findByTestId('screen-awake-toggle');

    expect(activate).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
    expect(holding()).toBe(true);
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText(SCREEN_STAYS_ON)).toBeOnTheScreen();
  });

  it('lets go when the toggle is turned to "Screen can sleep", and takes hold again when turned back', async () => {
    await harness.render(<CookScreen cookId="cook-open" onBack={() => {}} onReview={() => {}} />);
    await fireEvent.press(await screen.findByTestId('screen-awake-toggle'));

    expect(holding()).toBe(false);
    expect(screen.getByText(SCREEN_CAN_SLEEP)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('screen-awake-toggle'));
    expect(holding()).toBe(true);
  });

  it('lets go the moment the page is no longer in front', async () => {
    await harness.render(<FrontAndBack />);
    await screen.findByTestId('screen-awake-toggle');
    expect(holding()).toBe(true);

    await fireEvent.press(screen.getByTestId('push-another-page'));
    expect(holding()).toBe(false);
  });

  it('lets go when the app goes to the background or the phone locks, and takes hold on return', async () => {
    await harness.render(<CookScreen cookId="cook-open" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('screen-awake-toggle');
    expect(holding()).toBe(true);

    await act(async () => appStateListener?.('background'));
    expect(holding()).toBe(false);

    await act(async () => appStateListener?.('active'));
    expect(holding()).toBe(true);
  });

  it('lets go when the page is closed', async () => {
    await harness.render(<CookScreen cookId="cook-open" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('screen-awake-toggle');
    await cleanup();
    expect(holding()).toBe(false);
  });
});

describe('everywhere else', () => {
  it('never asks on a reviewed cook, which has no toggle', async () => {
    await harness.render(<CookScreen cookId="cook-done" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('cook-detail-screen');
    expect(screen.queryByTestId('screen-awake-toggle')).toBeNull();
    expect(activate).not.toHaveBeenCalled();
  });

  it('never asks on Home or History', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('home-screen');
    await cleanup();
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    await screen.findByTestId('home-screen');
    expect(activate).not.toHaveBeenCalled();
  });
});
