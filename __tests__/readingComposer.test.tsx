/**
 * Taking a reading on the screen.
 *
 * Two buttons beside Send, each opening a field for one number, and the older
 * free-text form still there behind *Somewhere else?*. What is being protected:
 * a new reading records what it was taken of, a reading taken somewhere else
 * records nothing extra, and the timeline says which it is in words.
 */

import { screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  ADD_INTERNAL_READING,
  ADD_OVEN_READING,
  CANCEL,
  INTERNAL_READING_LABEL,
  OVEN_READING_LABEL,
  READING_SOMEWHERE_ELSE,
  SAVE_TEMPERATURE,
  SEND_NOTE,
} from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('reading-composer.db');
});

afterEach(async () => {
  await harness.close();
});

async function openCook(): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id: 'cook-1', startedAt: now() }, 'user', now());
  await harness.render(<CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />);
  await screen.findByTestId('cook-screen');
}

async function events() {
  return harness.storage.data.cookEvents.listForCook({ cookId: 'cook-1' });
}

describe('the composer', () => {
  it('offers both readings beside Send', async () => {
    await openCook();

    expect(screen.getByRole('button', { name: ADD_OVEN_READING })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: ADD_INTERNAL_READING })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SEND_NOTE })).toBeOnTheScreen();
  });

  it('offers a way out to a reading taken somewhere else', async () => {
    await openCook();

    expect(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE })).toBeOnTheScreen();
  });

  it('asks an oven reading for a number and nothing else', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: ADD_OVEN_READING }));

    expect(await screen.findByTestId('reading-panel-oven')).toBeOnTheScreen();
    expect(screen.getByTestId('temperature-celsius')).toBeOnTheScreen();
    // No free-text "where": that is what the other form is for.
    expect(screen.queryByTestId('temperature-where')).toBeNull();
    expect(screen.getByTestId('temperature-celsius').props.keyboardType).toBe('numeric');
  });

  it('takes the note field’s place while it is open, and gives the note back', async () => {
    await openCook();
    await user.type(screen.getByTestId('note-input'), 'Half-written note');

    await user.press(screen.getByRole('button', { name: ADD_INTERNAL_READING }));

    expect(await screen.findByTestId('reading-panel-internal')).toBeOnTheScreen();
    expect(screen.queryByTestId('note-input')).toBeNull();

    await user.press(screen.getByRole('button', { name: CANCEL }));

    expect(screen.queryByTestId('reading-panel-internal')).toBeNull();
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('Half-written note');
  });
});

describe('an oven reading', () => {
  it('records the kind with the reading', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: ADD_OVEN_READING }));
    await user.type(screen.getByTestId('temperature-celsius'), '230');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    await waitFor(async () => expect(await events()).toHaveLength(1));
    expect((await events())[0]).toMatchObject({
      kind: 'temp',
      meta: { celsius: 230, readingKind: 'oven' },
    });
  });

  it('gets its own card, which says "Oven" in words', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: ADD_OVEN_READING }));
    await user.type(screen.getByTestId('temperature-celsius'), '230');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    expect(await screen.findByText('230°C')).toBeOnTheScreen();
    expect(screen.getByText(OVEN_READING_LABEL)).toBeOnTheScreen();
    // The mark is decoration on top of the word, so it is hidden from the
    // screen reader — which is why finding it takes the hidden elements too.
    expect(
      screen.getByTestId('reading-icon-oven', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('reading-icon-oven')).toBeNull();
  });
});

describe('an internal reading', () => {
  it('records the kind with the reading', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: ADD_INTERNAL_READING }));
    await user.type(screen.getByTestId('temperature-celsius'), '62,5');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    await waitFor(async () => expect(await events()).toHaveLength(1));
    expect((await events())[0]).toMatchObject({
      kind: 'temp',
      meta: { celsius: 62.5, readingKind: 'internal' },
    });
  });

  it('gets an amber card, which says "Internal" and never "Inside"', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: ADD_INTERNAL_READING }));
    await user.type(screen.getByTestId('temperature-celsius'), '62.5');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    expect(await screen.findByText('62.5°C')).toBeOnTheScreen();
    expect(screen.getByText(INTERNAL_READING_LABEL)).toBeOnTheScreen();
    expect(INTERNAL_READING_LABEL).toBe('Internal');
    expect(screen.queryByText('Inside')).toBeNull();
    expect(
      screen.getByTestId('reading-icon-internal', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('refuses something that is not a number, and keeps it on screen', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: ADD_INTERNAL_READING }));
    await user.type(screen.getByTestId('temperature-celsius'), 'hot');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    expect(await screen.findByTestId('temperature-problem')).toBeOnTheScreen();
    expect(screen.getByTestId('temperature-celsius')).toHaveDisplayValue('hot');
    expect(await events()).toEqual([]);
  });
});

describe('a reading taken somewhere else', () => {
  it('asks for a number and the cook’s own words', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE }));

    expect(await screen.findByTestId('temperature-panel')).toBeOnTheScreen();
    expect(screen.getByTestId('temperature-celsius')).toBeOnTheScreen();
    expect(screen.getByTestId('temperature-where')).toBeOnTheScreen();
  });

  it('writes down no kind at all', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE }));
    await user.type(screen.getByTestId('temperature-celsius'), '4');
    await user.type(screen.getByTestId('temperature-where'), 'the fridge');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    await waitFor(async () => expect(await events()).toHaveLength(1));
    // Byte for byte what slice 1 wrote. A reading taken somewhere else is the
    // same shape as every reading already in the notebook.
    expect((await events())[0]?.meta).toEqual({ celsius: 4, where: 'the fridge' });
  });

  it('keeps today’s card, unchanged', async () => {
    await openCook();

    await user.press(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE }));
    await user.type(screen.getByTestId('temperature-celsius'), '4');
    await user.type(screen.getByTestId('temperature-where'), 'the fridge');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    expect(await screen.findByText('4°C')).toBeOnTheScreen();
    expect(screen.getByText('the fridge')).toBeOnTheScreen();
    // No kind, so no kind icon and no kind word. Hidden elements included, or
    // this would pass simply because the icon is hidden from the reader.
    expect(
      screen.queryByTestId('reading-icon-oven', { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      screen.queryByTestId('reading-icon-internal', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.queryByText(OVEN_READING_LABEL)).toBeNull();
    expect(screen.queryByText(INTERNAL_READING_LABEL)).toBeNull();
  });
});

describe('a reading already in the notebook', () => {
  it('shows exactly as it did before this version', async () => {
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-1', startedAt: now() }, 'user', now());
    // Written the way the shipped slice-1 build wrote one.
    await data.capture.addEvent(
      {
        id: 'old-reading',
        cookId: 'cook-1',
        ts: now(),
        kind: 'temp',
        meta: { celsius: 62.5, where: 'centre' },
      },
      'user',
    );

    await harness.render(<CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />);
    await screen.findByTestId('cook-screen');

    expect(await screen.findByText('62.5°C')).toBeOnTheScreen();
    expect(screen.getByText('centre')).toBeOnTheScreen();
    expect(screen.queryByText(OVEN_READING_LABEL)).toBeNull();
    expect(screen.queryByText(INTERNAL_READING_LABEL)).toBeNull();
  });
});
