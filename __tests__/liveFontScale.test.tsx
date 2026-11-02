/**
 * A live font-scale or density change (0.4.0, part 6).
 *
 * The second test build showed labels cut off ("Breakfas", "Lunch/", "COOKING"
 * without "NOW") after the font size or display density was changed with the
 * app open, until a restart. The app keeps nothing worked out from either:
 *
 *   - no module reads the font scale or density once (`PixelRatio`,
 *     `Dimensions.get`); the font scale is read only through
 *     `useWindowDimensions`, on every render;
 *   - the styles `makeStyles` keeps are built from the theme alone, in dp,
 *     and Android scales the text in them itself;
 *   - the one size worked out from the font scale, a multiline box's tallest
 *     height, follows a live change.
 *
 * The cause is inside React Native (its text measurement cache does not know
 * the font scale); see `build-control/slices/RELEASE_0.4.0.md`, part 6.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { TextField } from '../src/components/TextField';
import { maxTextBoxHeight } from '../src/layout/footerLimit';
import { makeStyles, type Theme } from '../src/theme/theme';
import { space, type } from '../src/theme/tokens';

type Figures = { width: number; height: number; scale: number; fontScale: number };

/** The window, changeable mid-test the way Settings changes it. */
const mockWindow: { figures: Figures; listeners: Set<() => void> } = {
  figures: { width: 707, height: 823, scale: 2.625, fontScale: 1 },
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

async function become(change: Partial<Figures>): Promise<void> {
  await act(async () => {
    mockWindow.figures = { ...mockWindow.figures, ...change };
    for (const listener of mockWindow.listeners) {
      listener();
    }
  });
}

const ROOT = join(__dirname, '..');

function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      return filesUnder(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Drops comments, so prose about the font scale does not count. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = ['src', 'app'].flatMap((folder) => filesUnder(join(ROOT, folder)));

beforeEach(() => {
  mockWindow.figures = { width: 707, height: 823, scale: 2.625, fontScale: 1 };
});

describe('nothing keeps the font scale or density', () => {
  it('finds the files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never reads them once, outside a render', () => {
    const offenders = files.flatMap((file) =>
      code(readFileSync(file, 'utf8'))
        .split('\n')
        .filter((line) => /\bPixelRatio\b|\bDimensions\s*\.\s*(get|addEventListener)\b|getFontScale/.test(line))
        .map((line) => `${relative(ROOT, file)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('reads the font scale only from useWindowDimensions, or as a value passed in', () => {
    const readers = files.filter((file) => /\bfontScale\b/.test(code(readFileSync(file, 'utf8'))));
    expect(readers.length).toBeGreaterThan(0);
    for (const file of readers) {
      const source = code(readFileSync(file, 'utf8'));
      const fromHook = /const\s*\{[^}]*\bfontScale\b[^}]*\}\s*=\s*useWindowDimensions\(\)/.test(source);
      const asArgument = /\(\s*[^)]*\bfontScale:\s*number/.test(source);
      expect({ file: relative(ROOT, file), ok: fromHook || asArgument }).toEqual({ file: relative(ROOT, file), ok: true });
    }
  });

  it('builds kept styles from the theme alone', async () => {
    const seen: string[][] = [];
    const useStyles = makeStyles((theme: Theme) => {
      seen.push(Object.keys(theme).sort());
      return StyleSheet.create({ box: { padding: space.sm } });
    });
    function Probe() {
      const styles = useStyles();
      return <Text style={styles.box}>Test</Text>;
    }
    await render(<Probe />);
    expect(seen).toEqual([['colors', 'fades', 'name', 'shadows']]);
  });
});

describe('a size worked out from the font scale follows a live change', () => {
  it('re-derives a multiline box’s tallest height when the font scale changes, and back', async () => {
    await render(<TextField value="Test words" onChangeText={() => {}} multiline rows={2} maxRows={6} testID="box" />);
    const tallest = () => StyleSheet.flatten(screen.getByTestId('box').props.style).maxHeight as number;
    const at = (scale: number) => maxTextBoxHeight(type.body.lineHeight, 6, scale, space.sm);

    expect(tallest()).toBe(at(1));
    await become({ fontScale: 1.3 });
    expect(tallest()).toBe(at(1.3));
    expect(tallest()).toBeGreaterThan(at(1));
    await become({ fontScale: 1.15, scale: 2.34 });
    expect(tallest()).toBe(at(1.15));
    await become({ fontScale: 1 });
    expect(tallest()).toBe(at(1));
  });
});
