import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { AppText } from '../../components/AppText';
import { NotApplicableToggle, StarButtons } from '../../components/StarRating';
import { TextField } from '../../components/TextField';
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
  SOMEONE_ELSE,
  starsLabel,
} from '../../content/product';
import type { HouseholdMember, Rating } from '../../domain/entities';
import type { RatingAnswer, RatingPerson } from '../../domain/evidence';
import { activeMembers } from '../../domain/household';
import { MAX_PERSON_NAME_LENGTH, MAX_RATING_LINE_LENGTH } from '../../domain/invariants';
import { makeStyles } from '../../theme/theme';
import { size, space } from '../../theme/tokens';

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
 * "Who ate it?" (0.3.0): a row per person who usually eats, in their order —
 * five star buttons, an N/A toggle and "+ Add a line" — and "+ Someone else"
 * for a guest named for this cook only.
 *
 * Every tap saves at once, as a tag does: nothing here waits for *Finish
 * review*, and nothing is required. A tap on the chosen star clears it. N/A
 * means "didn't eat it": it takes the stars away and counts nowhere.
 */
export function WhoAteIt({ household, ratings, onRate, testID = 'who-ate-it' }: WhoAteItProps) {
  const styles = useStyles();
  const [pendingGuests, setPendingGuests] = useState<readonly string[]>([]);
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestDraft, setGuestDraft] = useState('');
  const rows = rowsFor(household, ratings, pendingGuests);

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
      {rows.map((row) => (
        <RatingRow key={row.key} row={row} onRate={onRate} testID={`${testID}-${row.key}`} />
      ))}
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
              variant="outlined"
              disabled={guestDraft.trim() === '' || guestDraft.trim().length > MAX_PERSON_NAME_LENGTH}
              onPress={addGuest}
              testID={`${testID}-guest-add`}
            />
          </View>
        </View>
      ) : (
        <Button
          label={SOMEONE_ELSE}
          variant="text"
          onPress={() => setAddingGuest(true)}
          style={styles.someoneElse}
          testID={`${testID}-someone-else`}
        />
      )}
    </View>
  );
}

function RatingRow({
  row,
  onRate,
  testID,
}: {
  row: Row;
  onRate: WhoAteItProps['onRate'];
  testID: string;
}) {
  const styles = useStyles();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingLine, setEditingLine] = useState(false);
  const [lineDraft, setLineDraft] = useState(row.rating?.line ?? '');
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

  return (
    <View style={styles.row} testID={testID}>
      <AppText variant="bodyStrong">
        {row.name}
        {row.guest ? (
          <AppText variant="secondary" tone="inkMuted">{`  ${GUEST_MARK}`}</AppText>
        ) : null}
      </AppText>
      <View style={styles.controls}>
        <StarButtons
          stars={stars}
          onTap={tapStar}
          labelFor={starsLabel}
          hintFor={(value) => (value === stars ? 'Tap again to clear' : row.name)}
          disabled={pending}
          testID={testID}
        />
        <NotApplicableToggle
          label={NOT_EATEN}
          accessibilityLabel={NOT_EATEN_LONG}
          on={notEaten}
          onPress={tapNotEaten}
          disabled={pending}
          testID={`${testID}-na`}
        />
      </View>

      {editingLine ? (
        <View style={styles.lineForm}>
          <TextField
            value={lineDraft}
            onChangeText={setLineDraft}
            placeholder={RATING_LINE_PLACEHOLDER}
            accessibilityLabel={`${RATING_LINE_PLACEHOLDER}, ${row.name}`}
            autoFocus
            invalid={lineDraft.trim().length > MAX_RATING_LINE_LENGTH}
            testID={`${testID}-line-input`}
          />
          <View style={styles.formActions}>
            <Button label={CANCEL} variant="text" onPress={() => setEditingLine(false)} />
            <Button
              label={SAVE_LINE}
              variant="outlined"
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
          onPress={() => {
            setLineDraft(line);
            setEditingLine(true);
          }}
          style={styles.lineShown}
          testID={`${testID}-line`}
        >
          <AppText variant="secondary">{`“${line}”`}</AppText>
        </Pressable>
      ) : (
        <Button
          label={ADD_A_LINE}
          variant="text"
          onPress={() => {
            setLineDraft('');
            setEditingLine(true);
          }}
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
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    block: {
      gap: space.sm,
    },
    row: {
      gap: space.xxs,
      paddingVertical: space.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    controls: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.xxs,
    },
    pressed: {
      backgroundColor: colors.surfaceRaised,
    },
    lineForm: {
      gap: space.xs,
    },
    lineShown: {
      minHeight: size.targetMin,
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
    },
  }),
);
