import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { StateNotice } from '../../components/StateNotice';
import { TextField } from '../../components/TextField';
import {
  CANCEL,
  EDITED,
  EDIT_UNCHANGED,
  INGREDIENTS_ADD,
  INGREDIENTS_EDIT,
  INGREDIENTS_EDIT_LABEL,
  INGREDIENTS_NONE,
  INGREDIENTS_PLACEHOLDER,
  INGREDIENTS_SAVE,
  INGREDIENTS_SHOW_LESS,
  INGREDIENTS_TITLE,
  UNSAVED_KEPT,
  ingredientsShowAll,
} from '../../content/product';
import { currentIngredients, ingredientLines } from '../../domain/cookRecord';
import type { IngredientVersion } from '../../domain/entities';
import { MAX_TEXT_LENGTH } from '../../domain/invariants';
import { useScreenScroll } from '../../layout/ScreenScroll';
import { MIN_TOUCH_TARGET, space } from '../../theme/tokens';
import type { Version } from '../cook/VersionsSheet';

/** How many lines a folded list shows. */
export const FOLDED_INGREDIENT_LINES = 4;

type IngredientsBoxProps = {
  /** Every saved version, oldest first. */
  versions: readonly IngredientVersion[];
  /**
   * Whether the cook has timeline entries yet. Before the first, an open
   * cook's empty box is a field to type or paste into; after it, a long list
   * folds so the timeline stays in reach.
   */
  hasTimeline: boolean;
  /** Open cook: the empty box is a field. Reviewed: "Add ingredients". */
  open: boolean;
  /** Saves a new version; resolves with a message when it was not saved. */
  onSave: (text: string) => Promise<string | null>;
  onShowVersions: (versions: readonly Version[]) => void;
};

/** Every version but the newest, newest first, the first one marked original. */
export function earlierIngredientVersions(versions: readonly IngredientVersion[]): readonly Version[] {
  const all = versions.map((version, index) => ({
    text: version.text,
    at: version.savedAt,
    original: index === 0,
  }));
  return all.slice(0, -1).reverse();
}

/**
 * The Ingredients box, at the top of every cook (0.3.0).
 *
 * Plain text, one item per line, stored exactly as typed or pasted. Before
 * cooking it is a field; after a save it is the list with **Edit**, and an
 * edit is a new version — "edited" opens the earlier ones, as for a note.
 * Once the timeline has entries the list folds to its first four lines and
 * "Show all N", so it never crowds out the timeline; the composer is pinned
 * below the page anyway and is never pushed off.
 */
export function IngredientsBox({ versions, hasTimeline, open, onSave, onShowVersions }: IngredientsBoxProps) {
  const current = currentIngredients(versions);
  const startsAsField = open && current === null && !hasTimeline;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const editorRef = useRef<View>(null);
  const { reveal } = useScreenScroll();

  const showingField = editing || startsAsField;

  useEffect(() => {
    if (editing) {
      reveal(editorRef.current);
    }
  }, [editing, reveal]);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    const failure = await onSave(draft);
    setSaving(false);
    if (failure === null) {
      setEditing(false);
      setExpanded(false);
      return;
    }
    setProblem(failure);
  };

  if (showingField) {
    const unchanged = current !== null && draft === current.text;
    const blank = draft.trim() === '';
    const tooLong = draft.length > MAX_TEXT_LENGTH;
    return (
      <Card testID="ingredients">
        <View ref={editorRef} style={styles.block} testID="ingredients-editor">
          <View style={styles.headerRow}>
            <AppText variant="label" tone="muted" accessibilityRole="header">
              {INGREDIENTS_TITLE}
            </AppText>
            {/* Save and Cancel above the field, so the keyboard never covers them. */}
            <View style={styles.actions}>
              {editing ? (
                <ActionButton
                  label={CANCEL}
                  variant="quiet"
                  onPress={() => {
                    setEditing(false);
                    setProblem(null);
                  }}
                  testID="ingredients-cancel"
                />
              ) : null}
              <ActionButton
                label={INGREDIENTS_SAVE}
                variant="secondary"
                disabled={blank || unchanged || tooLong}
                pending={saving}
                onPress={() => void save()}
                testID="ingredients-save"
              />
            </View>
          </View>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={INGREDIENTS_PLACEHOLDER}
            accessibilityLabel={editing ? INGREDIENTS_EDIT_LABEL : INGREDIENTS_TITLE}
            multiline
            rows={3}
            maxRows={6}
            autoFocus={editing}
            invalid={tooLong}
            helper={
              tooLong
                ? `Keep it under ${MAX_TEXT_LENGTH} characters.`
                : editing && unchanged
                  ? EDIT_UNCHANGED
                  : undefined
            }
            testID="ingredients-input"
          />
          {problem ? (
            <StateNotice title={problem} body={UNSAVED_KEPT} tone="problem" testID="ingredients-failed" />
          ) : null}
        </View>
      </Card>
    );
  }

  const startEditing = () => {
    setDraft(current?.text ?? '');
    setProblem(null);
    setEditing(true);
  };

  if (current === null) {
    return (
      <Card variant="muted" testID="ingredients">
        <View style={styles.headerRow}>
          <AppText variant="label" tone="muted" accessibilityRole="header">
            {INGREDIENTS_TITLE}
          </AppText>
          <ActionButton label={INGREDIENTS_ADD} variant="quiet" onPress={startEditing} testID="ingredients-add" />
        </View>
        <AppText variant="secondary" tone="muted">
          {INGREDIENTS_NONE}
        </AppText>
      </Card>
    );
  }

  const lines = ingredientLines(current.text);
  const folds = hasTimeline && lines.length > FOLDED_INGREDIENT_LINES;
  const shown = folds && !expanded ? lines.slice(0, FOLDED_INGREDIENT_LINES).join('\n') : current.text;

  return (
    <Card testID="ingredients">
      <View style={styles.block}>
        <View style={styles.headerRow}>
          <AppText variant="label" tone="muted" accessibilityRole="header">
            {INGREDIENTS_TITLE}
          </AppText>
          <ActionButton
            label={INGREDIENTS_EDIT}
            variant="quiet"
            accessibilityHint={`${INGREDIENTS_EDIT_LABEL}. The earlier list is kept.`}
            onPress={startEditing}
            testID="ingredients-edit"
          />
        </View>
        <AppText variant="body" testID="ingredients-text">
          {shown}
        </AppText>
        <View style={styles.footerRow}>
          {folds ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((now) => !now)}
              style={styles.link}
              testID="ingredients-show-all"
            >
              <AppText variant="label" tone="primary">
                {expanded ? INGREDIENTS_SHOW_LESS : ingredientsShowAll(lines.length)}
              </AppText>
            </Pressable>
          ) : null}
          {versions.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edited. Show earlier versions"
              onPress={() => onShowVersions(earlierIngredientVersions(versions))}
              style={styles.link}
              testID="ingredients-edited"
            >
              <AppText variant="caption" tone="primary" style={styles.underline}>
                {EDITED}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginLeft: 'auto',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.md,
  },
  link: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
