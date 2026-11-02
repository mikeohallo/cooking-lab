import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { makeStyles } from '../theme/theme';
import { radius, size, space, type ColorRole } from '../theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type SectionGroupProps = {
  /** Readings, Notes, Photos, Who ate it?, Your notes. */
  title: string;
  /** "2", shown after the heading: "Notes · 2". */
  count?: number;
  /** The section's icon, in its tinted circle. */
  icon?: IconName;
  /** The circle's tint: sage for places, note-icon for notes, the reading tints. */
  iconTint?: ColorRole;
  iconColor?: ColorRole;
  /** Something on the right of the heading: the average badge on Who ate it?. */
  trailing?: ReactNode;
  children: ReactNode;
  testID?: string;
};

/**
 * How a cook page is grouped: a heading over its own card or cards, in the
 * order Readings, Notes, Photos. Never a timeline: times stay in the data and
 * are shown on a long press or in the photo viewer.
 */
export function SectionGroup({
  title,
  count,
  icon,
  iconTint = 'zone',
  iconColor = 'zoneIcon',
  trailing,
  children,
  testID,
}: SectionGroupProps) {
  const styles = useStyles();
  return (
    <View style={styles.group} testID={testID}>
      <View style={styles.head}>
        {icon ? (
          <View style={[styles.circle, { backgroundColor: styles.tints[iconTint] }]}>
            <Icon name={icon} color={iconColor} size={size.iconSmall + 2} />
          </View>
        ) : null}
        <AppText
          variant="heading"
          accessibilityRole="header"
          accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
          style={styles.title}
        >
          {title}
          {count === undefined ? null : (
            <AppText variant="secondary" tone="inkMuted">{` · ${count}`}</AppText>
          )}
        </AppText>
        {trailing ?? null}
      </View>
      {children}
    </View>
  );
}

/** The warm badge behind an average rating, "★ 5.0", beside Who ate it?. */
export function RatingBadge({ average, testID }: { average: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.badge} testID={testID} accessibilityLabel={`Average ${average} stars`}>
      <Icon name="star" color="star" size={size.iconSmall} />
      <AppText variant="cardTitle">{average}</AppText>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  ...StyleSheet.create({
    group: {
      gap: space.sm,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    circle: {
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
      backgroundColor: colors.ratingBadge,
      borderRadius: radius.pill,
      paddingHorizontal: space.sm - 2,
      paddingVertical: space.xxs,
    },
  }),
  tints: colors as Readonly<Record<ColorRole, string>>,
}));
