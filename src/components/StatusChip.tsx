import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space, statusRoles, type StatusTreatment } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type StatusChipProps = {
  /** Which meaning this chip carries. Decides the colour treatment. */
  status: StatusTreatment;
  /** The words. Always shown: colour is never the only signal. */
  label: string;
  testID?: string;
};

const ICON: Partial<Record<StatusTreatment, IconName>> = {
  open: 'flame',
  reviewed: 'check',
};

/**
 * A small pill naming where a cook is: Cooking (a flame), Reviewed (a tick)
 * or Needs a review. The other evidence pairs wait for update 3.
 */
export function StatusChip({ status, label, testID }: StatusChipProps) {
  const styles = useStyles();
  const roles = statusRoles[status];
  const icon = ICON[status];
  return (
    <View style={[styles.chip, styles[status]]} accessibilityLabel={label} testID={testID}>
      {icon ? <Icon name={icon} color={roles.foreground} size={size.iconTiny + 1} /> : null}
      <AppText variant="label" tone={roles.foreground}>
        {label}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      paddingHorizontal: space.sm - 2,
      paddingVertical: space.xxs - 1,
    },
    ...(Object.fromEntries(
      Object.entries(statusRoles).map(([name, roles]) => [name, { backgroundColor: colors[roles.background] }]),
    ) as Record<StatusTreatment, { backgroundColor: string }>),
  }),
);
