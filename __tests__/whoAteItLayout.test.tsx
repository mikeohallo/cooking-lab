/**
 * Who ate it? picks one layout per list (0.4.1).
 *
 * Every row's stars, N/A and pencil sit beside the name when every row fits,
 * and under the name on every row when any one does not: never a list of
 * mixed rows. The choice is worked out from the latest measurements each
 * time (measure, don't latch), so a window that widens brings them back
 * beside. Jest has no layout engine, so the rows' layout events are sent here
 * the way Android sends them.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { HouseholdMember } from '../src/domain/entities';
import {
  RATING_CONTROLS_GAP,
  RATING_NAME_GAP,
  ratingControlsWidth,
  whoAteItLayout,
} from '../src/layout/responsive';
import { WhoAteIt } from '../src/screens/record/WhoAteIt';
import { size } from '../src/theme/tokens';

const AT = '2026-11-03T08:30:00.000Z';

const member = (id: string, name: string, position: number): HouseholdMember => ({
  id: id as HouseholdMember['id'],
  name,
  position,
  retiredAt: null,
  createdAt: AT,
});

const HOUSEHOLD = [
  member('m-you', 'You', 0),
  member('m-guest', 'Guest', 1),
  member('m-long', 'Guest with a longer name', 2),
];

const KEYS = ['member-m-you', 'member-m-guest', 'member-m-long'] as const;

/** The widths a row reports: its name at its own width, N/A, and the room beside the rail. */
const NAMES: Record<(typeof KEYS)[number], number> = {
  'member-m-you': 28,
  'member-m-guest': 44,
  'member-m-long': 186,
};
const NA = 48;

async function layout(testID: string, width: number) {
  // The name's measuring copy is hidden from TalkBack, so from the default query too.
  await fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 48 } } });
}

/** Every row measured, with `room` dp beside the rail. */
async function measureAll(room: number) {
  for (const key of KEYS) {
    const id = `who-ate-it-${key}`;
    await layout(`${id}-name-measure`, NAMES[key]);
    await layout(`${id}-na-box`, NA);
    await layout(`${id}-row`, room);
  }
}

const directionOf = (key: string) =>
  StyleSheet.flatten(screen.getByTestId(`who-ate-it-${key}-row`).props.style).flexDirection;

async function draw() {
  await render(<WhoAteIt household={HOUSEHOLD} ratings={[]} onRate={async () => null} />);
}

describe('the rule', () => {
  const controls = ratingControlsWidth(NA);

  it('counts five 38 dp stars, N/A and the 40 dp pencil, with their gaps', () => {
    expect(controls).toBe(5 * size.starTarget + NA + size.iconButton + 2 * RATING_CONTROLS_GAP);
  });

  it('is beside when every row fits, and under when any one does not', () => {
    const fits = (name: number, room: number) => ({ name, na: NA, room });
    const room = 28 + RATING_NAME_GAP + controls;
    expect(whoAteItLayout([fits(28, room), fits(44, room + 16)])).toBe('beside');
    expect(whoAteItLayout([fits(28, room), fits(29, room)])).toBe('under');
  });

  it('counts a row not yet measured as fitting', () => {
    expect(whoAteItLayout([{}, { name: 10 }])).toBe('beside');
  });
});

describe('Who ate it? on screen', () => {
  it('starts beside, with every row the same', async () => {
    await draw();
    expect(KEYS.map(directionOf)).toEqual(['row', 'row', 'row']);
  });

  it('puts every row’s controls under the name when the longest name does not fit', async () => {
    await draw();
    // Room for "You" and "Guest" beside, not for "Guest with a longer name".
    await measureAll(NAMES['member-m-guest'] + RATING_NAME_GAP + ratingControlsWidth(NA) + 20);
    expect(KEYS.map(directionOf)).toEqual(['column', 'column', 'column']);
    // Under the name, the controls are still one row that never wraps.
    const controls = StyleSheet.flatten(screen.getByTestId('who-ate-it-member-m-you-controls').props.style);
    expect(controls.flexDirection).toBe('row');
    expect(controls.flexWrap).toBe('nowrap');
  });

  it('switches back beside when the window widens', async () => {
    await draw();
    await measureAll(300);
    expect(KEYS.map(directionOf)).toEqual(['column', 'column', 'column']);
    await measureAll(NAMES['member-m-long'] + RATING_NAME_GAP + ratingControlsWidth(NA));
    expect(KEYS.map(directionOf)).toEqual(['row', 'row', 'row']);
    // And under again when it narrows.
    await measureAll(360);
    expect(KEYS.map(directionOf)).toEqual(['column', 'column', 'column']);
  });

  it('measures each name unseen and unread by TalkBack', async () => {
    await draw();
    expect(screen.queryByTestId('who-ate-it-member-m-long-name-measure')).toBeNull();
    const measure = screen.getByTestId('who-ate-it-member-m-long-name-measure', { includeHiddenElements: true });
    const box = StyleSheet.flatten(measure.parent!.props.style);
    expect(box).toMatchObject({ position: 'absolute', opacity: 0 });
    expect(measure.parent!.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(measure.props.numberOfLines).toBe(1);
  });
});
