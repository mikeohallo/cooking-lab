/**
 * The whole loop, end to end, against real SQL: Home → New Cook → notes and a
 * temperature → Finish & review → verdict → History shows it → the cook
 * reopens read-only. Then the store is closed and reopened to prove the
 * history is on disk, not in React state.
 *
 * Screens are driven the way a thumb would drive them. Each screen is
 * rendered in turn as the router would, with the ids the previous one handed
 * over.
 */
import { cleanup, screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  ADD_INTERNAL_READING,
  FINISH_AND_REVIEW,
  FINISH_REVIEW,
  NEW_COOK_TITLE,
  SAVE_TEMPERATURE,
  SEND_NOTE,
} from '../src/content/product';
import { createSqliteDataLayer } from '../src/data/sqlite/dataLayer';
import { CookScreen } from '../src/screens/CookScreen';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { countingIds } from './support/database';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

/**
 * This one test renders four screens in turn, types every character the way
 * a thumb would and waits on real SQLite between them. Alone on a fast
 * machine it takes about 4 s; under a full parallel run, or on the CI runner,
 * it crosses Jest's 5 s default and fails for being slow, not for being
 * wrong. The budget below is sized for the slowest machine that runs it.
 */
const WHOLE_LOOP_TIMEOUT_MS = 30_000;

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('core-loop.db');
});

afterEach(async () => {
  await harness.close();
});

describe('the core loop', () => {
  it('cooks dinner and keeps the history', async () => {
    // Home: one tap starts a cook.
    const onOpenCook = jest.fn();
    await harness.render(<HomeScreen onOpenCook={onOpenCook} onHistory={jest.fn()} />);
    await screen.findByTestId('home-empty');
    await user.press(screen.getByRole('button', { name: NEW_COOK_TITLE }));
    await waitFor(() => expect(onOpenCook).toHaveBeenCalled());
    const cookId = onOpenCook.mock.calls[0]?.[0] as string;
    await cleanup();

    // Cook: a note, a temperature, another note.
    const onReview = jest.fn();
    await harness.render(<CookScreen cookId={cookId} onBack={jest.fn()} onReview={onReview} />);
    await screen.findByTestId('cook-screen');
    await user.type(screen.getByTestId('note-input'), 'Pork chops, dry brined overnight.');
    await user.press(screen.getByRole('button', { name: SEND_NOTE }));
    await screen.findByText('Pork chops, dry brined overnight.');
    harness.tick();
    // Two taps for the reading a cook actually takes: the button names what it
    // is, and the panel asks for the number and nothing else.
    await user.press(screen.getByRole('button', { name: ADD_INTERNAL_READING }));
    await user.type(screen.getByTestId('temperature-celsius'), '58');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));
    await screen.findByText('58°C');
    expect(screen.getByText('Internal')).toBeOnTheScreen();
    harness.tick();
    await user.type(screen.getByTestId('note-input'), 'Rested 8 minutes.');
    await user.press(screen.getByRole('button', { name: SEND_NOTE }));
    await screen.findByText('Rested 8 minutes.');
    await user.press(screen.getByRole('button', { name: FINISH_AND_REVIEW }));
    expect(onReview).toHaveBeenCalledWith(cookId);
    await cleanup();

    // Review: the verdict, in the cook's own words.
    const onFinished = jest.fn();
    await harness.render(<ReviewScreen cookId={cookId} onBack={jest.fn()} onFinished={onFinished} />);
    await screen.findByTestId('review-screen');
    expect(screen.getByText('58°C')).toBeOnTheScreen();
    await user.type(screen.getByTestId('verdict-input'), 'Great crust. Apple and cabbage needed acid.');
    await user.type(screen.getByTestId('takeaway-input'), 'More acid in the cabbage.');
    harness.tick();
    await user.press(screen.getByRole('button', { name: FINISH_REVIEW }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(cookId));
    await cleanup();

    // History: the cook is there, reviewed, with its verdict.
    const onOpenFromHistory = jest.fn();
    await harness.render(<HistoryScreen onOpenCook={onOpenFromHistory} onBack={jest.fn()} />);
    await screen.findByTestId('history-list');
    expect(screen.getByText('Great crust. Apple and cabbage needed acid.')).toBeOnTheScreen();
    await user.press(screen.getByTestId(`cook-card-${cookId}`));
    expect(onOpenFromHistory).toHaveBeenCalledWith(cookId);
    await cleanup();

    // The cook reopens read-only with everything it held.
    await harness.render(<CookScreen cookId={cookId} onBack={jest.fn()} onReview={jest.fn()} />);
    await screen.findByTestId('cook-detail-screen');
    expect(screen.getByText('Great crust. Apple and cabbage needed acid.')).toBeOnTheScreen();
    expect(screen.getByText('More acid in the cabbage.')).toBeOnTheScreen();
    expect(screen.getByText('Pork chops, dry brined overnight.')).toBeOnTheScreen();
    expect(screen.getByText('58°C')).toBeOnTheScreen();
    // The kind is named in words on the read-only card too, never by colour.
    expect(screen.getByText('Internal')).toBeOnTheScreen();
    expect(screen.getByText('Rested 8 minutes.')).toBeOnTheScreen();
    expect(screen.queryByTestId('composer')).toBeNull();
    await cleanup();

    // Raw evidence survived the review untouched, in order, and is on disk:
    // a fresh data layer over the same connection reads the same rows.
    const reopened = createSqliteDataLayer(harness.db.adapter, countingIds('again'));
    const events = await reopened.cookEvents.listForCook({ cookId, sort: 'oldest_first' });
    expect(events.map((event) => [event.kind, event.body ?? event.meta])).toEqual([
      ['user_note', 'Pork chops, dry brined overnight.'],
      ['temp', { celsius: 58, readingKind: 'internal' }],
      ['user_note', 'Rested 8 minutes.'],
    ]);
    const cook = await reopened.cooks.findById(cookId);
    expect(cook?.status).toBe('reviewed');
    expect(cook?.reviewOpenedAt).not.toBeNull();
    expect(cook?.reviewSavedAt).not.toBeNull();
    expect(Date.parse(cook!.reviewSavedAt!)).toBeGreaterThan(Date.parse(cook!.reviewOpenedAt!));
  }, WHOLE_LOOP_TIMEOUT_MS);
});
