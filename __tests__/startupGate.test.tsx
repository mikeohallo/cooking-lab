/**
 * A store that could not open is explained, never shown as an empty notebook.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StartupGate } from '../src/state/StartupGate';
import { StorageProvider } from '../src/state/StorageProvider';
import type { StorageStartupResult } from '../src/data/runtime';
import { STARTING_TITLE } from '../src/content/product';
import { TEST_SAFE_AREA } from './support/screens';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function renderGate(start: () => Promise<StorageStartupResult>) {
  await render(
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
      <StorageProvider start={start} newId={() => 'id'}>
        <StartupGate>
          <Text>the real app</Text>
        </StartupGate>
      </StorageProvider>
    </SafeAreaProvider>,
  );
}

describe('StartupGate', () => {
  it('shows a starting state while the store opens, then the app', async () => {
    const pending = deferred<StorageStartupResult>();
    await renderGate(() => pending.promise);

    expect(screen.getByTestId('startup-starting')).toBeOnTheScreen();
    expect(screen.getByText(STARTING_TITLE)).toBeOnTheScreen();
    expect(screen.queryByText('the real app')).toBeNull();

    pending.resolve({
      ok: true,
      storage: {
        data: {} as never,
        photos: {} as never,
        assistant: {} as never,
        schemaVersion: 1,
        freshInstall: false,
        close: async () => undefined,
      },
    });
    expect(await screen.findByText('the real app')).toBeOnTheScreen();
  });

  it('tells the person their history is intact when the key is missing', async () => {
    await renderGate(async () => ({
      ok: false,
      reason: 'recovery_required',
      message: 'encrypted database present, no key',
    }));

    expect(await screen.findByTestId('startup-failed')).toBeOnTheScreen();
    expect(screen.getByText('Your notebook is locked')).toBeOnTheScreen();
    expect(screen.getByText(/still here and still encrypted/)).toBeOnTheScreen();
    expect(screen.queryByText('the real app')).toBeNull();
  });

  it('reports a thrown startup error without pretending the store opened', async () => {
    await renderGate(async () => {
      throw new Error('native module missing');
    });

    expect(await screen.findByTestId('startup-failed')).toBeOnTheScreen();
    expect(screen.getByText(/native module missing/)).toBeOnTheScreen();
    expect(screen.queryByText('the real app')).toBeNull();
  });
});
