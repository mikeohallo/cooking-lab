/**
 * The export buttons on screen, against real SQL and a share sheet that only
 * remembers: where they appear, what they hand over, and what they say when
 * the hand-over fails.
 */
import { cleanup, screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  EMPTY_HISTORY_TITLE,
  EMPTY_OPEN_TITLE,
  EMPTY_REVIEWED_TITLE,
  READING_SOMEWHERE_ELSE,
  CANCEL,
  EXPORT_COOK,
  EXPORT_COOK_HINT,
  EXPORT_DONE_TITLE,
  EXPORT_EVERYTHING,
  EXPORT_EVERYTHING_HINT,
  EXPORT_FAILED_TITLE,
  FILTER_OPEN,
  FILTER_REVIEWED,
} from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('export-screens.db');
});

afterEach(async () => {
  await harness.close();
});

async function seedReviewedCook(id = 'done-cook'): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id, title: 'Roast chicken', startedAt: now() }, 'user', now());
  await data.capture.addEvent(
    { id: `${id}-note`, cookId: id, ts: harness.tick(), kind: 'user_note', body: 'Salted the night before.' },
    'user',
  );
  await data.capture.openReview(id, 'user', harness.tick());
  await data.capture.saveReview(id, 'Skin perfect, breast a touch dry.', 'user', harness.tick());
}

describe('Export everything, on Home', () => {
  it('is not offered while there is nothing to export', async () => {
    await harness.render(<HomeScreen onOpenCook={jest.fn()} onHistory={jest.fn()} />);
    await screen.findByTestId('home-empty');

    expect(screen.queryByRole('button', { name: EXPORT_EVERYTHING })).toBeNull();
  });

  it('hands one backup file to the share sheet and says what went in it', async () => {
    await seedReviewedCook();
    await harness.render(<HomeScreen onOpenCook={jest.fn()} onHistory={jest.fn()} />);

    await user.press(await screen.findByRole('button', { name: EXPORT_EVERYTHING }));

    expect(screen.getByText(EXPORT_EVERYTHING_HINT)).toBeOnTheScreen();
    expect(await screen.findByTestId('export-everything-done')).toBeOnTheScreen();
    expect(screen.getByText(EXPORT_DONE_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(/1 cook in cooking-lab-TEST-backup-.*\.json\./)).toBeOnTheScreen();
    expect(harness.sink.shared).toHaveLength(1);
    expect(harness.sink.shared[0]!.fileName).toMatch(/^cooking-lab-TEST-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(harness.sink.shared[0]!.text).toContain('"cooking-lab.backup"');
  });

  it('shows why when the share sheet fails, and nothing in the store changes', async () => {
    await seedReviewedCook();
    const before = await harness.storage.data.snapshots.readSnapshot();
    harness.sink.fail = new Error('The share sheet could not be opened.');
    await harness.render(<HomeScreen onOpenCook={jest.fn()} onHistory={jest.fn()} />);

    await user.press(await screen.findByRole('button', { name: EXPORT_EVERYTHING }));

    expect(await screen.findByTestId('export-everything-failed')).toBeOnTheScreen();
    expect(screen.getByText(EXPORT_FAILED_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(/The share sheet could not be opened\./)).toBeOnTheScreen();
    expect(await harness.storage.data.snapshots.readSnapshot()).toEqual(before);
    expect(harness.sink.shared).toEqual([]);
  });
});

describe('Export this cook, on a reviewed cook', () => {
  it('is offered on a reviewed cook and hands over its text', async () => {
    await seedReviewedCook();
    await harness.render(<CookScreen cookId="done-cook" onBack={jest.fn()} onReview={jest.fn()} />);
    await screen.findByTestId('cook-detail-screen');
    expect(screen.getByText(EXPORT_COOK_HINT)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: EXPORT_COOK }));

    expect(await screen.findByTestId('export-cook-done')).toBeOnTheScreen();
    expect(harness.sink.shared).toHaveLength(1);
    const file = harness.sink.shared[0]!;
    expect(file.fileName).toMatch(/^cooking-lab-TEST-cook-\d{4}-\d{2}-\d{2}-roast-chicken\.txt$/);
    expect(file.text).toContain('Verdict\nSkin perfect, breast a touch dry.\n');
    expect(file.text).toContain('Salted the night before.');
  });

  it('is not offered while a cook is still open', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'open-cook', startedAt: now() }, 'user', now());
    await harness.render(<CookScreen cookId="open-cook" onBack={jest.fn()} onReview={jest.fn()} />);
    await screen.findByTestId('cook-screen');

    expect(screen.queryByRole('button', { name: EXPORT_COOK })).toBeNull();
  });
});

describe('History’s empty state names the filter', () => {
  it('says there are no open cooks when every cook is reviewed', async () => {
    await seedReviewedCook();
    await harness.render(<HistoryScreen onBack={jest.fn()} onOpenCook={jest.fn()} />);
    await screen.findByTestId('history-list');

    await user.press(screen.getByRole('tab', { name: FILTER_OPEN }));

    await waitFor(() => expect(screen.getByText(EMPTY_OPEN_TITLE)).toBeOnTheScreen());
    expect(screen.queryByText(EMPTY_HISTORY_TITLE)).toBeNull();
  });

  it('says nothing is reviewed yet when the only cook is open', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'open-cook', startedAt: now() }, 'user', now());
    await harness.render(<HistoryScreen onBack={jest.fn()} onOpenCook={jest.fn()} />);
    await screen.findByTestId('history-list');

    await user.press(screen.getByRole('tab', { name: FILTER_REVIEWED }));

    await waitFor(() => expect(screen.getByText(EMPTY_REVIEWED_TITLE)).toBeOnTheScreen());
    await cleanup();
  });

  it('still says no cooks yet when the notebook is empty', async () => {
    await harness.render(<HistoryScreen onBack={jest.fn()} onOpenCook={jest.fn()} />);

    expect(await screen.findByText(EMPTY_HISTORY_TITLE)).toBeOnTheScreen();
  });
});

describe('The composer keeps room for the timeline', () => {
  it('lets the temperature row take the note field’s place, and gives the note back on Cancel', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'open-cook', startedAt: now() }, 'user', now());
    await harness.render(<CookScreen cookId="open-cook" onBack={jest.fn()} onReview={jest.fn()} />);
    await screen.findByTestId('cook-screen');
    await user.type(screen.getByTestId('note-input'), 'Half-written note');

    await user.press(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE }));

    expect(screen.getByTestId('temperature-panel')).toBeOnTheScreen();
    expect(screen.queryByTestId('note-input')).toBeNull();

    await user.press(screen.getByRole('button', { name: CANCEL }));

    expect(screen.queryByTestId('temperature-panel')).toBeNull();
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('Half-written note');
  });
});
