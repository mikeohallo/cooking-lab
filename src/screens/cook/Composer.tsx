import { useState } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { AppText } from '../../components/AppText';
import { CameraButton } from '../../components/CameraButton';
import { ComposerBar, ReadingChip, SendButton } from '../../components/Composer';
import { Notice } from '../../components/Notice';
import {
  ADD_INTERNAL_READING,
  ADD_OVEN_READING,
  ADD_PHOTO,
  NOTE_FIELD_PLACEHOLDER,
  SEND_NOTE,
  UNSAVED_KEPT,
} from '../../content/product';
import { NOTE_MAX_LINES, maxTextBoxHeight } from '../../layout/footerLimit';
import { fontStyleFor, useFontsReady } from '../../theme/fonts';
import { makeStyles, useColors } from '../../theme/theme';
import { space, type } from '../../theme/tokens';
import type { WriteState } from '../../state/useWrite';
import type { ReadingChoice } from './ReadingSheet';

type ComposerProps = {
  /** Called with the note exactly as typed. Resolves true once the store has it. */
  onSendNote: (body: string) => Promise<boolean>;
  /** Opens Add a reading on Oven or Internal. */
  onReading: (choice: ReadingChoice) => void;
  /** Opens the choice of camera or a picture already taken. */
  onCamera: () => void;
  /** The last write's state, so the composer can show pending and keep text on failure. */
  writeState: WriteState;
  /** True while the camera or the picker is open, or a photo is being saved. */
  photoPending?: boolean;
};

/**
 * The foot of an open cook (0.4.0): Oven °C and Internal °C above, then one
 * rounded field with the camera inside on the left and an orange round Send on
 * the right. One line and Send is a complete interaction; a reading is two
 * taps and a number, in its own sheet.
 *
 * The note grows to five lines and then scrolls inside itself, so a pasted
 * recipe never pushes Send off the screen (0.2.2); the screen pins the whole
 * bar above the keyboard. Nothing typed is cleared until the store has it.
 */
export function Composer({ onSendNote, onReading, onCamera, writeState, photoPending = false }: ComposerProps) {
  const styles = useStyles();
  const colors = useColors();
  const fontsReady = useFontsReady();
  const { fontScale } = useWindowDimensions();
  const [note, setNote] = useState('');
  const [blankRefused, setBlankRefused] = useState(false);
  const pending = writeState.status === 'pending';

  const sendNote = async () => {
    if (note.trim() === '') {
      // Refused, and the typed whitespace is left exactly where it was.
      setBlankRefused(true);
      return;
    }
    setBlankRefused(false);
    if (await onSendNote(note)) {
      setNote('');
    }
  };

  return (
    <View style={styles.composer} testID="composer">
      {writeState.status === 'failed' ? (
        <Notice title={writeState.message} body={UNSAVED_KEPT} tone="problem" testID="composer-write-failed" />
      ) : null}
      <ComposerBar
        style={styles.bar}
        readings={
          <>
            <ReadingChip
              kind="oven"
              label={ADD_OVEN_READING}
              accessibilityHint="Adds an oven temperature"
              onPress={() => onReading('oven')}
              testID="oven-reading-toggle"
            />
            <ReadingChip
              kind="internal"
              label={ADD_INTERNAL_READING}
              accessibilityHint="Adds the food’s own temperature"
              onPress={() => onReading('internal')}
              testID="internal-reading-toggle"
            />
          </>
        }
      >
        <CameraButton label={ADD_PHOTO} pending={photoPending} onPress={onCamera} testID="add-photo" />
        <TextInput
          value={note}
          onChangeText={(text) => {
            setNote(text);
            if (blankRefused) {
              setBlankRefused(false);
            }
          }}
          placeholder={NOTE_FIELD_PLACEHOLDER}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="Note"
          multiline
          scrollEnabled
          textAlignVertical="center"
          style={[
            styles.input,
            { color: colors.ink, maxHeight: maxTextBoxHeight(type.body.lineHeight, NOTE_MAX_LINES, fontScale, space.sm) },
            fontsReady ? fontStyleFor(type.body.fontWeight) : null,
          ]}
          testID="note-input"
        />
        <SendButton
          label={SEND_NOTE}
          onPress={() => void sendNote()}
          disabled={note.length === 0 || pending}
          testID="note-send"
        />
      </ComposerBar>
      {blankRefused ? (
        <AppText variant="secondary" tone="danger" style={styles.helper} testID="note-blank">
          Write something first. One word is enough.
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    composer: {
      gap: space.xs,
    },
    // The screen's footer already pads the sides and the top.
    bar: {
      paddingHorizontal: 0,
      paddingTop: 0,
    },
    input: {
      flex: 1,
      minHeight: type.body.lineHeight + space.md,
      fontSize: type.body.fontSize,
      lineHeight: type.body.lineHeight,
      paddingVertical: space.sm,
      paddingHorizontal: space.xxs,
    },
    helper: {
      paddingHorizontal: space.xs,
    },
  }),
);
