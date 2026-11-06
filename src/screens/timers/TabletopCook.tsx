import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { Icon, type IconName } from '../../components/Icon';
import { MealLabel } from '../../components/MealLabel';
import {
  INTERNAL_READING_LABEL,
  OVEN_READING_LABEL,
  STOP_TIMER,
  TABLETOP_NO_TIMERS,
  TABLETOP_NOTE,
  TABLETOP_PHOTO,
  TIMER,
  timerIsDone,
} from '../../content/product';
import type { CookEvent, Timer } from '../../domain/entities';
import type { StoredMealType } from '../../domain/enums';
import { makeStyles, useColors } from '../../theme/theme';
import { radius, size, space, timerRoles, type ColorRole } from '../../theme/tokens';
import { timerState } from '../../timers/model';
import { ReadingChips } from '../cook/Sections';
import { TimerRow } from './TimerRow';

/** The five big buttons on the flat half, in order. "Internal", never "Inside". */
export const TABLETOP_BUTTONS = [
  { key: 'timer', label: TIMER, icon: 'timer', tint: 'timerBlueTrack', ink: 'ink' },
  { key: 'oven', label: OVEN_READING_LABEL, icon: 'oven', tint: 'readingOven', ink: 'readingOvenInk' },
  { key: 'internal', label: INTERNAL_READING_LABEL, icon: 'probe', tint: 'readingInternal', ink: 'readingInternalInk' },
  { key: 'photo', label: TABLETOP_PHOTO, icon: 'camera', tint: 'surfaceRaised', ink: 'ink' },
  { key: 'note', label: TABLETOP_NOTE, icon: 'pencil', tint: 'noteIcon', ink: 'ink' },
] as const satisfies readonly { key: string; label: string; icon: IconName; tint: ColorRole; ink: ColorRole }[];

export type TabletopButton = (typeof TABLETOP_BUTTONS)[number]['key'];

type TabletopCookProps = {
  title: string;
  mealType: StoredMealType | null;
  /** In the order shown: finished first, then the soonest. */
  timers: readonly Timer[];
  now: number;
  latestReading: CookEvent | null;
  /** Last time's first Next time line. */
  nextTime: string | null;
  /** Where the fold is, in dp from the top of the window. */
  foldTop: number;
  foldBottom: number;
  onButton: (button: TabletopButton) => void;
  onStop: (timer: Timer) => void;
  onTimer: (timer: Timer) => void;
};

/**
 * Tabletop mode (0.5.0): the inner screen half folded on the bench, the hinge
 * across it. The page splits where the fold is, and nothing is placed across
 * it. The upright half is for reading from across the kitchen: the dish and
 * its meal, up to three timers as big tiles, the latest reading and last
 * time's first Next time line. The flat half is for big taps: Timer, Oven,
 * Internal, Photo, Note, each opening what it opens on the cook page. A
 * finished timer turns the flat half into one Stop button.
 */
export function TabletopCook({
  title,
  mealType,
  timers,
  now,
  latestReading,
  nextTime,
  foldTop,
  foldBottom,
  onButton,
  onStop,
  onTimer,
}: TabletopCookProps) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const done = timers.find((timer) => timerState(timer, now) === 'finished') ?? null;
  const tiles = timers.slice(0, 3);
  return (
    <View style={styles.root} testID="tabletop">
      <View style={[styles.top, { height: foldTop, paddingTop: insets.top + space.sm }]} testID="tabletop-top">
        <View style={styles.heading}>
          <Icon name="flame" color="zoneIcon" size={size.icon} />
          <AppText variant="title" numberOfLines={1} style={styles.title} accessibilityRole="header">
            {title}
          </AppText>
          <MealLabel mealType={mealType} />
        </View>
        <View style={styles.tiles} testID="tabletop-tiles">
          {tiles.length === 0 ? (
            <View style={styles.empty}>
              <AppText variant="heading" tone="inkMuted" style={styles.centre}>
                {TABLETOP_NO_TIMERS}
              </AppText>
            </View>
          ) : (
            tiles.map((timer) => (
              <View key={timer.id} style={styles.tile}>
                <TimerRow
                  timer={timer}
                  now={now}
                  scale="table"
                  onPress={() => onTimer(timer)}
                  testID={`tabletop-timer-${timer.id}`}
                />
              </View>
            ))
          )}
        </View>
        {latestReading !== null || nextTime !== null ? (
          <View style={styles.facts}>
            {latestReading !== null ? <ReadingChips readings={[latestReading]} /> : null}
            {nextTime !== null ? (
              <View style={styles.next} testID="tabletop-next-time">
                <Icon name="lightbulb" color="nextInk" size={size.iconSmall + 2} />
                <AppText variant="nextTime" tone="nextInk" numberOfLines={1} style={styles.shrink}>
                  {nextTime}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {/* The hinge: nothing is drawn across it. */}
      <View style={[styles.hinge, { height: Math.max(0, foldBottom - foldTop) }]} testID="tabletop-hinge" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]} testID="tabletop-bottom">
        {done !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${STOP_TIMER}. ${timerIsDone(done.name)}`}
            onPress={() => onStop(done)}
            style={({ pressed }) => [styles.stop, { backgroundColor: colors[timerRoles[done.colour].fill] }, pressed && styles.pressed]}
            testID="tabletop-stop"
          >
            <AppText variant="timerLarge" tone="onTimer">
              {STOP_TIMER}
            </AppText>
            <AppText variant="title" tone="onTimer">
              {timerIsDone(done.name)}
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.buttons}>
            {TABLETOP_BUTTONS.map((button) => (
              <Pressable
                key={button.key}
                accessibilityRole="button"
                accessibilityLabel={button.label}
                onPress={() => onButton(button.key)}
                style={({ pressed }) => [styles.big, { backgroundColor: colors[button.tint] }, pressed && styles.pressed]}
                testID={`tabletop-${button.key}`}
              >
                <Icon name={button.icon} color={button.ink} size={size.tableIcon} />
                <AppText variant="tableButton" tone={button.ink} style={styles.centre}>
                  {button.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.page,
    },
    top: {
      paddingHorizontal: space.lg,
      paddingBottom: space.sm,
      gap: space.sm,
      overflow: 'hidden',
    },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    title: {
      flexShrink: 1,
      minWidth: 0,
    },
    tiles: {
      flex: 1,
      flexDirection: 'row',
      gap: space.sm,
      minHeight: 0,
    },
    tile: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
    },
    empty: {
      flex: 1,
      borderRadius: radius.card,
      borderWidth: size.hairline,
      borderStyle: 'dashed',
      borderColor: colors.controlLine,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.md,
    },
    centre: {
      textAlign: 'center',
    },
    facts: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.sm,
    },
    next: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      borderRadius: radius.field,
      borderWidth: size.hairline,
      borderColor: colors.nextLine,
      backgroundColor: colors.next,
      flexShrink: 1,
      minWidth: 0,
    },
    shrink: {
      flexShrink: 1,
      minWidth: 0,
    },
    hinge: {
      borderTopWidth: size.hairline,
      borderTopColor: colors.line,
    },
    bottom: {
      flex: 1,
      paddingHorizontal: space.lg,
      paddingTop: space.md,
    },
    buttons: {
      flex: 1,
      flexDirection: 'row',
      gap: space.sm,
    },
    big: {
      flexGrow: 1,
      flexBasis: 0,
      minHeight: size.tableButtonMin,
      borderRadius: radius.card,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xs,
      padding: space.xs,
    },
    stop: {
      flex: 1,
      minHeight: size.tableButtonMin,
      borderRadius: radius.card,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xxs,
    },
    pressed: {
      opacity: 0.85,
    },
  }),
);
