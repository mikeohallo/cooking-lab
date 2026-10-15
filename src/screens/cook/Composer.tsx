import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { StateNotice } from '../../components/StateNotice';
import { TextField } from '../../components/TextField';
import {
  ADD_TEMPERATURE,
  CANCEL,
  NOTE_PLACEHOLDER,
  SAVE_TEMPERATURE,
  SEND_NOTE,
  TEMPERATURE_PLACEHOLDER,
  TEMPERATURE_WHERE_PLACEHOLDER,
  UNSAVED_KEPT,
} from '../../content/product';
import type { JsonObject } from '../../domain/entities';
import { space } from '../../theme/tokens';
import type { WriteState } from '../../state/useWrite';
import { parseTemperature } from './temperature';

type ComposerProps = {
  /** Called with the note exactly as typed. Resolves true once the store has it. */
  onSendNote: (body: string) => Promise<boolean>;
  /** Called with a validated temperature `meta`. Resolves true once the store has it. */
  onAddTemperature: (meta: JsonObject) => Promise<boolean>;
  /** The last write's state, so the composer can show pending and keep text on failure. */
  writeState: WriteState;
};

/**
 * The bottom of the Active Cook screen: one line and Send is a complete
 * interaction. The temperature entry folds out from a secondary button rather
 * than living on screen as a second form.
 *
 * Nothing typed is cleared until the store has confirmed the write.
 */
export function Composer({ onSendNote, onAddTemperature, writeState }: ComposerProps) {
  const [note, setNote] = useState('');
  const [temperatureOpen, setTemperatureOpen] = useState(false);
  const [celsius, setCelsius] = useState('');
  const [where, setWhere] = useState('');
  const [temperatureProblem, setTemperatureProblem] = useState<string | null>(null);
  const [blankRefused, setBlankRefused] = useState(false);

  const pending = writeState.status === 'pending';

  const sendNote = async () => {
    if (note.trim() === '') {
      // Refused, and the typed whitespace is left exactly where it was.
      setBlankRefused(true);
      return;
    }
    setBlankRefused(false);
    const saved = await onSendNote(note);
    if (saved) {
      setNote('');
    }
  };

  const addTemperature = async () => {
    const parsed = parseTemperature({ celsius, where });
    if (!parsed.ok) {
      setTemperatureProblem(parsed.message);
      return;
    }
    setTemperatureProblem(null);
    const saved = await onAddTemperature(parsed.meta);
    if (saved) {
      setCelsius('');
      setWhere('');
      setTemperatureOpen(false);
    }
  };

  return (
    <View style={styles.composer} testID="composer">
      {writeState.status === 'failed' ? (
        <StateNotice
          title={writeState.message}
          body={UNSAVED_KEPT}
          tone="problem"
          testID="composer-write-failed"
        />
      ) : null}

      {temperatureOpen ? (
        <View style={styles.temperaturePanel} testID="temperature-panel">
          <View style={styles.temperatureFields}>
            <View style={styles.celsiusField}>
              <TextField
                value={celsius}
                onChangeText={setCelsius}
                placeholder={TEMPERATURE_PLACEHOLDER}
                accessibilityLabel="Temperature in Celsius"
                keyboardType="numbers-and-punctuation"
                autoFocus
                invalid={temperatureProblem !== null}
                testID="temperature-celsius"
              />
            </View>
            <View style={styles.whereField}>
              <TextField
                value={where}
                onChangeText={setWhere}
                placeholder={TEMPERATURE_WHERE_PLACEHOLDER}
                accessibilityLabel="Where the reading was taken"
                testID="temperature-where"
              />
            </View>
          </View>
          {temperatureProblem ? (
            <StateNotice title={temperatureProblem} tone="problem" testID="temperature-problem" />
          ) : null}
          <View style={styles.actions}>
            <ActionButton
              label={CANCEL}
              variant="quiet"
              onPress={() => {
                setTemperatureOpen(false);
                setTemperatureProblem(null);
              }}
            />
            <ActionButton
              label={SAVE_TEMPERATURE}
              variant="secondary"
              onPress={() => void addTemperature()}
              pending={pending}
              testID="temperature-save"
            />
          </View>
        </View>
      ) : null}

      <TextField
        value={note}
        onChangeText={(text) => {
          setNote(text);
          if (blankRefused) {
            setBlankRefused(false);
          }
        }}
        placeholder={NOTE_PLACEHOLDER}
        accessibilityLabel="Note"
        multiline
        rows={2}
        invalid={blankRefused}
        helper={blankRefused ? 'Write something first. One word is enough.' : undefined}
        testID="note-input"
      />
      <View style={styles.actions}>
        <ActionButton
          label={ADD_TEMPERATURE}
          variant="secondary"
          onPress={() => setTemperatureOpen((open) => !open)}
          testID="temperature-toggle"
        />
        <ActionButton
          label={SEND_NOTE}
          variant="primary"
          onPress={() => void sendNote()}
          pending={pending}
          style={styles.send}
          testID="note-send"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    gap: space.xs,
  },
  temperaturePanel: {
    gap: space.xs,
    paddingBottom: space.xs,
  },
  temperatureFields: {
    flexDirection: 'row',
    gap: space.xs,
  },
  celsiusField: {
    flexBasis: 110,
    flexGrow: 0,
  },
  whereField: {
    flexGrow: 1,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.xs,
  },
  send: {
    minWidth: 96,
  },
});
