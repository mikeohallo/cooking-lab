/**
 * The real route tree, mounted by the real router.
 *
 * `renderRouter` loads the actual files under `app/` — the root layout and
 * every route — so this is the test that catches a Home screen the router
 * cannot find, which no screen test can. The store is the Node SQLite harness,
 * handed to the root layout in place of the native startup.
 */
import { screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import path from 'node:path';

import { NEW_COOK_TITLE } from '../src/content/product';
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
        assistant: jest.requireActual('../src/data/ai/unavailable').createUnavailableAiService(),
        schemaVersion: 1,
        freshInstall: true,
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
      return `route-${next}`;
    },
  };
});

let db: TestDatabase;

beforeEach(async () => {
  db = await openTestDatabase('routes.db');
  mockDb.current = db;
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
});
