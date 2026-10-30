/**
 * Deleting a cook and editing its words, on screen (0.2.2).
 *
 * Every screen here is the real one, writing through the real services to real
 * SQLite: the card's long-press and the cook page's ⋯, the confirm, the Undo bar
 * and what it brings back; the ⋯ on a note and on the verdict, the editor, the
 * "edited" mark and the earlier versions; the title on a reviewed cook; and the
 * tags on a reviewed cook.
 */

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { UNDO_WINDOW_MS } from '../src/data/deletion/workflow';
import {
  COOK_DELETED,
  DELETE_COOK_CONFIRM_BODY,
  DELETE_COOK_CONFIRM_TITLE,
  EDITED,
  ORIGINAL_VERSION,
} from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { HistoryScreen } from '../src/screens/HistoryScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

async function cook(id: string, title: string, review?: string): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id, title, startedAt: now() }, 'user', now());
  await data.capture.addEvent(
    { id: `${id}-note`, cookId: id, ts: harness.tick(), kind: 'user_note', body: 'Salted at 8.' },
    'user',
  );
  if (review !== undefined) {
    await data.capture.saveReview(id, review, 'user', harness.tick());
  }
}

beforeEach(async () => {
  harness = await openScreenHarness();
});

afterEach(async () => {
  jest.useRealTimers();
  await cleanup();
  await harness.close();
});

describe('deleting a cook from Home', () => {
  beforeEach(async () => {
    await cook('cook-open', 'Stew');
    await cook('cook-done', 'Pork chops', 'Good.');
  });

  it('long-press, Delete cook, confirm: the card goes and Undo is offered; Undo brings it back', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} onHistory={() => {}} />);
    const card = await screen.findByTestId('cook-card-cook-done');

    await fireEvent(card, 'longPress');
    await fireEvent.press(await screen.findByTestId('delete-cook'));
    expect(screen.getByText(DELETE_COOK_CONFIRM_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(DELETE_COOK_CONFIRM_BODY)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('delete-cook-confirm-button'));

    await waitFor(() => expect(screen.queryByTestId('cook-card-cook-done')).toBeNull());
    expect(screen.getByTestId('undo-bar')).toBeOnTheScreen();
    expect(screen.getByText(COOK_DELETED)).toBeOnTheScreen();
    expect(screen.getByTestId('cook-card-cook-open')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('undo-delete'));

    expect(await screen.findByTestId('cook-card-cook-done')).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-bar')).toBeNull();
    expect(await harness.db.data.cookDeletions.listPending()).toEqual([]);
  });

  it('changes nothing when the cook answers Keep it', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} onHistory={() => {}} />);
    await fireEvent(await screen.findByTestId('cook-card-cook-open'), 'longPress');
    await fireEvent.press(await screen.findByTestId('delete-cook'));
    await fireEvent.press(screen.getByTestId('delete-cook-keep'));

    expect(screen.getByTestId('cook-card-cook-open')).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-bar')).toBeNull();
    expect(await harness.db.data.cookDeletions.listPending()).toEqual([]);
  });

  it('deletes it for good once the undo window has passed', async () => {
    jest.useFakeTimers();
    await harness.render(<HomeScreen onOpenCook={() => {}} onHistory={() => {}} />);
    await fireEvent(await screen.findByTestId('cook-card-cook-done'), 'longPress');
    await fireEvent.press(await screen.findByTestId('delete-cook'));
    await fireEvent.press(screen.getByTestId('delete-cook-confirm-button'));
    await waitFor(() => expect(screen.getByTestId('undo-bar')).toBeOnTheScreen());

    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });

    await waitFor(() => expect(screen.queryByTestId('undo-bar')).toBeNull());
    await waitFor(async () =>
      expect(await harness.db.data.cooks.findById('cook-done')).toBeNull(),
    );
    expect(await harness.db.data.cooks.findById('cook-open')).not.toBeNull();
  });
});

describe('deleting a cook from History', () => {
  it('works from a card there too', async () => {
    await cook('cook-a', 'Bread', 'Dense.');
    await harness.render(<HistoryScreen onOpenCook={() => {}} onBack={() => {}} />);

    await fireEvent(await screen.findByTestId('cook-card-cook-a'), 'longPress');
    await fireEvent.press(await screen.findByTestId('delete-cook'));
    await fireEvent.press(screen.getByTestId('delete-cook-confirm-button'));

    await waitFor(() => expect(screen.queryByTestId('cook-card-cook-a')).toBeNull());
    expect(screen.getByTestId('undo-bar')).toBeOnTheScreen();
  });
});

describe('the cook’s own page', () => {
  it('offers Delete cook from ⋯, without a long-press, and goes back once deleted', async () => {
    await cook('cook-a', 'Bread');
    const onBack = jest.fn();
    await harness.render(<CookScreen cookId="cook-a" onBack={onBack} onReview={() => {}} />);

    const more = await screen.findByTestId('cook-more');
    expect(more.props.accessibilityLabel).toBe('More actions for this cook');
    await fireEvent.press(more);
    await fireEvent.press(await screen.findByTestId('delete-cook'));
    await fireEvent.press(screen.getByTestId('delete-cook-confirm-button'));

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(await harness.db.data.cookDeletions.listPending()).toEqual(['cook-a']);
  });

  it('edits a note on an open cook: ⋯, Edit, Save — the newest words, "edited", and the original kept', async () => {
    await cook('cook-a', 'Bread');
    await harness.render(<CookScreen cookId="cook-a" onBack={() => {}} onReview={() => {}} />);

    await fireEvent.press(await screen.findByTestId('note-cook-a-note-more'));
    await fireEvent.press(screen.getByTestId('note-cook-a-note-edit'));
    const input = screen.getByTestId('note-cook-a-note-edit-input');
    expect(input.props.value).toBe('Salted at 8.');
    await fireEvent.changeText(input, 'Salted at 7.');
    await fireEvent.press(screen.getByTestId('note-cook-a-note-edit-save'));

    expect(await screen.findByText('Salted at 7.')).toBeOnTheScreen();
    expect(screen.queryByText('Salted at 8.')).toBeNull();
    expect(screen.getByText(EDITED)).toBeOnTheScreen();

    const [row] = await harness.db.adapter.select({
      sql: "SELECT body FROM cook_events WHERE id = 'cook-a-note'",
    });
    expect(row?.body).toBe('Salted at 8.');

    await fireEvent.press(screen.getByTestId('note-cook-a-note-edited'));
    const sheet = await screen.findByTestId('version-0');
    expect(within(sheet).getByText('Salted at 8.')).toBeOnTheScreen();
    expect(within(sheet).getByText(new RegExp(`^${ORIGINAL_VERSION} · `))).toBeOnTheScreen();
  });

  it('gives the note’s ⋯ a 48 dp target', async () => {
    await cook('cook-a', 'Bread');
    await harness.render(<CookScreen cookId="cook-a" onBack={() => {}} onReview={() => {}} />);
    const more = await screen.findByTestId('note-cook-a-note-more');
    const style = more.props.style as { minWidth?: number; minHeight?: number }[] | object;
    const flat = Object.assign({}, ...(Array.isArray(style) ? style : [style]));
    expect(flat.minWidth).toBeGreaterThanOrEqual(48);
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('edits a note and the verdict on a reviewed cook, and lists every earlier verdict', async () => {
    await cook('cook-done', 'Pork chops', 'Good.');
    await harness.render(<CookScreen cookId="cook-done" onBack={() => {}} onReview={() => {}} />);

    await fireEvent.press(await screen.findByTestId('note-cook-done-note-more'));
    await fireEvent.press(screen.getByTestId('note-cook-done-note-edit'));
    await fireEvent.changeText(screen.getByTestId('note-cook-done-note-edit-input'), 'Salted at 7.');
    await fireEvent.press(screen.getByTestId('note-cook-done-note-edit-save'));
    expect(await screen.findByText('Salted at 7.')).toBeOnTheScreen();

    for (const words of ['Good. More acid.', 'Good. More acid, less salt.']) {
      await fireEvent.press(screen.getByTestId('verdict-more'));
      await fireEvent.press(screen.getByTestId('verdict-edit'));
      await fireEvent.changeText(screen.getByTestId('verdict-edit-input'), words);
      await fireEvent.press(screen.getByTestId('verdict-edit-save'));
      expect(await screen.findByText(words)).toBeOnTheScreen();
    }

    await fireEvent.press(screen.getByTestId('verdict-edited'));
    expect(within(await screen.findByTestId('version-0')).getByText('Good. More acid.')).toBeOnTheScreen();
    expect(within(screen.getByTestId('version-1')).getByText('Good.')).toBeOnTheScreen();

    const [cookRow] = await harness.db.adapter.select({
      sql: "SELECT verdict FROM cooks WHERE id = 'cook-done'",
    });
    expect(cookRow?.verdict).toBe('Good.');
  });

  it('keeps Save off until the words have changed, and refuses empty words', async () => {
    await cook('cook-a', 'Bread');
    await harness.render(<CookScreen cookId="cook-a" onBack={() => {}} onReview={() => {}} />);
    await fireEvent.press(await screen.findByTestId('note-cook-a-note-more'));
    await fireEvent.press(screen.getByTestId('note-cook-a-note-edit'));

    expect(screen.getByTestId('note-cook-a-note-edit-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('note-cook-a-note-edit-input'), '   ');
    expect(screen.getByTestId('note-cook-a-note-edit-save')).toBeDisabled();
    expect(await harness.db.data.revisions.listForCook('cook-a')).toEqual([]);
  });

  it('lets the title be changed on a reviewed cook', async () => {
    await cook('cook-done', 'Pork chops', 'Good.');
    await harness.render(<CookScreen cookId="cook-done" onBack={() => {}} onReview={() => {}} />);

    await fireEvent.press(await screen.findByTestId('cook-title'));
    await fireEvent.changeText(screen.getByTestId('cook-title-input'), 'Pork chops, brined');
    await fireEvent.press(screen.getByTestId('cook-title-save'));

    expect(await screen.findByText('Pork chops, brined')).toBeOnTheScreen();
    expect((await harness.db.data.cooks.findById('cook-done'))?.title).toBe('Pork chops, brined');
  });

  it('still lets tags be added and taken off a reviewed cook', async () => {
    await cook('cook-done', 'Pork chops', 'Good.');
    await harness.render(<CookScreen cookId="cook-done" onBack={() => {}} onReview={() => {}} />);

    await fireEvent.changeText(await screen.findByTestId('tag-input'), 'brine');
    await fireEvent.press(screen.getByTestId('tag-add'));
    const chip = await screen.findByText('brine');
    expect(chip).toBeOnTheScreen();
    expect((await harness.db.data.cookTags.listForCook('cook-done')).map((tag) => tag.name)).toEqual(['brine']);

    const [tag] = await harness.db.data.cookTags.listForCook('cook-done');
    await fireEvent.press(screen.getByTestId(`cook-tag-${tag?.id ?? ''}`));
    await waitFor(async () => expect(await harness.db.data.cookTags.listForCook('cook-done')).toEqual([]));
  });
});

describe('Review', () => {
  it('shows a note’s newest words, marked edited, and offers no editing there', async () => {
    await cook('cook-a', 'Bread');
    await harness.storage.data.capture.reviseNote(
      'cook-a-note',
      'Salted at 7.',
      { id: 'rev-1' },
      'user',
      harness.tick(),
    );
    await harness.render(<ReviewScreen cookId="cook-a" onBack={() => {}} onFinished={() => {}} />);

    expect(await screen.findByText('Salted at 7.')).toBeOnTheScreen();
    expect(screen.getByText(EDITED)).toBeOnTheScreen();
    expect(screen.queryByTestId('note-cook-a-note-more')).toBeNull();
  });
});
