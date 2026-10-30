import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { MealTypeLabel } from '../../components/MealTypeLabel';
import { StatusChip } from '../../components/StatusChip';
import { DELETE_COOK, STATUS_OPEN, UNTITLED_COOK } from '../../content/product';
import type { Cook } from '../../domain/entities';
import type { StoredMealType } from '../../domain/enums';
import { formatDateTime } from '../../format/dateTime';
import { verdictExcerpt } from '../../state/useCookList';
import { colors, space } from '../../theme/tokens';
import type { HighlightedSegment, SearchHit } from '../history/search';
import { ratingsSpoken, type StarredRating } from './ratingsLine';

type CookCardProps = {
  cook: Cook;
  /** The notes as they now read — the newest edit, or as first written. */
  verdict?: string | null;
  /** Its meal type, shown as a small label above the title (0.3.0). */
  mealType?: StoredMealType | null;
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
 * A cook on Home: its meal type above the title; the title, never cut off;
 * the date; who gave it how many stars, on one line; then the first line or
 * two of the notes. Long-press for Delete cook.
 *
 * N2 (0.3.0): the title is a block of its own, the full width of the card,
 * not a shrinking item in a row beside the Open chip. In a row, Android
 * measured the title at the row's width and then drew it narrower, and a
 * wrapped last word ("Acceptance cook" → "Acceptance") fell on a line that was
 * never drawn. It now wraps to as many lines as it needs at any width and any
 * font scale.
 */
export function CookCard({
  cook,
  verdict,
  mealType = null,
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
    <Card
      onPress={onPress}
      onLongPress={onLongPress}
      longPressLabel={DELETE_COOK}
      selected={selected}
      accessibilityLabel={`${title}, ${formatDateTime(cook.startedAt)}`}
      accessibilityHint={open ? 'Continue this cook' : 'Open this cook'}
      testID={`cook-card-${cook.id}`}
    >
      {mealType !== null || open ? (
        <View style={styles.labels}>
          <MealTypeLabel mealType={mealType} testID={`cook-meal-${cook.id}`} />
          {open ? <StatusChip status="open" label={STATUS_OPEN} /> : null}
        </View>
      ) : null}
      <AppText
        variant="bodyStrong"
        tone={cook.title ? 'text' : 'muted'}
        style={styles.title}
        testID={`cook-title-${cook.id}`}
      >
        {hit !== undefined && cook.title !== null ? <Highlighted segments={hit.title} /> : title}
      </AppText>
      <AppText variant="caption" tone="muted">
        {formatDateTime(cook.startedAt)}
      </AppText>
      {ratings.length > 0 ? (
        <AppText
          variant="secondary"
          accessibilityLabel={ratingsSpoken(ratings)}
          testID={`cook-ratings-${cook.id}`}
        >
          {ratings.map((rating, index) => (
            <AppText key={rating.key} variant="secondary">
              {index > 0 ? '  ·  ' : ''}
              <AppText variant="secondary" style={styles.star}>
                ★
              </AppText>
              {` ${rating.stars} ${rating.name}`}
            </AppText>
          ))}
        </AppText>
      ) : null}
      {hit !== undefined && hit.tags.length > 0 ? (
        <AppText variant="secondary" tone="muted" testID={`cook-tags-line-${cook.id}`}>
          <Highlighted segments={hit.tagLine} />
        </AppText>
      ) : null}
      {hit !== undefined && hit.ingredientLine.length > 0 ? (
        <AppText variant="secondary" tone="muted" testID={`cook-ingredients-line-${cook.id}`}>
          <Highlighted segments={hit.ingredientLine} />
        </AppText>
      ) : null}
      {excerpt ? (
        <AppText variant="secondary" numberOfLines={2} testID={`cook-notes-${cook.id}`}>
          {excerpt}
        </AppText>
      ) : null}
    </Card>
  );
}

/**
 * Text with the matched runs picked out.
 *
 * Bold and a soft tint behind it, not colour alone: a highlight that was only
 * a tint would be invisible to some of the people reading it, and weight
 * carries the same information everywhere.
 */
export function Highlighted({ segments }: { segments: readonly HighlightedSegment[] }) {
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

const styles = StyleSheet.create({
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  // A block of its own, full width; see N2 above. Nothing here limits lines.
  title: {
    alignSelf: 'stretch',
  },
  star: {
    color: colors.star,
  },
  match: {
    backgroundColor: colors.primarySoft,
    color: colors.text,
  },
});
