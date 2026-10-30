import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { CameraButton } from '../../components/CameraButton';
import { StateNotice } from '../../components/StateNotice';
import { TextField } from '../../components/TextField';
import {
  ADD_INTERNAL_READING,
  ADD_OVEN_READING,
  ADD_PHOTO,
  CANCEL,
  CHOOSE_PHOTO,
  NOTE_PLACEHOLDER,
  READING_SOMEWHERE_ELSE,
  SAVE_TEMPERATURE,
  SEND_NOTE,
  TAKE_PHOTO,
  TEMPERATURE_PLACEHOLDER,
  TEMPERATURE_WHERE_PLACEHOLDER,
  UNSAVED_KEPT,
} from '../../content/product';
import type { PhotoOrigin } from '../../data/adapters';
import type { JsonObject } from '../../domain/entities';
import type { ReadingKind } from '../../domain/enums';
import { NOTE_MAX_LINES } from '../../layout/footerLimit';
import { space } from '../../theme/tokens';
import type { WriteState } from '../../state/useWrite';
import { parseTemperature, readingKindLabel } from './temperature';

type ComposerProps = {
  /** Called with the note exactly as typed. Resolves true once the store has it. */
  onSendNote: (body: string) => Promise<boolean>;
  /** Called with a validated temperature `meta`. Resolves true once the store has it. */
  onAddTemperature: (meta: JsonObject) => Promise<boolean>;
  /** Called when a photograph has been asked for. The screen runs the capture. */
  onAddPhoto: (origin: PhotoOrigin) => Promise<void>;
  /** The last write's state, so the composer can show pending and keep text on failure. */
  writeState: WriteState;
  /** True while the camera or the picker is open, or a photo is being saved. */
  photoPending?: boolean;
};

/**
 * Which extra row of the composer is open. Only ever one at a time, and
 * whichever it is takes the note field's place.
 */
type OpenPanel =
  | { readonly kind: 'none' }
  /** A reading of the oven's air or of the food: one number, nothing else. */
  | { readonly kind: 'reading'; readonly reading: Exclude<ReadingKind, 'none'> }
  /** A reading taken neither place, described in the cook's own words. */
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'photo' };

const CLOSED: OpenPanel = { kind: 'none' };

/**
 * The bottom of the Active Cook screen: one line and Send is a complete
 * interaction.
 *
 * A reading is two taps, not three. **Oven °C** and **Internal °C** sit beside
 * Send, and each opens a field for one number — the two readings a cook
 * actually takes, each named, with nothing to choose from first. The older,
 * slower form is still there behind *Somewhere else?*, which asks for a number
 * and the cook's own words for where it was taken; a reading entered that way
 * says nothing about what it was taken of, which is the truth about it.
 *
 * A panel takes the note field's place while it is open rather than stacking
 * above it, so with the keyboard up the timeline is not squeezed to a sliver.
 * The note typed so far is kept and comes back when the panel closes.
 *
 * Nothing typed is cleared until the store has confirmed the write.
 */
export function Composer({
  onSendNote,
  onAddTemperature,
  onAddPhoto,
  writeState,
  photoPending = false,
}: ComposerProps) {
  const [note, setNote] = useState('');
  const [panel, setPanel] = useState<OpenPanel>(CLOSED);
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

  const openReading = (reading: Exclude<ReadingKind, 'none'>) => {
    setCelsius('');
    setWhere('');
    setTemperatureProblem(null);
    setPanel({ kind: 'reading', reading });
  };

  const closePanel = () => {
    setPanel(CLOSED);
    setTemperatureProblem(null);
  };

  const addReading = async (kind: ReadingKind) => {
    const parsed = parseTemperature({ celsius, where: kind === 'none' ? where : '', kind });
    if (!parsed.ok) {
      setTemperatureProblem(parsed.message);
      return;
    }
    setTemperatureProblem(null);
    const saved = await onAddTemperature(parsed.meta);
    if (saved) {
      setCelsius('');
      setWhere('');
      setPanel(CLOSED);
    }
  };

  const takePhoto = async (origin: PhotoOrigin) => {
    setPanel(CLOSED);
    await onAddPhoto(origin);
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

      {panel.kind === 'reading' ? (
        <View style={styles.panel} testID={`reading-panel-${panel.reading}`}>
          <TextField
            label={`${readingKindLabel(panel.reading) ?? ''} °C`}
            value={celsius}
            onChangeText={setCelsius}
            placeholder={TEMPERATURE_PLACEHOLDER}
            accessibilityLabel={`${readingKindLabel(panel.reading) ?? ''} temperature in Celsius`}
            keyboardType="numeric"
            autoFocus
            invalid={temperatureProblem !== null}
            testID="temperature-celsius"
          />
          {temperatureProblem ? (
            <StateNotice title={temperatureProblem} tone="problem" testID="temperature-problem" />
          ) : null}
          <View style={styles.actions}>
            <ActionButton label={CANCEL} variant="quiet" onPress={closePanel} />
            <ActionButton
              label={SAVE_TEMPERATURE}
              variant="secondary"
              onPress={() => void addReading(panel.reading)}
              pending={pending}
              testID="temperature-save"
            />
          </View>
        </View>
      ) : null}

      {panel.kind === 'elsewhere' ? (
        <View style={styles.panel} testID="temperature-panel">
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
            <ActionButton label={CANCEL} variant="quiet" onPress={closePanel} />
            <ActionButton
              label={SAVE_TEMPERATURE}
              variant="secondary"
              onPress={() => void addReading('none')}
              pending={pending}
              testID="temperature-save"
            />
          </View>
        </View>
      ) : null}

      {panel.kind === 'photo' ? (
        <View style={styles.panel} testID="photo-panel">
          <ActionButton
            label={TAKE_PHOTO}
            variant="secondary"
            onPress={() => void takePhoto('camera')}
            testID="take-photo"
          />
          <ActionButton
            label={CHOOSE_PHOTO}
            variant="secondary"
            onPress={() => void takePhoto('library')}
            testID="choose-photo"
          />
          <View style={styles.actions}>
            <ActionButton label={CANCEL} variant="quiet" onPress={closePanel} />
          </View>
        </View>
      ) : null}

      {panel.kind === 'none' ? (
        <>
          <View style={styles.noteRow}>
            <View style={styles.noteField}>
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
                // Grows to five lines and then scrolls inside itself, so a
                // pasted recipe cannot push Send off the screen (0.2.2).
                maxRows={NOTE_MAX_LINES}
                invalid={blankRefused}
                helper={blankRefused ? 'Write something first. One word is enough.' : undefined}
                testID="note-input"
              />
            </View>
            <CameraButton
              label={ADD_PHOTO}
              pending={photoPending}
              onPress={() => setPanel({ kind: 'photo' })}
              testID="add-photo"
            />
          </View>
          <View style={styles.actions}>
            <ActionButton
              label={ADD_OVEN_READING}
              variant="secondary"
              onPress={() => openReading('oven')}
              testID="oven-reading-toggle"
            />
            <ActionButton
              label={ADD_INTERNAL_READING}
              variant="secondary"
              onPress={() => openReading('internal')}
              testID="internal-reading-toggle"
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
          <View style={styles.elsewhereRow}>
            <ActionButton
              label={READING_SOMEWHERE_ELSE}
              variant="quiet"
              onPress={() => {
                setCelsius('');
                setWhere('');
                setTemperatureProblem(null);
                setPanel({ kind: 'elsewhere' });
              }}
              accessibilityHint="Opens a reading with a temperature and your own words for where it was taken"
              testID="temperature-elsewhere"
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    gap: space.xs,
  },
  panel: {
    gap: space.xs,
    paddingBottom: space.xs,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  noteField: {
    flexGrow: 1,
    flexShrink: 1,
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
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.xs,
  },
  elsewhereRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  send: {
    minWidth: 96,
  },
});
