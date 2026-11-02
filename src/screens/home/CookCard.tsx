import { StyleSheet } from 'react-native';

import { AppText } from '../../components/AppText';
import { CookCard as CookCardPart } from '../../components/CookCard';
import { DELETE_COOK, NEEDS_A_REVIEW, UNTITLED_COOK, ratingsCount } from '../../content/product';
import { ordinal } from '../../domain/cookRecord';
import type { Cook } from '../../domain/entities';
import type { StoredMealType } from '../../domain/enums';
import { formatDate } from '../../format/dateTime';
import { makeStyles } from '../../theme/theme';
import type { HighlightedSegment, SearchHit } from '../history/search';
import { ratingsSpoken, type StarredRating } from './ratingsLine';

type CookCardProps = {
  cook: Cook;
  /** Its meal type, shown as a small label above the title (0.3.0). */
  mealType?: StoredMealType | null;
  /** Its cuisine's label, or Other's words (0.4.0). */
  cuisine?: string | null;
  /** The card's photo (0.4.0): its own first, or the last cook of the same dish. */
  photoUri?: string | null;
  /** Its ratings with stars, in order; N/A left out (0.3.0). */
  ratings?: readonly StarredRating[];
  /** 1 for a first time, 2 for the first repeat, … */
  timesCooked?: number;
  /** When the card is a search result: the matched words picked out. */
  hit?: SearchHit;
  /** The cook shown in the other pane, on the inner display. */
  selected?: boolean;
  /** The inner list's smaller card. */
  compact?: boolean;
  onPress: () => void;
  /** Opens the cook's actions (Delete cook). */
  onLongPress?: () => void;
};

/** "5.0" from the stars given, to one place. */
export function averageOf(ratings: readonly StarredRating[]): string | null {
  if (ratings.length === 0) {
    return null;
  }
  return (ratings.reduce((sum, rating) => sum + rating.stars, 0) / ratings.length).toFixed(1);
}

/** "Fri 30 Oct", or "Tue 27 Oct · 3rd time". */
export function cardDateLine(cook: Cook, timesCooked: number): string {
  const date = formatDate(cook.startedAt);
  return timesCooked > 1 ? `${date} · ${ordinal(timesCooked)} time` : date;
}

/**
 * A cook in Your cooks (0.4.0): its photo or meal tile, the meal label and
 * cuisine, the title (never cut off, N2), the date and how many times it has
 * been cooked, then the average of its stars and how many gave them — or, with
 * no stars yet, the Needs a review chip. Long-press for Delete cook.
 */
export function CookCard({
  cook,
  mealType = null,
  cuisine = null,
  photoUri = null,
  ratings = [],
  timesCooked = 1,
  hit,
  selected,
  compact,
  onPress,
  onLongPress,
}: CookCardProps) {
  const title = cook.title ?? UNTITLED_COOK;
  const dateLine = cardDateLine(cook, timesCooked);
  const average = averageOf(ratings);
  return (
    <CookCardPart
      title={hit !== undefined && cook.title !== null ? <Highlighted segments={hit.title} /> : title}
      untitled={cook.title === null}
      dateLine={dateLine}
      mealType={mealType}
      cuisine={cuisine}
      photoUri={photoUri}
      average={average}
      ratingSummary={average === null ? null : ratingsCount(ratings.length)}
      needsReviewLabel={NEEDS_A_REVIEW}
      selected={selected}
      compact={compact}
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={DELETE_COOK}
      accessibilityLabel={
        average === null
          ? `${title}, ${dateLine}, ${NEEDS_A_REVIEW}`
          : `${title}, ${dateLine}, ${ratingsSpoken(ratings)}`
      }
      accessibilityHint="Open this cook"
      testID={`cook-card-${cook.id}`}
      partID={`cook-${cook.id}`}
      titleTestID={`cook-title-${cook.id}`}
      mealTestID={`cook-meal-${cook.id}`}
    >
      {hit !== undefined && hit.tags.length > 0 ? (
        <AppText variant="secondary" tone="inkMuted" testID={`cook-tags-line-${cook.id}`}>
          <Highlighted segments={hit.tagLine} />
        </AppText>
      ) : null}
      {hit !== undefined && hit.ingredientLine.length > 0 ? (
        <AppText variant="secondary" tone="inkMuted" testID={`cook-ingredients-line-${cook.id}`}>
          <Highlighted segments={hit.ingredientLine} />
        </AppText>
      ) : null}
    </CookCardPart>
  );
}

/**
 * Text with the matched runs picked out: bold and a soft tint behind it, not
 * colour alone.
 */
export function Highlighted({ segments }: { segments: readonly HighlightedSegment[] }) {
  const styles = useStyles();
  return (
    <>
      {segments.map((segment, index) => (
        <AppText
          // Segments have no identity of their own; their position is their
          // identity, and the list is rebuilt whole on every keystroke.
          key={`${index}-${segment.text}`}
          variant={segment.matched ? 'bodyStrong' : 'secondary'}
          style={segment.matched ? styles.match : undefined}
        >
          {segment.text}
        </AppText>
      ))}
    </>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    match: {
      backgroundColor: colors.surfaceRaised,
      color: colors.ink,
    },
  }),
);
