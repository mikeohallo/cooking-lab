import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { CORE_LOOP_STEPS } from '../content/product';
import { useLayoutMetrics } from '../layout/useLayoutMetrics';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

/**
 * The Cook -> Observe -> Review -> Learn -> Cook Again loop.
 *
 * Shown on first use, when there is nothing else to show. Steps wrap rather
 * than scroll, and on cover-screen-class widths they stack vertically so
 * nothing is ever pushed off the right edge.
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
            <AppText
              variant="secondary"
              tone="muted"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {allowsInlineLoop ? '→' : '↓'}
            </AppText>
          ) : null}
          <View style={styles.step}>
            <AppText variant="label">{step}</AppText>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loop: {
    gap: space.xs,
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
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
});
