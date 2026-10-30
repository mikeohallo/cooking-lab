/**
 * Two fixes from the 0.2.2 test run (0.3.0), on a real cook page.
 *
 *   N3  On the cover display with the keyboard up, the note editor's Save and
 *       Cancel stay visible: they sit above the field, and opening the editor
 *       asks the page to scroll it to the top of the screen.
 *   ⋯   A note's ⋯ sits at the top right of the note, and the menu it opens
 *       comes up at the top too — reachable on a long note without scrolling.
 */

import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ScreenScrollContext } from '../src/layout/ScreenScroll';
import { CookScreen } from '../src/screens/CookScreen';
import { EditableWords } from '../src/screens/cook/EditableWords';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

type JsonNode = { readonly props?: Record<string, unknown>; readonly children?: readonly (JsonNode | string)[] | null };

function testIDsInOrder(): readonly string[] {
  const ids: string[] = [];
  const walk = (node: JsonNode | string | null | undefined) => {
    if (node === null || node === undefined || typeof node === 'string') {
      return;
    }
    if (typeof node.props?.testID === 'string') {
      ids.push(node.props.testID);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  const tree = screen.toJSON() as JsonNode | readonly JsonNode[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) {
    walk(top as JsonNode | null);
  }
  return ids;
}

const LONG_NOTE = Array.from({ length: 40 }, (_, index) => `Line ${index + 1} of a pasted method.`).join('\n');

beforeEach(async () => {
  harness = await openScreenHarness();
  const { data, now } = harness.storage;
  await data.capture.startCook({ id: 'cook-1', title: 'Bread', startedAt: now() }, 'user', now());
  await data.capture.addEvent(
    { id: 'note-1', cookId: 'cook-1', ts: harness.tick(), kind: 'user_note', body: LONG_NOTE },
    'user',
  );
});

afterEach(async () => {
  await cleanup();
  await harness.close();
});

it('puts the ⋯ before the long words, and opens its menu above them', async () => {
  await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
  await screen.findByTestId('note-note-1-words');

  // Top right: in the same row as the words, laid out at the top.
  const more = screen.getByTestId('note-note-1-more');
  const flat = (style: unknown): Record<string, unknown> =>
    Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
  expect(flat(typeof more.props.style === 'function' ? more.props.style({ pressed: false }) : more.props.style).alignSelf).toBe('flex-start');

  await fireEvent.press(more);
  const order = testIDsInOrder();
  expect(order.indexOf('note-note-1-menu')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('note-note-1-menu')).toBeLessThan(order.indexOf('note-note-1-words'));
});

it('puts Save and Cancel above the field in the editor, and scrolls the editor into view', async () => {
  await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
  await fireEvent.press(await screen.findByTestId('note-note-1-more'));
  await fireEvent.press(screen.getByTestId('note-note-1-edit'));

  const order = testIDsInOrder();
  expect(order.indexOf('note-note-1-edit-save')).toBeLessThan(order.indexOf('note-note-1-edit-input'));
  expect(order.indexOf('note-note-1-edit-cancel')).toBeLessThan(order.indexOf('note-note-1-edit-input'));
});

it('asks the screen to reveal the editor when it opens', async () => {
  const reveal = jest.fn();
  const element: ReactElement = (
    <ScreenScrollContext.Provider value={{ reveal }}>
      <EditableWords
        words="Short note."
        edited={false}
        editable
        onSave={async () => null}
        onShowVersions={() => {}}
        actionsLabel="More actions for this note"
        editLabel="Edit note"
        testID="note-x"
      />
    </ScreenScrollContext.Provider>
  );
  await harness.render(element);
  await fireEvent.press(screen.getByTestId('note-x-more'));
  expect(reveal).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('note-x-edit'));
  expect(reveal).toHaveBeenCalledTimes(1);
});
