/**
 * A heading's trailing word or count never clips (0.4.1): "Optional" beside
 * Cuisine on the review, "12 reviewed" and "0 of 12" beside Your cooks on
 * Home, the average badge beside Who ate it?.
 *
 * The heading gives way first; the trailing word never shrinks. When the two
 * do not fit on one line the trailing word moves under the heading, which
 * then has the line to itself. Jest has no layout engine, so this holds the
 * styles that make the layout do that, on each heading that has one, and
 * the web preview's screenshots show it drawn.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HeadingRow, headingRowStyles } from '../src/components/HeadingRow';
import { RatingBadge, SectionGroup } from '../src/components/SectionGroup';
import { HomeScreen } from '../src/screens/HomeScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('the rule', () => {
  it('wraps the row, so the trailing word moves under rather than be cut', () => {
    expect(headingRowStyles.row).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  });

  it('never shrinks the trailing word', () => {
    expect(headingRowStyles.trailing).toMatchObject({ flexGrow: 0, flexShrink: 0 });
  });

  it('lets the heading give way first, down to nothing rather than push the row wider', () => {
    expect(headingRowStyles.heading).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0 });
  });
});

describe('each heading with a trailing word', () => {
  it('a quiet word: never cut short, never one line only', async () => {
    await render(<HeadingRow heading="Cuisine" trailing="Optional" trailingTestID="optional" testID="row" />);
    const word = screen.getByTestId('optional');
    expect(screen.getByText('Optional')).toBeOnTheScreen();
    expect(flat(word)).toMatchObject({ flexShrink: 0 });
    expect(word.props.numberOfLines).toBeUndefined();
    expect(word.props.ellipsizeMode).toBeUndefined();
    expect(flat(screen.getByTestId('row'))).toMatchObject({ flexWrap: 'wrap' });
    expect(screen.getByRole('header', { name: 'Cuisine' })).toBeOnTheScreen();
  });

  it('a badge, beside Who ate it?', async () => {
    await render(
      <SectionGroup title="Who ate it?" trailing={<RatingBadge average="4.5" testID="badge" />}>
        {null}
      </SectionGroup>,
    );
    const badge = screen.getByTestId('badge');
    expect(flat(badge.parent!)).toMatchObject({ flexShrink: 0 });
    expect(flat(badge.parent!.parent!)).toMatchObject({ flexWrap: 'wrap' });
  });
});

describe('Home’s count beside Your cooks', () => {
  let harness: ScreenHarness;

  beforeEach(async () => {
    harness = await openScreenHarness('heading-row.db');
    const at = '2026-11-03T08:30:00.000Z';
    await harness.storage.data.capture.startCook({ id: 'cook-done', title: 'Apple cake', startedAt: at }, 'user', at);
    await harness.storage.data.capture.saveReview('cook-done', 'Really tasty.', 'user', harness.tick());
  });

  afterEach(async () => {
    await harness.close();
  });

  it('"1 reviewed" never shrinks and moves under the heading when it does not fit', async () => {
    await harness.render(<HomeScreen onOpenCook={() => {}} />);
    const count = await screen.findByTestId('home-count');
    expect(count).toHaveTextContent('1 reviewed');
    expect(flat(count)).toMatchObject({ flexShrink: 0 });
    expect(flat(screen.getByTestId('home-heading'))).toMatchObject({ flexWrap: 'wrap', flexDirection: 'row' });
  });
});
