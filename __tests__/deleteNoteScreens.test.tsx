/**
 * Delete note on screen (0.4.0, part 4), on the cover screen.
 *
 * Real screens, real services, real SQLite. Note options ends with Delete
 * note in the danger colour; there is no "are you sure?"; the note goes at
 * once and "Note deleted · Undo" is up for `UNDO_WINDOW_MS`; Undo brings it
 * back as it was; the window passing deletes it and its earlier versions for
 * good; and leaving before then keeps it. The inner screen's sheet is in
 * `innerScreens.test.tsx`; the store's side is in `deleteNote.test.ts`.
 */

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { DELETE_NOTE, EDITED, NOTE_DELETED } from '../src/content/product';
import { UNDO_WINDOW_MS } from '../src/data/deletion/workflow';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { palettes } from '../src/theme/tokens';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

/** An open cook with three notes, the middle one edited twice, a reading, and a second cook. */
async function notebook(): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id: 'cook-roast', title: 'Roast chicken', startedAt: now() }, 'user', now());
  const add = (id: string, body: string) =>
    data.capture.addEvent({ id, cookId: 'cook-roast', ts: harness.tick(), kind: 'user_note', body }, 'user');
  await add('n-1', 'Salted the night before.');
  await add('n-2', 'Skin crisping nicely.');
  await data.capture.addEvent(
    { id: 't-1', cookId: 'cook-roast', ts: harness.tick(), kind: 'temp', meta: { celsius: 220, readingKind: 'oven' } },
    'user',
  );
  await add('n-3', 'Rested twenty minutes.');
  await data.capture.reviseNote('n-2', 'Skin crisping, turned it up.', { id: 'rev-1' }, 'user', harness.tick());
  await data.capture.reviseNote('n-2', 'Skin crisping, turned it up to 220.', { id: 'rev-2' }, 'user', harness.tick());

  await data.capture.startCook({ id: 'cook-other', title: 'Porridge', startedAt: now() }, 'user', now());
  await data.capture.addEvent(
    { id: 'n-other', cookId: 'cook-other', ts: harness.tick(), kind: 'user_note', body: 'Oats soaked.' },
    'user',
  );
}

function noteIds(): string[] {
  return within(screen.getByTestId('notes'))
    .queryAllByTestId(/^event-n-/)
    .map((node) => String(node.props.testID));
}

async function openDelete(noteId: string): Promise<void> {
  await fireEvent.press(await screen.findByTestId(`note-${noteId}-more`));
  await fireEvent.press(await screen.findByTestId(`note-${noteId}-delete`));
}

beforeEach(async () => {
  harness = await openScreenHarness();
  await notebook();
});

afterEach(async () => {
  jest.useRealTimers();
  await cleanup();
  await harness.close();
});

describe('Note options', () => {
  it('ends with Delete note, a button labelled for a screen reader, in the danger colour', async () => {
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    await fireEvent.press(await screen.findByTestId('note-n-2-more'));
    const menu = await screen.findByTestId('note-n-2-menu');

    const rows = [
      within(menu).getByTestId('note-n-2-edit'),
      within(menu).getByTestId('note-n-2-versions'),
      within(menu).getByTestId('note-n-2-delete'),
    ];
    expect(rows.map((row) => row.props.testID)).toEqual(['note-n-2-edit', 'note-n-2-versions', 'note-n-2-delete']);

    const button = within(menu).getByLabelText('Delete note');
    expect(button.props.accessibilityRole).toBe('button');
    const label = within(button).getByText(DELETE_NOTE);
    expect(StyleSheet.flatten(label.props.style).color).toBe(palettes.light.danger);
  });

  it('offers Delete note on a reviewed cook too', async () => {
    await harness.storage.data.capture.saveReview('cook-roast', 'Very good.', 'user', harness.tick());
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    await openDelete('n-1');
    await waitFor(() => expect(screen.queryByTestId('event-n-1')).toBeNull());
    expect(screen.getByText(NOTE_DELETED)).toBeOnTheScreen();
  });
});

describe('Delete note', () => {
  it('takes the note off at once, asks nothing, and writes nothing yet', async () => {
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    expect(await screen.findByLabelText('Notes, 3')).toBeOnTheScreen();

    await openDelete('n-2');

    await waitFor(() => expect(screen.queryByTestId('event-n-2')).toBeNull());
    expect(screen.queryByTestId('note-n-2-menu')).toBeNull();
    expect(screen.getByLabelText('Notes, 2')).toBeOnTheScreen();
    expect(within(screen.getByTestId('undo-bar')).getByText(NOTE_DELETED)).toBeOnTheScreen();
    expect(screen.getByTestId('undo-delete').props.accessibilityHint).toBe('Brings the note back exactly as it was');
    expect(await harness.db.data.cookEvents.findById('n-2')).not.toBeNull();
    expect(harness.storage.noteDeletions.pending().has('n-2')).toBe(true);
  });

  it('Undo brings it back in its place, with its words and its earlier versions', async () => {
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('event-n-2');
    const before = noteIds();

    await openDelete('n-2');
    await waitFor(() => expect(screen.queryByTestId('event-n-2')).toBeNull());
    await fireEvent.press(screen.getByTestId('undo-delete'));

    expect(await screen.findByTestId('event-n-2')).toBeOnTheScreen();
    expect(noteIds()).toEqual(before);
    expect(screen.getByText('Skin crisping, turned it up to 220.')).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-bar')).toBeNull();
    await fireEvent.press(screen.getByTestId('note-n-2-more'));
    const menu = await screen.findByTestId('note-n-2-menu');
    expect(within(menu).getByText(EDITED, { exact: false })).toBeOnTheScreen();
    expect(within(menu).getByLabelText('Earlier versions, 2')).toBeOnTheScreen();
    expect(await harness.db.data.revisions.listForCook('cook-roast')).toHaveLength(2);
  });

  it('deletes it for good, with its earlier versions, once the window has passed', async () => {
    jest.useFakeTimers();
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    await openDelete('n-2');
    await waitFor(() => expect(screen.getByTestId('undo-bar')).toBeOnTheScreen());

    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });

    await waitFor(() => expect(screen.queryByTestId('undo-bar')).toBeNull());
    await waitFor(async () => expect(await harness.db.data.cookEvents.findById('n-2')).toBeNull());
    expect(await harness.db.data.revisions.listForCook('cook-roast')).toEqual([]);
    expect(screen.queryByTestId('event-n-2')).toBeNull();
    expect(noteIds()).toEqual(['event-n-1', 'event-n-3']);
    expect(screen.getByLabelText('Notes, 2')).toBeOnTheScreen();
    // The reading, the other notes and the other cook are still there.
    expect(await harness.db.data.cookEvents.findById('t-1')).not.toBeNull();
    expect(await harness.db.data.cookEvents.findById('n-other')).not.toBeNull();
  });

  it('keeps the note when the app closes during the window', async () => {
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    await openDelete('n-3');
    await waitFor(() => expect(screen.getByTestId('undo-bar')).toBeOnTheScreen());

    // The app goes before the window passes.
    await cleanup();

    expect(await harness.db.data.cookEvents.findById('n-3')).not.toBeNull();
    expect(harness.storage.noteDeletions.pending().size).toBe(0);
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    expect(await screen.findByTestId('event-n-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('undo-bar')).toBeNull();
  });

  it('leaves a note waiting on Undo out of Export this cook and Export everything', async () => {
    await harness.render(<CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />);
    await openDelete('n-2');
    await waitFor(() => expect(screen.getByTestId('undo-bar')).toBeOnTheScreen());

    await harness.storage.exporter.exportCook('cook-roast');
    await harness.storage.exporter.exportEverything();

    for (const file of harness.sink.shared) {
      expect(file.text).not.toContain('Skin crisping');
      expect(file.text).toContain('Salted the night before.');
    }
  });
});

describe('the counts', () => {
  // Since 0.4.1 Cooking now shows just the dish: the count is read out in the
  // card's accessibility label, not drawn.
  const spoken = (testID: string) => String(screen.getByTestId(testID).props.accessibilityLabel);

  it('Cooking now’s “3 notes” becomes “2 notes”, and back with Undo', async () => {
    await harness.render(
      <View>
        <HomeScreen onOpenCook={() => {}} />
        <CookScreen cookId="cook-roast" onBack={() => {}} onReview={() => {}} />
      </View>,
    );
    await screen.findByTestId('cook-card-cook-roast');
    await waitFor(() => expect(spoken('cook-card-cook-roast')).toContain('3 notes'));

    await openDelete('n-1');
    await waitFor(() => expect(spoken('cook-card-cook-roast')).toContain('2 notes'));
    expect(spoken('cook-card-cook-other')).toContain('1 note');

    await fireEvent.press(screen.getAllByTestId('undo-delete')[0]!);
    await waitFor(() => expect(spoken('cook-card-cook-roast')).toContain('3 notes'));
  });
});
