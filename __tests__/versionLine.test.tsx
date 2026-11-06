/**
 * The version line at the foot of Home's ⋯ menu (0.4.0): the version and
 * commit the build carries, and the window's size in dp, rounded, changing
 * when the phone folds, unfolds or turns; and (0.5.0) the text size, Android's
 * font scale to two places.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import { getBuildStamp, versionLine } from '../src/config/appIdentity';
import { HomeScreen } from '../src/screens/HomeScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

const COVER: Figures = { width: 369.14, height: 905.3, scale: 2.625, fontScale: 1 };
const INNER: Figures = { width: 707.4, height: 823.6, scale: 2.625, fontScale: 1 };
const INNER_TURNED: Figures = { width: 823.6, height: 707.4, scale: 2.625, fontScale: 1 };

const mockWindow: { figures: Figures; listeners: Set<() => void> } = {
  figures: COVER,
  listeners: new Set(),
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  function useWindowDimensions() {
    return useSyncExternalStore(
      (listener: () => void) => {
        mockWindow.listeners.add(listener);
        return () => mockWindow.listeners.delete(listener);
      },
      () => mockWindow.figures,
    );
  }
  return { __esModule: true, default: useWindowDimensions };
});

const mockConstants: { expoConfig: Record<string, unknown> | null } = {
  expoConfig: { version: '0.4.0', extra: { appVariant: 'production', buildCommit: 'abc1234' } },
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConstants.expoConfig;
    },
  },
}));

async function windowBecomes(figures: Figures): Promise<void> {
  await act(async () => {
    mockWindow.figures = figures;
    for (const listener of mockWindow.listeners) {
      listener();
    }
  });
}

let harness: ScreenHarness;

beforeEach(async () => {
  mockWindow.figures = COVER;
  harness = await openScreenHarness('version-line.db');
});

afterEach(async () => {
  await harness.close();
});

describe('the version line', () => {
  it('reads "<version> (<commit>) · <width> × <height> · text <scale>", rounded, the scale to two places', () => {
    expect(versionLine({ version: '0.5.0', commit: 'abc1234' }, 752.3, 835.4, 1.15)).toBe(
      '0.5.0 (abc1234) · 752 × 835 · text 1.15',
    );
    expect(versionLine({ version: '0.4.0', commit: 'abc1234' }, 369.14, 905.6, 1)).toBe(
      '0.4.0 (abc1234) · 369 × 906 · text 1.00',
    );
    expect(versionLine({ version: '0.4.0', commit: 'abc1234' }, 369, 905, 1.3)).toBe('0.4.0 (abc1234) · 369 × 905 · text 1.30');
    // With the app's middle dots and times sign.
    expect(versionLine({ version: '0.4.0', commit: 'abc1234' }, 369, 905, 1)).toMatch(/^\S+ \(\w+\) · \d+ × \d+ · text \d\.\d\d$/);
  });

  it('takes the version and commit the build carries, and never guesses', () => {
    expect(getBuildStamp()).toEqual({ version: '0.4.0', commit: 'abc1234' });
    mockConstants.expoConfig = { extra: {} };
    expect(getBuildStamp()).toEqual({ version: 'unknown', commit: 'unknown' });
    mockConstants.expoConfig = { version: '0.4.0', extra: { appVariant: 'production', buildCommit: 'abc1234' } };
  });

  it('is carried from the same commit app.config.ts stamps into the APK', () => {
    const config = readFileSync(join(__dirname, '..', 'app.config.ts'), 'utf8');
    expect(config).toMatch(/const commit = buildCommit\(\);/);
    expect(config).toMatch(/\['\.\/plugins\/withBuildCommit', \{ commit \}\]/);
    expect(config).toMatch(/buildCommit: commit,/);
  });

  it('ends the ⋯ menu, in the secondary style, and follows the window', async () => {
    await harness.render(<HomeScreen onOpenCook={jest.fn()} onHousehold={jest.fn()} />);
    await fireEvent.press(await screen.findByTestId('home-more'));
    expect(screen.getByTestId('home-version')).toHaveTextContent('0.4.0 (abc1234) · 369 × 905 · text 1.00');

    await windowBecomes(INNER);
    expect(screen.getByTestId('home-version')).toHaveTextContent('0.4.0 (abc1234) · 707 × 824 · text 1.00');
    await windowBecomes(INNER_TURNED);
    expect(screen.getByTestId('home-version')).toHaveTextContent('0.4.0 (abc1234) · 824 × 707 · text 1.00');
    // A live text-size change shows in the line (0.5.0).
    await windowBecomes({ ...COVER, fontScale: 1.15 });
    expect(screen.getByTestId('home-version')).toHaveTextContent('0.4.0 (abc1234) · 369 × 905 · text 1.15');
  });
});
