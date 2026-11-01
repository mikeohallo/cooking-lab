import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type CuisinePillProps = {
  /** The cuisine's label, or the cook's own words for Other. Nothing when null. */
  label: string | null | undefined;
  testID?: string;
};

/**
 * Where a cook is from, such as Greek or Japanese: a neutral pill with a
 * globe, beside the MealLabel. Deliberately neutral, so it never competes
 * with the meal's colour. A cook with no cuisine shows nothing.
 */
export function CuisinePill({ label, testID }: CuisinePillProps) {
  const styles = useStyles();
  if (label == null || label.trim() === '') {
    return null;
  }
  return (
    <View style={styles.pill} testID={testID} accessibilityLabel={`Cuisine: ${label}`}>
      <Icon name="globe" color="ink" size={size.iconTiny} />
      <AppText variant="label">{label}</AppText>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: space.xxs,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.pill,
      paddingVertical: space.xxs / 2,
      paddingLeft: space.xxs + 3,
      paddingRight: space.xs + 1,
    },
  }),
);
