/**
 * Plus Jakarta Sans (0.3.0): bundled, never fetched; a plain screen until it
 * loads; the system font if it fails; a family per weight; font scaling kept.
 */
import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet, Text } from 'react-native';

import { AppText } from '../src/components/AppText';
import { FontGate } from '../src/state/FontGate';
import { FONT_FILES, FontsReadyContext, bundledWeight, fontStyleFor } from '../src/theme/fonts';

const mockFonts: { result: [boolean, Error | null]; asked: unknown[] } = {
  result: [false, null],
  asked: [],
};

jest.mock('expo-font', () => ({
  useFonts: (map: unknown) => {
    mockFonts.asked.push(map);
    return mockFonts.result;
  },
}));

const ROOT = path.join(__dirname, '..');

function styleOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style);
}

describe('the typeface', () => {
  beforeEach(() => {
    mockFonts.asked = [];
  });

  it('bundles exactly the five weights, as files in the package', () => {
    expect(Object.keys(FONT_FILES)).toEqual([
      'PlusJakartaSans_400Regular',
      'PlusJakartaSans_500Medium',
      'PlusJakartaSans_600SemiBold',
      'PlusJakartaSans_700Bold',
      'PlusJakartaSans_800ExtraBold',
    ]);
    const source = fs.readFileSync(path.join(ROOT, 'src', 'theme', 'fonts.ts'), 'utf8');
    expect(source).not.toMatch(/https?:\/\//);
    for (const weight of ['400Regular', '500Medium', '600SemiBold', '700Bold', '800ExtraBold']) {
      expect(
        fs.existsSync(
          path.join(ROOT, 'node_modules', '@expo-google-fonts', 'plus-jakarta-sans', weight, `PlusJakartaSans_${weight}.ttf`),
        ),
      ).toBe(true);
    }
  });

  it('shows a plain screen until the fonts have loaded', async () => {
    mockFonts.result = [false, null];
    await render(
      <FontGate>
        <Text testID="inside">Cooking Lab</Text>
      </FontGate>,
    );
    expect(screen.getByTestId('fonts-loading')).toBeTruthy();
    expect(screen.queryByTestId('inside')).toBeNull();
    expect(mockFonts.asked[0]).toBe(FONT_FILES);
  });

  it('draws text in Plus Jakarta Sans once loaded, a family per weight', async () => {
    mockFonts.result = [true, null];
    await render(
      <FontGate>
        <AppText testID="body">Body</AppText>
        <AppText testID="title" variant="screenTitle">
          Title
        </AppText>
        <AppText testID="display" variant="display">
          Display
        </AppText>
      </FontGate>,
    );
    expect(styleOf('body')).toMatchObject({ fontFamily: 'PlusJakartaSans_400Regular', fontWeight: 'normal' });
    expect(styleOf('title')).toMatchObject({ fontFamily: 'PlusJakartaSans_700Bold' });
    expect(styleOf('display')).toMatchObject({ fontFamily: 'PlusJakartaSans_800ExtraBold' });
  });

  it('goes on in the system font if the fonts fail to load', async () => {
    mockFonts.result = [false, new Error('no font')];
    await render(
      <FontGate>
        <AppText testID="body" variant="bodyStrong">
          Body
        </AppText>
      </FontGate>,
    );
    const style = styleOf('body');
    expect(style.fontFamily).toBeUndefined();
    expect(style.fontWeight).toBe('600');
  });

  it('keeps Android font scaling', async () => {
    await render(
      <FontsReadyContext.Provider value>
        <AppText testID="body">Body</AppText>
      </FontsReadyContext.Provider>,
    );
    expect(screen.getByTestId('body').props.allowFontScaling).not.toBe(false);
    expect(styleOf('body').height).toBeUndefined();
  });

  it('maps every weight to the nearest bundled one', () => {
    expect(bundledWeight(undefined)).toBe(400);
    expect(bundledWeight('normal')).toBe(400);
    expect(bundledWeight('300')).toBe(400);
    expect(bundledWeight('500')).toBe(500);
    expect(bundledWeight('600')).toBe(600);
    expect(bundledWeight('bold')).toBe(700);
    expect(bundledWeight(900)).toBe(800);
    expect(fontStyleFor('700')).toEqual({ fontFamily: 'PlusJakartaSans_700Bold', fontWeight: 'normal' });
  });

  it('notes the OFL licence', () => {
    for (const file of ['README.md', path.join('build-control', 'dependency-triage.md')]) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(text).toContain('Plus Jakarta Sans');
      expect(text).toContain('SIL Open Font License');
    }
  });
});
