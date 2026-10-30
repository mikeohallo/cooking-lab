/**
 * Update 2 on screen (0.3.0): meal type, ingredients, "Who ate it?", the
 * household, the review's new order, Cook this again with its "Last time"
 * card, History's search and filters, and the text export.
 *
 * Every screen is the real one, writing through the real services to real
 * SQLite. The people are made up: Alex, Sam and Jo.
 */

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';

import {
  EDITED,
  HOUSEHOLD_DONE,
  NEXT_TIME,
  NEXT_TIME_HINT,
  ORIGINAL_VERSION,
  WHO_ATE_IT,
  WHO_USUALLY_EATS,
  YOUR_NOTES,
  ingredientsShowAll,
} from '../src/content/product';
import { HOUSEHOLD_ASKED_KEY } from '../src/data/sqlite/cookRecord';
import type { EvidenceDecision } from '../src/domain/evidence';
import { CookScreen } from '../src/screens/CookScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { HouseholdScreen } from '../src/screens/HouseholdScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

type JsonNode = { readonly props?: Record<string, unknown>; readonly children?: readonly (JsonNode | string)[] | null };

/** Everything rendered, depth first, in screen order: strings and testIDs. */
function inOrder(): { readonly texts: readonly string[]; readonly testIDs: readonly string[] } {
  const texts: string[] = [];
  const testIDs: string[] = [];
  const walk = (node: JsonNode | string | null | undefined) => {
    if (node === null || node === undefined) {
      return;
    }
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    const id = node.props?.testID;
    if (typeof id === 'string') {
      testIDs.push(id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  const tree = screen.toJSON() as JsonNode | readonly JsonNode[] | null;
  for (const top of Array.isArray(tree) ? tree : [tree]) {
    walk(top as JsonNode | null);
  }
  return { texts, testIDs };
}

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

async function startCook(id: string, title: string): Promise<void> {
  const { data, now } = harness.storage;
  granted(await data.capture.startCook({ id, title, startedAt: now() }, 'user', now()));
}

async function note(cookId: string, body: string): Promise<void> {
  granted(
    await harness.storage.data.capture.addEvent(
      { id: `${cookId}-${body.length}-${harness.tick()}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(), cookId, ts: harness.tick(), kind: 'user_note', body },
      'user',
    ),
  );
}

async function household(...names: string[]): Promise<void> {
  for (const name of names) {
    granted(await harness.storage.data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
  }
}

beforeEach(async () => {
  harness = await openScreenHarness();
});

afterEach(async () => {
  await cleanup();
  await harness.close();
});

describe('meal type on a cook', () => {
  it('sets it with one tap, labels the cook above its title, and clears it with a second tap', async () => {
    await startCook('cook-1', 'Porridge');
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);

    const chip = await screen.findByTestId('meal-type-breakfast');
    expect(screen.getByRole('radio', { name: 'Breakfast' })).toBeOnTheScreen();
    expect(screen.queryByTestId('cook-meal-label')).toBeNull();

    await fireEvent.press(chip);
    await waitFor(() => expect(screen.getByTestId('cook-meal-label')).toHaveTextContent('Breakfast'));
    expect(await harness.db.data.mealTypes.findForCook('cook-1')).toMatchObject({ mealType: 'breakfast' });

    await fireEvent.press(screen.getByTestId('meal-type-breakfast'));
    await waitFor(() => expect(screen.queryByTestId('cook-meal-label')).toBeNull());
    expect(await harness.db.data.mealTypes.findForCook('cook-1')).toBeNull();
  });

  it('shows the label on Home and lets "Who’s eating" be reached from there', async () => {
    await startCook('cook-1', 'Brownies');
    granted(await harness.storage.data.cookRecord.setMealType('cook-1', 'dessert', 'user', harness.tick()));
    const onHousehold = jest.fn();
    await harness.render(<HomeScreen onOpenCook={() => {}} onHistory={() => {}} onHousehold={onHousehold} />);

    expect(await screen.findByTestId('cook-meal-cook-1')).toHaveTextContent('Dessert');
    await fireEvent.press(screen.getByTestId('whos-eating'));
    expect(onHousehold).toHaveBeenCalled();
  });
});

describe('the Ingredients box', () => {
  const LIST = ['4 eggs', '1 tin tomatoes', '1 onion', '2 peppers', '100 g feta', 'cumin'].join('\n');

  it('is a field before cooking; saved, it folds to four lines once the timeline starts', async () => {
    await startCook('cook-1', 'Shakshuka');
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);

    await fireEvent.changeText(await screen.findByTestId('ingredients-input'), LIST);
    await fireEvent.press(screen.getByTestId('ingredients-save'));
    await waitFor(() => expect(screen.getByTestId('ingredients-text')).toHaveTextContent('100 g feta', { exact: false }));
    // No timeline yet: all of it.
    expect(screen.queryByTestId('ingredients-show-all')).toBeNull();

    await cleanup();
    await note('cook-1', 'Onions in.');
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
    const text = await screen.findByTestId('ingredients-text');
    expect(text).toHaveTextContent('2 peppers', { exact: false });
    expect(text).not.toHaveTextContent('100 g feta', { exact: false });
    expect(screen.getByText(ingredientsShowAll(6))).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('ingredients-show-all'));
    expect(screen.getByTestId('ingredients-text')).toHaveTextContent('cumin', { exact: false });
    // The composer is still the page's pinned footer.
    expect(screen.getByTestId('screen-footer')).toBeOnTheScreen();
  });

  it('keeps the earlier list when edited: "edited" opens it', async () => {
    await startCook('cook-1', 'Dal');
    granted(await harness.storage.data.cookRecord.saveIngredients('cook-1', 'red lentils', { id: 'ing-1' }, 'user', harness.tick()));
    await note('cook-1', 'Lentils rinsed.');
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);

    await fireEvent.press(await screen.findByTestId('ingredients-edit'));
    // Save sits above the field, out of the keyboard's way.
    expect(screen.getByTestId('ingredients-editor')).toBeOnTheScreen();
    const order = inOrder().testIDs;
    expect(order.indexOf('ingredients-save')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('ingredients-save')).toBeLessThan(order.indexOf('ingredients-input'));

    await fireEvent.changeText(screen.getByTestId('ingredients-input'), 'red lentils\nginger');
    await fireEvent.press(screen.getByTestId('ingredients-save'));
    await waitFor(() => expect(screen.getByTestId('ingredients-text')).toHaveTextContent('ginger', { exact: false }));
    await fireEvent.press(screen.getByText(EDITED));
    expect(await screen.findByText(`${ORIGINAL_VERSION}`, { exact: false })).toBeOnTheScreen();
    expect(screen.getByText('red lentils')).toBeOnTheScreen();
    expect(await harness.db.data.ingredients.listForCook('cook-1')).toHaveLength(2);
  });
});

describe('the review', () => {
  it('asks "Who usually eats?" the first time, with nobody on the list, and not again', async () => {
    await startCook('cook-1', 'Risotto');
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={() => {}} />);

    expect(await screen.findByText(WHO_USUALLY_EATS)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('household-prompt-editor-name'), 'Alex');
    await fireEvent.press(screen.getByTestId('household-prompt-editor-add'));
    await waitFor(() => expect(screen.getByTestId('household-prompt-editor-member-id-01')).toBeOnTheScreen());
    await fireEvent.press(screen.getByText(HOUSEHOLD_DONE));
    await waitFor(() => expect(screen.queryByTestId('household-prompt')).toBeNull());
    expect(await harness.db.data.settings.get(HOUSEHOLD_ASKED_KEY)).toBe('yes');

    // The new person's row is there at once.
    expect(screen.getByText('Alex')).toBeOnTheScreen();
  });

  it('can be skipped, and is not asked again', async () => {
    await startCook('cook-1', 'Risotto');
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={() => {}} />);
    await fireEvent.press(await screen.findByTestId('household-prompt-skip'));
    await waitFor(() => expect(screen.queryByTestId('household-prompt')).toBeNull());

    await cleanup();
    await startCook('cook-2', 'Soup');
    await harness.render(<ReviewScreen cookId="cook-2" onBack={() => {}} onFinished={() => {}} />);
    await screen.findByTestId('review-screen');
    await screen.findByTestId('who-ate-it');
    expect(screen.queryByText(WHO_USUALLY_EATS)).toBeNull();
  });

  it('is in order — who ate it, meal type, your notes, next time — and nothing on it is required', async () => {
    await household('Alex', 'Sam');
    await startCook('cook-1', 'Risotto');
    const onFinished = jest.fn();
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={onFinished} />);
    await screen.findByTestId('who-ate-it');

    const { texts } = inOrder();
    const at = (label: string) => texts.indexOf(label);
    expect(at(WHO_ATE_IT)).toBeGreaterThanOrEqual(0);
    expect(at(WHO_ATE_IT)).toBeLessThan(at('Breakfast'));
    expect(at('Breakfast')).toBeLessThan(at(YOUR_NOTES));
    expect(at(YOUR_NOTES)).toBeLessThan(at(NEXT_TIME));
    expect(screen.getByText(NEXT_TIME_HINT)).toBeOnTheScreen();
    expect(screen.queryByTestId('household-prompt')).toBeNull();

    await fireEvent.press(screen.getByTestId('finish-review'));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('cook-1'));
    expect(await harness.db.data.ratings.listForCook('cook-1')).toEqual([]);
  });

  it('rates with labelled star buttons, N/A, a line and a guest — each saved at once', async () => {
    await household('Alex', 'Sam');
    await startCook('cook-1', 'Risotto');
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={() => {}} />);
    const alexRow = await screen.findByTestId('who-ate-it-member-m-alex');

    // Five star buttons, named for TalkBack.
    for (const name of ['1 star', '2 stars', '3 stars', '4 stars', '5 stars']) {
      expect(within(alexRow).getByRole('radio', { name })).toBeOnTheScreen();
    }
    await fireEvent.press(within(alexRow).getByRole('radio', { name: '4 stars' }));
    await waitFor(async () =>
      expect(await harness.db.data.ratings.listForCook('cook-1')).toEqual([
        expect.objectContaining({ memberId: 'm-alex', stars: 4, notEaten: false }),
      ]),
    );

    const samRow = screen.getByTestId('who-ate-it-member-m-sam');
    await fireEvent.press(within(samRow).getByTestId('who-ate-it-member-m-sam-na'));
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1')).find((r) => r.memberId === 'm-sam')).toMatchObject({
        stars: null,
        notEaten: true,
      }),
    );

    await fireEvent.press(within(alexRow).getByTestId('who-ate-it-member-m-alex-add-line'));
    await fireEvent.changeText(screen.getByTestId('who-ate-it-member-m-alex-line-input'), 'Creamy.');
    await fireEvent.press(screen.getByTestId('who-ate-it-member-m-alex-line-save'));
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1')).find((r) => r.memberId === 'm-alex')).toMatchObject({
        stars: 4,
        line: 'Creamy.',
      }),
    );

    await fireEvent.press(screen.getByTestId('who-ate-it-someone-else'));
    await fireEvent.changeText(screen.getByTestId('who-ate-it-guest-name'), 'Jo');
    await fireEvent.press(screen.getByTestId('who-ate-it-guest-add'));
    const joRow = await screen.findByTestId('who-ate-it-guest-jo');
    await fireEvent.press(within(joRow).getByRole('radio', { name: '5 stars' }));
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1')).find((r) => r.guestName === 'Jo')).toMatchObject({
        stars: 5,
        memberId: null,
      }),
    );

    // A tap on the chosen star clears it; with nothing else said, the rating goes.
    await fireEvent.press(within(screen.getByTestId('who-ate-it-guest-jo')).getByRole('radio', { name: '5 stars' }));
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1')).some((r) => r.guestName === 'Jo')).toBe(false),
    );
  });

  it('stores "Your notes" as the verdict and "Next time" as the user lesson', async () => {
    await household('Alex');
    await startCook('cook-1', 'Risotto');
    const onFinished = jest.fn();
    await harness.render(<ReviewScreen cookId="cook-1" onBack={() => {}} onFinished={onFinished} />);
    await fireEvent.changeText(await screen.findByTestId('verdict-input'), '  Rich.\nMore lemon.  ');
    await fireEvent.changeText(screen.getByTestId('takeaway-input'), 'Zest at the end.');
    await fireEvent.press(screen.getByTestId('meal-type-lunch_dinner'));
    await waitFor(async () => expect(await harness.db.data.mealTypes.findForCook('cook-1')).not.toBeNull());
    await fireEvent.press(screen.getByTestId('finish-review'));
    await waitFor(() => expect(onFinished).toHaveBeenCalled());

    expect((await harness.db.data.cooks.findById('cook-1'))?.verdict).toBe('  Rich.\nMore lemon.  ');
    expect(await harness.db.data.lessons.list({ cookId: 'cook-1', status: 'approved' })).toEqual([
      expect.objectContaining({ text: 'Zest at the end.' }),
    ]);
  });
});

describe('a reviewed cook, and cooking it again', () => {
  beforeEach(async () => {
    await household('Alex', 'Sam');
    await startCook('cook-1', 'Lamb tagine');
    const { data } = harness.storage;
    granted(await data.cookRecord.setMealType('cook-1', 'lunch_dinner', 'user', harness.tick()));
    granted(await data.cookRecord.saveIngredients('cook-1', 'lamb shoulder\napricots', { id: 'ing-1' }, 'user', harness.tick()));
    const tag = await data.tags.findOrCreate('tagine', null);
    await data.cookTags.link({ cookId: 'cook-1', tagId: tag.id });
    await note('cook-1', 'Browned.');
    granted(await data.capture.saveReview('cook-1', 'Tender.\nToo sweet.', 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { memberId: 'm-alex' }, { stars: 5, notEaten: false, line: null }, { id: 'r-1' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { memberId: 'm-sam' }, { stars: null, notEaten: true, line: null }, { id: 'r-2' }, 'user', harness.tick()));
    granted(await data.cookRecord.addNextTime('cook-1', 'Half the apricots.', { id: 'lesson-1' }, 'user', harness.tick()));
  });

  it('shows your notes, the ratings and next time, all changeable, and old notes word for word', async () => {
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} />);
    expect(await screen.findByText(YOUR_NOTES)).toBeOnTheScreen();
    expect(screen.getByTestId('verdict-words')).toHaveTextContent(/Tender\.\s+Too sweet\./);
    expect(screen.getByTestId('cook-meal-label')).toHaveTextContent('Lunch/Dinner');
    const ratings = screen.getByTestId('ratings-card');
    expect(within(ratings).getByTestId('who-ate-it-member-m-sam-na')).toBeChecked();

    // A rating changed after the review.
    await fireEvent.press(
      within(within(ratings).getByTestId('who-ate-it-member-m-alex')).getByRole('radio', { name: '3 stars' }),
    );
    await waitFor(async () =>
      expect((await harness.db.data.ratings.listForCook('cook-1')).find((r) => r.memberId === 'm-alex')?.stars).toBe(3),
    );

    // A next-time line edited, its first words kept.
    await fireEvent.press(screen.getByTestId('lesson-lesson-1-more'));
    await fireEvent.press(screen.getByTestId('lesson-lesson-1-edit'));
    await fireEvent.changeText(screen.getByTestId('lesson-lesson-1-edit-input'), 'A third of the apricots.');
    await fireEvent.press(screen.getByTestId('lesson-lesson-1-edit-save'));
    await waitFor(() => expect(screen.getByTestId('lesson-lesson-1-words')).toHaveTextContent('A third of the apricots.'));
    expect((await harness.db.data.lessons.findById('lesson-1'))?.text).toBe('Half the apricots.');

    // And a line added later.
    await fireEvent.press(screen.getByTestId('next-time-add'));
    await fireEvent.changeText(screen.getByTestId('next-time-input'), 'Toast the almonds.');
    await fireEvent.press(screen.getByTestId('next-time-save'));
    await waitFor(() => expect(screen.getByText('Toast the almonds.')).toBeOnTheScreen());
  });

  it('Cook this again starts a new open cook, which shows "Last time" and "2nd time cooking this"', async () => {
    const onOpenCook = jest.fn();
    await harness.render(<CookScreen cookId="cook-1" onBack={() => {}} onReview={() => {}} onOpenCook={onOpenCook} />);
    await fireEvent.press(await screen.findByTestId('cook-this-again'));
    await waitFor(() => expect(onOpenCook).toHaveBeenCalled());
    const newId = onOpenCook.mock.calls[0]?.[0] as string;
    const again = await harness.db.data.cooks.findById(newId);
    expect(again).toMatchObject({ title: 'Lamb tagine', status: 'open', parentCookId: 'cook-1' });
    expect((await harness.db.data.ingredients.listForCook(newId))[0]?.text).toBe('lamb shoulder\napricots');
    expect((await harness.db.data.cookTags.listForCook(newId)).map((t) => t.name)).toEqual(['tagine']);

    await cleanup();
    const openIt = jest.fn();
    await harness.render(<CookScreen cookId={newId} onBack={() => {}} onReview={() => {}} onOpenCook={openIt} />);
    const card = await screen.findByTestId('last-time');
    expect(within(card).getByText('Alex: 5 stars')).toBeOnTheScreen();
    expect(within(card).getByText('Sam: N/A (didn’t eat it)')).toBeOnTheScreen();
    expect(within(card).getByText('• Half the apricots.')).toBeOnTheScreen();
    expect(within(card).getByTestId('last-time-meal')).toHaveTextContent('Lunch/Dinner');
    expect(screen.getByTestId('times-cooked')).toHaveTextContent('2nd time cooking this');
    expect(screen.getByTestId('cook-meal-label')).toHaveTextContent('Lunch/Dinner');
    await fireEvent.press(within(card).getByTestId('last-time-open'));
    expect(openIt).toHaveBeenCalledWith('cook-1');

    // Folded to one line once the timeline has entries.
    await cleanup();
    await note(newId, 'Started.');
    await harness.render(<CookScreen cookId={newId} onBack={() => {}} onReview={() => {}} />);
    expect(await screen.findByTestId('last-time-folded')).toBeOnTheScreen();
  });

  it('falls back to the first lines of the notes when there is no next-time line', async () => {
    await startCook('cook-plain', 'Toast');
    granted(await harness.storage.data.capture.saveReview('cook-plain', 'Too dark.\nLower shelf.', 'user', harness.tick()));
    const again = granted(
      await harness.storage.data.cookRecord.cookAgain('cook-plain', { id: 'cook-plain-2', ingredientsId: 'ing-x' }, 'user', harness.tick()),
    );
    await harness.render(<CookScreen cookId={again.id} onBack={() => {}} onReview={() => {}} />);
    const notes = await screen.findByTestId('last-time-notes');
    expect(notes).toHaveTextContent('Too dark.', { exact: false });
  });
});

describe('Who’s eating', () => {
  it('adds, reorders, retires and brings back — never deleting anyone', async () => {
    await harness.render(<HouseholdScreen onBack={() => {}} />);
    const add = async (name: string) => {
      await fireEvent.changeText(await screen.findByTestId('household-name'), name);
      await fireEvent.press(screen.getByTestId('household-add'));
      await waitFor(() => expect(screen.getByText(name)).toBeOnTheScreen());
    };
    await add('Alex');
    await add('Sam');
    const names = async () => (await harness.db.data.household.list()).filter((m) => m.retiredAt === null).map((m) => m.name);
    expect(await names()).toEqual(['Alex', 'Sam']);

    await fireEvent.press(screen.getByRole('button', { name: 'Move up: Sam' }));
    await waitFor(async () => expect(await names()).toEqual(['Sam', 'Alex']));

    await fireEvent.press(screen.getByTestId('household-retire-id-01'));
    await waitFor(async () => expect(await names()).toEqual(['Sam']));
    expect(await screen.findByTestId('household-retired')).toBeOnTheScreen();
    expect(await harness.db.data.household.list()).toHaveLength(2);

    await fireEvent.press(screen.getByTestId('household-restore-id-01'));
    await waitFor(async () => expect(await names()).toEqual(['Sam', 'Alex']));
  });
});

