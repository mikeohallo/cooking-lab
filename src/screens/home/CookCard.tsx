import { StyleSheet } from 'react-native';

import { AppText } from '../../components/AppText';
import { CookCard as CookCardPart } from '../../components/CookCard';
import { StatusChip } from '../../components/StatusChip';
import { DELETE_COOK, STATUS_OPEN, UNTITLED_COOK } from '../../content/product';
import type { Cook } from '../../domain/entities';
import type { StoredMealType } from '../../domain/enums';
import { formatDateTime } from '../../format/dateTime';
import { verdictExcerpt } from '../../state/useCookList';
import { makeStyles } from '../../theme/theme';
import type { HighlightedSegment, SearchHit } from '../history/search';
import { ratingsSpoken, type StarredRating } from './ratingsLine';

type CookCardProps = {
  cook: Cook;
  /** The notes as they now read — the newest edit, or as first written. */
  verdict?: string | null;
  /** Its meal type, shown as a small label above the title (0.3.0). */
  mealType?: StoredMealType | null;
  /** Its cuisine's label, or Other's words (0.4.0). */
  cuisine?: string | null;
  /** The card's photo (0.4.0): its own first, or the last cook of the same dish. */
  photoUri?: string | null;
  /** Its ratings with stars, in order; N/A left out (0.3.0). */
  ratings?: readonly StarredRating[];
  /** When the card is a search result: the matched words picked out. */
  hit?: SearchHit;
  /** The cook shown in the other pane, on the inner display. */
  selected?: boolean;
  onPress: () => void;
  /** Opens the cook's actions (Delete cook). */
  onLongPress?: () => void;
};

/**
 * A cook on Home, on the shared CookCard (0.4.0): its photo or meal tile, the
 * meal label and cuisine, the title (never cut off, N2), the date, who gave it
 * how many stars, then the first line or two of the notes. Long-press for
 * Delete cook. Part 2 of 0.4.0 redraws Home around it.
 */
export function CookCard({
  cook,
  verdict,
  mealType = null,
  cuisine = null,
  photoUri = null,
  ratings = [],
  hit,
  selected,
  onPress,
  onLongPress,
}: CookCardProps) {
  const title = cook.title ?? UNTITLED_COOK;
  const excerpt = verdictExcerpt(verdict === undefined ? cook.verdict : verdict);
  const open = cook.status === 'open';
  return (
    <CookCardPart
      title={hit !== undefined && cook.title !== null ? <Highlighted segments={hit.title} /> : title}
      untitled={cook.title === null}
      dateLine={formatDateTime(cook.startedAt)}
      mealType={mealType}
      cuisine={cuisine}
      photoUri={photoUri}
      badge={open ? <StatusChip status="open" label={STATUS_OPEN} /> : null}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={DELETE_COOK}
      accessibilityLabel={`${title}, ${formatDateTime(cook.startedAt)}`}
      accessibilityHint={open ? 'Continue this cook' : 'Open this cook'}
      testID={`cook-card-${cook.id}`}
      partID={`cook-${cook.id}`}
      titleTestID={`cook-title-${cook.id}`}
      mealTestID={`cook-meal-${cook.id}`}
    >
      {ratings.length > 0 ? (
        <AppText
          variant="secondary"
          accessibilityLabel={ratingsSpoken(ratings)}
          testID={`cook-ratings-${cook.id}`}
        >
          {ratings.map((rating, index) => (
            <AppText key={rating.key} variant="secondary">
              {index > 0 ? '  ·  ' : ''}
              <AppText variant="secondary" tone="star">
                ★
              </AppText>
              {` ${rating.stars} ${rating.name}`}
            </AppText>
          ))}
        </AppText>
      ) : null}
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
      {excerpt ? (
        <AppText variant="secondary" numberOfLines={2} testID={`cook-notes-${cook.id}`}>
          {excerpt}
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
