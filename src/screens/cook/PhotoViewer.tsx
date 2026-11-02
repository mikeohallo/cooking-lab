import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { PaneSheet } from '../../layout/panes';
import { AppText } from '../../components/AppText';
import { Notice } from '../../components/Notice';
import {
  CLOSE_PHOTO,
  PHOTO_ADDED_AT,
  PHOTO_ALT,
  PHOTO_LABEL,
  REMOVE_PHOTO,
  REMOVE_PHOTO_CONFIRM,
  REMOVE_PHOTO_CONFIRM_BODY,
  REMOVE_PHOTO_CONFIRM_TITLE,
  REMOVE_PHOTO_KEEP,
} from '../../content/product';
import { formatDateTime } from '../../format/dateTime';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';

export type ViewedPhoto = {
  readonly eventId: string;
  readonly uri: string;
  /** When the photograph was added, which is its place in the timeline. */
  readonly ts: string;
  /**
   * A Gallery photo whose own time would not do sits at the time it was
   * added, and says so (0.2.2; see `src/domain/photoTime.ts`).
   */
  readonly placedWhenAdded?: boolean;
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
 * SYSTEM BARS
 * -----------
 * The modal is drawn edge to edge on purpose (`statusBarTranslucent` and
 * `navigationBarTranslucent`), so it behaves the same on every Android version
 * and with three-button or gesture navigation, and the safe-area insets then
 * keep the picture below the status bar and every button above the navigation
 * area. Before 0.2.1 the bar had no inset at all, and on a Samsung with
 * three-button navigation *Remove photo* and *Close* sat partly under it.
 *
 * Nothing else can be removed anywhere in the app. See `removeCookEvent` in
 * `src/domain/evidence.ts`: a photograph is the one timeline entry that carries
 * no words of anybody's, and the only one the rules let go.
 */
export function PhotoViewer({ photo, onClose, onRemove, canRemove = true }: PhotoViewerProps) {
  const styles = useStyles();
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
    <PaneSheet visible={photo !== null} onRequestClose={close} transparent={false} testID="photo-viewer">
      {(insets) => (
        <>
          {photo === null ? null : (
            <View
              style={[
                styles.screen,
                { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
              ]}
              testID="photo-viewer-screen"
            >
              <Image
                source={{ uri: photo.uri }}
                style={styles.photo}
                resizeMode="contain"
                accessibilityLabel={PHOTO_ALT}
                testID="photo-viewer-image"
              />

              <View
                style={[styles.bar, { paddingBottom: BAR_BOTTOM_PADDING + insets.bottom }]}
                testID="photo-viewer-bar"
              >
                <AppText variant="secondary" tone="inkMuted" testID={`photo-caption-${photo.eventId}`}>
                  {photo.placedWhenAdded
                    ? `${PHOTO_LABEL} · ${PHOTO_ADDED_AT} ${formatDateTime(photo.ts)}`
                    : `${PHOTO_LABEL} · ${formatDateTime(photo.ts)}`}
                </AppText>

                {problem ? (
                  <Notice
                    title="This photo was not removed"
                    body={`Nothing was changed. ${problem}`}
                    tone="problem"
                    testID="photo-remove-failed"
                  />
                ) : null}

                {confirming ? (
                  <View style={styles.confirm} testID="photo-remove-confirm">
                    <AppText variant="bodyStrong">{REMOVE_PHOTO_CONFIRM_TITLE}</AppText>
                    <AppText variant="secondary" tone="inkMuted">
                      {REMOVE_PHOTO_CONFIRM_BODY}
                    </AppText>
                    <View style={styles.actions}>
                      <Button
                        label={REMOVE_PHOTO_KEEP}
                        variant="outlined"
                        onPress={() => setConfirming(false)}
                        testID="photo-remove-keep"
                      />
                      <Button
                        label={REMOVE_PHOTO_CONFIRM}
                        variant="danger"
                        pending={removing}
                        onPress={() => void remove()}
                        testID="photo-remove-confirm-button"
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    {canRemove ? (
                      <Button
                        label={REMOVE_PHOTO}
                        variant="danger"
                        onPress={() => {
                          setProblem(null);
                          setConfirming(true);
                        }}
                        testID="photo-remove"
                      />
                    ) : null}
                    <Button
                      label={CLOSE_PHOTO}
                      variant="outlined"
                      onPress={close}
                      testID="photo-close"
                    />
                  </View>
                )}
              </View>
            </View>
          )}
        </>
      )}
    </PaneSheet>
  );
}

/** Space under the last button, above the navigation area's own inset. */
export const BAR_BOTTOM_PADDING = space.lg;

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.page,
    },
    photo: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surfaceRaised,
    },
    bar: {
      gap: space.xs,
      paddingHorizontal: space.ml,
      paddingTop: space.sm,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      backgroundColor: colors.page,
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
  }),
);
