/**
 * The real route tree, mounted by the real router.
 *
 * `renderRouter` loads the actual files under `app/` — the root layout and
 * every route — so this is the test that catches a Home screen the router
 * cannot find, which no screen test can. The store is the Node SQLite harness,
 * handed to the root layout in place of the native startup.
 */
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import path from 'node:path';

import { NEW_COOK_TITLE } from '../src/content/product';
import { LATEST_SCHEMA_VERSION } from '../src/data/schema/migrations';
import type { StorageStartupResult } from '../src/data/runtime';
import { openTestDatabase, type TestDatabase } from './support/database';

const mockDb: {
  current: TestDatabase | null;
  /** When set, startup waits until the test resolves it, like a real device. */
  release: ((result: StorageStartupResult) => void) | null;
  hold: boolean;
} = { current: null, release: null, hold: false };

function mockReadyResult(): StorageStartupResult {
  return {
    ok: true,
    storage: {
      data: mockDb.current!.data,
      photos: {} as never,
      // Never reached: no route takes a photograph while it is only being
      // mounted, and nothing on screen asks for one until a button is pressed.
      photoWorkflow: {} as never,
      deletions: {} as never,
      assistant: jest.requireActual('../src/data/ai/unavailable').createUnavailableAiService(),
      exporter: {} as never,
      schemaVersion: LATEST_SCHEMA_VERSION,
      freshInstall: true,
      close: async () => undefined,
    },
  };
}

jest.mock('../src/data/startup', () => ({
  initialiseStorage: (): Promise<StorageStartupResult> =>
    mockDb.hold
      ? new Promise((resolve) => {
          mockDb.release = resolve;
        })
      : Promise.resolve(mockReadyResult()),
  describeStartup: () => 'test',
}));

jest.mock('../src/data/native/expoCrypto', () => {
  let next = 0;
  return {
    newDeviceId: () => {
      next += 1;
      return `route-${next}`;
    },
  };
});

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('routes.db');
  mockDb.current = db;
  mockDb.hold = false;
  mockDb.release = null;
});

afterEach(async () => {
  await db.close();
});

const APP_DIR = path.join(__dirname, '..', 'app');

describe('routes', () => {
  it('opens on Home, not an unmatched route', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });

    expect(await screen.findByTestId('home-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: NEW_COOK_TITLE })).toBeOnTheScreen();
    expect(screen.queryByText(/Unmatched Route/i)).toBeNull();
  });

  it('resolves the cook and review routes', async () => {
    const { data } = db;
    await data.capture.startCook(
      { id: 'route-cook', startedAt: '2026-10-15T08:30:00.000Z' },
      'user',
      '2026-10-15T08:30:00.000Z',
    );

    await renderRouter(APP_DIR, { initialUrl: '/cook/route-cook' });
    expect(await screen.findByTestId('cook-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
  });

  it('shows the history route', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/history' });
    await waitFor(() => expect(screen.getByTestId('history-screen')).toBeOnTheScreen(), {
      timeout: 4000,
    });
  });

  it('shows the starting state inside the route while the store opens, then Home', async () => {
    mockDb.hold = true;
    await renderRouter(APP_DIR, { initialUrl: 'cookinglab:///' });

    expect(screen.getByTestId('startup-starting')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-screen')).toBeNull();
    expect(screen.queryByTestId('not-found-screen')).toBeNull();

    await act(async () => {
      mockDb.release!(mockReadyResult());
    });

    expect(await screen.findByTestId('home-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
  });

  it('explains an unknown path and offers a working way home', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: '/no/such/screen' });

    expect(await screen.findByTestId('not-found-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
    expect(screen.getByTestId('not-found-path')).toHaveTextContent(/\/no\/such\/screen/);

    await user.press(screen.getByRole('button', { name: 'Back to Home' }));
    expect(await screen.findByTestId('home-screen', {}, { timeout: 4000 })).toBeOnTheScreen();
  });
});
