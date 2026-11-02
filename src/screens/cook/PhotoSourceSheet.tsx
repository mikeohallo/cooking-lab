import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { ADD_PHOTO, CANCEL, CHOOSE_PHOTO, TAKE_PHOTO } from '../../content/product';
import type { PhotoOrigin } from '../../data/adapters';
import { PaneSheet } from '../../layout/panes';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';

type PhotoSourceSheetProps = {
  visible: boolean;
  onPick: (origin: PhotoOrigin) => void;
  onClose: () => void;
};

/**
 * Where a photo comes from: the camera, or a picture already taken. Opened by
 * the camera in the composer and by the + tile in Photos (0.4.0).
 */
export function PhotoSourceSheet({ visible, onPick, onClose }: PhotoSourceSheetProps) {
  const styles = useStyles();
  return (
    <PaneSheet visible={visible} onRequestClose={onClose} testID="photo-sheet">
      {(insets) => (
        <BottomSheet title={ADD_PHOTO} onClose={onClose} bottomInset={insets.bottom} testID="photo-panel">
          <View style={styles.actions}>
            <Button
              label={TAKE_PHOTO}
              icon="camera"
              variant="outlined"
              block
              onPress={() => onPick('camera')}
              testID="take-photo"
            />
            <Button
              label={CHOOSE_PHOTO}
              variant="outlined"
              block
              onPress={() => onPick('library')}
              testID="choose-photo"
            />
            <Button label={CANCEL} variant="text" onPress={onClose} style={styles.cancel} />
          </View>
        </BottomSheet>
      )}
    </PaneSheet>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    actions: {
      gap: space.xs,
    },
    cancel: {
      alignSelf: 'flex-end',
    },
  }),
);
