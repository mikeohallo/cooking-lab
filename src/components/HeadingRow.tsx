import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { space } from '../theme/tokens';
import { AppText } from './AppText';

type HeadingRowProps = {
  /** The heading's words (and anything drawn inside them, such as "· 2"). */
  heading: ReactNode;
  /** What TalkBack reads for the heading, when it is not just its words. */
  headingLabel?: string;
  /**
   * A quiet word or count on the right ("Optional", "12 reviewed", "0 of 12"),
   * or a small mark such as the average badge.
   */
  trailing?: string | ReactElement | null;
  /** The trailing word's own test id. */
  trailingTestID?: string;
  testID?: string;
};

/**
 * A heading with a trailing word or count (0.4.1).
 *
 * The trailing word is never cut and never shrinks. The heading gives way
 * first: it takes the room the trailing word leaves. When the two do not fit
 * on one line, the trailing word moves under the heading, and the heading has
 * the whole line to itself, wrapping there if it must. Nothing is cut.
 */
export function HeadingRow({ heading, headingLabel, trailing, trailingTestID, testID }: HeadingRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      <AppText variant="heading" accessibilityRole="header" accessibilityLabel={headingLabel} style={styles.heading}>
        {heading}
      </AppText>
      {trailing === undefined || trailing === null ? null : typeof trailing === 'string' ? (
        <AppText variant="secondary" tone="inkMuted" style={styles.trailing} testID={trailingTestID}>
          {trailing}
        </AppText>
      ) : (
        <View style={styles.trailing} testID={trailingTestID}>
          {trailing}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(() => headingRowStyles);

/** Exported for `__tests__/headingRow.test.tsx`. */
export const headingRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space.sm,
    rowGap: space.xxs,
  },
  // Gives way first: grows to push the trailing word right, shrinks before it.
  heading: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
  },
  // Never shrinks, so it is never cut; it wraps under the heading instead.
  trailing: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
