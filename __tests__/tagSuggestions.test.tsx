/**
 * The tag suggestions on the cover display (0.2.2).
 *
 * Two things Mike found typing a tag on the cover display: the suggestions sat
 * behind the keyboard, and a tag could show twice while typing. These tests pin
 * the fixes: the suggestions are drawn above the field, focusing the field asks
 * the page to scroll the two into sight, each tag is offered once, and a tag
 * being suggested is not repeated in *Used before:* right below it.
 */

import { cleanup, fireEvent, screen, within } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';

import { ScreenScrollContext } from '../src/layout/ScreenScroll';
import { CookScreen } from '../src/screens/CookScreen';
import { TagEditor } from '../src/screens/tags/TagEditor';
import { uniqueSuggestions, usedBeforeWithout } from '../src/state/useCookTags';
import type { Tag } from '../src/domain/entities';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const tag = (id: string, name: string, kind: Tag['kind'] = null): Tag => ({ id, name, kind });

describe('uniqueSuggestions', () => {
  it('offers each name once, keeping the best-ranked row', () => {
    const offered = uniqueSuggestions(
      [tag('a', 'brown butter'), tag('b', 'brown butter', 'technique'), tag('c', 'brioche')],
      [],
      6,
    );
    expect(offered.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('leaves out a tag already on the cook, by id and by name', () => {
    const offered = uniqueSuggestions(
      [tag('a', 'brown butter'), tag('b', 'brown butter', 'technique'), tag('c', 'brioche')],
      [tag('b', 'brown butter', 'technique')],
      6,
    );
    expect(offered.map((t) => t.id)).toEqual(['c']);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => tag(`t${i}`, `bean ${i}`));
    expect(uniqueSuggestions(many, [], 6)).toHaveLength(6);
  });
});

describe('usedBeforeWithout', () => {
  it('drops from Used before whatever the field is suggesting', () => {
    const used = [tag('a', 'brown butter'), tag('c', 'pork chops')];
    expect(usedBeforeWithout(used, [tag('a', 'brown butter')]).map((t) => t.id)).toEqual(['c']);
    expect(usedBeforeWithout(used, []).map((t) => t.id)).toEqual(['a', 'c']);
  });
});

/** testIDs in the order they are drawn, top to bottom. */
function testIdsInOrder(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] {
  if (node === null) {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap(testIdsInOrder);
  }
  const own = typeof node.props?.testID === 'string' ? [node.props.testID as string] : [];
  const children = (node.children ?? []).filter(
    (child): child is ReactTestRendererJSON => typeof child !== 'string',
  );
  return [...own, ...children.flatMap(testIdsInOrder)];
}

describe('typing a tag on the cook’s page', () => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    harness = await openScreenHarness();
    const { data, now } = harness.storage;
    await data.capture.startCook({ id: 'cook-01', startedAt: now() }, 'user', now());
    await data.capture.startCook({ id: 'cook-02', startedAt: now() }, 'user', now());
    // One name, two rows: an untyped tag and one a kind was given before
    // schema version 2. Both on another cook, so both are "used before".
    const untyped = await data.tags.findOrCreate('brown butter', null);
    const typed = await data.tags.findOrCreate('brown butter', 'technique');
    await data.cookTags.link({ cookId: 'cook-02', tagId: untyped.id });
    await data.cookTags.link({ cookId: 'cook-02', tagId: typed.id });
  });

  afterEach(async () => {
    await cleanup();
    await harness.close();
  });

  it('offers the tag once, above the field, and not again in Used before', async () => {
    await harness.render(<CookScreen cookId="cook-01" onBack={() => {}} onReview={() => {}} />);
    await screen.findByTestId('tags-used-before');

    await fireEvent.changeText(await screen.findByTestId('tag-input'), 'br');
    const suggestions = await screen.findByTestId('tag-suggestions');

    expect(within(suggestions).getAllByText('brown butter')).toHaveLength(1);
    expect(screen.getAllByText('brown butter')).toHaveLength(1);
    expect(screen.queryByTestId('tags-used-before')).toBeNull();

    const order = testIdsInOrder(screen.toJSON());
    expect(order.indexOf('tag-suggestions')).toBeGreaterThan(-1);
    expect(order.indexOf('tag-suggestions')).toBeLessThan(order.indexOf('tag-input'));
    // Both inside the block the page scrolls into sight.
    expect(within(screen.getByTestId('tag-typing')).getByTestId('tag-input')).toBeOnTheScreen();
    expect(within(screen.getByTestId('tag-typing')).getByTestId('tag-suggestions')).toBeOnTheScreen();
  });

  it('asks the page to scroll the field and its suggestions into sight while it has focus', async () => {
    const reveal = jest.fn();
    await harness.render(
      <ScreenScrollContext.Provider value={{ reveal }}>
        <TagEditor cookId="cook-01" />
      </ScreenScrollContext.Provider>,
    );
    const input = await screen.findByTestId('tag-input');
    expect(reveal).not.toHaveBeenCalled();

    await fireEvent(input, 'focus');
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal.mock.calls[0]?.[0]).not.toBeNull();

    await fireEvent.changeText(input, 'br');
    await screen.findByTestId('tag-suggestions');
    expect(reveal.mock.calls.length).toBeGreaterThan(1);

    await fireEvent(input, 'blur');
    const calls = reveal.mock.calls.length;
    await fireEvent.changeText(input, 'bro');
    await screen.findByTestId('tag-suggestions');
    expect(reveal.mock.calls.length).toBe(calls);
  });
});
