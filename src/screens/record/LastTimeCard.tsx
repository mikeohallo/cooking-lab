import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { MealTypeLabel } from '../../components/MealTypeLabel';
import {
  INGREDIENTS_SHOW_LESS,
  LAST_TIME,
  LAST_TIME_NO_RATINGS,
  NEXT_TIME,
  OPEN_LAST_TIME,
  YOUR_NOTES,
} from '../../content/product';
import { nextTimeWords, orderRatings, raterName, ratingAnswerText } from '../../domain/cookRecord';
import type { CookId, HouseholdMember } from '../../domain/entities';
import { formatDateTime } from '../../format/dateTime';
import type { LastTime } from '../../state/useCookRecord';
import { MIN_TOUCH_TARGET, space } from '../../theme/tokens';

/** How many lines of the earlier notes stand in when there is no next-time line. */
const NOTES_LINES = 3;

type LastTimeCardProps = {
  lastTime: LastTime;
  household: readonly HouseholdMember[];
  /** One line once the timeline has entries; tap to unfold. */
  folded: boolean;
  onOpen: (cookId: CookId) => void;
};

/** The first few lines of the earlier notes, as they now read. */
export function notesExcerpt(notes: string | null, lines = NOTES_LINES): string | null {
  if (notes === null || notes.trim() === '') {
    return null;
  }
  const kept = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const head = kept.slice(0, lines).join('\n');
  return kept.length > lines ? `${head}…` : head;
}

/**
 * "Last time" (0.3.0), above the ingredients on a cook started with *Cook
 * this again*: when the earlier cook was, who rated it what (N/A as N/A), and
 * its next-time lines — or, if it has none, the first lines of its notes.
 * *Open* goes to the earlier cook. It stays for the whole cook, folded to one
 * line once the timeline has entries.
 */
export function LastTimeCard({ lastTime, household, folded, onOpen }: LastTimeCardProps) {
  const [unfolded, setUnfolded] = useState(false);
  const { cook } = lastTime;
  const when = formatDateTime(cook.startedAt);
  const nextTime = lastTime.lessons.map((lesson) => nextTimeWords(lesson, lastTime.lessonRevisions).text);
  const notes = nextTime.length === 0 ? notesExcerpt(lastTime.notes) : null;
  const ratings = orderRatings(lastTime.ratings, household);
  const ratingLines = ratings
    .map((rating) => {
      const answer = ratingAnswerText(rating);
      const name = raterName(rating, household);
      const parts = [answer, rating.line === null ? null : `“${rating.line}”`].filter(
        (part): part is string => part !== null,
      );
      return parts.length === 0 ? null : `${name}: ${parts.join(' — ')}`;
    })
    .filter((line): line is string => line !== null);

  const open = (
    <ActionButton
      label={OPEN_LAST_TIME}
      variant="quiet"
      accessibilityHint={`Opens the cook from ${when}`}
      onPress={() => onOpen(cook.id)}
      testID="last-time-open"
    />
  );

  if (folded && !unfolded) {
    const summary = nextTime[0] ?? notes?.split('\n')[0] ?? ratingLines[0] ?? '';
    return (
      <Card variant="muted" testID="last-time">
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            accessibilityLabel={`${LAST_TIME}, ${when}. ${summary}`}
            accessibilityHint="Shows all of it"
            onPress={() => setUnfolded(true)}
            style={styles.foldedText}
            testID="last-time-folded"
          >
            <AppText variant="secondary" numberOfLines={1}>
              <AppText variant="label" tone="muted">{`${LAST_TIME} · `}</AppText>
              {summary === '' ? when : summary}
            </AppText>
          </Pressable>
          {open}
        </View>
      </Card>
    );
  }

  return (
    <Card variant="muted" testID="last-time">
      <View style={styles.block}>
        <View style={styles.row}>
          <View style={styles.title}>
            <MealTypeLabel mealType={lastTime.mealType?.mealType ?? null} testID="last-time-meal" />
            <AppText variant="label" tone="muted" accessibilityRole="header">
              {LAST_TIME}
            </AppText>
            <AppText variant="caption" tone="muted">
              {when}
            </AppText>
          </View>
          {open}
        </View>
        {ratingLines.length === 0 ? (
          <AppText variant="secondary" tone="muted">
            {LAST_TIME_NO_RATINGS}
          </AppText>
        ) : (
          <View testID="last-time-ratings">
            {ratingLines.map((line) => (
              <AppText key={line} variant="secondary">
                {line}
              </AppText>
            ))}
          </View>
        )}
        {nextTime.length > 0 ? (
          <View testID="last-time-next-time">
            <AppText variant="label" tone="muted">
              {NEXT_TIME}
            </AppText>
            {nextTime.map((line, index) => (
              <AppText key={`${index}-${line}`} variant="body">
                {`• ${line}`}
              </AppText>
            ))}
          </View>
        ) : notes !== null ? (
          <View testID="last-time-notes">
            <AppText variant="label" tone="muted">
              {YOUR_NOTES}
            </AppText>
            <AppText variant="body">{notes}</AppText>
          </View>
        ) : null}
        {folded ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setUnfolded(false)}
            style={styles.fold}
            testID="last-time-fold"
          >
            <AppText variant="label" tone="primary">
              {INGREDIENTS_SHOW_LESS}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  title: {
    flexShrink: 1,
  },
  foldedText: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  fold: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
