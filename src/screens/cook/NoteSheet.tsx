import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { CANCEL, NOTE_FIELD_PLACEHOLDER, SEND_NOTE, UNSAVED_KEPT } from '../../content/product';
import { NOTE_MAX_LINES } from '../../layout/footerLimit';
import { useKeptState } from '../../layout/KeptState';
import { PaneSheet } from '../../layout/panes';
import { useKeyboardHeight } from '../../layout/useKeyboardClearance';
import { space } from '../../theme/tokens';

type NoteSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Called with the note exactly as typed. Resolves true once the store has it. */
  onSendNote: (body: string) => Promise<boolean>;
  pending: boolean;
};

/**
 * Add a note, from tabletop mode's Note button (0.5.0): the composer's own
 * field in a sheet, as the flat half has no composer. It shares the
 * composer's half-typed words, so a note started on the bench is still there
 * when the screen is opened out flat.
 */
export function NoteSheet({ visible, onClose, onSendNote, pending }: NoteSheetProps) {
  const keyboard = useKeyboardHeight();
  return (
    <PaneSheet visible={visible} onRequestClose={onClose} testID="note-sheet-host">
      {(insets) =>
        visible ? <NoteBody onClose={onClose} onSendNote={onSendNote} pending={pending} bottomInset={insets.bottom + keyboard} /> : null
      }
    </PaneSheet>
  );
}

function NoteBody({ onClose, onSendNote, pending, bottomInset }: Omit<NoteSheetProps, 'visible'> & { bottomInset: number }) {
  const [note, setNote] = useKeptState('composer-note', '');
  const [failed, setFailed] = useState(false);
  const send = async () => {
    if (note.trim() === '') {
      return;
    }
    if (await onSendNote(note)) {
      setNote('');
      onClose();
    } else {
      setFailed(true);
    }
  };
  return (
    <BottomSheet
      onClose={onClose}
      bottomInset={bottomInset}
      testID="note-sheet"
      foot={
        <View style={styles.foot}>
          <Button label={CANCEL} variant="text" onPress={onClose} testID="note-sheet-cancel" />
          <Button
            label={SEND_NOTE}
            variant="main"
            size="main"
            disabled={note.trim() === ''}
            pending={pending}
            onPress={() => void send()}
            testID="note-sheet-send"
          />
        </View>
      }
    >
      <TextField
        value={note}
        onChangeText={setNote}
        placeholder={NOTE_FIELD_PLACEHOLDER}
        accessibilityLabel="Note"
        multiline
        rows={3}
        maxRows={NOTE_MAX_LINES}
        autoFocus
        helper={failed ? UNSAVED_KEPT : undefined}
        invalid={failed}
        testID="note-sheet-input"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    columnGap: space.xs,
    rowGap: space.md,
  },
});
