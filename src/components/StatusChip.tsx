import { StyleSheet, View } from 'react-native';

import { radius, space, statusTreatments, type StatusTreatment } from '../theme/tokens';
import { AppText } from './AppText';

type StatusChipProps = {
  /** Which meaning this chip carries. Decides the colour treatment. */
  status: StatusTreatment;
  /** The words. Always shown: colour is never the only signal. */
  label: string;
  testID?: string;
};

/**
 * A small pill that names a state or an evidence class.
 *
 * Used only where the label carries meaning — a cook that is still open, a
 * finding that is an inference — and never to decorate ordinary metadata.
 */
export function StatusChip({ status, label, testID }: StatusChipProps) {
  const treatment = statusTreatments[status];
  return (
    <View
      style={[styles.chip, { backgroundColor: treatment.background }]}
      accessibilityLabel={label}
      testID={testID}
    >
      <AppText variant="label" style={{ color: treatment.foreground }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
});
