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
              size={size.icon + 8}
            />
          </View>
        )}
        <View style={styles.text}>
          {mealType !== null || cuisine ? (
            <View style={styles.labels}>
              <MealLabel mealType={mealType} testID={`cook-meal-${cook.id}`} />
              <CuisinePill label={cuisine} />
            </View>
          ) : null}
          <AppText variant="cardTitle" tone={cook.title ? 'ink' : 'inkMuted'} testID={`cook-title-${cook.id}`}>
            {title}
          </AppText>
          <AppText variant="secondary" tone="inkMuted">
            {line}
          </AppText>
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
      padding: space.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    photo: {
      width: size.photoCardW,
      height: size.photoCardH,
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
    labels: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xs,
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
