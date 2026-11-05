import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Button } from '../../components/Button';
import { AppText } from '../../components/AppText';
import { NotApplicableToggle, StarButtons } from '../../components/StarRating';
import { Icon } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import { Zone } from '../../components/Zone';
import {
  ADD_A_LINE,
  ADD_GUEST,
  CANCEL,
  GUEST_MARK,
  GUEST_NAME_PLACEHOLDER,
  NOT_EATEN,
  NOT_EATEN_LONG,
  NO_HOUSEHOLD_YET,
  RATING_LINE_PLACEHOLDER,
  SAVE_LINE,
  EDIT_LINE,
  NOT_EATEN_LINE,
  SOMEONE_ELSE,
  starsLabel,
} from '../../content/product';
import type { HouseholdMember, Rating } from '../../domain/entities';
import type { RatingAnswer, RatingPerson } from '../../domain/evidence';
import { activeMembers } from '../../domain/household';
import { MAX_PERSON_NAME_LENGTH, MAX_RATING_LINE_LENGTH } from '../../domain/invariants';
import { useKeptState } from '../../layout/KeptState';
import {
  RATING_CONTROLS_GAP,
  RATING_NAME_GAP,
  whoAteItLayout,
  type RatingRowFit,
  type WhoAteItLayout,
} from '../../layout/responsive';
import { useSaveOnLeave } from '../../state/useSaveOnLeave';
import { makeStyles } from '../../theme/theme';
import { radius, size, space } from '../../theme/tokens';
import { touchSlop } from '../../theme/touch';

/** "Someone else", after the + the zone draws as an icon. */
const SOMEONE_ELSE_LABEL = SOMEONE_ELSE.replace(/^\+\s*/, '');

type WhoAteItProps = {
  household: readonly HouseholdMember[];
  ratings: readonly Rating[];
  /** Saves one person's answer; resolves with a message when it was not saved. */
  onRate: (person: RatingPerson, answer: RatingAnswer) => Promise<string | null>;
  testID?: string;
};

type Row = {
  readonly key: string;
  readonly name: string;
  readonly person: RatingPerson;
  readonly rating: Rating | null;
  readonly guest: boolean;
  readonly retired: boolean;
};

function rowsFor(
  household: readonly HouseholdMember[],
  ratings: readonly Rating[],
  pendingGuests: readonly string[],
): readonly Row[] {
  const rows: Row[] = activeMembers(household).map((member) => ({
    key: `member-${member.id}`,
    name: member.name,
    person: { memberId: member.id },
    rating: ratings.find((rating) => rating.memberId === member.id) ?? null,
    guest: false,
    retired: false,
  }));
  // Someone who no longer eats here keeps the row of a rating they gave.
  for (const member of household) {
    const rating = ratings.find((candidate) => candidate.memberId === member.id);
    if (member.retiredAt !== null && rating !== undefined) {
      rows.push({
        key: `member-${member.id}`,
        name: member.name,
        person: { memberId: member.id },
        rating,
        guest: false,
        retired: true,
      });
    }
  }
  const guests = ratings
    .filter((rating) => rating.guestName !== null)
    .sort((left, right) => left.ratedAt.localeCompare(right.ratedAt));
  for (const rating of guests) {
    const name = rating.guestName ?? '';
    rows.push({ key: `guest-${name.toLowerCase()}`, name, person: { guestName: name }, rating, guest: true, retired: false });
  }
  for (const name of pendingGuests) {
    if (!rows.some((row) => row.guest && row.name.toLowerCase() === name.toLowerCase())) {
      rows.push({ key: `guest-${name.toLowerCase()}`, name, person: { guestName: name }, rating: null, guest: true, retired: false });
    }
  }
  return rows;
}

/**
 * "Who ate it?" (0.3.0, redrawn in 0.4.0): a row per person who usually eats,
 * in their order, on a rail — the name, five star buttons, N/A and a pencil
 * for their own line — then "+ Someone else" for a guest named for this cook
 * only.
 *
 * Every tap saves at once, as a tag does: nothing here waits for *Finish
 * review*, and nothing is required. A tap on the chosen star clears it. N/A
 * means "didn't eat it": it takes the stars away and counts nowhere.
 *
 * A person's own line saves when its field is left — it loses focus, or the
 * keyboard is closed — just as Save line does (0.4.0, part 6). An unchanged
 * or empty line saves nothing there; Save line still clears one. A guest's
 * name keeps its words with Add in sight until Add or Cancel.
 */
export function WhoAteIt({ household, ratings, onRate, testID = 'who-ate-it' }: WhoAteItProps) {
  const styles = useStyles();
  // What each row measured, live: its name's own width, N/A's, and the room.
  const [fits, setFits] = useState<Readonly<Record<string, Partial<RatingRowFit>>>>({});
  const measured = useCallback((key: string, part: keyof RatingRowFit, width: number) => {
    setFits((now) => (now[key]?.[part] === width ? now : { ...now, [key]: { ...now[key], [part]: width } }));
  }, []);
  // Kept across folding: on the inner display this part moves to the other pane.
  const [pendingGuests, setPendingGuests] = useKeptState<readonly string[]>(`${testID}-pending-guests`, []);
  const [addingGuest, setAddingGuest] = useKeptState(`${testID}-adding-guest`, false);
  const [guestDraft, setGuestDraft] = useKeptState(`${testID}-guest-draft`, '');
  const rows = rowsFor(household, ratings, pendingGuests);
  // One layout for the whole list (0.4.1), worked out afresh from every
  // measurement, so a wider window brings the controls back beside the names.
  const layout = whoAteItLayout(rows.map((row) => fits[row.key] ?? {}));

  const addGuest = () => {
    const name = guestDraft.trim();
    if (name === '' || name.length > MAX_PERSON_NAME_LENGTH) {
      return;
    }
    setPendingGuests((names) => [...names, name]);
    setGuestDraft('');
    setAddingGuest(false);
  };

  return (
    <View style={styles.block} testID={testID}>
      {rows.length === 0 ? (
        <AppText variant="secondary" tone="inkMuted">
          {NO_HOUSEHOLD_YET}
        </AppText>
      ) : null}
      <View>
        {rows.map((row, index) => (
          <RatingRow
            key={row.key}
            row={row}
            first={index === 0}
            last={index === rows.length - 1}
            onRate={onRate}
            layout={layout}
            onMeasure={(part, width) => measured(row.key, part, width)}
            testID={`${testID}-${row.key}`}
          />
        ))}
      </View>
      {addingGuest ? (
        <View style={styles.guestForm} testID={`${testID}-guest-form`}>
          <TextField
            value={guestDraft}
            onChangeText={setGuestDraft}
            placeholder={GUEST_NAME_PLACEHOLDER}
            accessibilityLabel={GUEST_NAME_PLACEHOLDER}
            autoFocus
            onSubmitEditing={addGuest}
            invalid={guestDraft.trim().length > MAX_PERSON_NAME_LENGTH}
            testID={`${testID}-guest-name`}
          />
          <View style={styles.formActions}>
            <Button label={CANCEL} variant="text" onPress={() => setAddingGuest(false)} />
            <Button
              label={ADD_GUEST}
              variant="secondary"
              disabled={guestDraft.trim() === '' || guestDraft.trim().length > MAX_PERSON_NAME_LENGTH}
              onPress={addGuest}
              testID={`${testID}-guest-add`}
            />
          </View>
        </View>
      ) : (
        <Zone
          onPress={() => setAddingGuest(true)}
          accessibilityLabel={SOMEONE_ELSE_LABEL}
          accessibilityHint="A guest, for this cook only"
          style={styles.someoneElse}
          hitSlop={BUTTON_SLOP}
          testID={`${testID}-someone-else`}
        >
          <Icon name="plus" color="zoneIcon" size={size.iconSmall + 2} />
          <AppText variant="bodyStrong">{SOMEONE_ELSE_LABEL}</AppText>
        </Zone>
      )}
    </View>
  );
}

function RatingRow({
  row,
  first,
  last,
  onRate,
  layout,
  onMeasure,
  testID,
}: {
  row: Row;
  first: boolean;
  last: boolean;
  onRate: WhoAteItProps['onRate'];
  /** Beside the name, or under it: the same for every row of the list. */
  layout: WhoAteItLayout;
  onMeasure: (part: keyof RatingRowFit, width: number) => void;
  testID: string;
}) {
  const styles = useStyles();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingLine, setEditingLine] = useKeptState(`${testID}-editing-line`, false);
  const [lineDraft, setLineDraft] = useKeptState(`${testID}-line-draft`, row.rating?.line ?? '');
  const stars = row.rating?.stars ?? null;
  const notEaten = row.rating?.notEaten ?? false;
  const line = row.rating?.line ?? null;

  const send = async (answer: RatingAnswer): Promise<boolean> => {
    if (pending) {
      return false;
    }
    setPending(true);
    setProblem(null);
    const failure = await onRate(row.person, answer);
    setPending(false);
    setProblem(failure);
    return failure === null;
  };

  const tapStar = (value: number) =>
    void send({ stars: value === stars ? null : value, notEaten: false, line });
  const tapNotEaten = () => void send({ stars: null, notEaten: !notEaten, line });
  const openLine = () => {
    setLineDraft(line ?? '');
    setEditingLine(true);
  };

  const leavingLine = useSaveOnLeave(async () => {
    const words = lineDraft.trim();
    if (!editingLine || pending || words === '' || words === (line ?? '') || words.length > MAX_RATING_LINE_LENGTH) {
      return;
    }
    if (await send({ stars, notEaten, line: lineDraft })) {
      setEditingLine(false);
    }
  });

  return (
    <View style={styles.row} testID={testID}>
      {/* The rail: a dot per person, joined by a line. */}
      <View style={styles.rail}>
        <View style={[styles.railTop, first && styles.railHidden]} />
        <View style={[styles.dot, notEaten ? styles.dotOff : styles.dotOn]} />
        <View style={[styles.railBottom, last && styles.railHidden]} />
      </View>
      <View style={[styles.body, !last && styles.divided]}>
        <View
          style={[styles.controls, layout === 'beside' ? styles.beside : styles.under]}
          onLayout={widthOf((width) => onMeasure('room', width))}
          testID={`${testID}-row`}
        >
          {/* The name at its own width, on one line, unseen and unread: what
              it needs beside the controls, whatever the layout is now. */}
          <View
            style={styles.measure}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <AppText
              variant="cardTitle"
              numberOfLines={1}
              onLayout={widthOf((width) => onMeasure('name', width))}
              testID={`${testID}-name-measure`}
            >
              {row.name}
              {row.guest ? <AppText variant="secondary">{`  ${GUEST_MARK}`}</AppText> : null}
            </AppText>
          </View>
          <AppText variant="cardTitle" tone={notEaten ? 'inkMuted' : 'ink'} style={styles.name}>
            {row.name}
            {row.guest ? <AppText variant="secondary" tone="inkMuted">{`  ${GUEST_MARK}`}</AppText> : null}
          </AppText>
          <View style={styles.controlsRight} testID={`${testID}-controls`}>
            <StarButtons
              stars={stars}
              onTap={tapStar}
              labelFor={starsLabel}
              hintFor={(value) => (value === stars ? 'Tap again to clear' : row.name)}
              disabled={pending}
              testID={testID}
            />
            <View style={styles.na} onLayout={widthOf((width) => onMeasure('na', width))} testID={`${testID}-na-box`}>
              <NotApplicableToggle
                label={NOT_EATEN}
                accessibilityLabel={NOT_EATEN_LONG}
                on={notEaten}
                onPress={tapNotEaten}
                disabled={pending}
                testID={`${testID}-na`}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${EDIT_LINE}, ${row.name}`}
              onPress={openLine}
              hitSlop={PENCIL_SLOP}
              style={({ pressed }) => [styles.pencil, pressed && styles.pressed]}
              testID={`${testID}-pencil`}
            >
              <Icon name="pencil" color="ink" size={size.iconSmall + 2} />
            </Pressable>
          </View>
        </View>

        {editingLine ? (
          <View style={styles.lineForm}>
            <TextField
              value={lineDraft}
              onChangeText={setLineDraft}
              placeholder={RATING_LINE_PLACEHOLDER}
              accessibilityLabel={`${RATING_LINE_PLACEHOLDER}, ${row.name}`}
              autoFocus
              {...leavingLine}
              invalid={lineDraft.trim().length > MAX_RATING_LINE_LENGTH}
              testID={`${testID}-line-input`}
            />
            <View style={styles.formActions}>
              <Button label={CANCEL} variant="text" onPress={() => setEditingLine(false)} />
              <Button
                label={SAVE_LINE}
                variant="secondary"
                pending={pending}
                disabled={lineDraft.trim().length > MAX_RATING_LINE_LENGTH}
                onPress={() =>
                  void send({ stars, notEaten, line: lineDraft }).then((saved) => {
                    if (saved) {
                      setEditingLine(false);
                    }
                  })
                }
                testID={`${testID}-line-save`}
              />
            </View>
          </View>
        ) : line !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Change this line"
            onPress={openLine}
            style={styles.lineShown}
            hitSlop={BUTTON_SLOP}
            testID={`${testID}-line`}
          >
            <AppText variant="secondary">{line}</AppText>
          </Pressable>
        ) : notEaten ? (
          <AppText variant="secondary" tone="inkMuted" style={styles.lineShown}>
            {NOT_EATEN_LINE}
          </AppText>
        ) : (
          <Button
            label={ADD_A_LINE}
            variant="text"
            onPress={openLine}
            style={styles.addLine}
            testID={`${testID}-add-line`}
          />
        )}
        {problem ? (
          <AppText variant="secondary" tone="danger" testID={`${testID}-failed`}>
            {problem}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** A layout event's width, to a whole dp. */
function widthOf(take: (width: number) => void) {
  return (event: LayoutChangeEvent) => take(Math.round(event.nativeEvent.layout.width));
}

/** The pencil is drawn 40 round; a line and "Someone else" 40 tall. Their hit areas make 48. */
const PENCIL_SLOP = touchSlop(size.iconButton, size.iconButton);
const BUTTON_SLOP = touchSlop(size.button);

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    block: {
      gap: space.sm,
    },
    row: {
      flexDirection: 'row',
      gap: space.sm,
    },
    rail: {
      width: size.rail,
      alignItems: 'center',
    },
    railTop: {
      width: size.ring,
      height: space.md + space.xxs,
      backgroundColor: colors.line,
    },
    railBottom: {
      width: size.ring,
      flex: 1,
      backgroundColor: colors.line,
    },
    railHidden: {
      backgroundColor: 'transparent',
    },
    dot: {
      width: size.railDot,
      height: size.railDot,
      borderRadius: radius.pill,
    },
    dotOn: {
      backgroundColor: colors.secondary,
    },
    dotOff: {
      backgroundColor: colors.controlLine,
    },
    // 8 between the controls and the line under them: N/A and the pencil
    // reach 8 and 4 past their drawn size (0.4.1).
    body: {
      flex: 1,
      minWidth: 0,
      gap: space.xs,
      paddingBottom: space.xs,
    },
    divided: {
      borderBottomWidth: size.hairline,
      borderBottomColor: colors.line,
    },
    // The name, then the stars, N/A and pencil as one row (0.4.0, part 6).
    // One layout per list (0.4.1): beside the name on every row when every
    // row fits, under the name on every row when any one does not
    // (`whoAteItLayout`). The controls never wrap inside themselves. Where
    // even the line under the name is too narrow, the space either side of
    // each star closes up first (`StarButtons`, 38 down to 30 dp a star); N/A
    // and the pencil never shrink.
    controls: {
      gap: space.xxs,
    },
    beside: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: RATING_NAME_GAP,
    },
    under: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    measure: {
      position: 'absolute',
      top: 0,
      left: 0,
      opacity: 0,
    },
    name: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minWidth: 0,
    },
    // 8 between the stars, N/A and the pencil: the last star reaches 5 to its
    // right (0.4.1).
    controlsRight: {
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 'auto',
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: RATING_CONTROLS_GAP,
    },
    na: {
      flexShrink: 0,
    },
    pencil: {
      flexShrink: 0,
      width: size.iconButton,
      height: size.iconButton,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      backgroundColor: colors.surfaceRaised,
    },
    lineForm: {
      gap: space.xs,
    },
    lineShown: {
      minHeight: size.button,
      justifyContent: 'center',
    },
    addLine: {
      alignSelf: 'flex-start',
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: space.xs,
    },
    guestForm: {
      gap: space.xs,
    },
    someoneElse: {
      alignSelf: 'flex-start',
      minHeight: size.button,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      borderRadius: radius.pill,
      paddingVertical: space.xs,
      paddingHorizontal: space.md,
    },
  }),
);
