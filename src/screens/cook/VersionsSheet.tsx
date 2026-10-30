import { ScrollView, StyleSheet, View } from 'react-native';

import { ActionButton } from '../../components/ActionButton';
import { PaneSheet } from '../../layout/panes';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { CLOSE_VERSIONS, EARLIER_VERSIONS, ORIGINAL_VERSION } from '../../content/product';
import type { IsoTimestamp, Revision } from '../../domain/entities';
import { formatDateTime } from '../../format/dateTime';
import { colors, space } from '../../theme/tokens';

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

type VersionsSheetProps = {
  /** What to list, or `null` when closed. */
  versions: readonly Version[] | null;
  onClose: () => void;
};

/** Read-only. Nothing here can change or remove a version. */
export function VersionsSheet({ versions, onClose }: VersionsSheetProps) {
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
            <AppText variant="sectionTitle" accessibilityRole="header">
              {EARLIER_VERSIONS}
            </AppText>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {(versions ?? []).map((version, index) => (
                <Card key={`${version.at}-${index}`} testID={`version-${index}`}>
                  <AppText variant="body">{version.text}</AppText>
                  <AppText variant="caption" tone="muted">
                    {version.original
                      ? `${ORIGINAL_VERSION} · ${formatDateTime(version.at)}`
                      : formatDateTime(version.at)}
                  </AppText>
                </Card>
              ))}
            </ScrollView>
            <View style={styles.actions}>
              <ActionButton
                label={CLOSE_VERSIONS}
                variant="secondary"
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: space.sm,
    backgroundColor: colors.background,
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
});
