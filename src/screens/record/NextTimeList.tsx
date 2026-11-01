import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { AppText } from '../../components/AppText';
import { Notice } from '../../components/Notice';
import { NextTimeCard } from '../../components/NextTimeCard';
import { TextField } from '../../components/TextField';
import {
  ADD_NEXT_TIME,
  CANCEL,
  EDIT_NEXT_TIME,
  NEXT_TIME,
  NEXT_TIME_ACTIONS,
  NEXT_TIME_HINT,
  NEXT_TIME_OVERLINE,
  SAVE_NEXT_TIME,
  UNSAVED_KEPT,
} from '../../content/product';
import { nextTimeWords } from '../../domain/cookRecord';
import type { Lesson, LessonRevision } from '../../domain/entities';
import { MAX_TEXT_LENGTH } from '../../domain/invariants';
import { makeStyles } from '../../theme/theme';
import { radius, space } from '../../theme/tokens';
import { EditableWords } from '../cook/EditableWords';
import type { Version } from '../cook/VersionsSheet';

type NextTimeListProps = {
  /** Approved next-time lines, oldest first. */
  lessons: readonly Lesson[];
  edits: readonly LessonRevision[];
  /** Rewords a line; resolves with a message when it was not saved. */
  onRevise: (lesson: Lesson, text: string) => Promise<string | null>;
  /** Adds a line; resolves with a message when it was not saved. */
  onAdd: (text: string) => Promise<string | null>;
  onShowVersions: (versions: readonly Version[]) => void;
};

/** Every earlier wording of one next-time line, newest first, the first marked original. */
export function earlierNextTimeVersions(lesson: Lesson, edits: readonly LessonRevision[]): readonly Version[] {
  const mine = edits
    .filter((edit) => edit.lessonId === lesson.id)
    .sort((left, right) => (left.revisedAt < right.revisedAt ? -1 : left.revisedAt > right.revisedAt ? 1 : 0));
  const all: Version[] = [
    { text: lesson.text, at: lesson.createdAt, original: true },
    ...mine.map((edit) => ({ text: edit.text, at: edit.revisedAt, original: false })),
  ];
  return all.slice(0, -1).reverse();
}

/**
 * "Next time" on a reviewed cook's page (0.3.0): the lines shown before this
 * dish is cooked again. Each can be edited — the first words are kept, as a
 * note's are — and a line can be added after the review.
 */
export function NextTimeList({ lessons, edits, onRevise, onAdd, onShowVersions }: NextTimeListProps) {
  const styles = useStyles();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    setSaving(true);
    setProblem(null);
    const failure = await onAdd(draft);
    setSaving(false);
    if (failure === null) {
      setDraft('');
      setAdding(false);
      return;
    }
    setProblem(failure);
  };

  return (
    <NextTimeCard label={NEXT_TIME_OVERLINE} lines={[]} testID="next-time">
      <AppText variant="secondary" tone="inkMuted">
        {NEXT_TIME_HINT}
      </AppText>
      {lessons.map((lesson) => {
        const shown = nextTimeWords(lesson, edits);
        return (
          <EditableWords
            key={lesson.id}
            words={shown.text}
            edited={shown.edited}
            editable
            onSave={(text) => onRevise(lesson, text)}
            onShowVersions={() => onShowVersions(earlierNextTimeVersions(lesson, edits))}
            actionsLabel={NEXT_TIME_ACTIONS}
            editLabel={EDIT_NEXT_TIME}
            testID={`lesson-${lesson.id}`}
          />
        );
      })}
      {adding ? (
        <View style={styles.form}>
          <View style={styles.actions}>
            <Button label={CANCEL} variant="text" onPress={() => setAdding(false)} />
            <Button
              label={SAVE_NEXT_TIME}
              variant="outlined"
              disabled={draft.trim() === '' || draft.length > MAX_TEXT_LENGTH}
              pending={saving}
              onPress={() => void add()}
              testID="next-time-save"
            />
          </View>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder={NEXT_TIME_HINT}
            accessibilityLabel={NEXT_TIME}
            multiline
            rows={2}
            maxRows={5}
            autoFocus
            testID="next-time-input"
          />
          {problem ? <Notice title={problem} body={UNSAVED_KEPT} tone="problem" /> : null}
        </View>
      ) : (
        <Button
          label={ADD_NEXT_TIME}
          variant="text"
          onPress={() => setAdding(true)}
          style={styles.add}
          testID="next-time-add"
        />
      )}
    </NextTimeCard>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    // The Last time and Next time panel (scheme A).
    block: {
      gap: space.xs,
      marginTop: space.xs,
      padding: space.sm,
      borderRadius: radius.field,
      borderWidth: 1,
      borderColor: colors.nextLine,
      backgroundColor: colors.next,
    },
    form: {
      gap: space.xs,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: space.xs,
    },
    add: {
      alignSelf: 'flex-start',
    },
  }),
);
