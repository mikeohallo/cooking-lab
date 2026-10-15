/**
 * The composer stays above the keyboard.
 *
 * On the Fold the keyboard slid over the composer and Send could not be
 * reached (`build-control/slices/reports/2026-10-16-loop-walkthrough.md`).
 * These tests pin the arithmetic against React Native's Android keyboard
 * figure, which excludes the navigation bar, and drive a real keyboard event
 * through the screen container.
 */
import { act, render, screen } from '@testing-library/react-native';
import { DeviceEventEmitter, Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenContainer } from '../src/components/ScreenContainer';
import { bottomClearance } from '../src/layout/useKeyboardClearance';

describe('bottomClearance', () => {
  it('is the navigation-bar inset while the keyboard is closed', () => {
    expect(bottomClearance('android', 48, 0)).toBe(48);
    expect(bottomClearance('ios', 34, 0)).toBe(34);
  });

  it('adds the keyboard on Android, whose figure excludes the navigation bar', () => {
    expect(bottomClearance('android', 48, 300)).toBe(348);
  });

  it('takes the larger on iOS, whose figure already includes the home indicator', () => {
    expect(bottomClearance('ios', 34, 336)).toBe(336);
  });

  it('ignores nonsense heights rather than pushing the screen around', () => {
    expect(bottomClearance('android', 48, Number.NaN)).toBe(48);
    expect(bottomClearance('android', 48, -20)).toBe(48);
    expect(bottomClearance('android', Number.NaN, 0)).toBe(0);
  });
});

const METRICS = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 48 },
};

function bodyPadding(): number {
  const style = screen.getByTestId('screen-body').props.style as unknown;
  const flat = (Array.isArray(style) ? style : [style]).flat(Infinity) as { paddingBottom?: number }[];
  const padding = flat.reduce<number | undefined>(
    (found, entry) => (entry && typeof entry.paddingBottom === 'number' ? entry.paddingBottom : found),
    undefined,
  );
  return padding ?? 0;
}

describe('ScreenContainer with the keyboard', () => {
  // The app ships for Android only; the default test environment is iOS.
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lifts the footer above the keyboard and drops it back when the keyboard closes', async () => {
    expect(Platform.OS).toBe('android');
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScreenContainer footer={<Text>composer</Text>}>
          <Text>timeline</Text>
        </ScreenContainer>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('composer')).toBeOnTheScreen();
    expect(bodyPadding()).toBe(48);

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { height: 300, screenX: 0, screenY: 452, width: 360 },
      });
    });
    expect(bodyPadding()).toBe(348);

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', {
        endCoordinates: { height: 0, screenX: 0, screenY: 800, width: 360 },
      });
    });
    expect(bodyPadding()).toBe(48);
  });
});
