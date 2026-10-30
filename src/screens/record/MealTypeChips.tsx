import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { MealTypeDot } from '../../components/MealTypeLabel';
import { MEAL_TYPE_CHIPS_LABEL, MEAL_TYPE_CLEAR_HINT } from '../../content/product';
import { MEAL_TYPE_LABELS } from '../../domain/cookRecord';
import { STORED_MEAL_TYPES, type MealType, type StoredMealType } from '../../domain/enums';
import { MIN_TOUCH_TARGET, colors, radius, space } from '../../theme/tokens';

type MealTypeChipsProps = {
  /** The meal type now, or `null` for none. */
  value: StoredMealType | null;
  /** Saves; resolves with a message when it was not saved. */
  onChange: (next: MealType) => Promise<string | null>;
  testID?: string;
};

/**
 * Breakfast, Lunch/Dinner, Dessert, Snack (0.3.0). One tap sets it; a tap on
 * the chosen one clears it. Nothing is ever chosen for the cook.
 */
export function MealTypeChips({ value, onChange, testID = 'meal-type' }: MealTypeChipsProps) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = async (mealType: StoredMealType) => {
    if (pending) {
      return;
    }
    setPending(true);
    setProblem(null);
    const failure = await onChange(mealType === value ? 'none' : mealType);
    setPending(false);
    setProblem(failure);
  };

  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={MEAL_TYPE_CHIPS_LABEL}>
        {STORED_MEAL_TYPES.map((mealType) => {
          const selected = mealType === value;
          const label = MEAL_TYPE_LABELS[mealType];
          return (
            <Pressable
              key={mealType}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled: pending }}
              accessibilityHint={selected ? MEAL_TYPE_CLEAR_HINT : undefined}
              onPress={() => void choose(mealType)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && !selected && styles.chipPressed,
              ]}
              testID={`${testID}-${mealType}`}
            >
              <View style={styles.chipRow}>
                <MealTypeDot mealType={mealType} />
                <AppText variant="label" tone={selected ? 'onPrimary' : 'primary'}>
                  {selected ? `✓ ${label}` : label}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
      {problem ? (
        <AppText variant="caption" tone="danger" testID={`${testID}-failed`}>
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.xxs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  chipPressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
