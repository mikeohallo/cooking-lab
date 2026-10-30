/**
 * The cook screen scrolls, and the composer can always be reached (0.2.2).
 *
 * On the Fold's main display a pasted recipe of about thirty lines grew the
 * note box until the whole composer — the photo button, the note box, Oven °C,
 * Internal °C, Send and *Somewhere else?* — sat below the bottom of the screen,
 * and neither the page nor the box would scroll.
 *
 * Layout cannot be measured under Jest, so these tests pin the three things
 * that make it impossible again, in every combination the brief named — a
 * 40-line paste, at 320 dp and at the inner display's width, with the keyboard
 * open and closed, and at the largest font scale:
 *
 *   * the timeline is in the screen's scrolling area and the composer is not;
 *   * the note box is capped at five lines at the current font scale and
 *     scrolls inside itself;
 *   * the footer is capped at a share of the space above the keyboard and
 *     scrolls inside itself, and every composer control is inside that scroll.
 */

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native';
import { DeviceEventEmitter, Platform, StyleSheet } from 'react-native';

import {
  FOOTER_MIN_HEIGHT,
  NOTE_MAX_LINES,
  footerMaxHeight,
  maxTextBoxHeight,
} from '../src/layout/footerLimit';
import { bottomClearance } from '../src/layout/useKeyboardClearance';
import { CookScreen } from '../src/screens/CookScreen';
import { space, type as typeScale } from '../src/theme/tokens';
import { openScreenHarness, TEST_SAFE_AREA, type ScreenHarness } from './support/screens';

type WindowFigures = { width: number; height: number; scale: number; fontScale: number };

let mockWindowFigures: WindowFigures = { width: 360, height: 800, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowFigures,
}));

const FORTY_LINES = Array.from(
  { length: 40 },
  (_, index) => `${index + 1}. Step ${index + 1} of the recipe, pasted in whole.`,
).join('\n');

/** Every control the composer offers in its ordinary state. */
const COMPOSER_CONTROLS = [
  'add-photo',
  'note-input',
  'oven-reading-toggle',
  'internal-reading-toggle',
  'note-send',
  'temperature-elsewhere',
] as const;

function flat(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) as Record<string, unknown>) ?? {};
}

describe('footerMaxHeight', () => {
  it('leaves the timeline at least two fifths of the space above the navigation bar', () => {
    expect(footerMaxHeight(800, 24, 48)).toBe(Math.floor((800 - 24 - 48) * 0.6));
  });

  it('shrinks when the keyboard opens, and never below two touch targets', () => {
    const open = footerMaxHeight(800, 24, bottomClearance('android', 48, 300));
    expect(open).toBe(Math.floor((800 - 24 - 348) * 0.6));
    expect(footerMaxHeight(300, 24, 348)).toBe(FOOTER_MIN_HEIGHT);
  });

  it('ignores nonsense figures rather than collapsing the footer', () => {
    expect(footerMaxHeight(Number.NaN, 24, 48)).toBe(FOOTER_MIN_HEIGHT);
    expect(footerMaxHeight(800, Number.NaN, -1)).toBe(480);
  });
});

describe('maxTextBoxHeight', () => {
  it('is five lines at the current font scale, plus the box padding and border', () => {
    expect(maxTextBoxHeight(23, 5, 1, 12)).toBe(23 * 5 + 24 + 2);
    expect(maxTextBoxHeight(23, 5, 2, 12)).toBe(23 * 2 * 5 + 24 + 2);
  });
});

type Case = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fontScale: number;
  readonly keyboard: number;
};

/**
 * Typical figures in dp. 320 dp is the narrowest width the app supports; 880 dp
 * stands for the inner display. 2.0 is the largest font scale Android offers.
 */
const CASES: readonly Case[] = [
  { name: '320 dp, keyboard closed', width: 320, height: 760, fontScale: 1, keyboard: 0 },
  { name: '320 dp, keyboard open', width: 320, height: 760, fontScale: 1, keyboard: 300 },
  { name: '320 dp, largest font, keyboard closed', width: 320, height: 760, fontScale: 2, keyboard: 0 },
  { name: '320 dp, largest font, keyboard open', width: 320, height: 760, fontScale: 2, keyboard: 300 },
  { name: 'inner display, keyboard closed', width: 880, height: 960, fontScale: 1, keyboard: 0 },
  { name: 'inner display, keyboard open', width: 880, height: 960, fontScale: 1, keyboard: 340 },
  { name: 'inner display, largest font, keyboard open', width: 880, height: 960, fontScale: 2, keyboard: 340 },
];

describe.each(CASES)('an open cook with a 40-line paste, $name', (testCase) => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockWindowFigures = {
      width: testCase.width,
      height: testCase.height,
      scale: 3,
      fontScale: testCase.fontScale,
    };
    harness = await openScreenHarness();
    await harness.db.data.capture.startCook(
      { id: 'cook-01', startedAt: harness.storage.now() },
      'user',
      harness.storage.now(),
    );
    await harness.render(<CookScreen cookId="cook-01" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('composer');

    await fireEvent.changeText(screen.getByTestId('note-input'), FORTY_LINES);
    if (testCase.keyboard > 0) {
      await act(async () => {
        DeviceEventEmitter.emit('keyboardDidShow', {
          endCoordinates: {
            height: testCase.keyboard,
            screenX: 0,
            screenY: testCase.height - testCase.keyboard,
            width: testCase.width,
          },
        });
      });
    }
  });

  afterEach(async () => {
    await cleanup();
    await harness.close();
    jest.restoreAllMocks();
  });

  it('keeps the whole paste in the box, which stops at five lines and scrolls inside itself', () => {
    const input = screen.getByTestId('note-input');
    expect(input.props.value).toBe(FORTY_LINES);
    expect(input.props.scrollEnabled).toBe(true);
    const lineHeight = typeScale.body.lineHeight ?? 23;
    expect(flat(input.props.style).maxHeight).toBe(
      maxTextBoxHeight(lineHeight, NOTE_MAX_LINES, testCase.fontScale, space.sm),
    );
  });

  it('caps the composer at a share of the space above the keyboard', () => {
    const clearance = bottomClearance('android', TEST_SAFE_AREA.insets.bottom, testCase.keyboard);
    const footer = screen.getByTestId('screen-footer');
    expect(flat(footer.props.style).maxHeight).toBe(
      footerMaxHeight(testCase.height, TEST_SAFE_AREA.insets.top, clearance),
    );
  });

  it('puts every composer control inside the footer’s own scroll, and none in the timeline', () => {
    const footerScroll = screen.getByTestId('screen-footer-scroll');
    const timelineScroll = screen.getByTestId('screen-scroll');
    for (const control of COMPOSER_CONTROLS) {
      expect(within(footerScroll).getByTestId(control)).toBeOnTheScreen();
      expect(within(timelineScroll).queryByTestId(control)).toBeNull();
    }
    expect(within(timelineScroll).getByTestId('timeline')).toBeOnTheScreen();
  });

  it('can still send the pasted note, exactly as typed', async () => {
    await fireEvent.press(screen.getByTestId('note-send'));
    await screen.findByText(FORTY_LINES);
    const events = await harness.db.data.cookEvents.listForCook({ cookId: 'cook-01' });
    expect(events.map((event) => event.body)).toEqual([FORTY_LINES]);
  });
});
