import { StyleSheet, View } from 'react-native';

import { mealTypeLabel } from '../domain/cookRecord';
import type { MealType } from '../domain/enums';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

type MealTypeLabelProps = {
  mealType: MealType | null | undefined;
  testID?: string;
};

/**
 * The small word above a cook's title — "Breakfast", "Lunch/Dinner",
 * "Dessert", "Snack" — wherever a cook is listed or shown (0.3.0). Nothing at
 * all for a cook with no meal type.
 *
 * Neutral for now: the word carries the meaning. Part 2 gives each meal type
 * its colour, and the word stays, so the colour is never the only signal.
 */
export function MealTypeLabel({ mealType, testID }: MealTypeLabelProps) {
  const label = mealTypeLabel(mealType);
  if (label === null) {
    return null;
  }
  return (
    <View style={styles.label} testID={testID} accessibilityLabel={`Meal type: ${label}`}>
      <AppText variant="caption" tone="muted" style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.xs,
    paddingVertical: 1,
  },
  text: {
    letterSpacing: 0.3,
  },
});
