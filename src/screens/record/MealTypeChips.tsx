import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { FilterChip } from '../../components/FilterChip';
import { MEAL_ICON } from '../../components/Icon';
import { MEAL_TYPE_CHIPS_LABEL, MEAL_TYPE_CLEAR_HINT } from '../../content/product';
import { MEAL_TYPE_LABELS } from '../../domain/cookRecord';
import { STORED_MEAL_TYPES, type MealType, type StoredMealType } from '../../domain/enums';
import { makeStyles } from '../../theme/theme';
import { mealColorRole, radius, size, space } from '../../theme/tokens';

type MealTypeChipsProps = {
  /** The meal type now, or `null` for none. */
  value: StoredMealType | null;
  /** Saves; resolves with a message when it was not saved. */
  onChange: (next: MealType) => Promise<string | null>;
  testID?: string;
};

/**
 * Breakfast, Lunch/Dinner, Dessert, Snack and Side (0.4.0). One tap sets it; a tap on
 * the chosen one clears it. Nothing is ever chosen for the cook.
 */
export function MealTypeChips({ value, onChange, testID = 'meal-type' }: MealTypeChipsProps) {
  const styles = useStyles();
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
            <FilterChip
              key={mealType}
              kind="choice"
              role="radio"
              label={label}
              selected={selected}
              disabled={pending}
              icon={MEAL_ICON[mealType]}
              iconColor={mealColorRole[mealType]}
              accessibilityHint={selected ? MEAL_TYPE_CLEAR_HINT : undefined}
              onPress={() => void choose(mealType)}
              testID={`${testID}-${mealType}`}
            />
          );
        })}
      </View>
      {problem ? (
        <AppText variant="secondary" tone="danger" testID={`${testID}-failed`}>
          {problem}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    block: {
      gap: space.xxs,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: space.xs,
      // Rows of wrapped controls sit 16 apart, so two rows' 48 dp touch areas never overlap (0.4.1).
      rowGap: space.md,
    },
    chip: {
      minHeight: size.targetMin,
      justifyContent: 'center',
      paddingHorizontal: space.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      backgroundColor: colors.selected,
      borderColor: colors.selected,
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    chipPressed: {
      backgroundColor: colors.surfaceRaised,
    },
  }),
);
