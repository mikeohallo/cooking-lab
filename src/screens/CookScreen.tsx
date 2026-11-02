import { useState, type ComponentProps, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useStorage } from '../state/StorageProvider';
import { useCardPhotoUris } from '../state/useCardPhotos';
import { useCook } from '../state/useCook';
import { useCookRecord } from '../state/useCookRecord';
import { useKeepScreenOn, useScreenStaysOn } from '../state/useKeepScreenOn';
import { useExport } from '../state/useExport';
import { usePhotoUris } from '../state/usePhotoUris';
import { useWrite, type WriteState } from '../state/useWrite';
import { Button } from '../components/Button';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { CuisinePill } from '../components/CuisinePill';
import { MealLabel } from '../components/MealLabel';
import { NextTimeCard } from '../components/NextTimeCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { RatingBadge, SectionGroup } from '../components/SectionGroup';
import { RatingRow } from '../components/StarRating';
import { Notice } from '../components/Notice';
import { StatusChip } from '../components/StatusChip';
import { TextField } from '../components/TextField';
import { IconButton, TopBar } from '../components/TopBar';
import {
  BACK_HOME,
  BACK_TO_HOME,
  CANCEL,
  COOK_NOT_FOUND_BODY,
  COOK_NOT_FOUND_TITLE,
  COOK_THIS_AGAIN,
  COOK_THIS_AGAIN_HINT,
  COOK_TITLE_PLACEHOLDER,
  EDITED,
  EDIT_REVIEW,
  EDIT_TITLE,
  EMPTY_TIMELINE_BODY,
  EMPTY_TIMELINE_TITLE,
  EXPORT_COOK,
  EXPORT_COOK_HINT,
  FINISH_AND_REVIEW,
  FROM_THE_COOK,
  GUEST_MARK,
  LAST_TIME_NO_RATINGS,
  MORE_COOK_ACTIONS,
  NEXT_TIME_OVERLINE,
  NOTES,
  NOTHING_NOTED,
  NOT_EATEN,
  NO_NOTES,
  PHOTOS,
  PHOTO_CAMERA_BLOCKED_BODY,
  PHOTO_CAMERA_DENIED_BODY,
  PHOTO_CAMERA_DENIED_TITLE,
  PHOTO_FAILED_BODY,
  PHOTO_FAILED_TITLE,
  READINGS,
  RETRY,
  SAVE_TITLE,
  SCREEN_CAN_SLEEP,
  SCREEN_OFF,
  SCREEN_ON,
  SCREEN_STAYS_ON,
  STATUS_REVIEWED,
  UNTITLED_COOK,
  WHO_ATE_IT,
  YOUR_NOTES,
} from '../content/product';
import type { PhotoOrigin } from '../data/adapters';
import { cuisineLabel, nextTimeWords, orderRatings, raterName, timesCookedLine } from '../domain/cookRecord';
import type { Cook, CookEvent, CookEventId, CookId, JsonObject, Revision } from '../domain/entities';
import { latestWords } from '../domain/evidence';
import { photoPlacedWhenAdded } from '../domain/photoTime';
import { MAX_TITLE_LENGTH } from '../domain/invariants';
import { COOK_SIDE_PANE_WIDTH } from '../layout/responsive';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { formatDayAndTime, formatTime } from '../format/dateTime';
import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { CookActions } from './CookActions';
import { Composer } from './cook/Composer';
import { NoteOptionsSheet } from './cook/NoteOptionsSheet';
import { PhotoSourceSheet } from './cook/PhotoSourceSheet';
import { PhotoViewer, type ViewedPhoto } from './cook/PhotoViewer';
import { ReadingSheet, type ReadingChoice } from './cook/ReadingSheet';
import { FromTheCookCard, NotesList, PhotoGrid, ReadingChips, ReadingsGrid } from './cook/Sections';
import { VersionsSheet, earlierNextTimeVersions, earlierVersions, type Version } from './cook/VersionsSheet';
import { ExportNotice } from './ExportNotice';
import { IngredientsBox } from './record/IngredientsBox';
import { IngredientsSection } from './record/IngredientsSection';
import { LastTimeCard, lastTimeNextTime, ratingAverage } from './record/LastTimeCard';
import { TagEditor } from './tags/TagEditor';

type CookScreenProps = {
  cookId: CookId;
  onBack: () => void;
  /** Finish & review on an open cook; Edit review on a reviewed one. */
  onReview: (cookId: CookId) => void;
  /**
   * Opens another cook: the earlier one from "Last time", or the new one
   * "Cook this again" has just started (0.3.0). A test that renders the
   * screen alone may leave it out.
   */
  onOpenCook?: (cookId: CookId) => void;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
  /**
   * Whether this page is the one in front. The screen is kept on only while
   * it is (0.2.2). The route says; a test that renders the screen alone leaves
   * it at true.
   */
  inFront?: boolean;
  /**
   * Drawn inside Home's right-hand pane on the inner display (0.3.0), rather
   * than as a screen of its own: no Back, one column, no screen container.
   */
  embedded?: boolean;
};

/** Where the page is drawn: a screen of its own, or inside Home's other pane. */
function Frame({
  embedded,
  testID,
  children,
  footer,
  ...screen
}: { embedded: boolean; testID: string; children: ReactNode } & Omit<
  ComponentProps<typeof ScreenContainer>,
  'children' | 'testID'
>) {
  if (embedded) {
    return (
      <View testID={testID}>
        {children}
        {footer}
      </View>
    );
  }
  return (
    <ScreenContainer testID={testID} footer={footer} {...screen}>
      {children}
    </ScreenContainer>
  );
}

/**
 * A cook's page (0.4.0, part 2), grouped by section, never a timeline.
 *
 * Open: back to Home, Screen on and Finish & review at the top; what it is,
 * its title, when it started, how many times the dish has been cooked and its
 * photo; its tags; then Next time (from the last time, always first when
 * there is one), Last time, the Ingredients bar, Readings two to a row, Notes
 * as one card in the order they were written, and Photos as a grid. The
 * composer is pinned to the foot.
 *
 * Reviewed: the same header with the Reviewed chip; tags; Next time; who ate
 * it with the average; your notes; the Ingredients bar; and From the cook —
 * the readings, notes and photos together. Cook this again and Edit review
 * are pinned to the foot; ⋯ holds Export this cook and Delete cook.
 *
 * Times stay in the data: a note's time is in its Note options, a photo's in
 * the viewer. Every write goes through the services as the user, and the page
 * shows a thing only once the store has returned it.
 */
export function CookScreen({
  cookId,
  onBack,
  onReview,
  onOpenCook = () => {},
  refreshToken = 0,
  inFront = true,
  embedded = false,
}: CookScreenProps) {
  const styles = useStyles();
  // On the inner display a cook's page has two panes: the page and the
  // composer on the left, Last time and the whole ingredients list on the
  // right. Inside Home's pane it is one column. Part 3 redraws the inner screen.
  const split = useLayoutMetrics().twoPane && !embedded;
  const back = embedded ? undefined : onBack;
  const { data, exporter, photoWorkflow, newId, now } = useStorage();
  const { load, reload, acceptCook, acceptEvent, acceptRevision } = useCook(cookId, refreshToken);
  const { record, acceptIngredients, reload: reloadRecord } = useCookRecord(cookId, refreshToken);
  const againWrite = useWrite();
  const eventWrite = useWrite();
  const titleWrite = useWrite();
  const exportOne = useExport();
  const [photoPending, setPhotoPending] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<PhotoProblem | null>(null);
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null);
  const events = load.status === 'ready' ? load.events : EMPTY_EVENTS;
  const photoUris = usePhotoUris(events);
  const photoCount = events.filter((event) => event.kind === 'photo').length;
  const titlePhoto = useCardPhotoUris([cookId], refreshToken * 1000 + photoCount).get(cookId) ?? null;
  const [actionsOpen, setActionsOpen] = useState(false);
  const [versions, setVersions] = useState<readonly Version[] | null>(null);
  const [reading, setReading] = useState<ReadingChoice | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [noteMenu, setNoteMenu] = useState<CookEvent | null>(null);
  const [editingNote, setEditingNote] = useState<CookEventId | null>(null);
  const [staysOn, setStaysOn] = useScreenStaysOn(cookId);
  // On while an open cook's page is in front and its toggle says so; the hook
  // also lets go whenever the app leaves the foreground.
  useKeepScreenOn(load.status === 'ready' && load.cook.status === 'open' && inFront && staysOn);

  if (load.status === 'loading') {
    return (
      <Frame embedded={embedded} testID="cook-loading">
        <TopBar back={back ? { label: BACK_HOME, onPress: back, accessibilityLabel: 'Back' } : undefined} />
      </Frame>
    );
  }

  if (load.status === 'missing' || load.status === 'failed') {
    const missing = load.status === 'missing';
    return (
      <Frame embedded={embedded} testID={missing ? 'cook-missing' : 'cook-failed'}>
        <TopBar back={back ? { label: BACK_HOME, onPress: back, accessibilityLabel: 'Back' } : undefined} />
        <Notice
          title={missing ? COOK_NOT_FOUND_TITLE : 'This cook could not be loaded'}
          body={missing ? COOK_NOT_FOUND_BODY : `Nothing was changed. ${load.message}`}
          tone="problem"
          action={
            missing
              ? embedded
                ? undefined
                : { label: BACK_TO_HOME, onPress: onBack }
              : { label: RETRY, onPress: () => void reload() }
          }
        />
      </Frame>
    );
  }

  const { cook, lessons, revisions } = load;
  const readOnly = cook.status === 'reviewed';
  const verdictEdits = revisions.filter((revision) => revision.field === 'verdict');
  const verdictNow = latestWords(cook.verdict, verdictEdits);
  const readings = events.filter((event) => event.kind === 'temp');
  const notes = events.filter((event) => event.kind === 'user_note');
  const photos = events.filter((event) => event.kind === 'photo');
  const others = events.filter((event) => event.kind === 'assistant_msg' || event.kind === 'plan');
  const editsOf = (event: CookEvent): readonly Revision[] =>
    revisions.filter((revision) => revision.cookEventId === event.id);

  /** Save new words for a note: a new version beside the old ones. */
  const saveNote = async (event: CookEvent, text: string): Promise<string | null> => {
    try {
      const decision = await data.capture.reviseNote(event.id, text, { id: newId() }, 'user', now());
      if (!decision.allowed) {
        return decision.message;
      }
      acceptRevision(decision.record);
      return null;
    } catch (cause: unknown) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  };

  const saveIngredients = async (text: string): Promise<string | null> => {
    try {
      const decision = await data.cookRecord.saveIngredients(cook.id, text, { id: newId() }, 'user', now());
      if (!decision.allowed) {
        return decision.message;
      }
      acceptIngredients(decision.record);
      return null;
    } catch (cause: unknown) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  };

  const cookAgain = async () => {
    const result = await againWrite.run(() =>
      data.cookRecord.cookAgain(cook.id, { id: newId(), ingredientsId: newId() }, 'user', now()),
    );
    if (result.ok) {
      onOpenCook(result.record.id);
    }
  };

  const sendNote = async (body: string): Promise<boolean> => {
    const result = await eventWrite.run(() =>
      data.capture.addEvent({ id: newId(), cookId: cook.id, ts: now(), kind: 'user_note', body }, 'user'),
    );
    if (result.ok) {
      acceptEvent(result.record);
    }
    return result.ok;
  };

  const addTemperature = async (meta: JsonObject): Promise<boolean> => {
    const result = await eventWrite.run(() =>
      data.capture.addEvent({ id: newId(), cookId: cook.id, ts: now(), kind: 'temp', meta }, 'user'),
    );
    if (result.ok) {
      acceptEvent(result.record);
    }
    return result.ok;
  };

  const saveTitle = async (title: string | null): Promise<boolean> => {
    const result = await titleWrite.run(() => data.capture.updateCook(cook.id, { title }, 'user'));
    if (result.ok) {
      acceptCook(result.record);
    }
    return result.ok;
  };

  /**
   * Take or choose a photograph, and put it in Photos. A cancelled capture
   * says nothing at all — backing out of the camera is not an error.
   */
  const addPhoto = async (origin: PhotoOrigin): Promise<void> => {
    setPhotoSheet(false);
    setPhotoProblem(null);
    setPhotoPending(true);
    const outcome = await photoWorkflow.add(cook.id, origin);
    setPhotoPending(false);
    switch (outcome.status) {
      case 'added':
        acceptEvent(outcome.event);
        return;
      case 'cancelled':
        return;
      case 'denied':
        setPhotoProblem({ kind: 'denied', canAskAgain: outcome.canAskAgain });
        return;
      case 'failed':
        setPhotoProblem({ kind: 'failed', message: outcome.message });
        return;
    }
  };

  /** Removes a photograph. Resolves with a message when it could not be. */
  const removePhoto = async (eventId: string): Promise<string | null> => {
    const outcome = await photoWorkflow.remove(eventId);
    if (outcome.status === 'removed') {
      await reload();
      return null;
    }
    return outcome.message;
  };

  const openPhoto = (event: CookEvent, uri: string) =>
    setViewing({ eventId: event.id, uri, ts: event.ts, placedWhenAdded: photoPlacedWhenAdded(event) });

  const ready = record.status === 'ready' ? record : null;
  const timesLine = ready ? timesCookedLine(ready.timesCooked) : null;
  const nextTimeLines: readonly string[] = readOnly
    ? lessons.map((lesson) => nextTimeWords(lesson, ready?.lessonRevisions ?? []).text)
    : ready?.lastTime
      ? lastTimeNextTime(ready.lastTime)
      : [];
  const editedLessons = readOnly
    ? lessons.filter((lesson) => nextTimeWords(lesson, ready?.lessonRevisions ?? []).edited)
    : [];

  const lastTime =
    ready?.lastTime ? <LastTimeCard lastTime={ready.lastTime} onOpen={onOpenCook} /> : null;
  const notesList = (
    <NotesList
      notes={notes}
      revisions={revisions}
      editing={editingNote}
      onEditingChange={setEditingNote}
      onSave={saveNote}
      onMore={setNoteMenu}
    />
  );
  const menuNote = noteMenu === null ? null : notes.find((note) => note.id === noteMenu.id) ?? null;
  const menuWords = menuNote ? latestWords(menuNote.body, editsOf(menuNote)) : null;

  const header = (
    <View style={styles.header}>
      <TopBar
        back={back ? { label: BACK_HOME, onPress: back, accessibilityLabel: 'Back' } : undefined}
        actions={
          readOnly ? (
            <IconButton
              icon="more"
              accessibilityLabel={MORE_COOK_ACTIONS}
              onPress={() => setActionsOpen(true)}
              testID="cook-more"
            />
          ) : (
            <>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: staysOn }}
                accessibilityLabel={staysOn ? SCREEN_STAYS_ON : SCREEN_CAN_SLEEP}
                accessibilityHint="Changes whether the screen stays on while this cook is open"
                onPress={() => setStaysOn(!staysOn)}
                style={({ pressed }) => [styles.awake, staysOn && styles.awakeOn, pressed && styles.pressed]}
                testID="screen-awake-toggle"
              >
                <Icon name="sun" color={staysOn ? 'zoneIcon' : 'inkMuted'} size={size.iconSmall + 2} />
                <AppText variant="chip" tone={staysOn ? 'ink' : 'inkMuted'}>
                  {staysOn ? SCREEN_ON : SCREEN_OFF}
                </AppText>
              </Pressable>
              <Button
                label={FINISH_AND_REVIEW}
                variant="secondary"
                onPress={() => onReview(cook.id)}
                testID="finish-and-review"
              />
            </>
          )
        }
      />
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          {ready && (ready.mealType !== null || ready.cuisine !== null) ? (
            <View style={styles.labels}>
              <MealLabel mealType={ready.mealType?.mealType ?? null} testID="cook-meal-label" />
              <CuisinePill label={cuisineLabel(ready.cuisine)} testID="cook-cuisine-label" />
            </View>
          ) : null}
          {/* The title can be changed on any cook, open or reviewed (0.2.2). */}
          <EditableTitle cook={cook} onSave={saveTitle} writeState={titleWrite.state} />
          <View style={styles.labels}>
            <AppText variant="secondary" tone="inkMuted" testID="times-cooked">
              {[formatDayAndTime(cook.startedAt), timesLine].filter(Boolean).join(' · ')}
            </AppText>
            {readOnly ? <StatusChip status="reviewed" label={STATUS_REVIEWED} testID="cook-status-chip" /> : null}
          </View>
        </View>
        {titlePhoto ? (
          <Image source={{ uri: titlePhoto }} style={styles.titlePhoto} testID="cook-title-photo" />
        ) : null}
      </View>
      <TagEditor cookId={cook.id} refreshToken={refreshToken} labelled={false} compact />
    </View>
  );

  const footer = readOnly ? (
    <View style={styles.footRow}>
      <Button
        label={COOK_THIS_AGAIN}
        icon="refresh"
        variant="main"
        size="main"
        accessibilityHint={COOK_THIS_AGAIN_HINT}
        pending={againWrite.state.status === 'pending'}
        onPress={() => void cookAgain()}
        style={styles.grow}
        testID="cook-this-again"
      />
      <Button
        label={EDIT_REVIEW}
        variant="secondary"
        size="main"
        onPress={() => onReview(cook.id)}
        testID="edit-review"
      />
    </View>
  ) : (
    <Composer
      onSendNote={sendNote}
      onReading={setReading}
      onCamera={() => setPhotoSheet(true)}
      writeState={eventWrite.state}
      photoPending={photoPending}
    />
  );

  const ratings = ready ? orderRatings(ready.ratings, ready.household) : [];
  const average = ratingAverage(ratings);

  return (
    <Frame
      embedded={embedded}
      testID={readOnly ? 'cook-detail-screen' : 'cook-screen'}
      side={
        split
          ? {
              testID: 'cook-side',
              children: (
                <View style={styles.page}>
                  {lastTime}
                  {ready ? (
                    <IngredientsBox
                      versions={ready.ingredients}
                      hasTimeline={events.length > 0}
                      foldable={false}
                      open={!readOnly}
                      onSave={saveIngredients}
                      onShowVersions={setVersions}
                    />
                  ) : null}
                </View>
              ),
            }
          : undefined
      }
      fixed={{ pane: 'side', width: COOK_SIDE_PANE_WIDTH }}
      footer={footer}
    >
      {header}

      <View style={styles.page} testID="timeline">
        {photoProblem ? <PhotoProblemNotice problem={photoProblem} /> : null}
        {againWrite.state.status === 'failed' ? (
          <Notice title={againWrite.state.message} tone="problem" testID="cook-this-again-failed" />
        ) : null}
        {record.status === 'failed' ? (
          <Notice
            title="Part of this cook could not be loaded"
            body={`Nothing was changed. ${record.message}`}
            tone="problem"
            action={{ label: RETRY, onPress: () => void reloadRecord() }}
            testID="cook-record-failed"
          />
        ) : null}

        {nextTimeLines.length > 0 ? (
          <NextTimeCard label={NEXT_TIME_OVERLINE} lines={nextTimeLines} testID="next-time-card">
            {editedLessons.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edited. Show earlier versions"
                onPress={() =>
                  setVersions(
                    editedLessons.flatMap((lesson) => earlierNextTimeVersions(lesson, ready?.lessonRevisions ?? [])),
                  )
                }
                style={styles.link}
                testID="next-time-edited"
              >
                <AppText variant="secondary" tone="link" style={styles.underline}>
                  {EDITED}
                </AppText>
              </Pressable>
            ) : null}
          </NextTimeCard>
        ) : null}

        {readOnly ? (
          <>
            {ready ? (
              <SectionGroup
                title={WHO_ATE_IT}
                trailing={average ? <RatingBadge average={average.value} testID="ratings-average" /> : null}
                testID="ratings-card"
              >
                <Card style={styles.tight}>
                  {ratings.length === 0 ? (
                    <AppText variant="secondary" tone="inkMuted" style={styles.nobody}>
                      {LAST_TIME_NO_RATINGS}
                    </AppText>
                  ) : null}
                  {ratings.map((rating, index) => {
                    const name = raterName(rating, ready.household);
                    return (
                      <View key={rating.id} style={index > 0 ? styles.divided : null}>
                        <RatingRow
                          name={name}
                          mark={rating.guestName !== null ? GUEST_MARK : null}
                          line={rating.line}
                          stars={rating.stars}
                          notEaten={rating.notEaten}
                          notEatenLabel={NOT_EATEN}
                          spoken={
                            rating.notEaten
                              ? `${name}, didn’t eat it`
                              : `${name}, ${rating.stars ?? 0} stars${rating.line ? `, ${rating.line}` : ''}`
                          }
                          testID={`rating-${rating.id}`}
                        />
                      </View>
                    );
                  })}
                </Card>
              </SectionGroup>
            ) : null}

            <SectionGroup title={YOUR_NOTES}>
              <Card testID="verdict-card">
                <View style={styles.verdictRow}>
                  <View style={styles.noteCircle}>
                    <Icon name="page" color="ink" size={size.iconSmall + 2} />
                  </View>
                  <View style={styles.grow}>
                    {verdictNow.text !== null && verdictNow.text.trim() !== '' ? (
                      <AppText variant="body" testID="verdict-words">
                        {verdictNow.text}
                      </AppText>
                    ) : (
                      <AppText variant="body" tone="inkMuted">
                        {NO_NOTES}
                      </AppText>
                    )}
                    {verdictNow.edited ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Edited. Show earlier versions"
                        onPress={() =>
                          setVersions(
                            earlierVersions(cook.verdict, cook.reviewSavedAt ?? cook.startedAt, verdictEdits),
                          )
                        }
                        style={styles.link}
                        testID="verdict-edited"
                      >
                        <AppText variant="secondary" tone="link" style={styles.underline}>
                          {EDITED}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Card>
            </SectionGroup>

            {ready ? (
              <IngredientsSection
                versions={ready.ingredients}
                open={false}
                startOpen={false}
                onSave={saveIngredients}
                onShowVersions={setVersions}
              />
            ) : null}

            <SectionGroup title={FROM_THE_COOK}>
              {events.length === 0 ? (
                <AppText variant="secondary" tone="inkMuted">
                  {NOTHING_NOTED}
                </AppText>
              ) : (
                <FromTheCookCard>
                  {readings.length > 0 ? <ReadingChips readings={readings} /> : null}
                  {notes.length > 0 ? notesList : null}
                  {photos.length > 0 ? <PhotoGrid photos={photos} uris={photoUris} onOpen={openPhoto} /> : null}
                  {others.map((event) => (
                    <OtherEntry key={event.id} event={event} />
                  ))}
                </FromTheCookCard>
              )}
            </SectionGroup>
          </>
        ) : (
          <>
            {split ? null : lastTime}
            {split || !ready ? null : (
              <IngredientsSection
                versions={ready.ingredients}
                open
                startOpen={ready.ingredients.length === 0 && events.length === 0}
                onSave={saveIngredients}
                onShowVersions={setVersions}
              />
            )}
            {events.length === 0 ? <Notice title={EMPTY_TIMELINE_TITLE} body={EMPTY_TIMELINE_BODY} /> : null}
            {readings.length > 0 ? (
              <SectionGroup title={READINGS} count={readings.length}>
                <ReadingsGrid readings={readings} />
              </SectionGroup>
            ) : null}
            {notes.length > 0 ? (
              <SectionGroup title={NOTES} count={notes.length}>
                <Card style={styles.tight}>{notesList}</Card>
              </SectionGroup>
            ) : null}
            {photos.length > 0 ? (
              <SectionGroup title={PHOTOS} count={photos.length}>
                <PhotoGrid photos={photos} uris={photoUris} onOpen={openPhoto} onAdd={() => setPhotoSheet(true)} />
              </SectionGroup>
            ) : null}
            {others.map((event) => (
              <OtherEntry key={event.id} event={event} />
            ))}
          </>
        )}
      </View>

      <ReadingSheet
        opening={reading}
        onAdd={addTemperature}
        onClose={() => setReading(null)}
        pending={eventWrite.state.status === 'pending'}
        now={now}
      />

      <PhotoSourceSheet visible={photoSheet} onPick={(origin) => void addPhoto(origin)} onClose={() => setPhotoSheet(false)} />

      <NoteOptionsSheet
        note={
          menuNote && menuWords
            ? {
                words: menuWords.text ?? '',
                time: formatTime(menuNote.ts),
                edited: menuWords.edited,
                earlier: editsOf(menuNote).length,
                testID: `note-${menuNote.id}`,
                canEdit: true,
              }
            : null
        }
        onEdit={() => {
          if (menuNote) {
            setEditingNote(menuNote.id);
          }
          setNoteMenu(null);
        }}
        onVersions={() => {
          if (menuNote) {
            setVersions(earlierVersions(menuNote.body, menuNote.ts, editsOf(menuNote)));
          }
          setNoteMenu(null);
        }}
        onClose={() => setNoteMenu(null)}
      />

      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} onRemove={removePhoto} canRemove={!readOnly} />

      <VersionsSheet versions={versions} onClose={() => setVersions(null)} />

      <CookActions
        cook={actionsOpen ? cook : null}
        onClose={() => setActionsOpen(false)}
        // Deleted from its own page: go back, and the Undo is on the screen
        // the cook lands on. Inside Home's pane, Home simply shows the next.
        onDeleted={embedded ? undefined : onBack}
        extra={
          <View style={styles.export} testID="export-section">
            <Button
              label={EXPORT_COOK}
              onPress={() => void exportOne.run(() => exporter.exportCook(cook.id))}
              variant="outlined"
              block
              pending={exportOne.state.status === 'pending'}
              testID="export-cook"
            />
            <AppText variant="secondary" tone="inkMuted">
              {EXPORT_COOK_HINT}
            </AppText>
            <ExportNotice state={exportOne.state} testID="export-cook" />
          </View>
        }
      />
    </Frame>
  );
}

/** An assistant message or a plan: labelled with its kind, never passed off as the cook's own words. */
function OtherEntry({ event }: { event: CookEvent }) {
  return (
    <Card testID={`event-${event.id}`}>
      <AppText variant="label" tone="inkMuted">
        {event.kind === 'plan' ? 'Plan' : 'Assistant'}
      </AppText>
      <AppText variant="body">{event.body ?? ''}</AppText>
    </Card>
  );
}

/**
 * Why a photograph was not added. A refusal is answered in Android's settings,
 * or by choosing a picture already taken; a failure by trying again.
 */
type PhotoProblem =
  | { readonly kind: 'denied'; readonly canAskAgain: boolean }
  | { readonly kind: 'failed'; readonly message: string };

function PhotoProblemNotice({ problem }: { problem: PhotoProblem }) {
  if (problem.kind === 'denied') {
    return (
      <Notice
        title={PHOTO_CAMERA_DENIED_TITLE}
        body={problem.canAskAgain ? PHOTO_CAMERA_DENIED_BODY : PHOTO_CAMERA_BLOCKED_BODY}
        tone="problem"
        testID="photo-denied"
      />
    );
  }
  return (
    <Notice
      title={PHOTO_FAILED_TITLE}
      body={`${PHOTO_FAILED_BODY} ${problem.message}`}
      tone="problem"
      testID="photo-failed"
    />
  );
}

/**
 * A stable empty array for the photo hook while the cook is still loading.
 * Module-level rather than inline: a fresh `[]` on every render is a new
 * dependency every render, and the hook would walk the file system in a loop.
 */
const EMPTY_EVENTS: readonly CookEvent[] = [];

type EditableTitleProps = {
  cook: Cook;
  onSave: (title: string | null) => Promise<boolean>;
  writeState: WriteState;
};

/** The title, tappable to edit in place. Optional, and user-authored only. */
function EditableTitle({ cook, onSave, writeState }: EditableTitleProps) {
  const styles = useStyles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cook.title ?? '');

  if (!editing) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={EDIT_TITLE}
        accessibilityHint="Opens a field to name this cook"
        onPress={() => {
          setDraft(cook.title ?? '');
          setEditing(true);
        }}
        style={styles.titlePressable}
        testID="cook-title"
      >
        <AppText variant="title" tone={cook.title ? 'ink' : 'inkMuted'} accessibilityRole="header">
          {cook.title ?? UNTITLED_COOK}
        </AppText>
      </Pressable>
    );
  }

  const tooLong = draft.trim().length > MAX_TITLE_LENGTH;

  return (
    <View style={styles.titleEditor} testID="cook-title-editor">
      <TextField
        value={draft}
        onChangeText={setDraft}
        placeholder={COOK_TITLE_PLACEHOLDER}
        accessibilityLabel="Cook title"
        autoFocus
        invalid={tooLong}
        helper={
          tooLong
            ? `Keep the title under ${MAX_TITLE_LENGTH} characters.`
            : writeState.status === 'failed'
              ? writeState.message
              : undefined
        }
        testID="cook-title-input"
      />
      <View style={styles.titleActions}>
        <Button label={CANCEL} variant="text" onPress={() => setEditing(false)} />
        <Button
          label={SAVE_TITLE}
          variant="outlined"
          disabled={tooLong}
          pending={writeState.status === 'pending'}
          onPress={() => {
            const trimmed = draft.trim();
            void onSave(trimmed === '' ? null : trimmed).then((saved) => {
              if (saved) {
                setEditing(false);
              }
            });
          }}
          testID="cook-title-save"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    header: {
      gap: space.sm,
      marginBottom: space.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    titleBlock: {
      flex: 1,
      gap: space.xxs,
    },
    labels: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
    },
    titlePhoto: {
      width: size.photoTitle,
      height: size.photoTitle,
      borderRadius: radius.card,
      backgroundColor: colors.surfaceRaised,
    },
    page: {
      gap: space.md,
      paddingBottom: space.lg,
    },
    awake: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      minHeight: size.targetMin,
      paddingHorizontal: space.sm + 2,
      borderRadius: radius.pill,
      borderWidth: size.hairline,
      borderColor: colors.controlLine,
    },
    awakeOn: {
      borderColor: colors.zone,
      backgroundColor: colors.zone,
    },
    pressed: {
      opacity: 0.8,
    },
    tight: {
      paddingVertical: space.xs,
    },
    nobody: {
      paddingVertical: space.xs,
    },
    divided: {
      borderTopWidth: size.hairline,
      borderTopColor: colors.line,
    },
    verdictRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
    },
    noteCircle: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      backgroundColor: colors.noteIcon,
      alignItems: 'center',
      justifyContent: 'center',
    },
    grow: {
      flex: 1,
    },
    link: {
      minHeight: size.targetMin,
      minWidth: size.targetMin,
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    underline: {
      textDecorationLine: 'underline',
    },
    footRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    export: {
      gap: space.xxs,
    },
    titlePressable: {
      minHeight: size.targetMin,
      justifyContent: 'center',
    },
    titleEditor: {
      gap: space.xs,
    },
    titleActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: space.xs,
    },
  }),
);
