/**
 * Typed words are never dropped without warning (0.4.0, part 6).
 *
 * In the second test build's acceptance run a title typed into the title box
 * was lost when the keyboard was closed with Back and Save title was never
 * tapped; the cook was reviewed as "Untitled cook". Every one-line edit now
 * does one of two things when the field is left (it loses focus, or the
 * keyboard closes while it has focus):
 *
 *   saves, as its Save would    the title, Rename on Who's eating, Other's
 *                               cuisine words, a person's own line on Who ate
 *                               it?; an unchanged or empty one saves nothing;
 *   keeps the words, Save shown a tag (and Done adds it), a note being
 *                               edited (and Edit on another note saves it),
 *                               the Add a reading value, a guest's name, a
 *                               new person's name.
 *
 * Every screen is the real one, writing through the real services to real
 * SQLite. The people are made up: You, Guest and Guest 2.
 */

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { DeviceEventEmitter, Platform } from 'react-native';

import type { EvidenceDecision } from '../src/domain/evidence';
import { CookScreen } from '../src/screens/CookScreen';
import { HouseholdScreen } from '../src/screens/HouseholdScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

async function startCook(id: string, title: string | null): Promise<void> {
  const { data, now } = harness.storage;
  granted(await data.capture.startCook({ id, title, startedAt: now() }, 'user', now()));
}

async function note(cookId: string, id: string, body: string): Promise<void> {
  granted(
    await harness.storage.data.capture.addEvent({ id, cookId, ts: harness.tick(), kind: 'user_note', body }, 'user'),
  );
}

async function household(...names: string[]): Promise<void> {
  for (const name of names) {
    granted(await harness.storage.data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
  }
}

/** Android's Back with the keyboard up: the keyboard goes, the field keeps focus. */
async function closeKeyboard(): Promise<void> {
  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { height: 0, screenX: 0, screenY: 800, width: 360 } });
  });
}

/** Typing into a field the way a person does: it has focus first. */
async function typeInto(testID: string, words: string): Promise<void> {
  const field = await screen.findByTestId(testID);
  await fireEvent(field, 'focus');
  await fireEvent.changeText(field, words);
}

const title = async (id: string) => (await harness.db.data.cooks.findById(id))?.title ?? null;

beforeEach(async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  harness = await openScreenHarness();
});

afterEach(async () => {
  await cleanup();
  await harness.close();
  jest.restoreAllMocks();
});

describe('the title saves when its field is left', () => {
  beforeEach(async () => {
    await startCook('cook-1', null);
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
    await fireEvent.press(await screen.findByTestId('cook-title'));
  });

  it('when the keyboard is closed with Back, without Save title', async () => {
    await typeInto('cook-title-input', '  Test lemon tart ');
    await closeKeyboard();
    await waitFor(async () => expect(await title('cook-1')).toBe('Test lemon tart'));
    expect(await screen.findByTestId('cook-title')).toHaveTextContent('Test lemon tart');
    expect(screen.queryByTestId('cook-title-input')).toBeNull();
  });

  it('when the field loses focus', async () => {
    await typeInto('cook-title-input', 'Test lemon tart');
    await fireEvent(screen.getByTestId('cook-title-input'), 'blur');
    await waitFor(async () => expect(await title('cook-1')).toBe('Test lemon tart'));
    expect(await screen.findByTestId('cook-title')).toHaveTextContent('Test lemon tart');
  });

  it('once, when Back closes the keyboard and then the field loses focus', async () => {
    const update = jest.spyOn(harness.storage.data.capture, 'updateCook');
    await typeInto('cook-title-input', 'Test lemon tart');
    // Both at once, before the first save is back.
    const field = screen.getByTestId('cook-title-input');
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', {});
      field.props.onBlur?.({ nativeEvent: {} });
    });
    await waitFor(async () => expect(await title('cook-1')).toBe('Test lemon tart'));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('and an empty title saves nothing, leaving the field open', async () => {
    const update = jest.spyOn(harness.storage.data.capture, 'updateCook');
    await typeInto('cook-title-input', '   ');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('cook-title-input'), 'blur');
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByTestId('cook-title-input')).toBeOnTheScreen();
    expect(screen.getByTestId('cook-title-save')).toBeOnTheScreen();
  });

  it('but not after Cancel', async () => {
    await typeInto('cook-title-input', 'Test words not wanted');
    await fireEvent.press(screen.getByText('Cancel'));
    await closeKeyboard();
    expect(await title('cook-1')).toBeNull();
  });
});

describe('an unchanged title', () => {
  it('saves nothing when its field is left', async () => {
    await startCook('cook-1', 'Test lemon tart');
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
    await fireEvent.press(await screen.findByTestId('cook-title'));
    const update = jest.spyOn(harness.storage.data.capture, 'updateCook');
    await typeInto('cook-title-input', ' Test lemon tart ');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('cook-title-input'), 'blur');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('Rename on Who’s eating saves when its field is left', () => {
  const names = async () => (await harness.db.data.household.list()).map((member) => member.name);

  beforeEach(async () => {
    await household('You', 'Guest');
    await harness.render(<HouseholdScreen onBack={() => {}} />);
    await fireEvent.press(await screen.findByTestId('household-rename-m-guest'));
  });

  it('when the keyboard closes', async () => {
    await typeInto('household-rename-input-m-guest', 'Guest 2');
    await closeKeyboard();
    await waitFor(async () => expect(await names()).toEqual(['You', 'Guest 2']));
    expect(screen.queryByTestId('household-rename-input-m-guest')).toBeNull();
  });

  it('once, when Return both submits and leaves the field', async () => {
    const rename = jest.spyOn(harness.storage.data.householdWorkflow, 'rename');
    await typeInto('household-rename-input-m-guest', 'Guest 2');
    // Return submits and then blurs the field, before the first save is back.
    const field = screen.getByTestId('household-rename-input-m-guest');
    await act(async () => {
      field.props.onSubmitEditing?.({ nativeEvent: { text: 'Guest 2' } });
      field.props.onBlur?.({ nativeEvent: {} });
    });
    await waitFor(async () => expect(await names()).toEqual(['You', 'Guest 2']));
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('and an unchanged or empty name saves nothing', async () => {
    const rename = jest.spyOn(harness.storage.data.householdWorkflow, 'rename');
    await typeInto('household-rename-input-m-guest', 'Guest');
    await closeKeyboard();
    await fireEvent.changeText(screen.getByTestId('household-rename-input-m-guest'), ' ');
    await fireEvent(screen.getByTestId('household-rename-input-m-guest'), 'blur');
    expect(rename).not.toHaveBeenCalled();
    expect(await names()).toEqual(['You', 'Guest']);
  });

  it('while a new person’s name keeps its words with Add in sight', async () => {
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByTestId('household-add-someone'));
    await typeInto('household-name', 'Guest 2');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('household-name'), 'blur');
    expect(screen.getByTestId('household-name')).toHaveDisplayValue('Guest 2');
    expect(screen.getByTestId('household-add')).toBeEnabled();
    expect(await names()).toEqual(['You', 'Guest']);
  });
});

describe('on the review', () => {
  beforeEach(async () => {
    await household('You', 'Guest');
    await startCook('cook-1', 'Test moussaka');
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={() => {}} />);
  });

  it('Other’s cuisine words save when their field is left', async () => {
    await fireEvent.press(await screen.findByTestId('cuisine-other'));
    await typeInto('cuisine-other-input', ' Test home baking ');
    await closeKeyboard();
    await waitFor(async () =>
      expect(await harness.db.data.cuisines.findForCook('cook-1')).toMatchObject({
        cuisine: 'other',
        otherWords: 'Test home baking',
      }),
    );
    expect(await screen.findByTestId('cuisine-other-chosen')).toHaveTextContent('Test home baking');
    expect(screen.queryByTestId('cuisine-other-input')).toBeNull();
  });

  it('Other’s words save once when Return both submits and leaves the field', async () => {
    const onChange = jest.spyOn(harness.storage.data.cookRecord, 'setCuisine');
    await fireEvent.press(await screen.findByTestId('cuisine-other'));
    await typeInto('cuisine-other-input', 'Test home baking');
    const field = screen.getByTestId('cuisine-other-input');
    await act(async () => {
      field.props.onSubmitEditing?.({ nativeEvent: { text: 'Test home baking' } });
      field.props.onBlur?.({ nativeEvent: {} });
    });
    await waitFor(async () =>
      expect(await harness.db.data.cuisines.findForCook('cook-1')).toMatchObject({ otherWords: 'Test home baking' }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('empty Other words save nothing', async () => {
    await fireEvent.press(await screen.findByTestId('cuisine-other'));
    await typeInto('cuisine-other-input', '  ');
    await fireEvent(screen.getByTestId('cuisine-other-input'), 'blur');
    expect(await harness.db.data.cuisines.findForCook('cook-1')).toBeNull();
    expect(screen.getByTestId('cuisine-other-input')).toBeOnTheScreen();
  });

  it('a person’s own line saves when its field is left, stars kept', async () => {
    await fireEvent.press(await screen.findByTestId('who-ate-it-member-m-you-star-4'));
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1'))[0]?.stars).toBe(4),
    );
    await fireEvent.press(screen.getByTestId('who-ate-it-member-m-you-pencil'));
    await typeInto('who-ate-it-member-m-you-line-input', 'Test line, more lemon');
    await closeKeyboard();
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1'))[0]).toMatchObject({
        memberId: 'm-you',
        stars: 4,
        line: 'Test line, more lemon',
      }),
    );
    expect(await screen.findByTestId('who-ate-it-member-m-you-line')).toHaveTextContent('Test line, more lemon');
  });

  it('only the field with focus saves when the keyboard closes', async () => {
    await fireEvent.press(await screen.findByTestId('who-ate-it-member-m-you-pencil'));
    await fireEvent.press(screen.getByTestId('who-ate-it-member-m-guest-pencil'));
    await fireEvent.changeText(screen.getByTestId('who-ate-it-member-m-you-line-input'), 'Test words, no focus');
    await typeInto('who-ate-it-member-m-guest-line-input', 'Test line for Guest');
    await closeKeyboard();
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1')).map((r) => [r.memberId, r.line])).toEqual([
        ['m-guest', 'Test line for Guest'],
      ]),
    );
    expect(screen.getByTestId('who-ate-it-member-m-you-line-input')).toHaveDisplayValue('Test words, no focus');
  });

  it('a guest’s name keeps its words with Add in sight', async () => {
    await fireEvent.press(await screen.findByTestId('who-ate-it-someone-else'));
    await typeInto('who-ate-it-guest-name', 'Guest 2');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('who-ate-it-guest-name'), 'blur');
    expect(screen.getByTestId('who-ate-it-guest-name')).toHaveDisplayValue('Guest 2');
    expect(screen.getByTestId('who-ate-it-guest-add')).toBeEnabled();
  });
});

describe('on the cook page', () => {
  beforeEach(async () => {
    await startCook('cook-1', 'Test lemon tart');
    await note('cook-1', 'note-a', 'Test note A.');
    await note('cook-1', 'note-b', 'Test note B.');
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
  });

  const tagNames = async () => (await harness.db.data.cookTags.listForCook('cook-1')).map((tag) => tag.name);

  it('a tag keeps its words with Add in sight when the keyboard closes, and adds nothing', async () => {
    await fireEvent.press(await screen.findByTestId('tag-open'));
    await typeInto('tag-input', 'test tart');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('tag-input'), 'blur');
    expect(screen.getByTestId('tag-input')).toHaveDisplayValue('test tart');
    expect(screen.getByTestId('tag-add')).toBeEnabled();
    expect(await tagNames()).toEqual([]);
  });

  it('a note being edited keeps its words and Save when the keyboard closes', async () => {
    await fireEvent.press(await screen.findByTestId('note-note-a-more'));
    await fireEvent.press(await screen.findByTestId('note-note-a-edit'));
    await typeInto('note-note-a-edit-input', 'Test note A, changed.');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('note-note-a-edit-input'), 'blur');
    expect(screen.getByTestId('note-note-a-edit-input')).toHaveDisplayValue('Test note A, changed.');
    expect(screen.getByTestId('note-note-a-edit-save')).toBeEnabled();
    expect(await harness.db.data.revisions.listForCook('cook-1')).toEqual([]);
  });

  it('a cancelled note edit saves nothing', async () => {
    await fireEvent.press(await screen.findByTestId('note-note-a-more'));
    await fireEvent.press(await screen.findByTestId('note-note-a-edit'));
    await typeInto('note-note-a-edit-input', 'Test words not wanted.');
    await fireEvent.press(screen.getByTestId('note-note-a-edit-cancel'));
    await closeKeyboard();
    expect(await harness.db.data.revisions.listForCook('cook-1')).toEqual([]);
  });

  it('the Add a reading value keeps its number and Add reading when the keyboard closes', async () => {
    await fireEvent.press(await screen.findByTestId('oven-reading-toggle'));
    await typeInto('temperature-celsius', '180');
    await closeKeyboard();
    await fireEvent(screen.getByTestId('temperature-celsius'), 'blur');
    expect(screen.getByTestId('temperature-celsius')).toHaveDisplayValue('180');
    expect(screen.getByTestId('temperature-save')).toBeOnTheScreen();
    const readings = (await harness.db.data.cookEvents.listForCook({ cookId: 'cook-1' })).filter((e) => e.kind === 'temp');
    expect(readings).toEqual([]);
  });
});
