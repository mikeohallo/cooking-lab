import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { StateNotice } from '../../components/StateNotice';
import { TextField } from '../../components/TextField';
import { CANCEL, EDIT, EDITED, EDIT_UNCHANGED, SAVE_EDIT, UNSAVED_KEPT } from '../../content/product';
import { MAX_TEXT_LENGTH } from '../../domain/invariants';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../../theme/tokens';

type EditableWordsProps = {
  /** The words as they now read: the newest edit, or the original. */
  words: string;
  /** True once there has been an edit; shows "edited", which opens the versions. */
  edited: boolean;
  /** The muted line under the words, e.g. the note's time. */
  caption?: string;
  /** Offers ⋯ → Edit. False shows the words read-only. */
  editable: boolean;
  /** Saves new words. Resolves with a message when they were not saved. */
  onSave: (text: string) => Promise<string | null>;
  onShowVersions: () => void;
  /** What the ⋯ button is called for a screen reader. */
  actionsLabel: string;
  /** What the Edit action and the editor are called. */
  editLabel: string;
  /** Rendered above the words, e.g. "Verdict". */
  heading?: ReactNode;
  testID: string;
};

/**
 * The cook's own words, with a way to change them that keeps the old ones.
 *
 * ⋯ (48 dp) offers **Edit**; Edit opens the words in a field; **Save** stores a
 * new version beside the old one (rule 11). The words shown are always the
 * newest, and once there has been an edit the line under them says "edited",
 * which opens every earlier version with its time. The ⋯ is there so that
 * editing never depends on a long-press, and so the words themselves stay
 * plain text a thumb can scroll past without starting anything.
 */
export function EditableWords({
  words,
  edited,
  caption,
  editable,
  onSave,
  onShowVersions,
  actionsLabel,
  editLabel,
  heading,
  testID,
}: EditableWordsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(words);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const unchanged = draft === words;
  const blank = draft.trim() === '';
  const tooLong = draft.length > MAX_TEXT_LENGTH;

  const startEditing = () => {
    setDraft(words);
    setProblem(null);
    setMenuOpen(false);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const failure = await onSave(draft);
    setSaving(false);
    if (failure === null) {
      setEditing(false);
      return;
    }
    setProblem(failure);
  };

  if (editing) {
    return (
      <View style={styles.block} testID={`${testID}-editor`}>
        {heading}
        <TextField
          value={draft}
          onChangeText={setDraft}
          accessibilityLabel={editLabel}
          multiline
          rows={3}
          maxRows={8}
          autoFocus
          invalid={blank || tooLong}
          helper={
            blank
              ? 'Write something first. One word is enough.'
              : tooLong
                ? `Keep it under ${MAX_TEXT_LENGTH} characters.`
                : unchanged
                  ? EDIT_UNCHANGED
                  : undefined
          }
          testID={`${testID}-edit-input`}
        />
        {problem ? (
          <StateNotice title={problem} body={UNSAVED_KEPT} tone="problem" testID={`${testID}-edit-failed`} />
        ) : null}
        <View style={styles.actions}>
          <ActionButton
            label={CANCEL}
            variant="quiet"
            onPress={() => setEditing(false)}
            testID={`${testID}-edit-cancel`}
          />
          <ActionButton
            label={SAVE_EDIT}
            variant="secondary"
            disabled={unchanged || blank || tooLong}
            pending={saving}
            onPress={() => void save()}
            testID={`${testID}-edit-save`}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.words}>
          {heading}
          <AppText variant="body" testID={`${testID}-words`}>
            {words}
          </AppText>
        </View>
        {editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionsLabel}
            accessibilityState={{ expanded: menuOpen }}
            onPress={() => setMenuOpen((open) => !open)}
            style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
            hitSlop={4}
            testID={`${testID}-more`}
          >
            <AppText variant="bodyStrong" tone="muted" importantForAccessibility="no">
              ⋯
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {caption !== undefined || edited ? (
        <View style={styles.captionRow}>
          {caption !== undefined ? (
            <AppText variant="caption" tone="muted">
              {caption}
            </AppText>
          ) : null}
          {edited ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edited. Show earlier versions"
              onPress={onShowVersions}
              style={styles.editedLink}
              testID={`${testID}-edited`}
            >
              <AppText variant="caption" tone="primary" style={styles.editedText}>
                {EDITED}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {menuOpen ? (
        <View style={styles.actions} testID={`${testID}-menu`}>
          <ActionButton
            label={CANCEL}
            variant="quiet"
            onPress={() => setMenuOpen(false)}
            testID={`${testID}-menu-cancel`}
          />
          <ActionButton
            label={EDIT}
            variant="secondary"
            accessibilityHint={`${editLabel}. The earlier words are kept.`}
            onPress={startEditing}
            testID={`${testID}-edit`}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  words: {
    flexGrow: 1,
    flexShrink: 1,
    gap: space.xxs,
  },
  more: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    marginTop: -space.xs,
    marginRight: -space.xs,
  },
  morePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  editedLink: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  editedText: {
    textDecorationLine: 'underline',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.xs,
  },
});
