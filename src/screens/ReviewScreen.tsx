import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useStorage } from '../state/StorageProvider';
import { useCardPhotoUris } from '../state/useCardPhotos';
import { useCook } from '../state/useCook';
import { useCookRecord } from '../state/useCookRecord';
import { useWrite } from '../state/useWrite';
import { Button } from '../components/Button';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { ScreenContainer } from '../components/ScreenContainer';
import { Notice } from '../components/Notice';
import { TextField } from '../components/TextField';
import { TopBar } from '../components/TopBar';
import {
  BACK_TO_HOME,
  BACK_TO_THE_COOK,
  COOK_NOT_FOUND_BODY,
  COOK_NOT_FOUND_TITLE,
  CUISINE_HEADING,
  EDIT_REVIEW,
  FINISH_REVIEW,
  HOUSEHOLD_DONE,
  HOUSEHOLD_SKIP,
  NEXT_TIME,
  NEXT_TIME_SHOWN,
  NOTES_EMPTY_ON_EDIT,
  OPTIONAL,
  RETRY,
  REVIEW_TITLE,
  SAVE_REVIEW,
  TAKEAWAY_PLACEHOLDER,
  UNSAVED_KEPT,
  UNTITLED_COOK,
  WHAT_WAS_IT,
  WHO_ATE_IT,
  WHO_USUALLY_EATS,
  WHO_USUALLY_EATS_BODY,
  YOUR_NOTES,
  YOUR_NOTES_PLACEHOLDER,
} from '../content/product';
import { HOUSEHOLD_ASKED_KEY } from '../data/sqlite/cookRecord';
import type { CookId, HouseholdMember, LessonId } from '../domain/entities';
import { nextTimeWords, timesCookedLine } from '../domain/cookRecord';
import type { MealType } from '../domain/enums';
import {
  createUserLesson,
  latestWords,
  type EvidenceDecision,
  type RatingAnswer,
  type RatingPerson,
} from '../domain/evidence';
import { activeMembers } from '../domain/household';
import { MAX_TEXT_LENGTH } from '../domain/invariants';
import { formatDayAndTime } from '../format/dateTime';
import { KeptStateProvider, useKeptStore } from '../layout/KeptState';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { makeStyles } from '../theme/theme';
import { radius, size, space, type ColorRole } from '../theme/tokens';
import { CuisineChips } from './record/CuisineChips';
import { HouseholdEditor } from './record/HouseholdEditor';
import { MealTypeChips } from './record/MealTypeChips';
import { WhoAteIt } from './record/WhoAteIt';

type ReviewScreenProps = {
  cookId: CookId;
  onBack: () => void;
  /** Called once the review is saved, with the cook now reviewed. */
  onFinished: (cookId: CookId) => void;
};

/**
 * Finish review and Edit review (0.4.0, part 2): one screen.
 *
 * Back to the cook; the title and its photo; What was it? (the five meals);
 * Cuisine, optional (the ten and + Other); Who ate it?, a row per person on a
 * rail; Your notes; and Next time, in amber, "shown before you cook this
 * again". Finish review is pinned at the foot.
 *
 * The meal, cuisine and ratings save as they are tapped. Your notes and Next
 * time save with Finish review — or, on a cook already reviewed, Save review:
 * changed words become a new version beside the old ones, never a second save
 * over them (rule 11).
 *
 * Opening an open cook's review records `reviewOpenedAt` once. The verdict is
 * stored exactly as typed; the cook is complete with nothing filled in.
 */
export function ReviewScreen({ cookId, onBack, onFinished }: ReviewScreenProps) {
  const styles = useStyles();
  // On the inner display (0.4.0): the title, what it was, cuisine and your
  // notes on the left; who ate it and next time on the right, with Finish
  // review pinned at its foot.
  const { twoPane: split } = useLayoutMetrics();
  // Words being typed for a person, kept while Who ate it? moves between panes.
  const kept = useKeptStore();
  const { data, newId, now } = useStorage();
  const { load, reload, acceptCook } = useCook(cookId);
  const openWrite = useWrite();
  const saveWrite = useWrite();
  // `null` until the person types: the field shows the words the cook already
  // carries, and keystrokes are never overwritten by a reload.
  const [verdictDraft, setVerdictDraft] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState('');
  const [lessonDrafts, setLessonDrafts] = useState<Readonly<Record<LessonId, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [lessonProblem, setLessonProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const opened = useRef(false);
  const titlePhoto = useCardPhotoUris([cookId]).get(cookId) ?? null;
  const { record, acceptMealType, acceptRating, acceptHousehold, setCuisine } = useCookRecord(cookId);
  // "Who usually eats?" is asked the first time a review opens with nobody on
  // the list, and never again once answered or skipped.
  const [askHousehold, setAskHousehold] = useState(false);
  const asked = useRef(false);
  const { settings } = data;
  const householdEmpty = record.status === 'ready' && activeMembers(record.household).length === 0;
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

  const bar = (
    <TopBar
      back={{ label: BACK_TO_THE_COOK, onPress: onBack, accessibilityLabel: 'Back' }}
      actions={
        <AppText variant="bodyStrong" tone="inkMuted">
          {load.status === 'ready' && load.cook.status === 'reviewed' ? EDIT_REVIEW : REVIEW_TITLE}
        </AppText>
      }
    />
  );

  if (load.status === 'loading') {
    return <ScreenContainer testID="review-loading">{bar}</ScreenContainer>;
  }

  if (load.status === 'missing' || load.status === 'failed') {
    const missing = load.status === 'missing';
    return (
      <ScreenContainer testID={missing ? 'review-missing' : 'review-failed'}>
        {bar}
        <Notice
          title={missing ? COOK_NOT_FOUND_TITLE : 'This cook could not be loaded'}
          body={missing ? COOK_NOT_FOUND_BODY : `Nothing was changed. ${load.message}`}
          tone="problem"
          action={
            missing ? { label: BACK_TO_HOME, onPress: onBack } : { label: RETRY, onPress: () => void reload() }
          }
        />
      </ScreenContainer>
    );
  }

  const { cook, lessons, revisions } = load;
  const editing = cook.status === 'reviewed';
  const verdictNow = latestWords(
    cook.verdict,
    revisions.filter((revision) => revision.field === 'verdict'),
  ).text;
  const verdict = verdictDraft ?? verdictNow ?? '';
  const lessonRevisions = record.status === 'ready' ? record.lessonRevisions : [];
  const lessonNow = (id: LessonId) => {
    const lesson = lessons.find((candidate) => candidate.id === id);
    return lesson ? nextTimeWords(lesson, lessonRevisions).text : '';
  };
  const verdictTooLong = verdict.length > MAX_TEXT_LENGTH;
  const takeawayTooLong = takeaway.trim().length > MAX_TEXT_LENGTH;
  const lessonTooLong = Object.values(lessonDrafts).some((text) => text.length > MAX_TEXT_LENGTH);

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

  /** A new next-time line, as the cook's own lesson. Resolves with a message when it was not saved. */
  const addLesson = async (text: string): Promise<string | null> => {
    const decision = createUserLesson({ cookId: cook.id, text }, { id: newId() }, 'user', now());
    if (!decision.allowed) {
      return decision.message;
    }
    try {
      await data.lessons.create(decision.record);
      return null;
    } catch (cause: unknown) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  };

  const finish = async () => {
    setLessonProblem(null);
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
      const failure = await addLesson(lessonText);
      if (failure !== null) {
        setLessonProblem(failure);
        return;
      }
    }
    onFinished(cook.id);
  };

  /** Edit review: each changed field becomes a new version; nothing is written over. */
  const saveEdits = async () => {
    setProblem(null);
    setLessonProblem(null);
    setSaving(true);
    const failures: string[] = [];
    if (verdictDraft !== null && verdictDraft !== (verdictNow ?? '')) {
      if (verdictDraft.trim() === '') {
        failures.push(NOTES_EMPTY_ON_EDIT);
      } else {
        const failure = await attempt(
          () => data.capture.reviseVerdict(cook.id, verdictDraft, { id: newId() }, 'user', now()),
          () => {},
        );
        if (failure !== null) {
          failures.push(failure);
        }
      }
    }
    for (const [id, text] of Object.entries(lessonDrafts)) {
      if (text === lessonNow(id) || text.trim() === '') {
        continue;
      }
      const failure = await attempt(
        () => data.cookRecord.reviseNextTime(id, text, { id: newId() }, 'user', now()),
        () => {},
      );
      if (failure !== null) {
        failures.push(failure);
      }
    }
    if (takeaway.trim() !== '') {
      const failure = await attempt(
        () => data.cookRecord.addNextTime(cook.id, takeaway.trim(), { id: newId() }, 'user', now()),
        () => {},
      );
      if (failure !== null) {
        failures.push(failure);
      }
    }
    setSaving(false);
    if (failures.length > 0) {
      setProblem(failures.join(' '));
      return;
    }
    onBack();
  };

  const footButton = editing ? (
    <Button
      label={SAVE_REVIEW}
      icon="check"
      variant="main"
      size="main"
      block
      onPress={() => void saveEdits()}
      disabled={verdictTooLong || takeawayTooLong || lessonTooLong}
      pending={saving}
      testID="save-review"
    />
  ) : (
    <Button
      label={FINISH_REVIEW}
      icon="check"
      variant="main"
      size="main"
      block
      onPress={() => void finish()}
      disabled={verdictTooLong || takeawayTooLong}
      pending={saveWrite.state.status === 'pending'}
      testID="finish-review"
    />
  );

  const notesSection = (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {YOUR_NOTES}
      </AppText>
      <View style={styles.iconRow}>
        <IconCircle icon="page" tint="noteIcon" ink="ink" />
        <View style={styles.grow}>
          <TextField
            value={verdict}
            onChangeText={setVerdictDraft}
            placeholder={YOUR_NOTES_PLACEHOLDER}
            accessibilityLabel={YOUR_NOTES}
            multiline
            rows={3}
            invalid={verdictTooLong}
            helper={verdictTooLong ? `Keep it under ${MAX_TEXT_LENGTH} characters.` : undefined}
            testID="verdict-input"
          />
        </View>
      </View>
    </View>
  );

  const nextSection = (
    <View style={styles.section}>
      <View style={styles.iconRow}>
        <IconCircle icon="lightbulb" tint="primary" ink="onPrimary" />
        <View style={styles.grow}>
          <AppText variant="heading" tone="nextInk" accessibilityRole="header">
            {NEXT_TIME}
          </AppText>
          <AppText variant="secondary" tone="inkMuted">
            {NEXT_TIME_SHOWN}
          </AppText>
        </View>
      </View>
      {editing
        ? lessons.map((lesson) => (
            <TextField
              key={lesson.id}
              tone="next"
              value={lessonDrafts[lesson.id] ?? lessonNow(lesson.id)}
              onChangeText={(text) => setLessonDrafts((now) => ({ ...now, [lesson.id]: text }))}
              accessibilityLabel={NEXT_TIME}
              multiline
              rows={2}
              testID={`next-time-input-${lesson.id}`}
            />
          ))
        : null}
      {!editing || lessons.length === 0 ? (
        <TextField
          tone="next"
          value={takeaway}
          onChangeText={setTakeaway}
          placeholder={TAKEAWAY_PLACEHOLDER}
          accessibilityLabel={NEXT_TIME}
          accessibilityHint={NEXT_TIME_SHOWN}
          multiline
          rows={2}
          invalid={takeawayTooLong}
          helper={takeawayTooLong ? `Keep it under ${MAX_TEXT_LENGTH} characters.` : undefined}
          testID="takeaway-input"
        />
      ) : null}
    </View>
  );

  const who =
    record.status === 'ready' ? (
      <Section title={WHO_ATE_IT}>
        <WhoAteIt household={record.household} ratings={record.ratings} onRate={rate} oneLine={split} />
      </Section>
    ) : null;

  const photo = titlePhoto ? (
    <Image source={{ uri: titlePhoto }} style={styles.photo} testID="review-photo" />
  ) : null;

  return (
    <KeptStateProvider store={kept}>
      <ScreenContainer
        testID="review-screen"
        footer={split ? undefined : footButton}
        side={
          split
            ? {
                children: (
                  <>
                    {who}
                    {nextSection}
                  </>
                ),
                footer: footButton,
                testID: 'review-side',
                surface: true,
              }
            : undefined
        }
        panes="review"
      >
        <View style={styles.header}>
          {bar}
          <View style={styles.titleRow}>
            {/* The photo is on the left of the title on the inner display, as drawn. */}
            {split ? photo : null}
            <View style={styles.grow}>
              <AppText
                variant={split ? 'titleCompact' : 'title'}
                accessibilityRole="header"
                tone={cook.title ? 'ink' : 'inkMuted'}
              >
                {cook.title ?? UNTITLED_COOK}
              </AppText>
              <AppText variant="secondary" tone="inkMuted">
                {[
                  formatDayAndTime(cook.startedAt),
                  record.status === 'ready' ? timesCookedLine(record.timesCooked) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
            {split ? null : photo}
          </View>
        </View>

        {saveWrite.state.status === 'failed' ? (
          <Notice title={saveWrite.state.message} body={UNSAVED_KEPT} tone="problem" testID="review-save-failed" />
        ) : null}
        {problem ? <Notice title={problem} body={UNSAVED_KEPT} tone="problem" testID="review-edit-failed" /> : null}
        {lessonProblem ? (
          <Notice
            title="Your verdict was saved, but the takeaway was not"
            body={`${lessonProblem} ${UNSAVED_KEPT}`}
            tone="problem"
            action={{ label: RETRY, onPress: () => void finish() }}
            testID="lesson-save-failed"
          />
        ) : null}

        {record.status === 'ready' && askHousehold ? (
          <Card testID="household-prompt" style={styles.prompt}>
            <AppText variant="heading" accessibilityRole="header">
              {WHO_USUALLY_EATS}
            </AppText>
            <AppText variant="secondary" tone="inkMuted">
              {WHO_USUALLY_EATS_BODY}
            </AppText>
            <HouseholdEditor
              members={record.household}
              onChanged={(members: readonly HouseholdMember[]) => acceptHousehold(members)}
              testID="household-prompt-editor"
            />
            <View style={styles.promptActions}>
              <Button label={HOUSEHOLD_SKIP} variant="text" onPress={finishAsking} testID="household-prompt-skip" />
              <Button
                label={HOUSEHOLD_DONE}
                variant="outlined"
                onPress={finishAsking}
                testID="household-prompt-done"
              />
            </View>
          </Card>
        ) : null}

        {record.status === 'ready' ? (
          <>
            <Section title={WHAT_WAS_IT}>
              <MealTypeChips value={record.mealType?.mealType ?? null} onChange={saveMealType} />
            </Section>
            <Section title={CUISINE_HEADING} trailing={OPTIONAL}>
              <CuisineChips value={record.cuisine} onChange={setCuisine} />
            </Section>
            {/* On two panes Who ate it? is in the right-hand pane. */}
            {split ? null : who}
          </>
        ) : record.status === 'failed' ? (
          <Notice
            title="Part of this cook could not be loaded"
            body={`Nothing was changed. ${record.message}`}
            tone="problem"
            testID="review-record-failed"
          />
        ) : null}

        {/* Your notes stay in this pane either way, so folding never draws the
            field afresh; Next time moves to the right-hand pane on two. */}
        {notesSection}
        {split ? null : nextSection}
      </ScreenContainer>
    </KeptStateProvider>
  );
}

/** A section of the review: its heading, and on the right a quiet word ("Optional"). */
function Section({ title, trailing, children }: { title: string; trailing?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <AppText variant="heading" accessibilityRole="header" style={styles.grow}>
          {title}
        </AppText>
        {trailing ? (
          <AppText variant="secondary" tone="inkMuted">
            {trailing}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** An icon in its tinted circle, beside a heading or a field. */
function IconCircle({ icon, tint, ink }: { icon: IconName; tint: ColorRole; ink: ColorRole }) {
  const styles = useStyles();
  return (
    <View style={[styles.circle, { backgroundColor: styles.tints[tint] }]}>
      <Icon name={icon} color={ink} size={size.iconSmall + 2} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  ...StyleSheet.create({
    header: {
      gap: space.sm,
      marginBottom: space.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    photo: {
      width: size.photoTitle,
      height: size.photoTitle,
      borderRadius: radius.card,
      backgroundColor: colors.surfaceRaised,
    },
    grow: {
      flex: 1,
    },
    section: {
      gap: space.sm,
      marginBottom: space.lg,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space.sm,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
    },
    circle: {
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    prompt: {
      marginBottom: space.lg,
    },
    promptActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: space.xs,
    },
  }),
  tints: colors as Readonly<Record<ColorRole, string>>,
}));
