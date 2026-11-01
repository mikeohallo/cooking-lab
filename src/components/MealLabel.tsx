import { StyleSheet, View } from 'react-native';

import { mealTypeLabel } from '../domain/cookRecord';
import type { MealType } from '../domain/enums';
import { makeStyles } from '../theme/theme';
import { mealColorRole, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, MEAL_ICON } from './Icon';

type MealLabelProps = {
  mealType: MealType | null | undefined;
  testID?: string;
};

/**
 * The small coloured word and icon that say what a cook was: Breakfast,
 * Lunch/Dinner, Dessert, Snack or Side. The meal's colour is on the word and
 * the icon, never a fill, and never without the word. Nothing at all for a
 * cook with no meal type.
 */
export function MealLabel({ mealType, testID }: MealLabelProps) {
  const styles = useStyles();
  const label = mealTypeLabel(mealType);
  if (label === null || mealType == null || mealType === 'none') {
    return null;
  }
  const role = mealColorRole[mealType];
  return (
    <View style={styles.label} testID={testID} accessibilityLabel={`Meal type: ${label}`}>
      <Icon name={MEAL_ICON[mealType]} color={role} size={size.iconSmall - 2} />
      <AppText variant="label" tone={role}>
        {label}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    label: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: space.xxs + 1,
    },
  }),
);
