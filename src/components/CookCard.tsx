import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { MealType } from '../domain/enums';
import { makeStyles } from '../theme/theme';
import { mealColorRole, radius, size, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { CuisinePill } from './CuisinePill';
import { Icon, MEAL_ICON } from './Icon';
import { MealLabel } from './MealLabel';

type CookCardProps = {
  /** The title, or the title with search matches picked out. */
  title: ReactNode;
  /** Untitled cooks draw their stand-in title muted. */
  untitled?: boolean;
  /** "Tue 27 Oct · 3rd time". */
  dateLine: string;
  mealType?: MealType | null;
  /** The cuisine's label, or Other's words. */
  cuisine?: string | null;
  /** The card's photo: the cook's own first, or the last cook of the same dish (`uri`), or none. */
  photoUri?: string | null;
  /** The average, "4.5", and "· 3 reviews"; null shows the Needs a review chip. */
  average?: string | null;
  ratingSummary?: string | null;
  /** The words of the Needs a review chip, when there are no ratings. */
  needsReviewLabel?: string | null;
  /** A status chip beside the labels: Cooking, for an open cook. */
  badge?: ReactNode;
  titleTestID?: string;
  /** The base for the parts' test ids, when the card's own id is a prefix tests list by. */
  partID?: string;
  mealTestID?: string;
  /** The inner list's smaller card. */
  compact?: boolean;
  /** The cook shown in the other pane: a 2 px teal ring. */
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  longPressLabel?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Lines a search result adds: the matched tags or ingredients. */
  children?: ReactNode;
  testID: string;
};

/**
 * One cook in Your cooks: its photo (or a sage tile with its meal icon), what
 * it was and where it's from, its title, the date, and how it went. The whole
 * card is one tap target, with no buttons inside it. The title wraps to every
 * line it needs at any width and font scale (0.3.0's N2).
 */
export function CookCard({
  title,
  untitled = false,
  dateLine,
  mealType = null,
  cuisine = null,
  photoUri = null,
  average = null,
  ratingSummary = null,
  needsReviewLabel = null,
  badge = null,
  titleTestID,
  mealTestID,
  partID,
  compact = false,
  selected,
  onPress,
  onLongPress,
  longPressLabel,
  accessibilityLabel,
  accessibilityHint,
  children,
  testID,
}: CookCardProps) {
  const styles = useStyles();
  const part = partID ?? testID;
  const photoStyle = compact ? styles.photoCompact : styles.photo;
  const meal = mealType !== null && mealType !== 'none' ? mealType : null;
  return (
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={longPressLabel}
      selected={selected}
      compact
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <View style={styles.row}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={[photoStyle, styles.image]} testID={`${part}-photo`} />
        ) : (
          <View style={[photoStyle, styles.tile]} testID={`${part}-tile`}>
            {meal ? (
              <Icon name={MEAL_ICON[meal]} color={mealColorRole[meal]} size={compact ? size.icon : size.icon + 8} />
            ) : (
              <Icon name="forkKnife" color="zoneIcon" size={compact ? size.icon : size.icon + 8} />
            )}
          </View>
        )}
        <View style={styles.text}>
          {meal !== null || cuisine || badge ? (
            <View style={styles.labels}>
              <MealLabel mealType={meal} testID={mealTestID ?? `${part}-meal`} />
              <CuisinePill label={cuisine} testID={`${part}-cuisine`} />
              {badge}
            </View>
          ) : null}
          <AppText
            variant="cardTitle"
            tone={untitled ? 'inkMuted' : 'ink'}
            style={styles.title}
            testID={titleTestID ?? `${part}-title`}
          >
            {title}
          </AppText>
          <AppText variant="secondary" tone="inkMuted">
            {dateLine}
          </AppText>
          {average !== null ? (
            <View style={styles.rating} testID={`${part}-average`}>
              <Icon name="star" color="star" size={size.iconSmall} />
              <AppText variant="label" tone="starText">
                {average}
              </AppText>
              {ratingSummary ? (
                <AppText variant="secondary" tone="inkMuted">
                  {ratingSummary}
                </AppText>
              ) : null}
            </View>
          ) : needsReviewLabel ? (
            <View style={styles.needsReview}>
              <AppText variant="label" tone="onPeach">
                {needsReviewLabel}
              </AppText>
            </View>
          ) : null}
          {children}
        </View>
        <View style={styles.chevron}>
          <Icon name="chevronRight" color="ink" size={size.iconSmall} />
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
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
    photoCompact: {
      width: size.photoCardWInner,
      height: size.photoCardHInner,
      borderRadius: radius.photo,
    },
    image: {
      backgroundColor: colors.surfaceRaised,
    },
    tile: {
      backgroundColor: colors.zone,
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
    // A block of its own, full width, with no line limit (N2).
    title: {
      alignSelf: 'stretch',
    },
    rating: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xxs,
    },
    needsReview: {
      alignSelf: 'flex-start',
      backgroundColor: colors.peach,
      borderRadius: radius.pill,
      paddingHorizontal: space.xs,
      paddingVertical: space.xxs / 2,
    },
    chevron: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
