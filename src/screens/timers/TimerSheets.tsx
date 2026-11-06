import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { FilterChip } from '../../components/FilterChip';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import {
  ADD_FIVE_MINUTES,
  ADD_ONE_MINUTE,
  ALL_TIMERS,
  NEW_TIMER,
  ONE_MINUTE_LESS,
  ONE_MINUTE_MORE,
  PAUSE_TIMER,
  RESUME_TIMER,
  STOP_TIMER,
  TIMER_LENGTH_HEADING,
  TIMER_NAME_HEADING,
  TIMER_NAME_PLACEHOLDER,
  startTimerLabel,
} from '../../content/product';
import type { Timer } from '../../domain/entities';
import { MAX_TIMER_NAME_LENGTH } from '../../domain/invariants';
import { useKeptState } from '../../layout/KeptState';
import { PaneSheet } from '../../layout/panes';
import { useKeyboardHeight } from '../../layout/useKeyboardClearance';
import { makeStyles } from '../../theme/theme';
import { radius, size, space } from '../../theme/tokens';
import {
  DEFAULT_LENGTH_MIN,
  MAX_LENGTH_MIN,
  MINUTE,
  MIN_LENGTH_MIN,
  STARTER_NAMES,
  TIMER_LENGTHS_MIN,
  checkTimerName,
  clockWords,
  durationWords,
  lastLengthMs,
  nameKey,
  namesUsedBefore,
  timeLeftMs,
  timerState,
} from '../../timers/model';
import { TimerRow } from './TimerRow';

type NewTimerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Starts it; resolves with a message when it was not started. */
  onStart: (name: string, minutes: number) => Promise<string | null>;
  /** Every timer there has been: names used before, their colours and lengths. */
  history: () => Promise<readonly Timer[]>;
};

/**
 * New timer (0.5.0). A name — Meat, Veg, Rest, the names used before, or
 * typed — how long — a common length, or a minute at a time (a long press is
 * five) — and Start. A name used before starts at the length it was last
 * given, so a repeat is two taps: the name, then Start.
 */
export function NewTimerSheet({ visible, onClose, onStart, history }: NewTimerSheetProps) {
  const keyboard = useKeyboardHeight();
  return (
    <PaneSheet visible={visible} onRequestClose={onClose} testID="timer-sheet-host">
      {(insets) =>
        visible ? (
          <NewTimerBody onClose={onClose} onStart={onStart} history={history} bottomInset={insets.bottom + keyboard} />
        ) : null
      }
    </PaneSheet>
  );
}

function NewTimerBody({
  onClose,
  onStart,
  history,
  bottomInset,
}: Omit<NewTimerSheetProps, 'visible'> & { bottomInset: number }) {
  const styles = useStyles();
  // Kept through a font-size change, as the composer's words are.
  const [chosen, setChosen] = useKeptState<string | null>('timer-sheet-name', null);
  const [typed, setTyped] = useKeptState('timer-sheet-typed', '');
  const [minutes, setMinutes] = useKeptState('timer-sheet-minutes', DEFAULT_LENGTH_MIN);
  const [earlier, setEarlier] = useState<readonly Timer[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    void history().then(
      (all) => {
        if (live) {
          setEarlier(all);
        }
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [history]);

  const name = typed.trim() !== '' ? typed.trim() : chosen;
  const names = [...STARTER_NAMES.map((entry) => entry.name), ...namesUsedBefore(earlier)];
  const lengthFor = (picked: string) => {
    const last = lastLengthMs(picked, earlier);
    if (last !== null) {
      setMinutes(Math.min(MAX_LENGTH_MIN, Math.max(MIN_LENGTH_MIN, Math.round(last / MINUTE))));
    }
  };
  const nudge = (by: number) => setMinutes((was) => Math.min(MAX_LENGTH_MIN, Math.max(MIN_LENGTH_MIN, was + by)));

  const start = async () => {
    if (name === null) {
      setProblem('Choose or type a name first.');
      return;
    }
    const checked = checkTimerName(name);
    if (!checked.ok) {
      setProblem(checked.message);
      return;
    }
    setPending(true);
    const failed = await onStart(checked.name, minutes);
    setPending(false);
    if (failed !== null) {
      setProblem(failed);
      return;
    }
    setChosen(null);
    setTyped('');
    setMinutes(DEFAULT_LENGTH_MIN);
    onClose();
  };

  return (
    <BottomSheet
      title={NEW_TIMER}
      onClose={onClose}
      bottomInset={bottomInset}
      testID="timer-sheet"
      foot={
        <Button
          label={name === null ? startTimerLabel('timer', durationWords(minutes)) : startTimerLabel(name, durationWords(minutes))}
          variant="main"
          size="main"
          disabled={name === null}
          pending={pending}
          onPress={() => void start()}
          testID="timer-start"
        />
      }
    >
      <View style={styles.group}>
        <AppText variant="label" tone="inkMuted">
          {TIMER_NAME_HEADING}
        </AppText>
        <View style={styles.wrap}>
          {names.map((entry) => (
            <FilterChip
              key={nameKey(entry)}
              kind="choice"
              role="radio"
              label={entry}
              selected={typed.trim() === '' && chosen !== null && nameKey(chosen) === nameKey(entry)}
              onPress={() => {
                setChosen(entry);
                setTyped('');
                setProblem(null);
                lengthFor(entry);
              }}
              testID={`timer-name-${nameKey(entry).replace(/[^a-z0-9]+/g, '-')}`}
            />
          ))}
        </View>
        <TextField
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setProblem(null);
          }}
          onEndEditing={() => {
            if (typed.trim() !== '') {
              lengthFor(typed.trim());
            }
          }}
          placeholder={TIMER_NAME_PLACEHOLDER}
          accessibilityLabel="Timer name"
          maxLength={MAX_TIMER_NAME_LENGTH}
          testID="timer-name-input"
        />
      </View>
      <View style={styles.group}>
        <AppText variant="label" tone="inkMuted">
          {TIMER_LENGTH_HEADING}
        </AppText>
        <View style={styles.wrap}>
          {TIMER_LENGTHS_MIN.map((length) => (
            <FilterChip
              key={length}
              kind="choice"
              role="radio"
              label={durationWords(length)}
              selected={minutes === length}
              onPress={() => setMinutes(length)}
              testID={`timer-length-${length}`}
            />
          ))}
        </View>
        <View style={styles.stepper}>
          <Step icon="minus" label={ONE_MINUTE_LESS} onPress={() => nudge(-1)} onLongPress={() => nudge(-5)} testID="timer-less" />
          <View style={styles.amount} accessibilityLiveRegion="polite" testID="timer-length">
            <AppText variant="timerNumber">{durationWords(minutes)}</AppText>
          </View>
          <Step icon="plus" label={ONE_MINUTE_MORE} onPress={() => nudge(1)} onLongPress={() => nudge(5)} testID="timer-more" />
        </View>
      </View>
      {problem !== null ? <Notice title={problem} tone="problem" testID="timer-problem" /> : null}
    </BottomSheet>
  );
}

function Step({
  icon,
  label,
  onPress,
  onLongPress,
  testID,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  onLongPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="A long press is five minutes"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.step, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon name={icon} color="ink" size={size.icon} />
    </Pressable>
  );
}

type TimerActionsSheetProps = {
  timer: Timer | null;
  now: number;
  onClose: () => void;
  onAdd: (timer: Timer, minutes: number) => void;
  onPause: (timer: Timer) => void;
  onResume: (timer: Timer) => void;
  onStop: (timer: Timer) => void;
};

/** A running or paused timer's actions: +1 min, +5 min, Pause or Resume, Stop. */
export function TimerActionsSheet({ timer, now, onClose, onAdd, onPause, onResume, onStop }: TimerActionsSheetProps) {
  const styles = useStyles();
  return (
    <PaneSheet visible={timer !== null} onRequestClose={onClose} testID="timer-actions-host">
      {(insets) =>
        timer === null ? null : (
          <BottomSheet
            title={`${timer.name} · ${clockWords(timeLeftMs(timer, now))}`}
            onClose={onClose}
            bottomInset={insets.bottom}
            testID="timer-actions"
          >
            <View style={styles.actions}>
              {timerState(timer, now) === 'running' || timerState(timer, now) === 'paused' ? (
                <>
                  <Button label={ADD_ONE_MINUTE} variant="outlined" onPress={() => onAdd(timer, 1)} testID="timer-add-1" />
                  <Button label={ADD_FIVE_MINUTES} variant="outlined" onPress={() => onAdd(timer, 5)} testID="timer-add-5" />
                  {timerState(timer, now) === 'paused' ? (
                    <Button label={RESUME_TIMER} variant="secondary" onPress={() => onResume(timer)} testID="timer-resume" />
                  ) : (
                    <Button label={PAUSE_TIMER} variant="outlined" onPress={() => onPause(timer)} testID="timer-pause" />
                  )}
                </>
              ) : null}
              <Button label={STOP_TIMER} variant="danger" onPress={() => onStop(timer)} testID="timer-stop" />
            </View>
          </BottomSheet>
        )
      }
    </PaneSheet>
  );
}

/** Every timer on the cook, when they do not all fit above the composer. */
export function TimerListSheet({
  visible,
  timers,
  now,
  onClose,
  onPress,
}: {
  visible: boolean;
  timers: readonly Timer[];
  now: number;
  onClose: () => void;
  onPress: (timer: Timer) => void;
}) {
  const styles = useStyles();
  return (
    <PaneSheet visible={visible} onRequestClose={onClose} testID="timer-list-host">
      {(insets) =>
        visible ? (
          <BottomSheet title={ALL_TIMERS} onClose={onClose} bottomInset={insets.bottom} testID="timer-list">
            <View style={styles.list}>
              {timers.map((timer) => (
                <TimerRow key={timer.id} timer={timer} now={now} onPress={() => onPress(timer)} testID={`timer-list-${timer.id}`} />
              ))}
            </View>
          </BottomSheet>
        ) : null
      }
    </PaneSheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    group: {
      gap: space.sm,
      marginBottom: space.md,
    },
    // Rows of wrapped chips 16 apart: their 48 dp touch areas never meet (0.4.1).
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.xs,
      rowGap: space.md,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    step: {
      width: size.targetMin,
      height: size.targetMin,
      borderRadius: radius.pill,
      borderWidth: size.hairline,
      borderColor: colors.controlLine,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.85,
    },
    amount: {
      flexGrow: 1,
      flexBasis: 0,
      minHeight: size.targetMin,
      borderRadius: radius.field,
      backgroundColor: colors.timerBlueTrack,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.xs,
      rowGap: space.md,
    },
    list: {
      gap: space.xs,
    },
  }),
);
