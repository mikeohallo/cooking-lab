import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStorage } from '../state/StorageProvider';
import { useCook } from '../state/useCook';
import { useExport } from '../state/useExport';
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
  EXPORT_COOK,
  EXPORT_COOK_HINT,
  FINISH_AND_REVIEW,
  RETRY,
  SAVE_TITLE,
  STATUS_REVIEWED,
  UNTITLED_COOK,
} from '../content/product';
import type { Cook, CookId, JsonObject } from '../domain/entities';
import { MAX_TITLE_LENGTH } from '../domain/invariants';
import { formatDateTime } from '../format/dateTime';
import { MIN_TOUCH_TARGET, space } from '../theme/tokens';
import { Composer } from './cook/Composer';
import { TimelineEvent } from './cook/TimelineEvent';
import { ExportNotice } from './ExportNotice';

type CookScreenProps = {
  cookId: CookId;
  onBack: () => void;
  onReview: (cookId: CookId) => void;
  /** Bumped by the route when the screen regains focus, to reload. */
  refreshToken?: number;
};

/**
 * The Active Cook screen — and, once a cook is reviewed, the same timeline in
 * read-only form with its verdict at the top.
 *
 * Capture is conversational: the composer at the bottom takes one line and a
 * Send. Every write goes through the capture service as the user, and the
 * timeline shows an entry only once the store has returned it.
 */
export function CookScreen({ cookId, onBack, onReview, refreshToken = 0 }: CookScreenProps) {
  const { data, exporter, newId, now } = useStorage();
  const { load, reload, acceptCook, acceptEvent } = useCook(cookId, refreshToken);
  const eventWrite = useWrite();
  const titleWrite = useWrite();
  const exportOne = useExport();

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

  const { cook, events, lessons } = load;
  const readOnly = cook.status === 'reviewed';

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

  return (
    <ScreenContainer
      testID={readOnly ? 'cook-detail-screen' : 'cook-screen'}
      footer={
        readOnly ? undefined : (
          <Composer
            onSendNote={sendNote}
            onAddTemperature={addTemperature}
            writeState={eventWrite.state}
          />
        )
      }
    >
      <ScreenHeader
        title={cook.title ?? UNTITLED_COOK}
        subtitle={formatDateTime(cook.startedAt)}
        onBack={onBack}
        titleSlot={
          readOnly ? undefined : (
            <EditableTitle cook={cook} onSave={saveTitle} writeState={titleWrite.state} />
          )
        }
        trailing={
          readOnly ? (
            <StatusChip status="reviewed" label={STATUS_REVIEWED} testID="cook-status-chip" />
          ) : (
            <ActionButton
              label={FINISH_AND_REVIEW}
              variant="secondary"
              onPress={() => onReview(cook.id)}
              testID="finish-and-review"
            />
          )
        }
      />

      {readOnly ? (
        <Card variant="hero" testID="verdict-card">
          <AppText variant="label" tone="muted">
            Verdict
          </AppText>
          {cook.verdict !== null && cook.verdict.trim() !== '' ? (
            <AppText variant="body">{cook.verdict}</AppText>
          ) : (
            <AppText variant="body" tone="muted">
              No verdict was written for this cook.
            </AppText>
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
          events.map((event) => <TimelineEvent key={event.id} event={event} />)
        )}
      </View>

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
