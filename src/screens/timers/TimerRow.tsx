import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AppText } from '../../components/AppText';
import { TIMER_DONE, TIMER_PAUSED } from '../../content/product';
import type { Timer } from '../../domain/entities';
import { makeStyles, useColors } from '../../theme/theme';
import { radius, size, space, timerRoles } from '../../theme/tokens';
import { TIMER_ROW_GAP, TIMER_ROW_INNER_GAP, TIMER_ROW_PAD_X, TIMER_ROW_PAD_Y } from '../../timers/dock';
import { clockWords, shareLeft, spokenTimer, timeLeftMs, timerState } from '../../timers/model';

type TimerRowProps = {
  timer: Timer;
  now: number;
  /** dock: above the composer and in Cooking now; table: tabletop mode's big tiles. */
  scale?: 'dock' | 'table';
  onPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
};

/**
 * One timer (0.5.0): its colour's tint as the row, a dot, the name, the time
 * left big on the right, and a bar along the foot that empties as time runs
 * out. Finished, the whole row turns the timer's solid colour and says Done.
 *
 * The row is one control: TalkBack reads its label, "Rest, 4 minutes 32
 * seconds left", when it is focused, and not the words inside it.
 * It is not a live region, so the seconds are never read out as they tick;
 * the finish is announced once, by the timers controller.
 */
export function TimerRow({ timer, now, scale = 'dock', onPress, onLayout, testID }: TimerRowProps) {
  const styles = useStyles();
  const colors = useColors();
  const roles = timerRoles[timer.colour];
  const state = timerState(timer, now);
  const done = state === 'finished';
  const table = scale === 'table';
  const words = done ? TIMER_DONE : clockWords(timeLeftMs(timer, now));
  const ink = done ? 'onTimer' : 'ink';
  const share = shareLeft(timer, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spokenTimer(timer, now)}
      accessibilityHint={done ? 'Stops it' : 'Add time, pause or stop'}
      onPress={onPress}
      onLayout={onLayout}
      style={({ pressed }) => [
        styles.row,
        table && styles.rowTable,
        { backgroundColor: done ? colors[roles.fill] : colors[roles.track] },
        pressed && styles.pressed,
      ]}
      testID={testID ?? `timer-${timer.id}`}
    >
      <View style={styles.line}>
        <View
          style={[styles.dot, table && styles.dotTable, { backgroundColor: done ? colors.onTimer : colors[roles.fill] }]}
        />
        <AppText variant={table ? 'title' : 'bodyStrong'} tone={ink} numberOfLines={1} style={styles.name}>
          {timer.name}
        </AppText>
        {state === 'paused' ? (
          <AppText variant="chip" tone="inkMuted">
            {TIMER_PAUSED}
          </AppText>
        ) : null}
        {table ? null : (
          <AppText variant="timerNumber" tone={ink} style={styles.time} testID={`${testID ?? `timer-${timer.id}`}-time`}>
            {words}
          </AppText>
        )}
      </View>
      {table ? (
        <AppText
          variant="timerLarge"
          tone={ink}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.time, styles.timeTable]}
          testID={`${testID ?? `timer-${timer.id}`}-time`}
        >
          {words}
        </AppText>
      ) : null}
      {done ? null : (
        <View style={[styles.track, table && styles.trackTable]}>
          <View style={[styles.fill, { flexGrow: share, backgroundColor: colors[roles.fill] }]} />
          <View style={[styles.empty, { flexGrow: 1 - share }]} />
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    row: {
      minHeight: size.targetMin,
      borderRadius: radius.field,
      paddingHorizontal: TIMER_ROW_PAD_X,
      paddingVertical: TIMER_ROW_PAD_Y,
      gap: TIMER_ROW_INNER_GAP,
      justifyContent: 'center',
    },
    rowTable: {
      flexGrow: 1,
      justifyContent: 'space-between',
      borderRadius: radius.card,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      gap: space.xs,
    },
    pressed: {
      opacity: 0.85,
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: TIMER_ROW_GAP,
    },
    dot: {
      width: size.timerDot,
      height: size.timerDot,
      borderRadius: radius.pill,
    },
    dotTable: {
      width: size.timerDotLarge,
      height: size.timerDotLarge,
    },
    name: {
      flexShrink: 1,
      flexGrow: 1,
      minWidth: 0,
    },
    time: {
      fontVariant: ['tabular-nums'],
    },
    timeTable: {
      textAlign: 'center',
    },
    track: {
      flexDirection: 'row',
      height: size.timerBar,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    trackTable: {
      height: size.timerBarLarge,
    },
    fill: {
      flexBasis: 0,
      borderRadius: radius.pill,
    },
    empty: {
      flexBasis: 0,
    },
  }),
);
