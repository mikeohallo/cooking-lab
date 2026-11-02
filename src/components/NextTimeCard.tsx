import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type NextTimeCardProps = {
  /** NEXT TIME, written in capitals in the copy. */
  label: string;
  /** The words, one line each. */
  lines: readonly string[];
  /** The inner screen's side column draws the words a size up. */
  large?: boolean;
  /** Anything after the words: an edit control, + Add a line. */
  children?: ReactNode;
  testID?: string;
};

/**
 * What to do differently next time: the one thing on the cook screen that
 * must stand out. Amber with a next-line edge, an orange lightbulb circle,
 * the NEXT TIME label and the words in the next-time style. Nothing else on a
 * screen uses amber.
 */
export function NextTimeCard({ label, lines, large = false, children, testID = 'next-time-card' }: NextTimeCardProps) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <View style={styles.bulb}>
          <Icon name="lightbulb" color="onPrimary" size={size.iconSmall + 2} />
        </View>
        <AppText variant="overline" tone="nextInk" accessibilityRole="header">
          {label}
        </AppText>
      </View>
      {lines.map((line, index) => (
        <AppText key={`${index}-${line}`} variant={large ? 'nextTimeLarge' : 'nextTime'}>
          {line}
        </AppText>
      ))}
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.next,
      borderColor: colors.nextLine,
      borderWidth: size.nextEdge,
      borderRadius: radius.zone,
      padding: space.sm + space.xxs / 2,
      gap: space.xs,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    bulb: {
      width: size.nextCircle,
      height: size.nextCircle,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
