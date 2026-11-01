/**
 * Light and dark follow the phone, live (0.4.0).
 *
 * The phone's setting is stood in for by a small store behind
 * `useColorScheme`, so a test can switch it while a screen is showing, as the
 * phone does.
 */
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';

import { AppText } from '../src/components/AppText';
import { Card } from '../src/components/Card';
import { ThemeOverride, useThemeName } from '../src/theme/theme';
import { palettes } from '../src/theme/tokens';

const mockPhone: { scheme: 'light' | 'dark' | null; listeners: Set<() => void> } = {
  scheme: 'light',
  listeners: new Set(),
};

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  function useColorScheme() {
    return useSyncExternalStore(
      (listener: () => void) => {
        mockPhone.listeners.add(listener);
        return () => mockPhone.listeners.delete(listener);
      },
      () => mockPhone.scheme,
    );
  }
  return { __esModule: true, default: useColorScheme };
});

async function phoneGoes(scheme: 'light' | 'dark' | null) {
  await act(async () => {
    mockPhone.scheme = scheme;
    mockPhone.listeners.forEach((listener) => listener());
  });
}

function Probe() {
  return (
    <Card testID="card">
      <AppText testID="words">{useThemeName()}</AppText>
    </Card>
  );
}

const flat = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

const ROOT = join(__dirname, '..');

afterEach(async () => {
  await cleanup();
  mockPhone.scheme = 'light';
});

describe('the theme', () => {
  it('is light when the phone is light', async () => {
    await render(<Probe />);
    expect(screen.getByTestId('words')).toHaveTextContent('light');
    expect(flat('card').backgroundColor).toBe(palettes.light.surface);
    expect(flat('words').color).toBe(palettes.light.ink);
  });

  it('is dark when the phone is dark', async () => {
    mockPhone.scheme = 'dark';
    await render(<Probe />);
    expect(flat('card').backgroundColor).toBe(palettes.dark.surface);
    expect(flat('words').color).toBe(palettes.dark.ink);
  });

  it('changes live when the phone switches, and back', async () => {
    await render(<Probe />);
    await phoneGoes('dark');
    expect(screen.getByTestId('words')).toHaveTextContent('dark');
    expect(flat('card').backgroundColor).toBe(palettes.dark.surface);
    await phoneGoes('light');
    expect(flat('card').backgroundColor).toBe(palettes.light.surface);
  });

  it('is light when the phone says nothing', async () => {
    mockPhone.scheme = null;
    await render(<Probe />);
    expect(screen.getByTestId('words')).toHaveTextContent('light');
  });

  it('has a light card shadow and none in dark, where the line edges it', async () => {
    await render(<Probe />);
    expect(flat('card').boxShadow).toBeTruthy();
    await phoneGoes('dark');
    expect(flat('card').boxShadow).toBeUndefined();
    expect(flat('card').borderColor).toBe(palettes.dark.line);
  });

  it('can be pinned for a subtree, which only the tests do', async () => {
    await render(
      <ThemeOverride scheme="dark">
        <Probe />
      </ThemeOverride>,
    );
    expect(screen.getByTestId('words')).toHaveTextContent('dark');
  });
});

describe('the app around it', () => {
  it('asks Android to follow the phone', () => {
    const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
    expect(config).toMatch(/userInterfaceStyle: 'automatic'/);
    expect(config).toMatch(/'expo-system-ui'/);
  });

  it('turns the status and navigation bars with the theme', () => {
    const layout = readFileSync(join(ROOT, 'app', '_layout.tsx'), 'utf8');
    expect(layout).toMatch(/useTheme\(\)/);
    expect(layout).toMatch(/<StatusBar style=\{bars\} \/>/);
    expect(layout).toMatch(/<NavigationBar style=\{name === 'dark' \? 'dark' : 'light'\} \/>/);
  });

  it('never takes the wallpaper colours: no platform or dynamic colour anywhere', () => {
    const walk = (folder: string): string[] =>
      readdirSync(folder).flatMap((name) => {
        const path = join(folder, name);
        return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/PlatformColor|DynamicColorIOS|dynamicColor/);
    }
  });
});
