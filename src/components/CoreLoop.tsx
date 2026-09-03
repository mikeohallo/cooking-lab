import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CORE_LOOP_STEPS } from '../content/product';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { colors, fontSize, radius, space } from '../theme/tokens';

/**
 * The Cook -> Observe -> Review -> Learn -> Cook Again loop.
 *
 * Steps wrap rather than scroll, and on cover-screen-class widths they stack
 * vertically so nothing is ever pushed off the right edge.
 */
export function CoreLoop() {
  const { allowsInlineLoop } = useLayoutMetrics();

  return (
    <View
      style={[styles.loop, allowsInlineLoop ? styles.loopInline : styles.loopStacked]}
      testID="core-loop"
    >
      {CORE_LOOP_STEPS.map((step, index) => (
        <Fragment key={step}>
          {index > 0 ? (
            <Text style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no">
              {allowsInlineLoop ? '→' : '↓'}
            </Text>
          ) : null}
          <View style={styles.step}>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loop: {
    gap: space.sm,
  },
  loopInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  loopStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  step: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  stepText: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  arrow: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
});
