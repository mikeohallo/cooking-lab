import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, readingRoles, size, space, type ColorRole, type ReadingTreatment } from '../theme/tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon } from './Icon';

type ReadingCardProps = {
  /** Oven, Internal, or `null` for somewhere else, which prints its own word. */
  kind: ReadingTreatment | null;
  /** "Oven", "Internal", or the reading's own word ("Pan"). Internal, never Inside. */
  word: string;
  /** "180 °C". Celsius only. */
  value: string;
  /** Where the card is narrow, the number moves under the word. */
  narrow?: boolean;
  /** A line under the number: the time, or "edited". */
  children?: ReactNode;
  testID?: string;
};

/**
 * A temperature reading: its icon in a tinted circle (warm for Oven, cool blue
 * for Internal, surface-raised for anything else), the word, and the number.
 * The word is always printed: two readings never differ by colour alone.
 */
export function ReadingCard({ kind, word, value, narrow = false, children, testID }: ReadingCardProps) {
  const styles = useStyles();
  const tint: ColorRole = kind === null ? 'surfaceRaised' : readingRoles[kind].tint;
  const ink: ColorRole = kind === null ? 'ink' : readingRoles[kind].ink;
  return (
    <Card testID={testID} style={styles.card}>
      <View style={[styles.row, narrow && styles.column]}>
        <View style={styles.wordRow}>
          <View style={[styles.circle, styles[tint as 'readingOven']]}>
            <Icon name={kind === 'internal' ? 'probe' : 'oven'} color={ink} size={size.icon - 2} />
          </View>
          <AppText variant="bodyStrong" testID={testID ? `${testID}-word` : undefined}>
            {word}
          </AppText>
        </View>
        <AppText variant="readingNumber" style={narrow ? null : styles.value}>
          {value}
        </AppText>
      </View>
      {children}
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      padding: space.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    column: {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
    wordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    circle: {
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    readingOven: { backgroundColor: colors.readingOven },
    readingInternal: { backgroundColor: colors.readingInternal },
    surfaceRaised: { backgroundColor: colors.surfaceRaised },
    value: {
      marginLeft: 'auto',
    },
  }),
);
