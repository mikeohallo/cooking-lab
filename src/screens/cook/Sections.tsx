import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ReadingCard } from '../../components/ReadingCard';
import {
  ADD_PHOTO,
  EDIT_NOTE,
  NOTE_ACTIONS,
  PHOTO_ALT,
  PHOTO_MISSING,
  READING_WORD_ELSEWHERE,
  VIEW_PHOTO,
} from '../../content/product';
import type { CookEvent, CookEventId, Revision } from '../../domain/entities';
import { latestWords } from '../../domain/evidence';
import { makeStyles, useColors } from '../../theme/theme';
import { radius, readingRoles, size, space } from '../../theme/tokens';
import { EditableWords } from './EditableWords';
import { formatCelsius, readingKindFromEvent, readingKindLabel, whereFromEvent } from './temperature';

/** The rows of a grid, `columns` to a row. */
function rowsOf<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += columns) {
    rows.push(items.slice(start, start + columns));
  }
  return rows;
}

/** A reading's word: Oven, Internal, or the cook's own words for where. */
function readingWord(event: CookEvent): string {
  const kind = readingKindFromEvent(event);
  return readingKindLabel(kind) ?? whereFromEvent(event) ?? READING_WORD_ELSEWHERE;
}

/**
 * Readings as cards, two to a row (0.4.0): the icon in its tint, the word —
 * Oven, Internal, never Inside, or where it was taken — and the number. In the
 * order they were taken. Times stay in the data.
 */
export function ReadingsGrid({ readings }: { readings: readonly CookEvent[] }) {
  const styles = useStyles();
  return (
    <View style={styles.grid} testID="readings">
      {rowsOf(readings, 2).map((row) => (
        <View key={row[0]?.id} style={styles.gridRow}>
          {row.map((event) => {
            const kind = readingKindFromEvent(event);
            const where = whereFromEvent(event);
            return (
              <View key={event.id} style={styles.cell}>
                <ReadingCard
                  kind={kind === 'none' ? null : kind}
                  word={readingWord(event)}
                  value={formatCelsius(event)}
                  narrow
                  valueTestID={`reading-value-${event.id}`}
                  iconTestID={kind === 'none' ? undefined : `reading-icon-${kind}`}
                  testID={`event-${event.id}`}
                >
                  {kind !== 'none' && where ? (
                    <AppText variant="secondary" tone="inkMuted">
                      {where}
                    </AppText>
                  ) : null}
                </ReadingCard>
              </View>
            );
          })}
          {row.length < 2 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

/** A reading as a small chip, inside From the cook: "Oven 180 °C". */
export function ReadingChips({ readings }: { readings: readonly CookEvent[] }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.chips} testID="readings">
      {readings.map((event) => {
        const kind = readingKindFromEvent(event);
        const roles = kind === 'none' ? null : readingRoles[kind];
        return (
          <View
            key={event.id}
            style={[styles.readingChip, { backgroundColor: colors[roles?.tint ?? 'surfaceRaised'] }]}
            accessible
            accessibilityLabel={`${readingWord(event)} ${formatCelsius(event)}`}
            testID={`event-${event.id}`}
          >
            <Icon name={kind === 'internal' ? 'probe' : 'oven'} color={roles?.ink ?? 'ink'} size={size.iconSmall + 2} />
            <AppText variant="bodyStrong" tone={roles?.ink ?? 'ink'}>
              {`${readingWord(event)} `}
              <AppText variant="bodyStrong" tone={roles?.ink ?? 'ink'} testID={`reading-value-${event.id}`}>
                {formatCelsius(event)}
              </AppText>
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

type NotesListProps = {
  notes: readonly CookEvent[];
  revisions: readonly Revision[];
  /** The note whose editor is open, if any. */
  editing: CookEventId | null;
  onEditingChange: (id: CookEventId | null) => void;
  onSave: (event: CookEvent, text: string) => Promise<string | null>;
  /** ⋯ on a note: the Note options sheet. */
  onMore: (event: CookEvent) => void;
};

/**
 * The notes, a row each in the order they were written, divided by lines: a
 * pencil in its navy tint, the words as they now read, and ⋯ for the Note
 * options sheet. Edit note opens the words in place; every earlier version is
 * kept (rule 11).
 */
export function NotesList({ notes, revisions, editing, onEditingChange, onSave, onMore }: NotesListProps) {
  const styles = useStyles();
  return (
    <View testID="notes">
      {notes.map((event, index) => {
        const shown = latestWords(event.body, revisions.filter((edit) => edit.cookEventId === event.id));
        return (
          <View
            key={event.id}
            style={[styles.noteRow, index > 0 && styles.divided]}
            testID={`event-${event.id}`}
          >
            <View style={styles.noteCircle}>
              <Icon name="pencil" color="ink" size={size.iconSmall + 2} />
            </View>
            <View style={styles.noteWords}>
              <EditableWords
                words={shown.text ?? ''}
                edited={shown.edited}
                editable
                onSave={(text) => onSave(event, text)}
                onShowVersions={() => onMore(event)}
                onMore={() => onMore(event)}
                editing={editing === event.id}
                onEditingChange={(open) => onEditingChange(open ? event.id : null)}
                showEdited={false}
                actionsLabel={NOTE_ACTIONS}
                editLabel={EDIT_NOTE}
                testID={`note-${event.id}`}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

type PhotoGridProps = {
  photos: readonly CookEvent[];
  uris: Readonly<Record<CookEventId, string | null>>;
  onOpen: (event: CookEvent, uri: string) => void;
  /** The + tile, on an open cook. */
  onAdd?: () => void;
  /** Four to a row on the cover screen; From the cook draws them smaller. */
  columns?: number;
};

/** Photos as a grid of squares, in the order they were taken, with a + tile on an open cook. */
export function PhotoGrid({ photos, uris, onOpen, onAdd, columns = 4 }: PhotoGridProps) {
  const styles = useStyles();
  const tiles: (CookEvent | 'add')[] = onAdd ? [...photos, 'add'] : [...photos];
  return (
    <View style={styles.grid} testID="photos">
      {rowsOf(tiles, columns).map((row, rowIndex) => (
        <View key={rowIndex} style={styles.gridRow}>
          {row.map((tile) =>
            tile === 'add' ? (
              <Pressable
                key="add"
                accessibilityRole="button"
                accessibilityLabel={ADD_PHOTO}
                onPress={onAdd}
                style={({ pressed }) => [styles.tile, styles.addTile, pressed && styles.pressed]}
                testID="photo-add-tile"
              >
                <Icon name="plus" color="ink" size={size.icon + 4} />
              </Pressable>
            ) : (
              <PhotoTile key={tile.id} event={tile} uri={uris[tile.id]} onOpen={onOpen} />
            ),
          )}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`gap-${index}`} style={styles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

function PhotoTile({
  event,
  uri,
  onOpen,
}: {
  event: CookEvent;
  uri: string | null | undefined;
  onOpen: (event: CookEvent, uri: string) => void;
}) {
  const styles = useStyles();
  if (uri == null) {
    // Still being found, or its file is gone: a quiet tile that says so.
    return (
      <View
        style={[styles.tile, styles.missing]}
        accessible
        accessibilityLabel={uri === null ? PHOTO_MISSING : PHOTO_ALT}
        testID={`event-${event.id}`}
      >
        <Icon name="camera" color="inkMuted" />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={VIEW_PHOTO}
      accessibilityHint="Opens the photo full screen"
      onPress={() => onOpen(event, uri)}
      style={styles.tile}
      testID={`event-${event.id}`}
    >
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={PHOTO_ALT}
        testID={`photo-${event.id}`}
      />
    </Pressable>
  );
}

/**
 * From the cook, on a reviewed cook (0.4.0): readings as chips, the notes,
 * the photos, together in one card.
 */
export function FromTheCookCard({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <Card testID="from-the-cook" style={styles.fromTheCook}>
      {children}
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    grid: {
      gap: space.sm,
    },
    gridRow: {
      flexDirection: 'row',
      gap: space.sm,
    },
    cell: {
      flex: 1,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    readingChip: {
      minHeight: size.targetMin - 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      paddingHorizontal: space.sm + 2,
      borderRadius: radius.pill,
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      paddingVertical: space.xs,
    },
    divided: {
      borderTopWidth: size.hairline,
      borderTopColor: colors.line,
    },
    noteCircle: {
      width: size.iconCircleInner,
      height: size.iconCircleInner,
      borderRadius: radius.pill,
      backgroundColor: colors.noteIcon,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: space.xxs / 2,
    },
    noteWords: {
      flex: 1,
      paddingTop: space.xxs,
    },
    tile: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: radius.photo,
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.surfaceRaised,
    },
    addTile: {
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    missing: {
      backgroundColor: colors.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.8,
    },
    fromTheCook: {
      gap: space.sm,
    },
  }),
);
