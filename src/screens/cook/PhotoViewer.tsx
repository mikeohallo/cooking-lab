import { useState } from 'react';
import { Image, Modal, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { StateNotice } from '../../components/StateNotice';
import {
  CLOSE_PHOTO,
  PHOTO_ALT,
  PHOTO_LABEL,
  REMOVE_PHOTO,
  REMOVE_PHOTO_CONFIRM,
  REMOVE_PHOTO_CONFIRM_BODY,
  REMOVE_PHOTO_CONFIRM_TITLE,
  REMOVE_PHOTO_KEEP,
} from '../../content/product';
import { formatDateTime } from '../../format/dateTime';
import { colors, space } from '../../theme/tokens';

export type ViewedPhoto = {
  readonly eventId: string;
  readonly uri: string;
  /** When the photograph was added, which is its place in the timeline. */
  readonly ts: string;
};

type PhotoViewerProps = {
  /** The photograph being looked at, or `null` when the viewer is closed. */
  photo: ViewedPhoto | null;
  onClose: () => void;
  /**
   * Removes it, entry and file. Resolves with a message when it could not be
   * removed, and `null` when it was.
   */
  onRemove: (eventId: string) => Promise<string | null>;
  /** Hidden on a reviewed cook, where the timeline is read-only. */
  canRemove?: boolean;
};

/**
 * One photograph, as large as the screen will draw it.
 *
 * The removal lives here rather than next to the picture in the timeline, and
 * that is the point of having a full-screen view at all: before a photograph
 * can be deleted it has to be looked at, large, so the thing being removed is
 * unmistakably the thing the person meant to remove. A small × on a thumbnail
 * in a scrolling list is how the wrong picture gets deleted.
 *
 * The confirm is the same step again in words — what is deleted, and what is
 * not. Only the picture and its file go; the cook, its notes and its readings
 * are untouched, and the notice says so, because "remove" next to a photograph
 * in a notebook could reasonably be read as removing more than the photograph.
 *
 * Nothing else can be removed anywhere in the app. See `removeCookEvent` in
 * `src/domain/evidence.ts`: a photograph is the one timeline entry that carries
 * no words of anybody's, and the only one the rules let go.
 */
export function PhotoViewer({ photo, onClose, onRemove, canRemove = true }: PhotoViewerProps) {
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const close = () => {
    setConfirming(false);
    setProblem(null);
    setRemoving(false);
    onClose();
  };

  const remove = async () => {
    if (photo === null) {
      return;
    }
    setRemoving(true);
    const failure = await onRemove(photo.eventId);
    setRemoving(false);
    if (failure === null) {
      close();
      return;
    }
    setProblem(failure);
    setConfirming(false);
  };

  return (
    <Modal
      visible={photo !== null}
      animationType="fade"
      onRequestClose={close}
      transparent={false}
      testID="photo-viewer"
    >
      {photo === null ? null : (
        <View style={styles.screen}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.photo}
            resizeMode="contain"
            accessibilityLabel={PHOTO_ALT}
            testID="photo-viewer-image"
          />

          <View style={styles.bar}>
            <AppText variant="caption" tone="muted">
              {`${PHOTO_LABEL} · ${formatDateTime(photo.ts)}`}
            </AppText>

            {problem ? (
              <StateNotice
                title="This photo was not removed"
                body={`Nothing was changed. ${problem}`}
                tone="problem"
                testID="photo-remove-failed"
              />
            ) : null}

            {confirming ? (
              <View style={styles.confirm} testID="photo-remove-confirm">
                <AppText variant="bodyStrong">{REMOVE_PHOTO_CONFIRM_TITLE}</AppText>
                <AppText variant="secondary" tone="muted">
                  {REMOVE_PHOTO_CONFIRM_BODY}
                </AppText>
                <View style={styles.actions}>
                  <ActionButton
                    label={REMOVE_PHOTO_KEEP}
                    variant="secondary"
                    onPress={() => setConfirming(false)}
                    testID="photo-remove-keep"
                  />
                  <ActionButton
                    label={REMOVE_PHOTO_CONFIRM}
                    variant="quiet"
                    tone="danger"
                    pending={removing}
                    onPress={() => void remove()}
                    testID="photo-remove-confirm-button"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                {canRemove ? (
                  <ActionButton
                    label={REMOVE_PHOTO}
                    variant="quiet"
                    tone="danger"
                    onPress={() => {
                      setProblem(null);
                      setConfirming(true);
                    }}
                    testID="photo-remove"
                  />
                ) : null}
                <ActionButton
                  label={CLOSE_PHOTO}
                  variant="secondary"
                  onPress={close}
                  testID="photo-close"
                />
              </View>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  photo: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  bar: {
    gap: space.xs,
    paddingHorizontal: space.ml,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  confirm: {
    gap: space.xxs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.xs,
  },
});
