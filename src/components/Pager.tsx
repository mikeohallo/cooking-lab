import { Pressable, StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { DISABLED_OPACITY, radius, size, space } from '../theme/tokens';
import { touchSlop } from '../theme/touch';
import { AppText } from './AppText';
import { Icon } from './Icon';

type PagerProps = {
  page: number;
  pageCount: number;
  /** "1 of 2". */
  position: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  testID?: string;
};

/**
 * Moves through Your cooks ten at a time: Previous (a quiet pill), the
 * position, and Next (a navy pill with a chevron). An end that goes nowhere
 * fades to 40 % and refuses the tap.
 */
export function Pager({
  page,
  pageCount,
  position,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  testID = 'home-pager',
}: PagerProps) {
  const styles = useStyles();
  const atStart = page <= 1;
  const atEnd = page >= pageCount;
  return (
    <View style={styles.pager} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        accessibilityState={{ disabled: atStart }}
        disabled={atStart}
        onPress={onPrevious}
        testID="home-page-previous"
        hitSlop={PILL_SLOP}
        style={({ pressed }) => [styles.pill, styles.previous, pressed && styles.pressed, atStart && styles.off]}
      >
        <Icon name="chevronLeft" color="ink" size={size.iconSmall + 2} />
        <AppText variant="button">{previousLabel}</AppText>
      </Pressable>
      <AppText
        variant="label"
        style={styles.position}
        accessibilityLabel={`Page ${position}`}
        testID="home-page-position"
      >
        {position}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: atEnd }}
        disabled={atEnd}
        onPress={onNext}
        testID="home-page-next"
        hitSlop={PILL_SLOP}
        style={({ pressed }) => [styles.pill, styles.next, pressed && styles.pressed, atEnd && styles.off]}
      >
        <AppText variant="button" tone="onSelected">
          {nextLabel}
        </AppText>
        <Icon name="chevronRight" color="onSelected" size={size.iconSmall + 2} />
      </Pressable>
    </View>
  );
}

/** The page buttons are drawn 40 tall; their hit areas make 48. */
const PILL_SLOP = touchSlop(size.button);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
      marginTop: space.md,
    },
    pill: {
      minHeight: size.button,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
    },
    previous: {
      backgroundColor: colors.surfaceRaised,
    },
    next: {
      backgroundColor: colors.selected,
    },
    pressed: {
      opacity: 0.85,
    },
    off: {
      opacity: DISABLED_OPACITY,
    },
    position: {
      flexShrink: 1,
      textAlign: 'center',
    },
  }),
);
