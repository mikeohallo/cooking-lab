import { useRef, type ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useKeptScroll } from '../../layout/useKeptScroll';

import { Button } from '../../components/Button';
import { PaneSheet } from '../../layout/panes';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { CLOSE_VERSIONS, EARLIER_VERSIONS, ORIGINAL_VERSION } from '../../content/product';
import type { IsoTimestamp, Lesson, LessonRevision, Revision } from '../../domain/entities';
import { formatDateTime } from '../../format/dateTime';
import { makeStyles } from '../../theme/theme';
import { space } from '../../theme/tokens';

export type Version = {
  readonly text: string;
  readonly at: IsoTimestamp;
  /** True for the words as first written. */
  readonly original: boolean;
};

/**
 * Every earlier version of a note or a verdict, newest first, the original
 * last — everything but the words already on screen.
 *
 * `originalAt` is when the original was written: the note's own time, or when
 * the review was saved.
 */
export function earlierVersions(
  original: string | null,
  originalAt: IsoTimestamp,
  revisions: readonly Revision[],
): readonly Version[] {
  const ordered = [...revisions].sort((left, right) =>
    left.revisedAt < right.revisedAt ? -1 : left.revisedAt > right.revisedAt ? 1 : 0,
  );
  const all: Version[] = [
    { text: original ?? '', at: originalAt, original: true },
    ...ordered.map((revision) => ({ text: revision.text, at: revision.revisedAt, original: false })),
  ];
  // The newest is the one on screen; the rest, newest first.
  return all.slice(0, -1).reverse();
}

/** Every earlier wording of one next-time line, newest first, the first marked original. */
export function earlierNextTimeVersions(lesson: Lesson, edits: readonly LessonRevision[]): readonly Version[] {
  const mine = edits
    .filter((edit) => edit.lessonId === lesson.id)
    .sort((left, right) => (left.revisedAt < right.revisedAt ? -1 : left.revisedAt > right.revisedAt ? 1 : 0));
  const all: Version[] = [
    { text: lesson.text, at: lesson.createdAt, original: true },
    ...mine.map((edit) => ({ text: edit.text, at: edit.revisedAt, original: false })),
  ];
  return all.slice(0, -1).reverse();
}

type VersionsSheetProps = {
  /** What to list, or `null` when closed. */
  versions: readonly Version[] | null;
  onClose: () => void;
};

/** The list of versions, keeping its place through a font-size change (0.5.0). */
function KeptScrollView(props: ComponentProps<typeof ScrollView>) {
  const scrollRef = useRef<ScrollView>(null);
  const kept = useKeptScroll('versions', scrollRef);
  return <ScrollView {...props} ref={scrollRef} {...kept} testID="versions-scroll" />;
}

/** Read-only. Nothing here can change or remove a version. */
export function VersionsSheet({ versions, onClose }: VersionsSheetProps) {
  const styles = useStyles();
  return (
    <PaneSheet visible={versions !== null} onRequestClose={onClose} transparent={false} testID="versions-sheet">
      {(insets) => (
        <>
          <View
            style={[
              styles.screen,
              {
                paddingTop: insets.top + space.md,
                paddingBottom: insets.bottom + space.md,
                paddingLeft: insets.left + space.ml,
                paddingRight: insets.right + space.ml,
              },
            ]}
          >
            <AppText variant="heading" accessibilityRole="header">
              {EARLIER_VERSIONS}
            </AppText>
            <KeptScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {(versions ?? []).map((version, index) => (
                <Card key={`${version.at}-${index}`} testID={`version-${index}`}>
                  <AppText variant="body">{version.text}</AppText>
                  <AppText variant="secondary" tone="inkMuted">
                    {version.original
                      ? `${ORIGINAL_VERSION} · ${formatDateTime(version.at)}`
                      : formatDateTime(version.at)}
                  </AppText>
                </Card>
              ))}
            </KeptScrollView>
            <View style={styles.actions}>
              <Button
                label={CLOSE_VERSIONS}
                variant="outlined"
                onPress={onClose}
                testID="versions-close"
              />
            </View>
          </View>
        </>
      )}
    </PaneSheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      gap: space.sm,
      backgroundColor: colors.page,
    },
    list: {
      flex: 1,
    },
    listContent: {
      gap: space.xs,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
  }),
);
