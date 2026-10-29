/**
 * Every control pinned to the bottom of a screen sits above the system
 * navigation area (fix round 0.2.1, F5).
 *
 * On a Samsung with three-button navigation the photo viewer's *Remove photo*
 * and *Close*, and the remove confirm, sat partly under the navigation bar:
 * the viewer is a modal and took no inset at all. These tests render every
 * bottom-pinned control with a non-zero bottom inset — three-button and gesture
 * navigation, on a narrow cover-sized display and a wide inner-sized one — and
 * check the spacing that keeps it clear.
 */

import { cleanup, render, screen, userEvent, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BAR_BOTTOM_PADDING, PhotoViewer } from '../src/screens/cook/PhotoViewer';
import { CookScreen } from '../src/screens/CookScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

type Case = {
  readonly name: string;
  readonly metrics: {
    frame: { x: number; y: number; width: number; height: number };
    insets: { top: number; left: number; right: number; bottom: number };
  };
};

/** Typical figures, in dp. Nothing here describes a particular device. */
const CASES: readonly Case[] = [
  {
    name: 'three-button navigation, narrow display',
    metrics: {
      frame: { x: 0, y: 0, width: 360, height: 800 },
      insets: { top: 24, left: 0, right: 0, bottom: 48 },
    },
  },
  {
    name: 'gesture navigation, narrow display',
    metrics: {
      frame: { x: 0, y: 0, width: 360, height: 800 },
      insets: { top: 24, left: 0, right: 0, bottom: 20 },
    },
  },
  {
    name: 'three-button navigation, wide display',
    metrics: {
      frame: { x: 0, y: 0, width: 880, height: 960 },
      insets: { top: 28, left: 0, right: 0, bottom: 48 },
    },
  },
  {
    name: 'gesture navigation, wide display',
    metrics: {
      frame: { x: 0, y: 0, width: 880, height: 960 },
      insets: { top: 28, left: 0, right: 0, bottom: 16 },
    },
  },
];

function flat(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as StyleProp<ViewStyle>) as Record<string, unknown>) ?? {};
}

function withInsets(metrics: Case['metrics'], element: ReactElement): ReactElement {
  return <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>;
}

describe.each(CASES)('the photo viewer, $name', ({ metrics }) => {
  const photo = { eventId: 'event-1', uri: 'file:///private/photo.jpg', ts: '2026-10-15T08:30:00.000Z' };

  afterEach(async () => {
    await cleanup();
  });

  async function openViewer(canRemove = true): Promise<void> {
    await render(
      withInsets(
        metrics,
        <PhotoViewer photo={photo} onClose={jest.fn()} onRemove={jest.fn(async () => null)} canRemove={canRemove} />,
      ),
    );
  }

  it('is drawn edge to edge, so the insets are what keep it clear', async () => {
    await openViewer();
    const modal = screen.getByTestId('photo-viewer');
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
    expect(flat(screen.getByTestId('photo-viewer-screen').props.style).paddingTop).toBe(
      metrics.insets.top,
    );
  });

  it('keeps Remove photo and Close above the navigation area', async () => {
    await openViewer();
    const bar = screen.getByTestId('photo-viewer-bar');
    expect(flat(bar.props.style).paddingBottom).toBe(BAR_BOTTOM_PADDING + metrics.insets.bottom);
    expect(within(bar).getByTestId('photo-remove')).toBeOnTheScreen();
    expect(within(bar).getByTestId('photo-close')).toBeOnTheScreen();
  });

  it('keeps the remove confirm above the navigation area', async () => {
    await openViewer();
    await user.press(screen.getByTestId('photo-remove'));

    const bar = screen.getByTestId('photo-viewer-bar');
    expect(within(bar).getByTestId('photo-remove-confirm')).toBeOnTheScreen();
    expect(within(bar).getByTestId('photo-remove-confirm-button')).toBeOnTheScreen();
    expect(flat(bar.props.style).paddingBottom).toBe(BAR_BOTTOM_PADDING + metrics.insets.bottom);
  });

  it('keeps Close clear on a reviewed cook, where there is no Remove', async () => {
    await openViewer(false);
    const bar = screen.getByTestId('photo-viewer-bar');
    expect(within(bar).queryByTestId('photo-remove')).toBeNull();
    expect(within(bar).getByTestId('photo-close')).toBeOnTheScreen();
    expect(flat(bar.props.style).paddingBottom).toBe(BAR_BOTTOM_PADDING + metrics.insets.bottom);
  });
});

describe.each(CASES)('pinned screen footers, $name', ({ metrics }) => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    harness = await openScreenHarness('bottom-insets.db');
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-1', startedAt: now() }, 'user', now());
  });

  afterEach(async () => {
    await harness.close();
  });

  /** The footer sits in the body, whose bottom padding is the inset. */
  function expectFooterClear(controlTestId: string): void {
    const body = screen.getByTestId('screen-body');
    expect(flat(body.props.style).paddingBottom).toBe(metrics.insets.bottom);

    const footer = screen.getByTestId('screen-footer');
    expect(within(footer).getByTestId(controlTestId)).toBeOnTheScreen();

    // The scrolling area ends where the footer begins: the footer is its
    // sibling, after it, and never inside it.
    const scroll = screen.getByTestId('screen-scroll');
    expect(within(scroll).queryByTestId('screen-footer')).toBeNull();
    expect(within(scroll).queryByTestId(controlTestId)).toBeNull();
    expect(within(body).getByTestId('screen-scroll')).toBe(scroll);
    expect(within(body).getByTestId('screen-footer')).toBe(footer);
  }

  it('keeps Review’s Finish review bar above the navigation area, with nothing under it', async () => {
    await harness.render(
      withInsets(
        metrics,
        <ReviewScreen cookId="cook-1" onBack={jest.fn()} onFinished={jest.fn()} />,
      ),
    );
    await screen.findByTestId('review-screen');

    expectFooterClear('finish-review');
    // Everything Review shows is in the scrolling area, above the bar.
    const scroll = screen.getByTestId('screen-scroll');
    expect(within(scroll).getByTestId('review-screen')).toBeOnTheScreen();
    expect(within(scroll).getByTestId('tag-editor')).toBeOnTheScreen();
    expect(within(scroll).getByTestId('ai-unavailable')).toBeOnTheScreen();
  });

  it('keeps the cook composer above the navigation area', async () => {
    await harness.render(
      withInsets(metrics, <CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />),
    );
    await screen.findByTestId('cook-screen');

    expectFooterClear('composer');
  });
});
