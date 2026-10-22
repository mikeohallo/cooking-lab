import { screen, userEvent, waitFor, within } from '@testing-library/react-native';

import {
  READING_SOMEWHERE_ELSE,
  COOK_NOT_FOUND_TITLE,
  EMPTY_TIMELINE_TITLE,
  FINISH_AND_REVIEW,
  SAVE_TEMPERATURE,
  SAVE_TITLE,
  SEND_NOTE,
  STATUS_REVIEWED,
  UNTITLED_COOK,
} from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('cook-screen.db');
});

afterEach(async () => {
  await harness.close();
});

async function startCook(id = 'cook-1', title: string | null = null) {
  const { data, now } = harness.storage;
  const started = await data.capture.startCook({ id, title, startedAt: now() }, 'user', now());
  if (!started.allowed) {
    throw new Error(started.message);
  }
  return started.record;
}

async function renderCook(cookId: string) {
  const onBack = jest.fn();
  const onReview = jest.fn();
  await harness.render(<CookScreen cookId={cookId} onBack={onBack} onReview={onReview} />);
  return { onBack, onReview };
}

describe('CookScreen — an open cook', () => {
  it('shows Untitled cook, an empty timeline and the composer', async () => {
    await startCook();
    await renderCook('cook-1');

    expect(await screen.findByTestId('cook-screen')).toBeOnTheScreen();
    expect(screen.getByText(UNTITLED_COOK)).toBeOnTheScreen();
    expect(screen.getByText(EMPTY_TIMELINE_TITLE)).toBeOnTheScreen();
    expect(screen.getByTestId('composer')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: FINISH_AND_REVIEW })).toBeOnTheScreen();
  });

  it('persists a note exactly as typed and shows it only once the store has it', async () => {
    await startCook();
    await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    await user.type(screen.getByTestId('note-input'), '  Seared hard, 4 min a side.  ');
    await user.press(screen.getByRole('button', { name: SEND_NOTE }));

    expect(await screen.findByText('  Seared hard, 4 min a side.  ')).toBeOnTheScreen();
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('');

    const events = await harness.db.data.cookEvents.listForCook({ cookId: 'cook-1' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'user_note',
      body: '  Seared hard, 4 min a side.  ',
      photoPath: null,
    });
  });

  it('refuses a blank note without clearing what was typed', async () => {
    await startCook();
    await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    await user.type(screen.getByTestId('note-input'), '   ');
    await user.press(screen.getByRole('button', { name: SEND_NOTE }));

    expect(screen.getByText('Write something first. One word is enough.')).toBeOnTheScreen();
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('   ');
    expect(await harness.db.data.cookEvents.listForCook({ cookId: 'cook-1' })).toHaveLength(0);
  });

  it('records a Celsius reading with an optional where, and no kind', async () => {
    await startCook();
    await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    await user.press(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE }));
    await user.type(screen.getByTestId('temperature-celsius'), '62,5');
    await user.type(screen.getByTestId('temperature-where'), 'centre');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    expect(await screen.findByText('62.5°C')).toBeOnTheScreen();
    expect(screen.getByText('centre')).toBeOnTheScreen();
    expect(screen.queryByTestId('temperature-panel')).toBeNull();

    const events = await harness.db.data.cookEvents.listForCook({ cookId: 'cook-1' });
    expect(events[0]).toMatchObject({ kind: 'temp', meta: { celsius: 62.5, where: 'centre' } });
    // A reading taken somewhere else says nothing about what it was taken of,
    // and writes nothing down about it: this meta is byte for byte what slice 1
    // wrote, which is what keeps every reading already in the notebook intact.
    expect(events[0]?.meta).toEqual({ celsius: 62.5, where: 'centre' });
  });

  it('rejects a non-numeric temperature and keeps the panel open', async () => {
    await startCook();
    await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    await user.press(screen.getByRole('button', { name: READING_SOMEWHERE_ELSE }));
    await user.type(screen.getByTestId('temperature-celsius'), 'hot');
    await user.press(screen.getByRole('button', { name: SAVE_TEMPERATURE }));

    expect(await screen.findByTestId('temperature-problem')).toBeOnTheScreen();
    expect(screen.getByTestId('temperature-celsius')).toHaveDisplayValue('hot');
    expect(await harness.db.data.cookEvents.listForCook({ cookId: 'cook-1' })).toHaveLength(0);
  });

  it('keeps the typed note on screen when the store refuses the write', async () => {
    await startCook();
    const failing = {
      ...harness.storage,
      data: {
        ...harness.storage.data,
        capture: {
          ...harness.storage.data.capture,
          addEvent: async () => {
            throw new Error('database is locked');
          },
        },
      },
    };
    await harness.render(
      <CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />,
      failing,
    );
    await screen.findByTestId('cook-screen');

    await user.type(screen.getByTestId('note-input'), 'Rested ten minutes');
    await user.press(screen.getByRole('button', { name: SEND_NOTE }));

    expect(await screen.findByTestId('composer-write-failed')).toBeOnTheScreen();
    expect(screen.getByText('database is locked')).toBeOnTheScreen();
    expect(screen.getByTestId('note-input')).toHaveDisplayValue('Rested ten minutes');
    expect(await harness.db.data.cookEvents.listForCook({ cookId: 'cook-1' })).toHaveLength(0);
  });

  it('edits the title in place and saves it through the capture service', async () => {
    await startCook();
    await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    await user.press(screen.getByTestId('cook-title'));
    await user.type(screen.getByTestId('cook-title-input'), 'Rolled lamb breast');
    await user.press(screen.getByRole('button', { name: SAVE_TITLE }));

    expect(await screen.findByText('Rolled lamb breast')).toBeOnTheScreen();
    expect(screen.queryByTestId('cook-title-editor')).toBeNull();
    const stored = await harness.db.data.cooks.findById('cook-1');
    expect(stored?.title).toBe('Rolled lamb breast');
  });

  it('hands off to Review from the header', async () => {
    await startCook();
    const { onReview } = await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    await user.press(screen.getByRole('button', { name: FINISH_AND_REVIEW }));
    expect(onReview).toHaveBeenCalledWith('cook-1');
  });

  it('shows the timeline oldest first', async () => {
    await startCook();
    const { data, now } = harness.storage;
    await data.capture.addEvent(
      { id: 'e1', cookId: 'cook-1', ts: now(), kind: 'user_note', body: 'first' },
      'user',
    );
    await data.capture.addEvent(
      { id: 'e2', cookId: 'cook-1', ts: harness.tick(), kind: 'temp', meta: { celsius: 96 } },
      'user',
    );
    await data.capture.addEvent(
      { id: 'e3', cookId: 'cook-1', ts: harness.tick(), kind: 'user_note', body: 'third' },
      'user',
    );
    await renderCook('cook-1');
    await screen.findByTestId('cook-screen');

    const order = within(screen.getByTestId('timeline')).getAllByTestId(/^event-/);
    expect(order.map((node) => node.props.testID)).toEqual(['event-e1', 'event-e2', 'event-e3']);
    expect(screen.getByText('96°C')).toBeOnTheScreen();
  });
});

describe('CookScreen — a reviewed cook', () => {
  it('is read-only, shows the verdict and approved lessons, and hides the composer', async () => {
    await startCook('cook-2', 'Pork chops');
    const { data, now } = harness.storage;
    await data.capture.addEvent(
      { id: 'e1', cookId: 'cook-2', ts: now(), kind: 'user_note', body: 'Dry brined overnight' },
      'user',
    );
    await data.capture.saveReview('cook-2', 'Great crust.\nApple needed more acid.', 'user', now());
    await data.lessons.create({
      id: 'lesson-1',
      cookId: 'cook-2',
      text: 'More acid in the cabbage.',
      status: 'approved',
      provenance: 'live',
      createdAt: now(),
      updatedAt: null,
    });
    await data.lessons.create({
      id: 'lesson-2',
      cookId: 'cook-2',
      text: 'A proposal nobody approved.',
      status: 'proposed',
      provenance: 'live',
      createdAt: now(),
      updatedAt: null,
    });

    await renderCook('cook-2');

    expect(await screen.findByTestId('cook-detail-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('cook-status-chip')).toHaveTextContent(STATUS_REVIEWED);
    expect(screen.getByText('Great crust.\nApple needed more acid.')).toBeOnTheScreen();
    expect(screen.getByText('More acid in the cabbage.')).toBeOnTheScreen();
    expect(screen.queryByText('A proposal nobody approved.')).toBeNull();
    expect(screen.getByText('Dry brined overnight')).toBeOnTheScreen();
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(screen.queryByRole('button', { name: FINISH_AND_REVIEW })).toBeNull();
    expect(screen.queryByTestId('cook-title-editor')).toBeNull();
  });
});

describe('CookScreen — a cook that is not there', () => {
  it('explains that nothing was changed and offers a way home', async () => {
    const { onBack } = await renderCook('no-such-cook');

    expect(await screen.findByTestId('cook-missing')).toBeOnTheScreen();
    expect(screen.getAllByText(COOK_NOT_FOUND_TITLE).length).toBeGreaterThan(0);
    await user.press(screen.getByRole('button', { name: 'Back to Home' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
