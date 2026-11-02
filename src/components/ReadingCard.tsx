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
  /** The number's own id, for a test that reads it. */
  valueTestID?: string;
  /** The icon circle's id. */
  iconTestID?: string;
  testID?: string;
};

/**
 * A temperature reading: its icon in a tinted circle (warm for Oven, cool blue
 * for Internal, surface-raised for anything else), the word, and the number.
 * The word is always printed: two readings never differ by colour alone.
 */
export function ReadingCard({
  kind,
  word,
  value,
  narrow = false,
  children,
  valueTestID,
  iconTestID,
  testID,
}: ReadingCardProps) {
  const styles = useStyles();
  const tint: ColorRole = kind === null ? 'surfaceRaised' : readingRoles[kind].tint;
  const ink: ColorRole = kind === null ? 'ink' : readingRoles[kind].ink;
  return (
    <Card testID={testID} style={styles.card}>
      <View style={[styles.row, narrow && styles.column]}>
        <View style={styles.wordRow}>
          {/* Decoration beside the word, so hidden from the screen reader. A
              reading of nothing in particular has no mark at all. */}
          {kind === null ? null : (
            <View
              style={[styles.circle, styles[tint as 'readingOven']]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID={iconTestID}
            >
              <Icon name={kind === 'internal' ? 'probe' : 'oven'} color={ink} size={size.iconSmall + 2} />
            </View>
          )}
          <AppText variant="bodyStrong" style={styles.word} testID={testID ? `${testID}-word` : undefined}>
            {word}
          </AppText>
        </View>
        <AppText variant="readingNumber" style={narrow ? null : styles.value} testID={valueTestID}>
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
      paddingVertical: space.sm,
      paddingHorizontal: space.sm + 2,
    },
    word: {
      flexShrink: 1,
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
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    circle: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
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
