import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { CuisinePill } from '../../components/CuisinePill';
import { Icon, MEAL_ICON } from '../../components/Icon';
import { MealLabel } from '../../components/MealLabel';
import { Zone, ZoneOverline } from '../../components/Zone';
import { COOKING_NOW_OVERLINE, DELETE_COOK, UNTITLED_COOK, startedLine } from '../../content/product';
import { ordinal } from '../../domain/cookRecord';
import type { Cook } from '../../domain/entities';
import type { StoredMealType } from '../../domain/enums';
import { formatTime } from '../../format/dateTime';
import { makeStyles } from '../../theme/theme';
import { mealColorRole, radius, size, space } from '../../theme/tokens';

type CookingNowCardProps = {
  cook: Cook;
  mealType: StoredMealType | null;
  cuisine: string | null;
  photoUri: string | null;
  /** How many notes it has so far, once known. */
  notes: number | null;
  timesCooked: number;
  onPress: () => void;
  onLongPress: () => void;
  /** In the inner display's list pane (0.4.0). Since part 7 both sizes draw the same compact card. */
  compact?: boolean;
};

/**
 * One open cook at the top of Home (0.4.0): a sage zone with COOKING NOW, the
 * cook's photo, what it is, its title, when it started, how many notes it has
 * and how many times the dish has been cooked, and a round chevron. The whole
 * card is one tap back into the cook; a long-press offers Delete cook.
 */
export function CookingNowCard({
  cook,
  mealType,
  cuisine,
  photoUri,
  notes,
  timesCooked,
  onPress,
  onLongPress,
}: CookingNowCardProps) {
  const styles = useStyles();
  const title = cook.title ?? UNTITLED_COOK;
  const line =
    notes === null
      ? `Started ${formatTime(cook.startedAt)}`
      : startedLine(formatTime(cook.startedAt), notes, timesCooked, ordinal(timesCooked));
  return (
    <Zone
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={DELETE_COOK}
      accessibilityLabel={`Cooking now: ${title}. ${line}`}
      accessibilityHint="Continue this cook"
      testID={`cook-card-${cook.id}`}
      style={styles.zone}
    >
      <ZoneOverline icon="flame" label={COOKING_NOW_OVERLINE} />
      <View style={styles.row}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={[styles.photo, styles.image]} testID={`cook-${cook.id}-photo`} />
        ) : (
          <View style={[styles.photo, styles.tile]} testID={`cook-${cook.id}-tile`}>
            <Icon
              name={mealType ? MEAL_ICON[mealType] : 'forkKnife'}
              color={mealType ? mealColorRole[mealType] : 'zoneIcon'}
              size={size.icon}
            />
          </View>
        )}
        <View style={styles.text}>
          <AppText variant="cardTitle" tone={cook.title ? 'ink' : 'inkMuted'} testID={`cook-title-${cook.id}`}>
            {title}
          </AppText>
          {/* One line of meta where it fits: meal, cuisine and the started line wrap only when they must. */}
          <View style={styles.meta}>
            {mealType !== null || cuisine ? (
              <View style={styles.labels}>
                <MealLabel mealType={mealType} testID={`cook-meal-${cook.id}`} />
                <CuisinePill label={cuisine} />
              </View>
            ) : null}
            <AppText variant="secondary" tone="inkMuted" style={styles.line}>
              {line}
            </AppText>
          </View>
        </View>
        <View style={styles.chevron}>
          <Icon name="chevronRight" color="ink" size={size.iconSmall + 2} />
        </View>
      </View>
    </Zone>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    zone: {
      padding: space.sm,
      gap: space.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    // Compact (0.4.0 part 7): one square photo, about 56, on the cover and inner screens alike.
    photo: {
      width: size.photoNow,
      height: size.photoNow,
      borderRadius: radius.photo,
    },
    image: {
      backgroundColor: colors.surfaceRaised,
    },
    tile: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      gap: space.xxs / 2,
    },
    meta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: space.xs,
      rowGap: space.xxs / 2,
    },
    labels: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
    },
    line: {
      flexShrink: 1,
    },
    chevron: {
      width: size.iconCircle,
      height: size.iconCircle,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
