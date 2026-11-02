import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { LastTimeCard as LastTimeCardPart } from '../../components/LastTimeCard';
import { LAST_TIME, OPEN_LAST_TIME, YOUR_NOTES } from '../../content/product';
import { nextTimeWords } from '../../domain/cookRecord';
import type { CookId } from '../../domain/entities';
import { formatDate } from '../../format/dateTime';
import type { LastTime } from '../../state/useCookRecord';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';

/** How many lines of the earlier notes stand in when there is no next-time line. */
const NOTES_LINES = 3;

type LastTimeCardProps = {
  lastTime: LastTime;
  onOpen: (cookId: CookId) => void;
};

/**
 * The average of the stars given, to one place ("4.5"), and how many said
 * something: "· 2 ratings, 1 N/A". Null when nobody gave stars.
 */
export function ratingAverage(
  ratings: readonly { readonly stars: number | null; readonly notEaten: boolean }[],
): { readonly value: string; readonly summary: string } | null {
  const starred = ratings.flatMap((rating) => (rating.stars === null ? [] : [rating.stars]));
  if (starred.length === 0) {
    return null;
  }
  const mean = starred.reduce((sum, stars) => sum + stars, 0) / starred.length;
  const notApplicable = ratings.filter((rating) => rating.notEaten).length;
  const counted = `${starred.length} ${starred.length === 1 ? 'rating' : 'ratings'}`;
  return {
    value: mean.toFixed(1),
    summary: notApplicable > 0 ? `· ${counted}, ${notApplicable} N/A` : `· ${counted}`,
  };
}

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

/** The earlier cook's next-time lines, as they now read. They head an open cook's page. */
export function lastTimeNextTime(lastTime: LastTime): readonly string[] {
  return lastTime.lessons.map((lesson) => nextTimeWords(lesson, lastTime.lessonRevisions).text);
}

/**
 * "Last time" (0.4.0), on a cook started with *Cook this again*: a clock, when
 * the earlier cook was, the average of its stars and how many gave them, and
 * Open in peach. Its next-time lines head the page in the Next time card; if
 * it has none, the first lines of its notes stand in here.
 */
export function LastTimeCard({ lastTime, onOpen }: LastTimeCardProps) {
  const styles = useStyles();
  const { cook } = lastTime;
  const when = formatDate(cook.startedAt);
  const notes = lastTimeNextTime(lastTime).length === 0 ? notesExcerpt(lastTime.notes) : null;
  const average = ratingAverage(lastTime.ratings);
  return (
    <LastTimeCardPart
      heading={`${LAST_TIME} · ${when}`}
      average={average?.value ?? null}
      ratingSummary={average?.summary ?? null}
      openLabel={OPEN_LAST_TIME}
      openHint={`Opens the cook from ${when}`}
      onOpen={() => onOpen(cook.id)}
    >
      {notes !== null ? (
        <View style={styles.notes} testID="last-time-notes">
          <AppText variant="label" tone="inkMuted">
            {YOUR_NOTES}
          </AppText>
          <AppText variant="body">{notes}</AppText>
        </View>
      ) : null}
    </LastTimeCardPart>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    notes: {
      gap: space.xxs,
    },
  }),
);
