import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { TEST_BADGE_TEST_ID } from '../src/components/TestBadge';
import {
  CONTINUE_COOKING,
  CORE_LOOP_STEPS,
  EMPTY_HOME_TITLE,
  NEW_COOK_TITLE,
  PRODUCT_TAGLINE,
  RECENT_COOKS,
  SEE_ALL_HISTORY,
  UNTITLED_COOK,
} from '../src/content/product';
import { HomeScreen } from '../src/screens/HomeScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('home-screen.db');
});

afterEach(async () => {
  await harness.close();
});

async function renderHome() {
  const onOpenCook = jest.fn();
  const onHistory = jest.fn();
  await harness.render(<HomeScreen onOpenCook={onOpenCook} onHistory={onHistory} />);
  return { onOpenCook, onHistory };
}

describe('HomeScreen', () => {
  it('shows a calm empty state and the loop on first use', async () => {
    await renderHome();
    expect(await screen.findByTestId('home-empty')).toBeOnTheScreen();
    expect(screen.getByText(EMPTY_HOME_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(PRODUCT_TAGLINE)).toBeOnTheScreen();
    for (const step of CORE_LOOP_STEPS) {
      expect(screen.getByText(step)).toBeOnTheScreen();
    }
  });

  it('creates an open, untitled, live cook in one tap and opens it', async () => {
    const { onOpenCook } = await renderHome();
    await screen.findByTestId('home-empty');

    await user.press(screen.getByRole('button', { name: NEW_COOK_TITLE }));

    await waitFor(() => expect(onOpenCook).toHaveBeenCalledTimes(1));
    const cookId = onOpenCook.mock.calls[0]?.[0] as string;
    const stored = await harness.db.data.cooks.findById(cookId);
    expect(stored).not.toBeNull();
    expect(stored).toMatchObject({
      status: 'open',
      provenance: 'live',
      title: null,
      verdict: null,
      startedAt: '2026-10-15T08:30:00.000Z',
    });
  });

  it('lists open cooks under Continue cooking and reviewed ones under Recent cooks', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'open-cook', startedAt: now() }, 'user', now());
    await data.capture.startCook(
      { id: 'done-cook', title: 'Pork chops', startedAt: harness.tick() },
      'user',
      now(),
    );
    await data.capture.saveReview('done-cook', 'Great crust. Apple needed acid.', 'user', harness.tick());

    const { onOpenCook } = await renderHome();

    expect(await screen.findByText(CONTINUE_COOKING)).toBeOnTheScreen();
    expect(screen.getByText(RECENT_COOKS)).toBeOnTheScreen();
    expect(screen.getByText(UNTITLED_COOK)).toBeOnTheScreen();
    expect(screen.getByText('Pork chops')).toBeOnTheScreen();
    expect(screen.getByText('Great crust. Apple needed acid.')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-empty')).toBeNull();
    // The marketing line is for first use only.
    expect(screen.queryByText(PRODUCT_TAGLINE)).toBeNull();

    await user.press(screen.getByTestId('cook-card-open-cook'));
    expect(onOpenCook).toHaveBeenCalledWith('open-cook');
  });

  it('navigates to History', async () => {
    const { onHistory } = await renderHome();
    await screen.findByTestId('home-empty');
    await user.press(screen.getByRole('button', { name: SEE_ALL_HISTORY }));
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it('shows no TEST indicator under the default production identity', async () => {
    await renderHome();
    await screen.findByTestId('home-empty');
    expect(screen.queryByTestId(TEST_BADGE_TEST_ID)).toBeNull();
    expect(screen.getByText('Cooking Lab')).toBeOnTheScreen();
  });

  it('reports a failed New Cook without creating anything', async () => {
    const failing = {
      ...harness.storage,
      data: {
        ...harness.storage.data,
        capture: {
          ...harness.storage.data.capture,
          startCook: async () => {
            throw new Error('disk full');
          },
        },
      },
    };
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} onHistory={jest.fn()} />, failing);
    await screen.findByTestId('home-empty');

    await user.press(screen.getByRole('button', { name: NEW_COOK_TITLE }));

    expect(await screen.findByTestId('new-cook-failed')).toBeOnTheScreen();
    expect(screen.getByText('disk full')).toBeOnTheScreen();
    expect(onOpenCook).not.toHaveBeenCalled();
    expect(await harness.db.data.cooks.count()).toBe(0);
  });
});
