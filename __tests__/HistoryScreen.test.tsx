import { screen, userEvent, within } from '@testing-library/react-native';

import { EMPTY_HISTORY_TITLE, FILTER_OPEN, FILTER_REVIEWED, UNTITLED_COOK } from '../src/content/product';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('history-screen.db');
});

afterEach(async () => {
  await harness.close();
});

async function seedThreeCooks() {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id: 'oldest', title: 'Roast chicken', startedAt: now() }, 'user', now());
  await data.capture.saveReview('oldest', 'Skin could crisp more.', 'user', now());
  await data.capture.startCook({ id: 'middle', startedAt: harness.tick() }, 'user', now());
  await data.capture.startCook(
    { id: 'newest', title: 'Pork chops', startedAt: harness.tick() },
    'user',
    now(),
  );
  await data.capture.saveReview('newest', 'Great crust.', 'user', now());
}

async function renderHistory() {
  const onOpenCook = jest.fn();
  const onBack = jest.fn();
  await harness.render(<HistoryScreen onOpenCook={onOpenCook} onBack={onBack} />);
  return { onOpenCook, onBack };
}

describe('HistoryScreen', () => {
  it('shows a calm empty state', async () => {
    await renderHistory();
    expect(await screen.findByTestId('history-empty')).toBeOnTheScreen();
    expect(screen.getByText(EMPTY_HISTORY_TITLE)).toBeOnTheScreen();
  });

  it('lists every cook newest first, with status and verdict excerpt', async () => {
    await seedThreeCooks();
    await renderHistory();
    await screen.findByTestId('history-list');

    const cards = within(screen.getByTestId('history-list')).getAllByTestId(/^cook-card-/);
    expect(cards.map((card) => card.props.testID)).toEqual([
      'cook-card-newest',
      'cook-card-middle',
      'cook-card-oldest',
    ]);
    expect(screen.getByText('Pork chops')).toBeOnTheScreen();
    expect(screen.getByText(UNTITLED_COOK)).toBeOnTheScreen();
    expect(screen.getByText('Skin could crisp more.')).toBeOnTheScreen();
    expect(screen.getByText('Great crust.')).toBeOnTheScreen();
  });

  it('filters by status', async () => {
    await seedThreeCooks();
    await renderHistory();
    await screen.findByTestId('history-list');

    await user.press(screen.getByRole('tab', { name: FILTER_OPEN }));
    await screen.findByTestId('cook-card-middle');
    expect(screen.queryByTestId('cook-card-newest')).toBeNull();
    expect(screen.queryByTestId('cook-card-oldest')).toBeNull();

    await user.press(screen.getByRole('tab', { name: FILTER_REVIEWED }));
    await screen.findByTestId('cook-card-newest');
    expect(screen.getByTestId('cook-card-oldest')).toBeOnTheScreen();
    expect(screen.queryByTestId('cook-card-middle')).toBeNull();
  });

  it('opens a cook when its card is tapped', async () => {
    await seedThreeCooks();
    const { onOpenCook } = await renderHistory();
    await screen.findByTestId('history-list');

    await user.press(screen.getByTestId('cook-card-oldest'));
    expect(onOpenCook).toHaveBeenCalledWith('oldest');
  });
});
