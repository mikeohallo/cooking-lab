import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStorage } from '../state/StorageProvider';
import { useCook } from '../state/useCook';
import { useKeepScreenOn, useScreenStaysOn } from '../state/useKeepScreenOn';
import { useExport } from '../state/useExport';
import { usePhotoUris } from '../state/usePhotoUris';
import { useWrite, type WriteState } from '../state/useWrite';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateNotice } from '../components/StateNotice';
import { StatusChip } from '../components/StatusChip';
import { TextField } from '../components/TextField';
import {
  BACK_TO_HOME,
  CANCEL,
  COOK_NOT_FOUND_BODY,
  COOK_NOT_FOUND_TITLE,
  COOK_TITLE_PLACEHOLDER,
  EDIT_TITLE,
  EMPTY_TIMELINE_BODY,
  EMPTY_TIMELINE_TITLE,
  EDIT_VERDICT,
  EXPORT_COOK,
  EXPORT_COOK_HINT,
  FINISH_AND_REVIEW,
  MORE_COOK_ACTIONS,
  PHOTO_CAMERA_BLOCKED_BODY,
  PHOTO_CAMERA_DENIED_BODY,
  PHOTO_CAMERA_DENIED_TITLE,
  PHOTO_FAILED_BODY,
  PHOTO_FAILED_TITLE,
  RETRY,
  SAVE_TITLE,
  SCREEN_CAN_SLEEP,
  SCREEN_STAYS_ON,
  STATUS_REVIEWED,
  UNTITLED_COOK,
  VERDICT_ACTIONS,
} from '../content/product';
import type { PhotoOrigin } from '../data/adapters';
import type { Cook, CookEvent, CookId, JsonObject, Revision } from '../domain/entities';
import { latestWords } from '../domain/evidence';
import { MAX_TITLE_LENGTH } from '../domain/invariants';
import { formatDateTime } from '../format/dateTime';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../theme/tokens';
import { CookActions } from './CookActions';
import { Composer } from './cook/Composer';
import { EditableWords } from './cook/EditableWords';
import { VersionsSheet, earlierVersions, type Version } from './cook/VersionsSheet';
import { PhotoViewer, type ViewedPhoto } from './cook/PhotoViewer';
import { TimelineEvent } from './cook/TimelineEvent';
import { ExportNotice } from './ExportNotice';
import { TagEditor } from './tags/TagEditor';

type CookScreenProps = {
  cookId: CookId;
  onBack: () => void;
  onReview: (cookId: CookId) => void;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
  /**
   * Whether this page is the one in front. The screen is kept on only while
   * it is (0.2.2). The route says; a test that renders the screen alone leaves
   * it at true.
   */
  inFront?: boolean;
};

/**
 * The Active Cook screen — and, once a cook is reviewed, the same timeline in
 * read-only form with its verdict at the top.
 *
 * Capture is conversational: the composer at the bottom takes one line and a
 * Send. Every write goes through the capture service as the user, and the
 * timeline shows an entry only once the store has returned it.
 */
export function CookScreen({
  cookId,
  onBack,
  onReview,
  refreshToken = 0,
  inFront = true,
}: CookScreenProps) {
  const { data, exporter, photoWorkflow, newId, now } = useStorage();
  const { load, reload, acceptCook, acceptEvent, acceptRevision } = useCook(cookId, refreshToken);
  const eventWrite = useWrite();
  const titleWrite = useWrite();
  const exportOne = useExport();
  const [photoPending, setPhotoPending] = useState(false);
  const [photoProblem, setPhotoProblem] = useState<PhotoProblem | null>(null);
  const [viewing, setViewing] = useState<ViewedPhoto | null>(null);
  const photoUris = usePhotoUris(load.status === 'ready' ? load.events : EMPTY_EVENTS);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [versions, setVersions] = useState<readonly Version[] | null>(null);
  const [staysOn, setStaysOn] = useScreenStaysOn(cookId);
  // On while an open cook's page is in front and its toggle says so; the hook
  // also lets go whenever the app leaves the foreground.
  useKeepScreenOn(load.status === 'ready' && load.cook.status === 'open' && inFront && staysOn);

  if (load.status === 'loading') {
    return (
      <ScreenContainer testID="cook-loading">
        <ScreenHeader title={UNTITLED_COOK} onBack={onBack} />
      </ScreenContainer>
    );
  }

  if (load.status === 'missing') {
    return (
      <ScreenContainer testID="cook-missing">
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
      <ScreenContainer testID="cook-failed">
        <ScreenHeader title={UNTITLED_COOK} onBack={onBack} />
        <StateNotice
          title="This cook could not be loaded"
          body={`Nothing was changed. ${load.message}`}
          tone="problem"
          action={{ label: RETRY, onPress: () => void reload() }}
        />
      </ScreenContainer>
    );
  }

  const { cook, events, lessons, revisions } = load;
  const readOnly = cook.status === 'reviewed';
  const verdictEdits = revisions.filter((revision) => revision.field === 'verdict');
  const verdictNow = latestWords(cook.verdict, verdictEdits);

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

  const saveVerdict = async (text: string): Promise<string | null> => {
    try {
      const decision = await data.capture.reviseVerdict(cook.id, text, { id: newId() }, 'user', now());
      if (!decision.allowed) {
        return decision.message;
      }
      acceptRevision(decision.record);
      return null;
    } catch (cause: unknown) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  };

  const sendNote = async (body: string): Promise<boolean> => {
    const result = await eventWrite.run(() =>
      data.capture.addEvent(
        { id: newId(), cookId: cook.id, ts: now(), kind: 'user_note', body },
        'user',
      ),
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
   * Take or choose a photograph, and put it in the timeline.
   *
   * The whole of the work is `photoWorkflow.add`; this only has to decide what,
   * if anything, to say about the outcome. A cancelled capture says nothing at
   * all — backing out of the camera is not an error, and a notice about it
   * would be the app arguing with the person.
   */
  const addPhoto = async (origin: PhotoOrigin): Promise<void> => {
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

  return (
    <ScreenContainer
      testID={readOnly ? 'cook-detail-screen' : 'cook-screen'}
      footer={
        readOnly ? undefined : (
          <Composer
            onSendNote={sendNote}
            onAddTemperature={addTemperature}
            onAddPhoto={addPhoto}
            writeState={eventWrite.state}
            photoPending={photoPending}
          />
        )
      }
    >
      <ScreenHeader
        title={cook.title ?? UNTITLED_COOK}
        subtitle={formatDateTime(cook.startedAt)}
        onBack={onBack}
        // The title can be changed on any cook, open or reviewed (0.2.2).
        titleSlot={<EditableTitle cook={cook} onSave={saveTitle} writeState={titleWrite.state} />}
        trailing={
          <View style={styles.headerActions}>
            {readOnly ? (
              <StatusChip status="reviewed" label={STATUS_REVIEWED} testID="cook-status-chip" />
            ) : (
              <ActionButton
                label={FINISH_AND_REVIEW}
                variant="secondary"
                onPress={() => onReview(cook.id)}
                testID="finish-and-review"
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={MORE_COOK_ACTIONS}
              onPress={() => setActionsOpen(true)}
              style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
              testID="cook-more"
            >
              <AppText variant="bodyStrong" tone="primary" importantForAccessibility="no">
                ⋯
              </AppText>
            </Pressable>
          </View>
        }
      />

      {readOnly ? null : (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: staysOn }}
          accessibilityLabel={staysOn ? SCREEN_STAYS_ON : SCREEN_CAN_SLEEP}
          accessibilityHint="Changes whether the screen stays on while this cook is open"
          onPress={() => setStaysOn(!staysOn)}
          style={[styles.awake, staysOn && styles.awakeOn]}
          testID="screen-awake-toggle"
        >
          <View style={[styles.awakeDot, staysOn && styles.awakeDotOn]} />
          <AppText variant="label" tone={staysOn ? 'primary' : 'muted'}>
            {staysOn ? SCREEN_STAYS_ON : SCREEN_CAN_SLEEP}
          </AppText>
        </Pressable>
      )}

      <View style={styles.tags}>
        <TagEditor cookId={cook.id} refreshToken={refreshToken} />
      </View>

      {photoProblem ? <PhotoProblemNotice problem={photoProblem} /> : null}

      {readOnly ? (
        <Card variant="hero" testID="verdict-card">
          {verdictNow.text !== null && verdictNow.text.trim() !== '' ? (
            <EditableWords
              heading={
                <AppText variant="label" tone="muted">
                  Verdict
                </AppText>
              }
              words={verdictNow.text}
              edited={verdictNow.edited}
              editable
              onSave={saveVerdict}
              onShowVersions={() =>
                setVersions(
                  earlierVersions(cook.verdict, cook.reviewSavedAt ?? cook.startedAt, verdictEdits),
                )
              }
              actionsLabel={VERDICT_ACTIONS}
              editLabel={EDIT_VERDICT}
              testID="verdict"
            />
          ) : (
            <>
              <AppText variant="label" tone="muted">
                Verdict
              </AppText>
              <AppText variant="body" tone="muted">
                No verdict was written for this cook.
              </AppText>
            </>
          )}
          {lessons.length > 0 ? (
            <View style={styles.lessons}>
              <AppText variant="label" tone="muted">
                Next time
              </AppText>
              {lessons.map((lesson) => (
                <AppText key={lesson.id} variant="body" testID={`lesson-${lesson.id}`}>
                  {lesson.text}
                </AppText>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <View style={styles.timeline} testID="timeline">
        {events.length === 0 ? (
          readOnly ? (
            <AppText variant="secondary" tone="muted">
              Nothing was noted during this cook.
            </AppText>
          ) : (
            <StateNotice title={EMPTY_TIMELINE_TITLE} body={EMPTY_TIMELINE_BODY} />
          )
        ) : (
          events.map((event) => (
            <TimelineEvent
              key={event.id}
              event={event}
              note={
                event.kind === 'user_note'
                  ? {
                      revisions: editsOf(event),
                      editable: true,
                      onSave: (text) => saveNote(event, text),
                      onShowVersions: () =>
                        setVersions(earlierVersions(event.body, event.ts, editsOf(event))),
                    }
                  : undefined
              }
              photo={
                event.kind === 'photo'
                  ? {
                      uri: photoUris[event.id] ?? null,
                      onOpen: () => {
                        const uri = photoUris[event.id];
                        if (uri != null) {
                          setViewing({ eventId: event.id, uri, ts: event.ts });
                        }
                      },
                    }
                  : undefined
              }
            />
          ))
        )}
      </View>

      <PhotoViewer
        photo={viewing}
        onClose={() => setViewing(null)}
        onRemove={removePhoto}
        canRemove={!readOnly}
      />

      <VersionsSheet versions={versions} onClose={() => setVersions(null)} />

      <CookActions
        cook={actionsOpen ? cook : null}
        onClose={() => setActionsOpen(false)}
        // Deleted from its own page: go back, and the Undo is on the screen
        // the cook lands on.
        onDeleted={onBack}
      />

      {readOnly ? (
        <View style={styles.exportSection} testID="export-section">
          <ActionButton
            label={EXPORT_COOK}
            onPress={() => void exportOne.run(() => exporter.exportCook(cook.id))}
            variant="quiet"
            pending={exportOne.state.status === 'pending'}
            testID="export-cook"
          />
          <AppText variant="caption" tone="muted" style={styles.exportHint}>
            {EXPORT_COOK_HINT}
          </AppText>
          <ExportNotice state={exportOne.state} testID="export-cook" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

/**
 * Why a photograph was not added.
 *
 * `denied` and `failed` are kept apart because what the person can do about
 * them is different: a refusal is answered in Android's settings, or by
 * choosing a picture already taken, while a failure is answered by trying
 * again.
 */
type PhotoProblem =
  | { readonly kind: 'denied'; readonly canAskAgain: boolean }
  | { readonly kind: 'failed'; readonly message: string };

function PhotoProblemNotice({ problem }: { problem: PhotoProblem }) {
  if (problem.kind === 'denied') {
    return (
      <StateNotice
        title={PHOTO_CAMERA_DENIED_TITLE}
        body={problem.canAskAgain ? PHOTO_CAMERA_DENIED_BODY : PHOTO_CAMERA_BLOCKED_BODY}
        tone="problem"
        testID="photo-denied"
      />
    );
  }
  return (
    <StateNotice
      title={PHOTO_FAILED_TITLE}
      body={`${PHOTO_FAILED_BODY} ${problem.message}`}
      tone="problem"
      testID="photo-failed"
    />
  );
}

/**
 * A stable empty array for the photo hook while the cook is still loading.
 *
 * Module-level rather than inline: a fresh `[]` on every render is a new
 * dependency every render, and the hook would walk the file system in a loop.
 */
const EMPTY_EVENTS: readonly never[] = [];

type EditableTitleProps = {
  cook: Cook;
  onSave: (title: string | null) => Promise<boolean>;
  writeState: WriteState;
};

/** The title, tappable to edit in place. Optional, and user-authored only. */
function EditableTitle({ cook, onSave, writeState }: EditableTitleProps) {
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
        <AppText variant="screenTitle" tone={cook.title ? 'text' : 'muted'} accessibilityRole="header">
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
        <ActionButton label={CANCEL} variant="quiet" onPress={() => setEditing(false)} />
        <ActionButton
          label={SAVE_TITLE}
          variant="secondary"
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

const styles = StyleSheet.create({
  tags: {
    marginBottom: space.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
  more: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  morePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  awake: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  awakeOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  awakeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  awakeDotOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  timeline: {
    gap: space.xs,
    paddingBottom: space.lg,
  },
  exportSection: {
    gap: space.xs,
    paddingBottom: space.lg,
  },
  exportHint: {
    textAlign: 'center',
  },
  lessons: {
    gap: space.xxs,
    marginTop: space.xs,
  },
  titlePressable: {
    minHeight: MIN_TOUCH_TARGET,
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
});
