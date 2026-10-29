import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { StateNotice } from '../../components/StateNotice';
import { TagChip } from '../../components/TagChip';
import { TextField } from '../../components/TextField';
import {
  ADD_TAG,
  ADD_TAG_PLACEHOLDER,
  HIDE_MY_TAGS,
  NO_TAGS_YET,
  SHOW_MY_TAGS,
  TAGS_LABEL,
  TAG_FAILED_TITLE,
  USED_BEFORE,
} from '../../content/product';
import type { CookId, Tag } from '../../domain/entities';
import { MAX_TAG_ENTRY_LENGTH } from '../../domain/invariants';
import { useCookTags } from '../../state/useCookTags';
import { space } from '../../theme/tokens';

type TagEditorProps = {
  cookId: CookId;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
  /** Prints the control's own "Tags" label. Off where the screen heads it already. */
  labelled?: boolean;
  testID?: string;
};

/**
 * Tagging a cook: the whole control, used everywhere a cook is tagged.
 *
 * One component for the cook's own page — open or reviewed, because a cook is
 * most often named and filed after it has been eaten — and for Review. Three
 * ways in, in the order a person reaches for them:
 *
 *   the chips      what is already on this cook, each one tappable to take off;
 *   the field      type it, with his own matching tags offered as he goes;
 *   *Used before:* the tags he reaches for most, that are not on this cook yet,
 *                  as one tap each;
 *   *Show me my tags*  every tag he has ever made, in one alphabet, with the
 *                  ones on this cook already ticked.
 *
 * The field is the slowest of the four and is deliberately not the only one: a
 * notebook whose filing needs typing is a notebook that stops being filed.
 * The suggestions and *Show me my tags* offer every tag ever created, even one
 * that is on no cook right now: taking a tag off a cook never deletes it, so it
 * must not quietly vanish from the lists either. *Used before:* counts cooks,
 * so it holds only tags that are on one.
 *
 * `labelled` is false where the screen already gives the control a heading of
 * its own (Review), so the word "Tags" is never printed twice.
 */
export function TagEditor({
  cookId,
  refreshToken = 0,
  labelled = true,
  testID = 'tag-editor',
}: TagEditorProps) {
  const tagging = useCookTags(cookId, refreshToken);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<readonly Tag[]>([]);
  const [showingAll, setShowingAll] = useState(false);

  // Suggestions follow the field a keystroke behind, which is as fast as a
  // local query needs to be and avoids a query per character on a phone.
  const suggest = tagging.suggest;
  useEffect(() => {
    let live = true;
    suggest(draft).then((matches) => {
      if (live) {
        setSuggestions(matches);
      }
    });
    return () => {
      live = false;
    };
  }, [draft, suggest]);

  const submit = async () => {
    const added = await tagging.add(draft);
    if (added) {
      setDraft('');
    }
  };

  const onCook = new Set(tagging.tags.map((tag) => tag.id));

  return (
    <View style={styles.editor} testID={testID}>
      {labelled ? (
        <AppText variant="label" tone="muted" testID="tag-editor-label">
          {TAGS_LABEL}
        </AppText>
      ) : null}

      {tagging.tags.length > 0 ? (
        <View style={styles.chips} testID="cook-tags">
          {tagging.tags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              variant="removable"
              disabled={tagging.saving}
              onPress={() => void tagging.remove(tag.id)}
              testID={`cook-tag-${tag.id}`}
            />
          ))}
        </View>
      ) : tagging.loading ? null : (
        <AppText variant="secondary" tone="muted" testID="cook-tags-empty">
          {NO_TAGS_YET}
        </AppText>
      )}

      {tagging.problem ? (
        <StateNotice
          title={TAG_FAILED_TITLE}
          body={tagging.problem}
          tone="problem"
          testID="tag-problem"
        />
      ) : null}

      <View style={styles.addRow}>
        <View style={styles.addField}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={ADD_TAG_PLACEHOLDER}
            accessibilityLabel="Add a tag"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX_TAG_ENTRY_LENGTH}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
            testID="tag-input"
          />
        </View>
        <ActionButton
          label={ADD_TAG}
          variant="secondary"
          disabled={draft.trim() === ''}
          pending={tagging.saving}
          onPress={() => void submit()}
          testID="tag-add"
        />
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.chips} testID="tag-suggestions">
          {suggestions.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              variant="pick"
              disabled={tagging.saving}
              onPress={() => {
                setDraft('');
                void tagging.addExisting(tag);
              }}
              testID={`tag-suggestion-${tag.id}`}
            />
          ))}
        </View>
      ) : null}

      {tagging.usedBefore.length > 0 ? (
        <View style={styles.block} testID="tags-used-before">
          <AppText variant="label" tone="muted">
            {USED_BEFORE}
          </AppText>
          <View style={styles.chips}>
            {tagging.usedBefore.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                variant="pick"
                disabled={tagging.saving}
                onPress={() => void tagging.addExisting(tag)}
                testID={`tag-used-before-${tag.id}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {tagging.allTags.length > 0 ? (
        <ActionButton
          label={showingAll ? HIDE_MY_TAGS : SHOW_MY_TAGS}
          variant="quiet"
          onPress={() => setShowingAll((open) => !open)}
          testID="show-my-tags"
        />
      ) : null}

      {showingAll ? (
        <View style={styles.chips} testID="all-tags">
          {tagging.allTags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              variant={onCook.has(tag.id) ? 'selected' : 'pick'}
              disabled={tagging.saving}
              onPress={() => void tagging.toggle(tag)}
              testID={`all-tag-${tag.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: space.xs,
  },
  block: {
    gap: space.xxs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  addField: {
    flexGrow: 1,
    flexShrink: 1,
  },
});
