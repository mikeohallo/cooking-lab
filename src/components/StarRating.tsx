import { Pressable, StyleSheet, View } from 'react-native';

import { STAR_VALUES } from '../domain/enums';
import { makeStyles } from '../theme/theme';
import { DISABLED_OPACITY, radius, size, space } from '../theme/tokens';
import { touchSlop } from '../theme/touch';
import { AppText } from './AppText';
import { Icon } from './Icon';


type StarButtonsProps = {
  /** The stars given, or null. */
  stars: number | null;
  onTap: (value: number) => void;
  /** "3 stars", for each button. */
  labelFor: (value: number) => string;
  /** A hint on each button: whose stars these are. */
  hintFor?: (value: number) => string;
  disabled?: boolean;
  testID: string;
};

/**
 * Five star buttons, each 30 dp drawn in a 48 dp tall target and named "1
 * star" to "5 stars" for TalkBack. Filled in star, empty in star-empty. A tap
 * on the chosen star is the caller's to clear.
 *
 * Each button is 38 dp wide where there is room. In a row too narrow for
 * that, the space either side of the star closes up, down to the star's own
 * 30 dp, so the row stays on one line (0.4.0, part 6).
 */
export function StarButtons({ stars, onTap, labelFor, hintFor, disabled = false, testID }: StarButtonsProps) {
  const styles = useStyles();
  return (
    <View style={styles.stars}>
      {STAR_VALUES.map((value) => {
        const filled = stars !== null && value <= stars;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={labelFor(value)}
            accessibilityHint={hintFor?.(value)}
            accessibilityState={{ checked: value === stars, disabled }}
            onPress={() => onTap(value)}
            hitSlop={STAR_SLOP}
            style={({ pressed }) => [styles.star, pressed && styles.pressed]}
            testID={`${testID}-star-${value}`}
          >
            <Icon
              name="star"
              color={filled ? 'star' : 'starEmpty'}
              size={size.icon + 2}
              testID={filled ? `${testID}-star-${value}-filled` : `${testID}-star-${value}-empty`}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

type NotApplicableToggleProps = {
  label: string;
  accessibilityLabel: string;
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
};

/** N/A: outlined, and navy when pressed. "Didn't eat it". */
export function NotApplicableToggle({ label, accessibilityLabel, on, onPress, disabled = false, testID }: NotApplicableToggleProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled }}
      onPress={onPress}
      hitSlop={NA_SLOP}
      style={({ pressed }) => [styles.na, on && styles.naOn, pressed && styles.pressed, disabled && styles.off]}
      testID={testID}
    >
      {/* N/A is one word: it never breaks over two lines (0.3.0). */}
      <AppText variant="label" tone={on ? 'onSelected' : 'ink'} numberOfLines={1} style={styles.naLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

type RatingRowProps = {
  name: string;
  /** "(guest)", after the name. */
  mark?: string | null;
  /** Their own line, in the secondary style. */
  line?: string | null;
  /** Stars given, or null. */
  stars: number | null;
  /** Didn't eat it: a control-line dot, the name muted, an N/A chip. */
  notEaten: boolean;
  notEatenLabel: string;
  spoken: string;
  testID?: string;
};

/**
 * A person's row on a reviewed cook, read-only: a teal dot, the name in the
 * card-title style, an optional line, and the stars on the right.
 */
export function RatingRow({ name, mark, line, stars, notEaten, notEatenLabel, spoken, testID }: RatingRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={spoken} testID={testID}>
      <View style={[styles.dot, notEaten ? styles.dotOff : styles.dotOn]} />
      <View style={styles.who}>
        <AppText variant="cardTitle" tone={notEaten ? 'inkMuted' : 'ink'}>
          {name}
          {mark ? <AppText variant="secondary" tone="inkMuted">{`  ${mark}`}</AppText> : null}
        </AppText>
        {line ? (
          <AppText variant="secondary" tone="inkMuted">
            {line}
          </AppText>
        ) : null}
      </View>
      {notEaten ? (
        <View style={styles.naChip}>
          <AppText variant="label">{notEatenLabel}</AppText>
        </View>
      ) : stars !== null ? (
        <View style={styles.readStars}>
          {STAR_VALUES.map((value) => (
            <Icon key={value} name="star" color={value <= stars ? 'star' : 'starEmpty'} size={size.iconSmall + 2} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A star is 48 tall and 38 wide; its hit area reaches 5 either side, to 48.
 * Neighbours share that 5: a tap there goes to the star drawn later, the
 * one on the right. N/A is drawn 32 tall as a chip; its hit area makes 48.
 */
const STAR_SLOP = touchSlop(size.targetMin, size.starTarget);
const NA_SLOP = touchSlop(size.chip);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    stars: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
    },
    star: {
      flexBasis: size.starTarget,
      flexGrow: 0,
      flexShrink: 1,
      minWidth: size.starButton,
      minHeight: size.targetMin,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    pressed: {
      opacity: 0.7,
    },
    off: {
      opacity: DISABLED_OPACITY,
    },
    na: {
      flexShrink: 0,
      minHeight: size.chip,
      minWidth: size.targetMin,
      paddingHorizontal: space.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: size.hairline,
      borderColor: colors.controlLine,
    },
    naLabel: {
      flexShrink: 0,
    },
    naOn: {
      backgroundColor: colors.selected,
      borderColor: colors.selected,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.xs,
    },
    dot: {
      width: size.dot,
      height: size.dot,
      borderRadius: radius.pill,
    },
    dotOn: {
      backgroundColor: colors.secondary,
    },
    dotOff: {
      borderWidth: size.ring,
      borderColor: colors.controlLine,
    },
    who: {
      flex: 1,
      gap: space.xxs / 2,
    },
    naChip: {
      borderRadius: radius.pill,
      borderWidth: size.hairline,
      borderColor: colors.controlLine,
      paddingHorizontal: space.xs,
      paddingVertical: space.xxs / 2,
    },
    readStars: {
      flexDirection: 'row',
      gap: space.xxs / 2,
    },
  }),
);
