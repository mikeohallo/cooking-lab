/**
 * Your place, kept through a live font-size or display-size change (0.4.1).
 *
 * Android recreates the activity when the font size or display size changes
 * with the app open. React Native takes every screen down and draws the app
 * again from its first route, in the same JavaScript (the React host lives in
 * the application, not the activity). Here that is the real route tree,
 * mounted by the real router, unmounted and mounted again: a simulated
 * activity recreation. The app must come back to the same screen and cook,
 * the same scroll position, and every half-typed word: a note, a title, a
 * rating line, Next time and Your notes.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import path from 'node:path';

import { PLACE_HOLD_MS, resetKeptPlaceForTests } from '../src/layout/KeptPlace';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { StorageStartupResult } from '../src/data/runtime';
import { openTestDatabase, type TestDatabase } from './support/database';

const mockDb: { current: TestDatabase | null } = { current: null };

jest.mock('../src/data/startup', () => ({
  initialiseStorage: (): Promise<StorageStartupResult> =>
    Promise.resolve({
      ok: true,
      storage: {
        data: mockDb.current!.data,
        photos: {} as never,
        photoWorkflow: {} as never,
        deletions: {} as never,
        noteDeletions: {} as never,
        assistant: jest.requireActual('../src/data/ai/unavailable').createUnavailableAiService(),
        exporter: {} as never,
        schemaVersion: jest.requireActual('../src/data/schema/migrations').LATEST_SCHEMA_VERSION,
        freshInstall: false,
        close: async () => undefined,
      },
    }),
  describeStartup: () => 'test',
}));

jest.mock('../src/data/native/expoCrypto', () => {
  let next = 0;
  return {
    newDeviceId: () => {
      next += 1;
      return `place-${next}`;
    },
  };
});

const APP_DIR = path.join(__dirname, '..', 'app');
const AT = '2026-11-03T08:30:00.000Z';
const COOK = 'place-cook';

/** The clock the held place is judged by, moved on by the tests. */
let now = Date.parse(AT);

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('keep-place.db');
  mockDb.current = db;
  now = Date.parse(AT);
  resetKeptPlaceForTests(() => now);
  expect(LATEST_SCHEMA_VERSION).toBeGreaterThan(0);
  await db.data.capture.startCook({ id: COOK, startedAt: AT }, 'user', AT);
});

afterEach(async () => {
  await db.close();
});

/** Android recreating the activity: every screen taken down, the app drawn again from its first route. */
async function recreate(after = 200): Promise<void> {
  await screen.unmount();
  now += after;
  await renderRouter(APP_DIR, { initialUrl: '/' });
}

async function scroll(testID: string, y: number) {
  await fireEvent.scroll(screen.getByTestId(testID), {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 369, height: 4000 },
      layoutMeasurement: { width: 369, height: 800 },
    },
  });
}

describe('a simulated activity recreation', () => {
  it('comes back to the same cook, its scroll position, the half-typed note and title', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    await screen.findByTestId('cook-screen', {}, { timeout: 4000 });

    await fireEvent.changeText(screen.getByTestId('note-input'), 'Grated both apples, and');
    await fireEvent.press(screen.getByTestId('cook-title'));
    await fireEvent.changeText(await screen.findByTestId('cook-title-input'), 'Apple cake, half named');
    await scroll('screen-scroll', 240);

    await recreate();

    expect(await screen.findByTestId('cook-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('Grated both apples, and');
    expect(screen.getByTestId('cook-title-input')).toHaveDisplayValue('Apple cake, half named');
    expect(screen.getByTestId('screen-scroll').props.contentOffset).toEqual({ x: 0, y: 240 });
  });

  it('comes back to the review with Your notes, Next time and a rating line half typed', async () => {
    await db.data.householdWorkflow.add('You', { id: 'member-you' }, AT);
    await renderRouter(APP_DIR, { initialUrl: `/cook/${COOK}/review` });
    await screen.findByTestId('review-screen', {}, { timeout: 4000 });

    await fireEvent.changeText(screen.getByTestId('verdict-input'), 'Better than last time');
    await fireEvent.changeText(screen.getByTestId('takeaway-input'), 'Less sugar');
    await fireEvent.press(await screen.findByTestId('who-ate-it-member-member-you-add-line'));
    await fireEvent.changeText(await screen.findByTestId('who-ate-it-member-member-you-line-input'), 'Wants it warm');
    await scroll('screen-scroll', 120);

    await recreate();

    expect(await screen.findByTestId('review-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.getByTestId('verdict-input')).toHaveDisplayValue('Better than last time');
    expect(screen.getByTestId('takeaway-input')).toHaveDisplayValue('Less sugar');
    expect(screen.getByTestId('who-ate-it-member-member-you-line-input')).toHaveDisplayValue('Wants it warm');
    expect(screen.getByTestId('screen-scroll').props.contentOffset).toEqual({ x: 0, y: 120 });
  });

  it('keeps the cook’s timers, New timer open with its typed name, and every scroll view’s place (0.5.0)', async () => {
    // A timer started before the change: it lives in the notebook, so it is simply there again.
    await db.data.timerWorkflow.start(COOK, 'Rest', 15 * 60_000, { id: 'timer-rest' }, 'user', AT);
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    await screen.findByTestId('cook-screen', {}, { timeout: 4000 });
    expect(await screen.findByTestId('timer-timer-rest')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('timer-toggle'));
    await fireEvent.changeText(await screen.findByTestId('timer-name-input'), 'Gra');
    await scroll('timer-sheet-scroll', 90);
    await scroll('screen-footer-scroll', 30);
    await scroll('screen-scroll', 150);

    await recreate();

    expect(await screen.findByTestId('cook-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(await screen.findByTestId('timer-timer-rest')).toBeOnTheScreen();
    expect(await screen.findByTestId('timer-name-input')).toHaveDisplayValue('Gra');
    expect(screen.getByTestId('timer-sheet-scroll').props.contentOffset).toEqual({ x: 0, y: 90 });
    expect(screen.getByTestId('screen-footer-scroll').props.contentOffset).toEqual({ x: 0, y: 30 });
    expect(screen.getByTestId('screen-scroll').props.contentOffset).toEqual({ x: 0, y: 150 });
  });

  it('keeps Home’s scroll position', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await screen.findByTestId('home-screen', {}, { timeout: 4000 });
    await scroll('screen-scroll', 64);

    await recreate();

    expect(await screen.findByTestId('home-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.getByTestId('screen-scroll').props.contentOffset).toEqual({ x: 0, y: 64 });
  });

  it('goes back from the cook it came back to, to Home', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    await screen.findByTestId('cook-screen', {}, { timeout: 4000 });

    await recreate();
    await screen.findByTestId('cook-screen', {}, { timeout: 4000 });

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByTestId('cook-screen')).toBeNull(), { timeout: 4000 });
    expect(screen.getByTestId('home-screen')).toBeOnTheScreen();
  });

  it('starts from Home as usual when the app is opened again later', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    await screen.findByTestId('cook-screen', {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByTestId('note-input'), 'Grated both apples, and');

    await recreate(PLACE_HOLD_MS + 1);

    expect(await screen.findByTestId('home-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.queryByTestId('cook-screen')).toBeNull();
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    expect(await screen.findByTestId('note-input', {}, { timeout: 4000 })).toHaveDisplayValue('');
  });

  it('lets a cook’s half-typed note go when the cook is left in the usual way', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    await screen.findByTestId('cook-screen', {}, { timeout: 4000 });
    await fireEvent.changeText(screen.getByTestId('note-input'), 'Grated both apples, and');

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByTestId('cook-screen')).toBeNull(), { timeout: 4000 });
    await fireEvent.press(await screen.findByTestId(`cook-card-${COOK}`, {}, { timeout: 4000 }));
    expect(await screen.findByTestId('note-input', {}, { timeout: 4000 })).toHaveDisplayValue('');
  });
});
