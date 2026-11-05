import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { AppText } from '../../components/AppText';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { CANCEL, EDIT, EDITED, EDIT_UNCHANGED, SAVE_EDIT, UNSAVED_KEPT } from '../../content/product';
import { MAX_TEXT_LENGTH } from '../../domain/invariants';
import { useScreenScroll } from '../../layout/ScreenScroll';
import { useKeptState } from '../../layout/KeptState';
import { makeStyles } from '../../theme/theme';
import { radius, size, space } from '../../theme/tokens';
import { touchSlop } from '../../theme/touch';

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
  /**
   * The cook page's notes (0.4.0): ⋯ opens the Note options sheet instead of
   * its own small menu, and the sheet's Edit note opens the editor here.
   */
  onMore?: () => void;
  /** Whether the editor is open, when the caller decides (with `onMore`). */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Shows "edited" under the words. Off where the sheet offers the versions. */
  showEdited?: boolean;
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
 *
 * Two fixes from the 0.2.2 test run (0.3.0):
 *
 *   * the ⋯ sits at the top right of the words, and the menu it opens comes
 *     up right under it, at the top — so on a long note neither needs a
 *     scroll to reach;
 *   * in the editor, Save and Cancel sit above the field, and opening it
 *     scrolls the editor to the top of the screen. With the keyboard up on
 *     the cover display the buttons were below the field, under the keyboard
 *     (N3); above it, they stay in sight however long the field grows.
 *
 * Leaving the field — it loses focus, or the keyboard is closed — keeps the
 * editor open with its words and Save in sight (0.4.0, part 6): a note's words
 * span lines and are often looked over before saving, and each save keeps a
 * version, so they are not saved by leaving the field. If the editor is
 * closed from outside instead (Edit on another note), changed words are saved
 * as a new version rather than dropped.
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
  onMore,
  editing: editingProp,
  onEditingChange,
  showEdited = true,
  testID,
}: EditableWordsProps) {
  const styles = useStyles();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingOwn, setEditingOwn] = useState(false);
  const editing = editingProp ?? editingOwn;
  const setEditing = (next: boolean) => {
    setEditingOwn(next);
    onEditingChange?.(next);
  };
  // Kept through a font-size change (0.4.1): the activity is recreated.
  const [opened, setOpened] = useKeptState(`${testID ?? 'words'}-opened`, editing);
  const [draft, setDraft] = useKeptState(`${testID ?? 'words'}-draft`, words);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const editorRef = useRef<View>(null);
  const { reveal } = useScreenScroll();
  // Whether this editor closed itself (Cancel, or a save), and the latest
  // words and save, for an editor that is closed from outside.
  const closedHere = useRef(false);
  const wasEditing = useRef(editing);
  const latest = useRef({ draft, words, onSave });
  useEffect(() => {
    latest.current = { draft, words, onSave };
  });
  useEffect(() => {
    if (wasEditing.current && !editing && !closedHere.current) {
      const { draft: kept, words: now, onSave: store } = latest.current;
      if (kept !== now && kept.trim() !== '' && kept.length <= MAX_TEXT_LENGTH) {
        void store(kept);
      }
    }
    wasEditing.current = editing;
    closedHere.current = false;
  }, [editing]);

  // Opened from outside (the sheet's Edit note): start from the words now.
  if (editing !== opened) {
    setOpened(editing);
    if (editing) {
      setDraft(words);
      setProblem(null);
    }
  }

  useEffect(() => {
    if (editing) {
      reveal(editorRef.current);
    }
  }, [editing, reveal]);

  const unchanged = draft === words;
  const blank = draft.trim() === '';
  const tooLong = draft.length > MAX_TEXT_LENGTH;

  const closeHere = () => {
    closedHere.current = true;
    setEditing(false);
  };

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
      closeHere();
      return;
    }
    setProblem(failure);
  };

  if (editing) {
    return (
      <View ref={editorRef} style={styles.block} testID={`${testID}-editor`}>
        <View style={styles.editorTop}>
          <View style={styles.words}>{heading}</View>
          <View style={styles.actions} testID={`${testID}-edit-actions`}>
            <Button
              label={CANCEL}
              variant="text"
              onPress={closeHere}
              testID={`${testID}-edit-cancel`}
            />
            <Button
              label={SAVE_EDIT}
              variant="outlined"
              disabled={unchanged || blank || tooLong}
              pending={saving}
              onPress={() => void save()}
              testID={`${testID}-edit-save`}
            />
          </View>
        </View>
        <TextField
          value={draft}
          onChangeText={setDraft}
          accessibilityLabel={editLabel}
          multiline
          rows={3}
          maxRows={6}
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
          <Notice title={problem} body={UNSAVED_KEPT} tone="problem" testID={`${testID}-edit-failed`} />
        ) : null}
      </View>
    );
  }

  const menu = menuOpen ? (
    <View style={styles.actions} testID={`${testID}-menu`}>
      <Button
        label={CANCEL}
        variant="text"
        onPress={() => setMenuOpen(false)}
        testID={`${testID}-menu-cancel`}
      />
      <Button
        label={EDIT}
        variant="outlined"
        accessibilityHint={`${editLabel}. The earlier words are kept.`}
        onPress={startEditing}
        testID={`${testID}-edit`}
      />
    </View>
  ) : null;

  return (
    <View style={styles.block}>
      {/* The menu opens at the top, under the ⋯, not after a long note. */}
      {menu}
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
            accessibilityState={onMore ? undefined : { expanded: menuOpen }}
            onPress={() => (onMore ? onMore() : setMenuOpen((open) => !open))}
            style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
            hitSlop={MORE_SLOP}
            testID={`${testID}-more`}
          >
            <Icon name="more" color="inkMuted" size={size.icon - 4} />
          </Pressable>
        ) : null}
      </View>

      {caption !== undefined || (edited && showEdited) ? (
        <View style={styles.captionRow}>
          {caption !== undefined ? (
            <AppText variant="secondary" tone="inkMuted">
              {caption}
            </AppText>
          ) : null}
          {edited && showEdited ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edited. Show earlier versions"
              onPress={onShowVersions}
              style={styles.editedLink}
              hitSlop={LINK_SLOP}
              testID={`${testID}-edited`}
            >
              <AppText variant="secondary" tone="link" style={styles.editedText}>
                {EDITED}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

    </View>
  );
}

/** ⋯ is drawn 40 round and "edited" 40 tall; their hit areas make 48. */
const MORE_SLOP = touchSlop(size.iconButton, size.iconButton);
const LINK_SLOP = touchSlop(size.button);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
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
    // Pinned to the top right of the words, however long they are.
    more: {
      alignSelf: 'flex-start',
      minWidth: size.iconButton,
      minHeight: size.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.field,
      marginTop: -space.xs,
      marginRight: -space.xs,
    },
    editorTop: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    morePressed: {
      backgroundColor: colors.surfaceRaised,
    },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    editedLink: {
      minHeight: size.button,
      minWidth: size.targetMin,
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
  }),
);
