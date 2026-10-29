/**
 * Tagging a cook, on the screens, against real SQL.
 *
 * The four ways in all have to work, because the point of having four is that
 * the kitchen uses whichever is to hand: the chips, the field, the tags used
 * before, and the whole alphabet. And the one rule that is easy to get wrong
 * has to hold — taking a tag off one cook leaves it on every other.
 */

import { cleanup, screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  ADD_TAG,
  HIDE_MY_TAGS,
  NO_TAGS_YET,
  SHOW_MY_TAGS,
  TAGS_LABEL,
  USED_BEFORE,
} from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('tag-screens.db');
});

afterEach(async () => {
  await harness.close();
});

async function startCook(id: string, title: string | null = null): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id, title, startedAt: now() }, 'user', now());
}

async function reviewCook(id: string): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.saveReview(id, 'Good.', 'user', now());
}

/** Puts a tag on a cook without going through a screen. */
async function tagCook(cookId: string, name: string): Promise<string> {
  const tag = await harness.storage.data.tags.findOrCreate(name, null);
  await harness.storage.data.cookTags.link({ cookId, tagId: tag.id });
  return tag.id;
}

async function openCook(id: string): Promise<void> {
  await harness.render(<CookScreen cookId={id} onBack={jest.fn()} onReview={jest.fn()} />);
  await screen.findByTestId('tag-editor');
}

describe('an open cook', () => {
  it('says it has no tags yet, in words a person would use', async () => {
    await startCook('cook-1');
    await openCook('cook-1');

    expect(await screen.findByTestId('cook-tags-empty')).toHaveTextContent(NO_TAGS_YET);
  });

  it('takes a typed tag, normalised, with no kind', async () => {
    await startCook('cook-1');
    await openCook('cook-1');

    await user.type(screen.getByTestId('tag-input'), '  Brown   Butter ');
    await user.press(screen.getByRole('button', { name: ADD_TAG }));

    expect(await screen.findByText('brown butter')).toBeOnTheScreen();
    const tags = await harness.storage.data.cookTags.listForCook('cook-1');
    // The id comes from the data layer's own source, which is the one thing the
    // store invents for itself: a tag the kitchen has just named.
    expect(tags).toEqual([{ id: 'tag-01', name: 'brown butter', kind: null }]);
  });

  it('clears the field once the store has the tag', async () => {
    await startCook('cook-1');
    await openCook('cook-1');

    await user.type(screen.getByTestId('tag-input'), 'pork chops');
    await user.press(screen.getByRole('button', { name: ADD_TAG }));

    await waitFor(() => expect(screen.getByTestId('tag-input')).toHaveDisplayValue(''));
  });

  it('shows the cook’s tags as chips that take themselves off', async () => {
    await startCook('cook-1');
    const tagId = await tagCook('cook-1', 'pork chops');
    await openCook('cook-1');

    await user.press(await screen.findByTestId(`cook-tag-${tagId}`));

    await waitFor(async () =>
      expect(await harness.storage.data.cookTags.listForCook('cook-1')).toEqual([]),
    );
  });

  it('leaves a tag on every other cook when it comes off this one', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const tagId = await tagCook('cook-1', 'pork chops');
    await tagCook('cook-2', 'pork chops');
    await openCook('cook-1');

    await user.press(await screen.findByTestId(`cook-tag-${tagId}`));

    await waitFor(async () =>
      expect(await harness.storage.data.cookTags.listForCook('cook-1')).toEqual([]),
    );
    const other = await harness.storage.data.cookTags.listForCook('cook-2');
    expect(other.map((tag) => tag.name)).toEqual(['pork chops']);
    // And the tag itself is still there, because "not on this cook" is not
    // "not a word I use".
    expect(await harness.storage.data.tags.findById(tagId)).not.toBeNull();
  });

  it('suggests his own matching tags as he types', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const tagId = await tagCook('cook-2', 'brown butter');
    await openCook('cook-1');

    await user.type(screen.getByTestId('tag-input'), 'brow');

    expect(await screen.findByTestId(`tag-suggestion-${tagId}`)).toBeOnTheScreen();
  });

  it('adds a suggestion with one tap', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const tagId = await tagCook('cook-2', 'brown butter');
    await openCook('cook-1');

    await user.type(screen.getByTestId('tag-input'), 'brow');
    await user.press(await screen.findByTestId(`tag-suggestion-${tagId}`));

    await waitFor(async () =>
      expect(
        (await harness.storage.data.cookTags.listForCook('cook-1')).map((tag) => tag.name),
      ).toEqual(['brown butter']),
    );
  });

  it('offers the tags used before, and not the ones already on this cook', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    await startCook('cook-3');
    const porkId = await tagCook('cook-2', 'pork chops');
    await tagCook('cook-3', 'pork chops');
    const butterId = await tagCook('cook-1', 'brown butter');
    await openCook('cook-1');

    expect(await screen.findByText(USED_BEFORE)).toBeOnTheScreen();
    expect(screen.getByTestId(`tag-used-before-${porkId}`)).toBeOnTheScreen();
    // Already a chip above the field, so offering it again would be noise.
    expect(screen.queryByTestId(`tag-used-before-${butterId}`)).toBeNull();
  });

  it('adds a used-before tag with one tap', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const tagId = await tagCook('cook-2', 'pork chops');
    await openCook('cook-1');

    await user.press(await screen.findByTestId(`tag-used-before-${tagId}`));

    await waitFor(async () =>
      expect(
        (await harness.storage.data.cookTags.listForCook('cook-1')).map((tag) => tag.name),
      ).toEqual(['pork chops']),
    );
  });

  it('shows the whole alphabet, hides it again, and marks what is on the cook', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const onCook = await tagCook('cook-1', 'brown butter');
    const elsewhere = await tagCook('cook-2', 'pork chops');
    await openCook('cook-1');

    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));

    expect(await screen.findByTestId('all-tags')).toBeOnTheScreen();
    expect(screen.getByTestId(`all-tag-${onCook}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`all-tag-${elsewhere}`)).toBeOnTheScreen();
    // The one on this cook is ticked; the other is not. A tick and a fill, so
    // the state is never carried by colour alone.
    expect(screen.getByTestId(`all-tag-${onCook}`).props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByTestId(`all-tag-${elsewhere}`).props.accessibilityState).toMatchObject({
      checked: false,
    });
    expect(screen.getByTestId(`all-tag-${onCook}`)).toHaveTextContent(/✓/);

    await user.press(screen.getByRole('button', { name: HIDE_MY_TAGS }));
    expect(screen.queryByTestId('all-tags')).toBeNull();
  });

  it('adds and removes with a tap in the alphabet', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const tagId = await tagCook('cook-2', 'pork chops');
    await openCook('cook-1');

    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));
    await user.press(await screen.findByTestId(`all-tag-${tagId}`));

    await waitFor(async () =>
      expect(await harness.storage.data.cookTags.listForCook('cook-1')).toHaveLength(1),
    );

    await user.press(screen.getByTestId(`all-tag-${tagId}`));

    await waitFor(async () =>
      expect(await harness.storage.data.cookTags.listForCook('cook-1')).toEqual([]),
    );
  });

  // Fix round 0.2.1 (F1): this replaces slice 3's "only tags in use" rule.
  it('lists every tag ever created, including one that is on no cook', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const resting = await tagCook('cook-2', 'aubergine');
    await harness.storage.data.cookTags.unlink('cook-2', resting);
    const used = await tagCook('cook-2', 'pork chops');
    await openCook('cook-1');

    await user.press(await screen.findByRole('button', { name: SHOW_MY_TAGS }));

    expect(await screen.findByTestId(`all-tag-${used}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`all-tag-${resting}`)).toBeOnTheScreen();
  });

  it('still offers a cook’s only tag after it is taken off', async () => {
    await startCook('cook-1');
    const tagId = await tagCook('cook-1', 'brown butter');
    await openCook('cook-1');

    await user.press(await screen.findByTestId(`cook-tag-${tagId}`));
    await waitFor(async () =>
      expect(await harness.storage.data.cookTags.listForCook('cook-1')).toEqual([]),
    );
    expect(await screen.findByTestId('cook-tags-empty')).toBeOnTheScreen();

    // In the suggestions as he types…
    await user.type(screen.getByTestId('tag-input'), 'brow');
    expect(await screen.findByTestId(`tag-suggestion-${tagId}`)).toBeOnTheScreen();

    // …and in the whole alphabet, not ticked.
    await user.press(screen.getByRole('button', { name: SHOW_MY_TAGS }));
    const chip = await screen.findByTestId(`all-tag-${tagId}`);
    expect(chip).toBeOnTheScreen();
    expect(chip.props.accessibilityState?.checked ?? false).toBe(false);

    // And one tap puts it back.
    await user.press(chip);
    await waitFor(async () => {
      const tags = await harness.storage.data.cookTags.listForCook('cook-1');
      expect(tags.map((tag) => tag.id)).toEqual([tagId]);
    });
  });

  it('refuses a tag that is too long, and keeps what was typed', async () => {
    await startCook('cook-1');
    await openCook('cook-1');

    // The field itself stops at forty characters, so this is what reaches it.
    await user.type(screen.getByTestId('tag-input'), 'a'.repeat(45));

    expect(screen.getByTestId('tag-input')).toHaveDisplayValue('a'.repeat(40));
  });

  it('says so when a tag could not be saved, and keeps the cook unchanged', async () => {
    await startCook('cook-1');
    const failing = {
      ...harness.storage,
      data: {
        ...harness.storage.data,
        tags: {
          ...harness.storage.data.tags,
          findOrCreate: async () => {
            throw new Error('the store refused the write');
          },
        },
      },
    };
    await harness.render(
      <CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />,
      failing,
    );
    await screen.findByTestId('tag-editor');

    await user.type(screen.getByTestId('tag-input'), 'pork chops');
    await user.press(screen.getByRole('button', { name: ADD_TAG }));

    expect(await screen.findByTestId('tag-problem')).toBeOnTheScreen();
    expect(await harness.storage.data.cookTags.listForCook('cook-1')).toEqual([]);
  });
});

describe('a reviewed cook', () => {
  it('can still be tagged, because a cook is usually filed after it is eaten', async () => {
    await startCook('cook-1', 'Sunday roast');
    await reviewCook('cook-1');
    await harness.render(
      <CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />,
    );
    await screen.findByTestId('cook-detail-screen');

    await user.type(await screen.findByTestId('tag-input'), 'sunday roast');
    await user.press(screen.getByRole('button', { name: ADD_TAG }));

    expect(await screen.findByText('sunday roast')).toBeOnTheScreen();
  });
});

describe('Review', () => {
  it('offers the same tag control, used before and whole alphabet included', async () => {
    await startCook('cook-1');
    await startCook('cook-2');
    const tagId = await tagCook('cook-2', 'pork chops');
    await cleanup();

    await harness.render(
      <ReviewScreen cookId="cook-1" onBack={jest.fn()} onFinished={jest.fn()} />,
    );
    await screen.findByTestId('review-screen');

    expect(await screen.findByTestId('tag-editor')).toBeOnTheScreen();
    expect(await screen.findByTestId(`tag-used-before-${tagId}`)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: SHOW_MY_TAGS })).toBeOnTheScreen();
  });

  // Fix round 0.2.1 (F2): the section heading and the control's own label
  // both said "Tags".
  it('heads the tags once, not twice', async () => {
    await startCook('cook-1');
    await harness.render(
      <ReviewScreen cookId="cook-1" onBack={jest.fn()} onFinished={jest.fn()} />,
    );
    await screen.findByTestId('tag-editor');

    expect(screen.getAllByText(TAGS_LABEL)).toHaveLength(1);
    expect(screen.queryByTestId('tag-editor-label')).toBeNull();
  });

  it('keeps the control’s own label on the cook’s page, which has no heading', async () => {
    await startCook('cook-1');
    await openCook('cook-1');

    expect(screen.getAllByText(TAGS_LABEL)).toHaveLength(1);
    expect(screen.getByTestId('tag-editor-label')).toBeOnTheScreen();
  });

  it('tags the cook from Review and keeps it after the review is saved', async () => {
    await startCook('cook-1');
    const onFinished = jest.fn();
    await harness.render(
      <ReviewScreen cookId="cook-1" onBack={jest.fn()} onFinished={onFinished} />,
    );
    await screen.findByTestId('review-screen');

    await user.type(screen.getByTestId('tag-input'), 'sunday roast');
    await user.press(screen.getByRole('button', { name: ADD_TAG }));
    await screen.findByText('sunday roast');

    await user.type(screen.getByTestId('verdict-input'), 'Better than last time.');
    await user.press(screen.getByRole('button', { name: 'Finish review' }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('cook-1'));
    const tags = await harness.storage.data.cookTags.listForCook('cook-1');
    expect(tags.map((tag) => tag.name)).toEqual(['sunday roast']);
  });
});
