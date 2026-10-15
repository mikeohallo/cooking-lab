import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStorage } from '../app/StorageProvider';
import { useCook } from '../app/useCook';
import { useWrite } from '../app/useWrite';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import { TextField } from '../components/TextField';
import {
  AI_NOT_CONNECTED_BODY,
  AI_NOT_CONNECTED_TITLE,
  BACK_TO_HOME,
  COOK_NOT_FOUND_BODY,
  COOK_NOT_FOUND_TITLE,
  FINISH_REVIEW,
  RAW_EVIDENCE,
  RETRY,
  REVIEW_PROMPT,
  REVIEW_TITLE,
  SUGGESTIONS,
  TAKEAWAY_LABEL,
  TAKEAWAY_PLACEHOLDER,
  UNSAVED_KEPT,
  UNTITLED_COOK,
  VERDICT_PLACEHOLDER,
} from '../content/product';
import type { CookId } from '../domain/entities';
import { createUserLesson } from '../domain/evidence';
import { MAX_TEXT_LENGTH } from '../domain/invariants';
import { formatDateTime } from '../format/dateTime';
import { space } from '../theme/tokens';
import { TimelineEvent } from './cook/TimelineEvent';

type ReviewScreenProps = {
  cookId: CookId;
  onBack: () => void;
  /** Called once the review is saved, with the cook now reviewed. */
  onFinished: (cookId: CookId) => void;
};

/**
 * Review: one large question, answered in the cook's own words.
 *
 * Entering the screen records `reviewOpenedAt` once, so the time between
 * opening and saving can later say whether a review really takes under a
 * minute. The verdict is stored exactly as typed. Suggestions are not
 * connected in this version and the screen says so calmly rather than
 * pretending an assistant ran; the cook is complete with a verdict alone.
 */
export function ReviewScreen({ cookId, onBack, onFinished }: ReviewScreenProps) {
  const { data, newId, now } = useStorage();
  const { load, reload, acceptCook } = useCook(cookId);
  const openWrite = useWrite();
  const saveWrite = useWrite();
  // `null` until the person types: the field then shows whatever verdict the
  // cook already carried, and keystrokes are never overwritten by a reload.
  const [verdictDraft, setVerdictDraft] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState('');
  const [lessonProblem, setLessonProblem] = useState<string | null>(null);
  const opened = useRef(false);

  // Record that the review was opened, once per cook, the first time the
  // loaded cook is seen without a `reviewOpenedAt`.
  const runOpen = openWrite.run;
  useEffect(() => {
    if (load.status !== 'ready' || opened.current) {
      return;
    }
    const { cook } = load;
    opened.current = true;
    if (cook.status !== 'open' || cook.reviewOpenedAt !== null) {
      return;
    }
    void runOpen(() => data.capture.openReview(cook.id, 'user', now())).then((result) => {
      if (result.ok) {
        acceptCook(result.record);
      }
    });
  }, [load, data, now, runOpen, acceptCook]);

  if (load.status === 'loading') {
    return (
      <ScreenContainer testID="review-loading">
        <ScreenHeader title={REVIEW_TITLE} onBack={onBack} />
      </ScreenContainer>
    );
  }

  if (load.status === 'missing') {
    return (
      <ScreenContainer testID="review-missing">
        <ScreenHeader title={COOK_NOT_FOUND_TITLE} onBack={onBack} />
        <StateNotice
          title={COOK_NOT_FOUND_TITLE}
          body={COOK_NOT_FOUND_BODY}
          tone="problem"
          action={{ label: BACK_TO_HOME, onPress: onBack }}
        />
      </ScreenContainer>
    );
  }

  if (load.status === 'failed') {
    return (
      <ScreenContainer testID="review-failed">
        <ScreenHeader title={REVIEW_TITLE} onBack={onBack} />
        <StateNotice
          title="This cook could not be loaded"
          body={`Nothing was changed. ${load.message}`}
          tone="problem"
          action={{ label: RETRY, onPress: () => void reload() }}
        />
      </ScreenContainer>
    );
  }

  const { cook, events } = load;
  const verdict = verdictDraft ?? cook.verdict ?? '';
  const verdictTooLong = verdict.length > MAX_TEXT_LENGTH;
  const takeawayTooLong = takeaway.trim().length > MAX_TEXT_LENGTH;

  const finish = async () => {
    // The verdict goes to the store exactly as typed. An empty field is no
    // verdict, which the model permits: a thin record is still a record.
    const saved = await saveWrite.run(() =>
      data.capture.saveReview(cook.id, verdict === '' ? null : verdict, 'user', now()),
    );
    if (!saved.ok) {
      return;
    }
    acceptCook(saved.record);

    const lessonText = takeaway.trim();
    if (lessonText !== '') {
      const decision = createUserLesson(
        { cookId: cook.id, text: lessonText },
        { id: newId() },
        'user',
        now(),
      );
      if (!decision.allowed) {
        setLessonProblem(decision.message);
        return;
      }
      try {
        await data.lessons.create(decision.record);
      } catch (cause: unknown) {
        setLessonProblem(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    }

    onFinished(cook.id);
  };

  return (
    <ScreenContainer
      testID="review-screen"
      footer={
        <ActionButton
          label={FINISH_REVIEW}
          variant="primary"
          size="hero"
          onPress={() => void finish()}
          disabled={verdictTooLong || takeawayTooLong}
          pending={saveWrite.state.status === 'pending'}
          testID="finish-review"
        />
      }
    >
      <ScreenHeader
        title={cook.title ?? UNTITLED_COOK}
        subtitle={`${REVIEW_TITLE} · ${formatDateTime(cook.startedAt)}`}
        onBack={onBack}
      />

      {saveWrite.state.status === 'failed' ? (
        <StateNotice
          title={saveWrite.state.message}
          body={UNSAVED_KEPT}
          tone="problem"
          testID="review-save-failed"
        />
      ) : null}
      {lessonProblem ? (
        <StateNotice
          title="Your verdict was saved, but the takeaway was not"
          body={`${lessonProblem} ${UNSAVED_KEPT}`}
          tone="problem"
          action={{ label: RETRY, onPress: () => void finish() }}
          testID="lesson-save-failed"
        />
      ) : null}

      <View style={styles.section}>
        <AppText variant="sectionTitle">{REVIEW_PROMPT}</AppText>
        <TextField
          value={verdict}
          onChangeText={setVerdictDraft}
          placeholder={VERDICT_PLACEHOLDER}
          accessibilityLabel={REVIEW_PROMPT}
          multiline
          rows={6}
          invalid={verdictTooLong}
          helper={verdictTooLong ? `Keep it under ${MAX_TEXT_LENGTH} characters.` : undefined}
          testID="verdict-input"
        />
      </View>

      <View style={styles.section}>
        <TextField
          label={TAKEAWAY_LABEL}
          value={takeaway}
          onChangeText={setTakeaway}
          placeholder={TAKEAWAY_PLACEHOLDER}
          multiline
          rows={2}
          invalid={takeawayTooLong}
          helper={takeawayTooLong ? `Keep it under ${MAX_TEXT_LENGTH} characters.` : undefined}
          testID="takeaway-input"
        />
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle">{SUGGESTIONS}</AppText>
        <StateNotice title={AI_NOT_CONNECTED_TITLE} body={AI_NOT_CONNECTED_BODY} testID="ai-unavailable" />
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle">{RAW_EVIDENCE}</AppText>
        {events.length === 0 ? (
          <Card variant="muted">
            <AppText variant="secondary" tone="muted">
              Nothing was noted during this cook. The verdict will be its record.
            </AppText>
          </Card>
        ) : (
          <View style={styles.evidence} testID="review-evidence">
            {events.map((event) => (
              <TimelineEvent key={event.id} event={event} />
            ))}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.xs,
    marginBottom: space.lg,
  },
  evidence: {
    gap: space.xs,
  },
});
