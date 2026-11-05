import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { FilterChip } from '../../components/FilterChip';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import {
  ADD_A_READING,
  CANCEL,
  INTERNAL_READING_LABEL,
  OVEN_READING_LABEL,
  READING_SOMEWHERE_ELSE_CHOICE,
  READING_WORD_ELSEWHERE,
  SAVE_TEMPERATURE,
  TEMPERATURE_WHERE_PLACEHOLDER,
  takenNow,
} from '../../content/product';
import type { JsonObject } from '../../domain/entities';
import { formatTime } from '../../format/dateTime';
import { PaneSheet } from '../../layout/panes';
import { useKeyboardHeight } from '../../layout/useKeyboardClearance';
import { fontStyleFor, useFontsReady } from '../../theme/fonts';
import { makeStyles, useColors } from '../../theme/theme';
import { radius, readingRoles, size, space, type } from '../../theme/tokens';
import { parseTemperature } from './temperature';

/** What a reading is taken of: the oven, the food, or somewhere in the cook's own words. */
export type ReadingChoice = 'oven' | 'internal' | 'elsewhere';

type ReadingSheetProps = {
  /** The choice the sheet opens on, or `null` when it is closed. */
  opening: ReadingChoice | null;
  /** Saves a validated reading. Resolves true once the store has it. */
  onAdd: (meta: JsonObject) => Promise<boolean>;
  onClose: () => void;
  /** While the write is in flight. */
  pending: boolean;
  /** Now, for "Taken now, 9:40 am". */
  now: () => string;
};

const PANEL_ID: Readonly<Record<ReadingChoice, string>> = {
  oven: 'reading-panel-oven',
  internal: 'reading-panel-internal',
  // The older form's id: a reading in the cook's own words.
  elsewhere: 'temperature-panel',
};

/**
 * Add a reading (0.4.0): a sheet over the dimmed cook page. Oven, Internal or
 * Somewhere else as choices, the number with its icon and °C, when it is
 * taken, and Add reading. A reading taken somewhere else says where in the
 * cook's own words and nothing about what it was taken of, which is the truth
 * about it. Nothing typed is cleared until the store has the reading.
 */
export function ReadingSheet({ opening, onAdd, onClose, pending, now }: ReadingSheetProps) {
  const keyboard = useKeyboardHeight();
  return (
    <PaneSheet visible={opening !== null} onRequestClose={onClose} testID="reading-sheet">
      {(insets) =>
        opening === null ? null : (
          <ReadingBody
            key={opening}
            opening={opening}
            onAdd={onAdd}
            onClose={onClose}
            pending={pending}
            now={now}
            bottomInset={insets.bottom + keyboard}
          />
        )
      }
    </PaneSheet>
  );
}

function ReadingBody({
  opening,
  onAdd,
  onClose,
  pending,
  now,
  bottomInset,
}: Omit<ReadingSheetProps, 'opening'> & { opening: ReadingChoice; bottomInset: number }) {
  const styles = useStyles();
  const colors = useColors();
  const fontsReady = useFontsReady();
  const [choice, setChoice] = useState<ReadingChoice>(opening);
  const [celsius, setCelsius] = useState('');
  const [where, setWhere] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const kind = choice === 'elsewhere' ? null : choice;
  const word =
    choice === 'oven' ? OVEN_READING_LABEL : choice === 'internal' ? INTERNAL_READING_LABEL : READING_WORD_ELSEWHERE;

  const add = async () => {
    const parsed = parseTemperature({
      celsius,
      where: choice === 'elsewhere' ? where : '',
      kind: kind ?? 'none',
    });
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    if (await onAdd(parsed.meta)) {
      onClose();
    }
  };

  const choose = (next: ReadingChoice) => {
    setChoice(next);
    setProblem(null);
  };

  return (
    <BottomSheet
      title={ADD_A_READING}
      onClose={onClose}
      bottomInset={bottomInset}
      testID={PANEL_ID[choice]}
      foot={
        <View style={styles.foot}>
          <Button label={CANCEL} variant="text" onPress={onClose} testID="temperature-cancel" />
          <Button
            label={SAVE_TEMPERATURE}
            variant="main"
            size="main"
            pending={pending}
            onPress={() => void add()}
            testID="temperature-save"
          />
        </View>
      }
    >
      <View style={styles.choices} accessibilityRole="radiogroup">
        <FilterChip
          kind="choice"
          role="radio"
          label={OVEN_READING_LABEL}
          selected={choice === 'oven'}
          icon="oven"
          iconColor={readingRoles.oven.ink}
          onPress={() => choose('oven')}
          testID="reading-kind-oven"
        />
        <FilterChip
          kind="choice"
          role="radio"
          label={INTERNAL_READING_LABEL}
          selected={choice === 'internal'}
          icon="probe"
          iconColor={readingRoles.internal.ink}
          onPress={() => choose('internal')}
          testID="reading-kind-internal"
        />
        <FilterChip
          kind="choice"
          role="radio"
          label={READING_SOMEWHERE_ELSE_CHOICE}
          selected={choice === 'elsewhere'}
          accessibilityHint="A temperature and your own words for where it was taken"
          onPress={() => choose('elsewhere')}
          testID="temperature-elsewhere"
        />
      </View>

      <View style={[styles.box, focused && styles.boxFocused, problem !== null && styles.boxInvalid]}>
        <View style={[styles.circle, { backgroundColor: colors[kind ? readingRoles[kind].tint : 'surfaceRaised'] }]}>
          <Icon
            name={kind === 'internal' ? 'probe' : 'oven'}
            color={kind ? readingRoles[kind].ink : 'ink'}
            size={size.iconSmall + 2}
          />
        </View>
        <AppText variant="bodyStrong" style={styles.word}>
          {word}
        </AppText>
        <TextInput
          value={celsius}
          onChangeText={setCelsius}
          accessibilityLabel={
            kind === null ? 'Temperature in Celsius' : `${word} temperature in Celsius`
          }
          keyboardType={choice === 'elsewhere' ? 'numbers-and-punctuation' : 'numeric'}
          autoFocus
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => void add()}
          style={[
            styles.number,
            { color: colors.ink },
            fontsReady ? fontStyleFor(type.readingNumber.fontWeight) : null,
          ]}
          testID="temperature-celsius"
        />
        <AppText variant="readingNumber" importantForAccessibility="no">
          °C
        </AppText>
      </View>

      {choice === 'elsewhere' ? (
        <TextField
          value={where}
          onChangeText={setWhere}
          placeholder={TEMPERATURE_WHERE_PLACEHOLDER}
          accessibilityLabel="Where the reading was taken"
          testID="temperature-where"
        />
      ) : null}

      {problem ? <Notice title={problem} tone="problem" testID="temperature-problem" /> : null}

      <AppText variant="secondary" tone="inkMuted" testID="reading-taken">
        {takenNow(formatTime(now()))}
      </AppText>
    </BottomSheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    choices: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.xs,
      // Rows of wrapped controls sit 16 apart, so two rows' 48 dp touch areas never overlap (0.4.1).
      rowGap: space.md,
    },
    box: {
      minHeight: size.targetMain + space.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: space.md,
      borderRadius: radius.field,
      borderWidth: size.nextEdge,
      borderColor: colors.controlLine,
      backgroundColor: colors.surface,
    },
    boxFocused: {
      borderColor: colors.secondary,
      borderWidth: size.ring,
    },
    boxInvalid: {
      borderColor: colors.danger,
    },
    circle: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    word: {
      flexShrink: 1,
    },
    number: {
      flex: 1,
      minWidth: size.targetMin,
      textAlign: 'right',
      fontSize: type.readingNumber.fontSize,
      lineHeight: type.readingNumber.lineHeight,
      paddingVertical: 0,
    },
    foot: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: space.sm,
    },
  }),
);
