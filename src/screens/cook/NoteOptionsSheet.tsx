import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { BottomSheet } from '../../components/BottomSheet';
import { Icon, type IconName } from '../../components/Icon';
import { EARLIER_VERSIONS_SHORT, EDITED, EDIT_NOTE } from '../../content/product';
import { PaneSheet } from '../../layout/panes';
import { makeStyles } from '../../theme/theme';
import { radius, size, space } from '../../theme/tokens';

export type NoteOptions = {
  /** The note's words as they now read. */
  readonly words: string;
  /** "6:05 pm". */
  readonly time: string;
  readonly edited: boolean;
  /** How many earlier versions there are. */
  readonly earlier: number;
  /** The note's own test id, so the sheet's rows are `<id>-edit` and `<id>-versions`. */
  readonly testID: string;
  readonly canEdit: boolean;
};

type NoteOptionsSheetProps = {
  note: NoteOptions | null;
  onEdit: () => void;
  onVersions: () => void;
  onClose: () => void;
};

/**
 * Note options (0.4.0): the note at the top with its time and "edited", then
 * Edit note and Earlier versions with how many. A note is never deleted — the
 * rules keep everything written down — so there is no Delete here.
 */
export function NoteOptionsSheet({ note, onEdit, onVersions, onClose }: NoteOptionsSheetProps) {
  const styles = useStyles();
  return (
    <PaneSheet visible={note !== null} onRequestClose={onClose} testID="note-options">
      {(insets) =>
        note === null ? null : (
          <BottomSheet onClose={onClose} bottomInset={insets.bottom} testID={`${note.testID}-menu`}>
            <View style={styles.note}>
              <View style={styles.circle}>
                <Icon name="pencil" color="ink" size={size.iconSmall + 2} />
              </View>
              <View style={styles.words}>
                <AppText variant="body">{note.words}</AppText>
                <AppText variant="secondary" tone="inkMuted">
                  {note.edited ? `${note.time} · ${EDITED}` : note.time}
                </AppText>
              </View>
            </View>
            {note.canEdit ? (
              <OptionRow icon="pencil" label={EDIT_NOTE} onPress={onEdit} testID={`${note.testID}-edit`} />
            ) : null}
            {note.earlier > 0 ? (
              <OptionRow
                icon="history"
                label={EARLIER_VERSIONS_SHORT}
                detail={String(note.earlier)}
                onPress={onVersions}
                testID={`${note.testID}-versions`}
              />
            ) : null}
          </BottomSheet>
        )
      }
    </PaneSheet>
  );
}

function OptionRow({
  icon,
  label,
  detail,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <Icon name={icon} color="ink" />
      <AppText variant="bodyStrong" style={styles.rowLabel}>
        {label}
      </AppText>
      {detail ? (
        <AppText variant="secondary" tone="inkMuted">
          {detail}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      padding: space.sm,
      borderRadius: radius.field,
      backgroundColor: colors.page,
    },
    circle: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      backgroundColor: colors.noteIcon,
      alignItems: 'center',
      justifyContent: 'center',
    },
    words: {
      flex: 1,
      gap: space.xxs,
    },
    row: {
      minHeight: size.targetMain,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.xs,
      borderRadius: radius.field,
    },
    pressed: {
      backgroundColor: colors.surfaceRaised,
    },
    rowLabel: {
      flex: 1,
    },
  }),
);
