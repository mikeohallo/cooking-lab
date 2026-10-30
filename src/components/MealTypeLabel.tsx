import { StyleSheet, View } from 'react-native';

import { mealTypeLabel } from '../domain/cookRecord';
import type { MealType, StoredMealType } from '../domain/enums';
import { mealTypeColors, radius, space } from '../theme/tokens';
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
 * Each meal type has its own soft colour (scheme A), and the word is always
 * printed, so the colour is never the only signal.
 */
export function MealTypeLabel({ mealType, testID }: MealTypeLabelProps) {
  const label = mealTypeLabel(mealType);
  if (label === null || mealType == null || mealType === 'none') {
    return null;
  }
  const treatment = mealTypeColors[mealType];
  return (
    <View
      style={[styles.label, { backgroundColor: treatment.background }]}
      testID={testID}
      accessibilityLabel={`Meal type: ${label}`}
    >
      <AppText variant="caption" style={[styles.text, { color: treatment.text }]}>
        {label}
      </AppText>
    </View>
  );
}

type MealTypeDotProps = {
  mealType: StoredMealType;
  testID?: string;
};

/** The meal type's dot, beside its word on a chip. Never shown without the word. */
export function MealTypeDot({ mealType, testID }: MealTypeDotProps) {
  return (
    <View
      style={[styles.dot, { backgroundColor: mealTypeColors[mealType].dot }]}
      importantForAccessibility="no"
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  label: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
  },
  text: {
    letterSpacing: 0.3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
