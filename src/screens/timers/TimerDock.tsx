import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { AppText } from '../../components/AppText';
import { Icon } from '../../components/Icon';
import { TIMER_ALERTS_OFF, TIMER_PAUSED, TIMERS_NOT_ON_TIME, moreTimers } from '../../content/product';
import type { Timer } from '../../domain/entities';
import type { TimerAlertState } from '../../../modules/cook-timers';
import { makeStyles } from '../../theme/theme';
import { size, space } from '../../theme/tokens';
import { touchSlop } from '../../theme/touch';
import { TIMER_DOCK_GAP, inRows, planDock, type TimerWords } from '../../timers/dock';
import { clockTemplate, timeLeftMs, timerState } from '../../timers/model';
import { TimerRow } from './TimerRow';

type TimerDockProps = {
  /** In the order shown: finished first, then the soonest. */
  timers: readonly Timer[];
  now: number;
  /** A running or paused timer: its actions. A finished one: stop it. */
  onPress: (timer: Timer) => void;
  /** "+ N more": the full list. */
  onMore: () => void;
  testID?: string;
};

/**
 * The running timers (0.5.0): pinned above the composer on an open cook, and
 * inside its Cooking now card on Home. Two to a row only when each has room
 * for its name and time in full at the current text size, else one; never
 * more than a third of the window's height, the rest as "+ N more".
 *
 * How wide each timer's words are drawn is measured live, by an unseen copy
 * of them, as Who ate it? measures its names (0.4.1); until it is known, one
 * to a row.
 */
export function TimerDock({ timers, now, onPress, onMore, testID = 'timer-dock' }: TimerDockProps) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const { fontScale } = useWindowDimensions();
  const [drawnAcross, setDrawnAcross] = useState<number | null>(null);
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});
  const note = useCallback((key: string) => (event: LayoutChangeEvent) => {
    const drawn = Math.ceil(event.nativeEvent.layout.width);
    setMeasured((was) => (was[key] === drawn ? was : { ...was, [key]: drawn }));
  }, []);

  if (timers.length === 0) {
    return null;
  }

  const timeKey = (timer: Timer) => `time:${clockTemplate(timeLeftMs(timer, now))}`;
  const words: (TimerWords | null)[] = timers.map((timer) => {
    const name = measured[`name:${timer.id}`];
    const time = measured[timerState(timer, now) === 'finished' ? 'time:Done' : timeKey(timer)];
    const paused = timerState(timer, now) === 'paused' ? measured.paused : 0;
    return name === undefined || time === undefined || paused === undefined ? null : { name, time, paused };
  });
  const plan = planDock({
    across: drawnAcross ?? window.width,
    windowHeight: window.height,
    fontScale,
    words: drawnAcross === null ? words.map(() => null) : words,
  });
  const shown = timers.slice(0, plan.shown);
  const templates = [...new Set(timers.map(timeKey))];

  return (
    <View
      style={styles.dock}
      onLayout={(event) => setDrawnAcross(event.nativeEvent.layout.width)}
      testID={testID}
    >
      {shown.length > 0 ? (
        <View style={styles.rows} testID={`${testID}-rows-${plan.perRow}`}>
          {inRows(shown, plan.perRow).map((row) => (
            <View key={row.map((timer) => timer.id).join('+')} style={styles.row}>
              {row.map((timer) => (
                <View key={timer.id} style={styles.cell}>
                  <TimerRow timer={timer} now={now} onPress={() => onPress(timer)} />
                </View>
              ))}
              {/* An odd last timer keeps half the row, as its neighbours above do. */}
              {row.length < plan.perRow ? <View style={styles.cell} /> : null}
            </View>
          ))}
        </View>
      ) : null}
      {plan.more > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${moreTimers(plan.more)} timers`}
          accessibilityHint="Shows every timer"
          onPress={onMore}
          hitSlop={MORE_SLOP}
          style={styles.more}
          testID={`${testID}-more`}
        >
          <AppText variant="chip" tone="link">
            {moreTimers(plan.more)}
          </AppText>
        </Pressable>
      ) : null}
      {/* The words, unseen, at the width they are drawn: what decides two to a row. */}
      <View style={styles.measure} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {timers.map((timer) => (
          <AppText key={timer.id} variant="bodyStrong" onLayout={note(`name:${timer.id}`)} style={styles.measured}>
            {timer.name}
          </AppText>
        ))}
        {templates.map((key) => (
          <AppText key={key} variant="timerNumber" onLayout={note(key)} style={[styles.measured, styles.tabular]}>
            {key.slice('time:'.length)}
          </AppText>
        ))}
        <AppText variant="timerNumber" onLayout={note('time:Done')} style={styles.measured}>
          Done
        </AppText>
        <AppText variant="chip" onLayout={note('paused')} style={styles.measured}>
          {TIMER_PAUSED}
        </AppText>
      </View>
    </View>
  );
}

/** The one line above the timers when they cannot ring, or not on time. It opens the setting. */
export function TimerAlertLine({
  alerts,
  onOpen,
}: {
  alerts: TimerAlertState;
  onOpen: (which: 'notifications' | 'exactAlarms') => void;
}) {
  const styles = useStyles();
  const which = alerts.notifications !== 'granted' ? 'notifications' : !alerts.exactAlarms ? 'exactAlarms' : null;
  if (which === null) {
    return null;
  }
  const words = which === 'notifications' ? TIMER_ALERTS_OFF : TIMERS_NOT_ON_TIME;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      onPress={() => onOpen(which)}
      style={styles.alert}
      testID={`timer-alert-${which}`}
    >
      <Icon name="timer" color="danger" size={size.iconSmall + 2} />
      <AppText variant="secondary" tone="danger" style={styles.alertWords}>
        {words}
      </AppText>
    </Pressable>
  );
}

/** "+ N more" is drawn 32 tall; its hit area makes 48. */
const MORE_SLOP = touchSlop(size.chip);

const useStyles = makeStyles(() =>
  StyleSheet.create({
    dock: {
      gap: TIMER_DOCK_GAP,
    },
    // One timer, or two, to a row: rows stacked, each cell an equal share of
    // the row's width (0.5.0 fix). No percentages: in 0.5.0 a wrapping row of
    // percentage-based cells drew past Cooking now's card on Android's inner
    // screen, wider than the card, while the browser drew it correctly.
    rows: {
      gap: TIMER_DOCK_GAP,
    },
    row: {
      flexDirection: 'row',
      gap: TIMER_DOCK_GAP,
    },
    cell: {
      flex: 1,
      minWidth: 0,
    },
    more: {
      minHeight: size.chip,
      justifyContent: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: space.xs,
      marginVertical: space.xs,
    },
    measure: {
      position: 'absolute',
      left: 0,
      top: 0,
      opacity: 0,
      alignItems: 'flex-start',
    },
    measured: {
      alignSelf: 'flex-start',
    },
    tabular: {
      fontVariant: ['tabular-nums'],
    },
    alert: {
      minHeight: size.targetMin,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    alertWords: {
      flexShrink: 1,
      textDecorationLine: 'underline',
    },
  }),
);
