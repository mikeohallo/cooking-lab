import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../components/Button';
import { PaneSheet } from '../layout/panes';
import { AppText } from '../components/AppText';
import { Notice } from '../components/Notice';
import {
  COOK_ACTIONS_CANCEL,
  DELETE_COOK,
  DELETE_COOK_CONFIRM,
  DELETE_COOK_CONFIRM_BODY,
  DELETE_COOK_CONFIRM_TITLE,
  DELETE_COOK_KEEP,
  DELETE_FAILED_TITLE,
  UNTITLED_COOK,
} from '../content/product';
import type { Cook, CookId } from '../domain/entities';
import { usePendingDeletion } from '../state/PendingDeletion';
import { makeStyles } from '../theme/theme';
import { radius, space } from '../theme/tokens';

type CookActionsProps = {
  /** The cook the actions are for, or `null` when the sheet is closed. */
  cook: Pick<Cook, 'id' | 'title'> | null;
  onClose: () => void;
  /** Called once the cook has been deleted (pending its Undo). */
  onDeleted?: (cookId: CookId) => void;
};

/**
 * What can be done to a whole cook: today, one thing — delete it.
 *
 * Reached two ways, so it never depends on long-press alone: a long-press on a
 * cook's card (Continue cooking, Recent cooks, History), and the ⋯ button on
 * the cook's own page. Both open this sheet with **Delete cook**, and that asks
 * first — "Delete this cook? Its notes, readings and photos go too." — before
 * anything happens. Even then the cook is only hidden: the Undo bar brings it
 * back for a few seconds (`PendingDeletionProvider`).
 */
export function CookActions({ cook, onClose, onDeleted }: CookActionsProps) {
  const styles = useStyles();
  const { requestDelete } = usePendingDeletion();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setConfirming(false);
    setDeleting(false);
    setProblem(null);
    onClose();
  };

  const confirmDelete = async () => {
    if (cook === null) {
      return;
    }
    setDeleting(true);
    const failure = await requestDelete(cook.id);
    setDeleting(false);
    if (failure !== null) {
      setProblem(failure);
      setConfirming(false);
      return;
    }
    const id = cook.id;
    close();
    onDeleted?.(id);
  };

  return (
    <PaneSheet visible={cook !== null} onRequestClose={close} testID="cook-actions">
      {(insets) => (
        <>
          <Pressable
            style={styles.scrim}
            onPress={close}
            accessibilityLabel={COOK_ACTIONS_CANCEL}
            testID="cook-actions-scrim"
          />
          {cook === null ? null : (
            <View
              style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}
              testID="cook-actions-sheet"
            >
              <AppText variant="bodyStrong" numberOfLines={2}>
                {cook.title ?? UNTITLED_COOK}
              </AppText>

              {problem ? (
                <Notice
                  title={DELETE_FAILED_TITLE}
                  body={`Nothing was changed. ${problem}`}
                  tone="problem"
                  testID="delete-cook-failed"
                />
              ) : null}

              {confirming ? (
                <View style={styles.confirm} testID="delete-cook-confirm">
                  <AppText variant="bodyStrong">{DELETE_COOK_CONFIRM_TITLE}</AppText>
                  <AppText variant="secondary" tone="inkMuted">
                    {DELETE_COOK_CONFIRM_BODY}
                  </AppText>
                  <View style={styles.actions}>
                    <Button
                      label={DELETE_COOK_KEEP}
                      variant="outlined"
                      onPress={close}
                      testID="delete-cook-keep"
                    />
                    <Button
                      label={DELETE_COOK_CONFIRM}
                      variant="danger"
                      pending={deleting}
                      onPress={() => void confirmDelete()}
                      testID="delete-cook-confirm-button"
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Button
                    label={COOK_ACTIONS_CANCEL}
                    variant="outlined"
                    onPress={close}
                    testID="cook-actions-cancel"
                  />
                  <Button
                    label={DELETE_COOK}
                    variant="danger"
                    onPress={() => {
                      setProblem(null);
                      setConfirming(true);
                    }}
                    testID="delete-cook"
                  />
                </View>
              )}
            </View>
          )}
        </>
      )}
    </PaneSheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    sheet: {
      gap: space.xs,
      paddingHorizontal: space.ml,
      paddingTop: space.ml,
      backgroundColor: colors.page,
      borderTopLeftRadius: radius.card,
      borderTopRightRadius: radius.card,
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
