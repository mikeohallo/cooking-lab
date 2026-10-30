import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStorage } from '../state/StorageProvider';
import { useCook } from '../state/useCook';
import { useCookRecord } from '../state/useCookRecord';
import { usePhotoUris } from '../state/usePhotoUris';
import { useWrite } from '../state/useWrite';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { MealTypeLabel } from '../components/MealTypeLabel';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import { TextField } from '../components/TextField';
import {
  AI_NOT_CONNECTED_BODY,
  AI_NOT_CONNECTED_TITLE,
  BACK_TO_HOME,
  TAGS_LABEL,
  COOK_NOT_FOUND_BODY,
  COOK_NOT_FOUND_TITLE,
  FINISH_REVIEW,
  HOUSEHOLD_DONE,
  HOUSEHOLD_SKIP,
  NEXT_TIME,
  NEXT_TIME_HINT,
  RAW_EVIDENCE,
  RETRY,
  REVIEW_TITLE,
  SUGGESTIONS,
  TAKEAWAY_PLACEHOLDER,
  UNSAVED_KEPT,
  UNTITLED_COOK,
  WHO_ATE_IT,
  WHO_USUALLY_EATS,
  WHO_USUALLY_EATS_BODY,
  YOUR_NOTES,
  YOUR_NOTES_PLACEHOLDER,
} from '../content/product';
import { HOUSEHOLD_ASKED_KEY } from '../data/sqlite/cookRecord';
import type { CookId, HouseholdMember } from '../domain/entities';
import type { MealType } from '../domain/enums';
import {
  createUserLesson,
  type EvidenceDecision,
  type RatingAnswer,
  type RatingPerson,
} from '../domain/evidence';
import { activeMembers } from '../domain/household';
import { MAX_TEXT_LENGTH } from '../domain/invariants';
import { formatDateTime } from '../format/dateTime';
import { space } from '../theme/tokens';
import { TimelineEvent } from './cook/TimelineEvent';
import { VersionsSheet, earlierVersions, type Version } from './cook/VersionsSheet';
import { HouseholdEditor } from './record/HouseholdEditor';
import { MealTypeChips } from './record/MealTypeChips';
import { WhoAteIt } from './record/WhoAteIt';
import { TagEditor } from './tags/TagEditor';

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
  const [versions, setVersions] = useState<readonly Version[] | null>(null);
  const photoUris = usePhotoUris(load.status === 'ready' ? load.events : EMPTY_EVENTS);
  const { record, acceptMealType, acceptRating, acceptHousehold } = useCookRecord(cookId);
  // "Who usually eats?" is asked the first time a review opens with nobody on
  // the list, and never again once answered or skipped.
  const [askHousehold, setAskHousehold] = useState(false);
  const asked = useRef(false);
  const { settings } = data;
  const householdEmpty =
    record.status === 'ready' && activeMembers(record.household).length === 0;
  useEffect(() => {
    if (!householdEmpty || asked.current) {
      return;
    }
    asked.current = true;
    settings
      .get(HOUSEHOLD_ASKED_KEY)
      .then((value) => setAskHousehold(value === null))
      .catch(() => setAskHousehold(false));
  }, [householdEmpty, settings]);

  const finishAsking = () => {
    setAskHousehold(false);
    void settings.set(HOUSEHOLD_ASKED_KEY, 'yes').catch(() => {});
  };

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

  const { cook, events, revisions } = load;
  const verdict = verdictDraft ?? cook.verdict ?? '';
  const verdictTooLong = verdict.length > MAX_TEXT_LENGTH;
  const takeawayTooLong = takeaway.trim().length > MAX_TEXT_LENGTH;

  const attempt = async <T,>(
    write: () => Promise<EvidenceDecision<T>>,
    accept: (value: T) => void,
  ): Promise<string | null> => {
    try {
      const decision = await write();
      if (!decision.allowed) {
        return decision.message;
      }
      accept(decision.record);
      return null;
    } catch (cause: unknown) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  };

  const saveMealType = (mealType: MealType) =>
    attempt(() => data.cookRecord.setMealType(cook.id, mealType, 'user', now()), acceptMealType);

  const rate = (person: RatingPerson, answer: RatingAnswer) =>
    attempt(
      () => data.cookRecord.rate(cook.id, person, answer, { id: newId() }, 'user', now()),
      (rating) => acceptRating(rating, person),
    );

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
        eyebrow={
          record.status === 'ready' ? (
            <MealTypeLabel mealType={record.mealType?.mealType ?? null} testID="review-meal-label" />
          ) : null
        }
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

      {record.status === 'ready' && askHousehold ? (
        <Card testID="household-prompt">
          <AppText variant="sectionTitle" accessibilityRole="header">
            {WHO_USUALLY_EATS}
          </AppText>
          <AppText variant="secondary" tone="muted">
            {WHO_USUALLY_EATS_BODY}
          </AppText>
          <HouseholdEditor
            members={record.household}
            onChanged={(members: readonly HouseholdMember[]) => acceptHousehold(members)}
            testID="household-prompt-editor"
          />
          <View style={styles.promptActions}>
            <ActionButton
              label={HOUSEHOLD_SKIP}
              variant="quiet"
              onPress={finishAsking}
              testID="household-prompt-skip"
            />
            <ActionButton
              label={HOUSEHOLD_DONE}
              variant="secondary"
              onPress={finishAsking}
              testID="household-prompt-done"
            />
          </View>
        </Card>
      ) : null}

      {record.status === 'ready' ? (
        <View style={styles.section}>
          <AppText variant="sectionTitle">{WHO_ATE_IT}</AppText>
          <WhoAteIt household={record.household} ratings={record.ratings} onRate={rate} />
        </View>
      ) : null}

      {record.status === 'ready' ? (
        <View style={styles.section}>
          <MealTypeChips value={record.mealType?.mealType ?? null} onChange={saveMealType} />
        </View>
      ) : null}

      <View style={styles.section}>
        <AppText variant="sectionTitle">{YOUR_NOTES}</AppText>
        <TextField
          value={verdict}
          onChangeText={setVerdictDraft}
          placeholder={YOUR_NOTES_PLACEHOLDER}
          accessibilityLabel={YOUR_NOTES}
          multiline
          rows={6}
          invalid={verdictTooLong}
          helper={verdictTooLong ? `Keep it under ${MAX_TEXT_LENGTH} characters.` : undefined}
          testID="verdict-input"
        />
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle">{NEXT_TIME}</AppText>
        <TextField
          value={takeaway}
          onChangeText={setTakeaway}
          placeholder={TAKEAWAY_PLACEHOLDER}
          accessibilityLabel={NEXT_TIME}
          accessibilityHint={NEXT_TIME_HINT}
          multiline
          rows={2}
          invalid={takeawayTooLong}
          helper={takeawayTooLong ? `Keep it under ${MAX_TEXT_LENGTH} characters.` : NEXT_TIME_HINT}
          testID="takeaway-input"
        />
      </View>

      {/*
        Filing the cook is part of sitting down with it, so the same tag
        control is here as on the cook's own page — the chips, the field, the
        tags he reaches for most and the whole alphabet. This is the moment he
        has the words for it: he has just eaten the thing.
      */}
      <View style={styles.section}>
        <AppText variant="sectionTitle">{TAGS_LABEL}</AppText>
        {/* The section title above is the heading; the control prints none. */}
        <TagEditor cookId={cook.id} labelled={false} />
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
              <TimelineEvent
                key={event.id}
                event={event}
                // A note shows its newest words, and "edited" opens the earlier
                // ones; editing itself is on the cook's own page, not here.
                note={
                  event.kind === 'user_note'
                    ? {
                        revisions: revisions.filter((edit) => edit.cookEventId === event.id),
                        editable: false,
                        onSave: async () => null,
                        onShowVersions: () =>
                          setVersions(
                            earlierVersions(
                              event.body,
                              event.ts,
                              revisions.filter((edit) => edit.cookEventId === event.id),
                            ),
                          ),
                      }
                    : undefined
                }
                // Shown, but with no way to open one full screen and therefore
                // no way to remove one: Review is for looking at the evidence
                // and saying how it went, not for editing it.
                photo={
                  event.kind === 'photo' ? { uri: photoUris[event.id] ?? null } : undefined
                }
              />
            ))}
          </View>
        )}
      </View>

      <VersionsSheet versions={versions} onClose={() => setVersions(null)} />
    </ScreenContainer>
  );
}

/** A stable empty array while the cook is still loading. See `CookScreen`. */
const EMPTY_EVENTS: readonly never[] = [];

const styles = StyleSheet.create({
  section: {
    gap: space.xs,
    marginBottom: space.lg,
  },
  evidence: {
    gap: space.xs,
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.xs,
  },
});
