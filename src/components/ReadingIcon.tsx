import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, readingRoles, size, type ReadingTreatment } from '../theme/tokens';
import { Icon } from './Icon';

type ReadingIconProps = {
  /** Which reading this icon stands for: the oven, or the probe for Internal. */
  kind: ReadingTreatment;
  testID?: string;
};

/**
 * A reading's icon in its tinted circle: the oven on warm, the probe on cool
 * blue. Hidden from the screen reader on purpose: every reading prints the
 * word "Oven" or "Internal" beside it, so announcing the drawing as well
 * would say it twice.
 */
export function ReadingIcon({ kind, testID }: ReadingIconProps) {
  const styles = useStyles();
  return (
    <View
      style={[styles.circle, styles[kind]]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Icon name={kind === 'oven' ? 'oven' : 'probe'} color={readingRoles[kind].ink} size={size.iconSmall + 2} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    circle: {
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    oven: {
      backgroundColor: colors.readingOven,
    },
    internal: {
      backgroundColor: colors.readingInternal,
    },
  }),
);
