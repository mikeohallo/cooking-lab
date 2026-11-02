import { StyleSheet, View } from 'react-native';

import { CORE_LOOP_STEPS } from '../content/product';
import { makeStyles } from '../theme/theme';
import { radius, space } from '../theme/tokens';
import { AppText } from './AppText';

/**
 * The Cook, Observe, Review, Learn, Cook again loop, as quiet pills under
 * Home's empty state (0.4.0). They wrap and stay centred at any width, so
 * nothing is ever pushed off the right edge.
 */
export function CoreLoop() {
  const styles = useStyles();
  return (
    <View
      style={styles.loop}
      accessible
      accessibilityLabel={CORE_LOOP_STEPS.join(', then ')}
      testID="core-loop"
    >
      {CORE_LOOP_STEPS.map((step) => (
        <View key={step} style={styles.step}>
          <AppText variant="label">{step}</AppText>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    loop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: space.xs,
    },
    step: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm + 2,
      paddingVertical: space.xxs + 2,
    },
  }),
);
